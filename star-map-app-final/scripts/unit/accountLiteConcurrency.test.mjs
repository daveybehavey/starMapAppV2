/**
 * accountLiteConcurrency.test.mjs — T-SM-KVRACE, A2-2 guard test.
 *
 * Drives the PUBLIC accountLite API with an adversarial KV read barrier:
 * two concurrent upserts for the same email are both handed the same
 * stale (empty) legacy snapshot before either may proceed. Against the
 * pre-fix implementation (KV read-modify-write of one shared array)
 * the second write overwrites the first and one purchase is silently
 * lost — this test FAILS there. Against the coordinator-backed
 * implementation the authoritative per-email object serializes the two
 * upserts and both purchases survive.
 *
 * This file deliberately imports only modules that exist on both sides
 * of the fix (accountLite + kv) so it can be run against a pre-fix
 * checkout for guard verification.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";

const { upsertAccountLiteEmailSession, getAccountLiteEmailSessions } = await import(
  "../../src/lib/accountLite.ts"
);
const { kv } = await import("../../src/lib/kv.ts");

function readBarrier(parties) {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived >= parties) release();
    await gate;
  };
}

test("A2-2 two concurrent purchases for one email both survive a stale-read race", async () => {
  const email = `race-${crypto.randomUUID()}@example.com`;
  const realGet = kv.get.bind(kv);
  const gate = readBarrier(2);
  let armed = true;
  kv.get = async (key) => {
    // Capture the snapshot first, then hold BOTH readers at the barrier
    // so each proceeds with the same stale view of the index.
    const snapshot = await realGet(key);
    if (armed && typeof key === "string" && key.startsWith("account:email:")) {
      await gate();
    }
    return snapshot;
  };
  try {
    await Promise.all([
      upsertAccountLiteEmailSession({
        email,
        session: { sessionId: "cs_race_a", createdAt: Date.now() - 10 },
      }),
      upsertAccountLiteEmailSession({
        email,
        session: { sessionId: "cs_race_b", createdAt: Date.now() - 5 },
      }),
    ]);
  } finally {
    armed = false;
    kv.get = realGet;
  }

  const view = await getAccountLiteEmailSessions(email);
  assert.deepEqual(
    (view?.sessions ?? []).map((s) => s.sessionId).sort(),
    ["cs_race_a", "cs_race_b"],
    "both purchases survive the concurrent upsert",
  );
});

test("A2-2 a purchase recorded before the fix (legacy KV row) is preserved", async () => {
  const email = `legacy-${crypto.randomUUID()}@example.com`;
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(email).digest("base64url").slice(0, 40);
  await kv.set(`account:email:${hash}`, {
    updatedAt: Date.now() - 60_000,
    sessions: [{ sessionId: "cs_pre_fix", createdAt: Date.now() - 60_000 }],
  });

  await upsertAccountLiteEmailSession({
    email,
    session: { sessionId: "cs_post_fix", createdAt: Date.now() },
  });

  const view = await getAccountLiteEmailSessions(email);
  assert.deepEqual(
    (view?.sessions ?? []).map((s) => s.sessionId).sort(),
    ["cs_post_fix", "cs_pre_fix"],
    "the legacy row is imported, not discarded",
  );
});
