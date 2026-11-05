/**
 * S4 sweep B1 — concurrent distinct referral visits lose a counter
 * increment.
 *
 * The defect (verified in docs/audits/s4-bug-class-sweep.md): the
 * visit route read the referral record ONCE, awaited the
 * fingerprint-dedupe read/write, then persisted
 * `{ ...record, visits: record.visits + 1 }` built from the stale
 * read. Two concurrent visits from distinct visitors interleave
 * and one increment is lost (audit reproduction: 2 successful
 * distinct visits, persisted visits = 1); a concurrent write to an
 * unrelated field of the same record is likewise clobbered by the
 * stale spread.
 *
 * The fix: the dedupe check and the counter write run inside a
 * per-record serialized update boundary (kv.ts
 * withSerializedKvUpdate), and the counter is computed from a
 * FRESH record read taken inside that boundary — never from the
 * read that authorized the request. Dedupe semantics, the
 * self-visit rule, and every response shape are unchanged.
 *
 * These tests drive the REAL route POST against the REAL local
 * KV. The interleaving is deterministic, using the repo's
 * read-barrier pattern (accountLiteConcurrency.test.mjs): both
 * requests are handed the same stale record snapshot at the
 * route's authorizing read before either may proceed. Against the
 * pre-fix route the barrier tests FAIL (visits persist as 1, the
 * unrelated-field update is lost); against the fix the fresh
 * in-boundary reads pass straight through the already-released
 * barrier and both increments land.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
// Registered last so its resolve hook runs first for the stubbed seams.
register("./referralVisitRace.hooks.mjs", import.meta.url);

const RUN = Date.now().toString(36).toUpperCase();
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), `s4-b1-visit-kv-${RUN}-`),
);

const { NextRequest } = await import("next/server");
const route = await import("../../src/app/api/referrals/visit/route.ts");
const { kv } = await import("../../src/lib/kv.ts");
const { referralKey } = await import("../../src/lib/referrals.ts");
const { PREMIUM_COOKIE_NAME } = await import("../../src/lib/premium.ts");

let counter = 0;
function nextCode() {
  counter += 1;
  return `S4B1${RUN}${counter}`;
}

async function seedRecord(code, overrides = {}) {
  const record = {
    code,
    sessionId: `owner-session-${code}`,
    createdAt: Date.now(),
    visits: 0,
    conversions: 0,
    rewardsGranted: 0,
    ...overrides,
  };
  await kv.set(referralKey(code), record);
  return record;
}

function visitRequest(code, { ip, userAgent, cookie } = {}) {
  const headers = {
    "content-type": "application/json",
    "cf-connecting-ip": ip,
    "user-agent": userAgent,
  };
  if (cookie) headers.cookie = cookie;
  return new NextRequest("https://starmapco.test/api/referrals/visit", {
    method: "POST",
    headers,
    body: JSON.stringify({ code }),
  });
}

/**
 * Arm the read barrier on the referral record key: the first two
 * reads each capture their snapshot, then hold until both have
 * arrived (both requests proceed with the same stale view). Reads
 * after the release pass through — the fix's fresh in-boundary
 * reads depend on that. When `annotate` is set, a concurrent
 * unrelated-field update (conversions: 3, as a conversion
 * bookkeeping write would land) is applied to the stored record
 * between the snapshot capture and the release.
 */
function armRecordReadBarrier(code, { annotate = false } = {}) {
  const key = referralKey(code);
  const realGet = kv.get.bind(kv);
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let annotated = false;
  kv.get = async (candidateKey, ...rest) => {
    const snapshot = await realGet(candidateKey, ...rest);
    if (candidateKey === key && arrived < 2) {
      arrived += 1;
      if (arrived === 2) {
        if (annotate && !annotated) {
          annotated = true;
          const current = await realGet(key);
          await kv.set(key, { ...current, conversions: 3 });
        }
        release();
      }
      await gate;
    }
    return snapshot;
  };
  return () => {
    kv.get = realGet;
  };
}

test("B1: two concurrent distinct visits persist visits = 2 (barrier interleaving)", async () => {
  const code = nextCode();
  await seedRecord(code);
  const disarm = armRecordReadBarrier(code);
  try {
    const [resA, resB] = await Promise.all([
      route.POST(visitRequest(code, { ip: "203.0.113.10", userAgent: "visitor-a" })),
      route.POST(visitRequest(code, { ip: "203.0.113.11", userAgent: "visitor-b" })),
    ]);
    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    assert.deepEqual(await resA.json(), { ok: true, deduped: false });
    assert.deepEqual(await resB.json(), { ok: true, deduped: false });
  } finally {
    disarm();
  }
  const stored = await kv.get(referralKey(code));
  assert.equal(stored.visits, 2, "both distinct visits are counted");
});

test("B1: a concurrent unrelated-field update survives the visit increments", async () => {
  const code = nextCode();
  await seedRecord(code);
  const disarm = armRecordReadBarrier(code, { annotate: true });
  try {
    const [resA, resB] = await Promise.all([
      route.POST(visitRequest(code, { ip: "203.0.113.20", userAgent: "visitor-a" })),
      route.POST(visitRequest(code, { ip: "203.0.113.21", userAgent: "visitor-b" })),
    ]);
    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
  } finally {
    disarm();
  }
  const stored = await kv.get(referralKey(code));
  assert.equal(stored.visits, 2, "both increments land");
  assert.equal(
    stored.conversions,
    3,
    "the concurrent conversion-field update is not clobbered by the visit writes",
  );
  assert.equal(stored.sessionId, `owner-session-${code}`, "identity fields survive");
});

test("B1: duplicate visitor inside the dedupe window is still deduped", async () => {
  const code = nextCode();
  await seedRecord(code);
  const first = await route.POST(
    visitRequest(code, { ip: "203.0.113.30", userAgent: "visitor-same" }),
  );
  assert.deepEqual(await first.json(), { ok: true, deduped: false });
  const second = await route.POST(
    visitRequest(code, { ip: "203.0.113.30", userAgent: "visitor-same" }),
  );
  assert.deepEqual(await second.json(), { ok: true, deduped: true });
  const stored = await kv.get(referralKey(code));
  assert.equal(stored.visits, 1, "the duplicate does not count");
});

test("B1: concurrent visits from the SAME visitor count once", async () => {
  const code = nextCode();
  await seedRecord(code);
  const [resA, resB] = await Promise.all([
    route.POST(visitRequest(code, { ip: "203.0.113.31", userAgent: "visitor-same" })),
    route.POST(visitRequest(code, { ip: "203.0.113.31", userAgent: "visitor-same" })),
  ]);
  const bodies = [await resA.json(), await resB.json()];
  assert.equal(
    bodies.filter((b) => b.deduped === false).length,
    1,
    "exactly one of the pair records the visit",
  );
  assert.equal(
    bodies.filter((b) => b.deduped === true).length,
    1,
    "the other is deduped",
  );
  const stored = await kv.get(referralKey(code));
  assert.equal(stored.visits, 1);
});

test("B1: a self-visit is deduped and never counts", async () => {
  const code = nextCode();
  const record = await seedRecord(code);
  const res = await route.POST(
    visitRequest(code, {
      ip: "203.0.113.40",
      userAgent: "owner",
      cookie: `${PREMIUM_COOKIE_NAME}=${record.sessionId}`,
    }),
  );
  assert.deepEqual(await res.json(), { ok: true, deduped: true });
  const stored = await kv.get(referralKey(code));
  assert.equal(stored.visits, 0);
});

test("B1: an unknown referral code still 404s", async () => {
  const code = nextCode();
  const res = await route.POST(
    visitRequest(code, { ip: "203.0.113.50", userAgent: "visitor" }),
  );
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { ok: false, error: "Referral not found" });
});
