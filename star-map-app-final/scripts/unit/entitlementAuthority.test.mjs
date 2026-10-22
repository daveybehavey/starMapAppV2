/**
 * entitlementAuthority.test.mjs — DL-1 Slice 2: Entitlement Authority DO
 * (ledger core, inert).
 *
 * Pins (DL-1 v3 §3.1 / §3.2 / §3.4 subsets named for this slice):
 * - the pure ledger machine: commit debits exactly once; re-commit never
 *   re-debits incl. the A→B→retry-A sequence that defeats the legacy
 *   last-token dedupe; per-plan allowance; baseline-aware derived balance
 *   (legacy grant entries are not double-subtracted); revoked/unpaid
 *   records refuse commit, grant, and delivery; unfinalized artifacts
 *   cannot satisfy commit;
 * - legacy recovery exclusivity: grant vs compensate in both orders and on
 *   replay never yields both ownership and a restored credit; compensate
 *   never removes a ledger entry; the 72h window at its exact boundary;
 * - the baseline is immutable once captured; a consume already compensated
 *   in the settled legacy record is marked compensated at capture without
 *   a phantom credit;
 * - the REAL Durable Object class over an in-memory SQLite fake: state
 *   survives an object restart, a retry returns the committed outcome, and
 *   an injected storage failure leaves no partial ledger/balance update;
 * - the client over its in-memory fallback republishes the KV read
 *   projection (non-authoritative) after mutations;
 * - wiring pins: the DO binding/migration exist, and NOTHING under src/app
 *   references the authority yet (Slice 2 is inert by design).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./entitlementAuthority.hooks.mjs", import.meta.url);

process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";

const {
  applyEntitlementAuthorityOp,
  countPaidCommits,
  createEmptyEntitlementAuthorityState,
  deriveRemainingAllowance,
  evaluateDeliveryEligibility,
  evaluateEntitlementValidity,
  isOwnedUnderValidEntitlement,
  LEGACY_COMPENSATE_WINDOW_MS,
} = await import("../../src/lib/entitlementAuthorityState.ts");
const { EntitlementAuthorityDO } = await import(
  "../../src/durable-objects/EntitlementAuthorityDO.ts"
);
const {
  createEntitlementAuthorityClient,
  __resetEntitlementAuthorityMemoryForTests,
  ENTITLEMENT_AUTHORITY_PROJECTION_KV_KEY,
} = await import("../../src/lib/entitlementAuthority.ts");
const { kv } = await import("../../src/lib/kv.ts");

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const SID = "cs_test_dl1_slice2";
const HOUR = 60 * 60 * 1000;

const facts = (over = {}) => ({
  plan: "pack3",
  paid: true,
  revoked: false,
  subscriptionActive: false,
  mapId: "map-1",
  ...over,
});

const baseline = (over = {}) => ({
  plan: "pack3",
  allowance: 3,
  legacyRemainingBalance: 2,
  legacySpentCount: 1,
  lastConsumeToken: "tok-1",
  lastConsumeAt: NOW - 60_000,
  lastCompensatedToken: null,
  purchaseMapId: "map-1",
  accessTermsNote: null,
  capturedAt: NOW - 120_000,
  ...over,
});

function seeded({ factsOver, baselineOver, withBaseline = false } = {}) {
  let s = createEmptyEntitlementAuthorityState(SID);
  s = applyEntitlementAuthorityOp(s, {
    type: "sync_facts",
    facts: facts(factsOver),
    now: NOW - 1000,
  }).state;
  if (withBaseline) {
    s = applyEntitlementAuthorityOp(s, {
      type: "capture_baseline",
      baseline: baseline(baselineOver),
      now: NOW - 900,
    }).state;
  }
  return s;
}

const commitOp = (artifactId, over = {}) => ({
  type: "commit",
  artifactId,
  mapId: "map-1",
  fingerprint: `fp-${artifactId}`,
  finalized: true,
  now: NOW,
  ...over,
});

const grantOp = (artifactId, over = {}) => ({
  type: "grant",
  artifactId,
  mapId: "map-1",
  fingerprint: `fp-${artifactId}`,
  finalized: true,
  now: NOW,
  ...over,
});

/* ---------------- pure ledger: commit (§3.1 i–iii, viii) ---------------- */

test("commit debits exactly once and writes a commit entry", () => {
  const s0 = seeded();
  assert.equal(deriveRemainingAllowance(s0), 3);
  const r = applyEntitlementAuthorityOp(s0, commitOp("art-a"));
  assert.equal(r.outcome, "committed");
  assert.equal(r.changed, true);
  assert.equal(r.state.ownedFiles["art-a"].source, "commit");
  assert.equal(r.state.ownedFiles["art-a"].mapId, "map-1");
  assert.equal(r.creditsRemaining, 2);
  // The input state is never mutated (a failed DO write must leave the
  // prior state intact — the DO persists only the returned next state).
  assert.deepEqual(s0.ownedFiles, {});
});

test("re-commit never re-debits, incl. A→B→retry-A", () => {
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  s = applyEntitlementAuthorityOp(s, commitOp("art-b")).state;
  const retry = applyEntitlementAuthorityOp(s, commitOp("art-a"));
  assert.equal(retry.outcome, "already_owned");
  assert.equal(retry.changed, false);
  assert.equal(countPaidCommits(retry.state), 2);
  assert.equal(retry.creditsRemaining, 1);
});

test("allowance: single plan admits exactly one paid commit", () => {
  let s = seeded({ factsOver: { plan: "single" } });
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  const r = applyEntitlementAuthorityOp(s, commitOp("art-b"));
  assert.equal(r.outcome, "refused");
  assert.equal(r.refusal, "no_credits");
  assert.equal(r.creditsRemaining, 0);
});

test("allowance: pack3 admits three paid commits, refuses the fourth", () => {
  let s = seeded();
  for (const id of ["art-a", "art-b", "art-c"]) {
    s = applyEntitlementAuthorityOp(s, commitOp(id)).state;
  }
  const r = applyEntitlementAuthorityOp(s, commitOp("art-d"));
  assert.equal(r.outcome, "refused");
  assert.equal(r.refusal, "no_credits");
});

test("allowance: active subscription is unlimited; inactive refuses", () => {
  let s = seeded({
    factsOver: { plan: "subscription", subscriptionActive: true },
  });
  for (const id of ["a1", "a2", "a3", "a4", "a5"]) {
    const r = applyEntitlementAuthorityOp(s, commitOp(id));
    assert.equal(r.outcome, "committed");
    assert.equal(r.creditsRemaining, null);
    s = r.state;
  }
  const inactive = seeded({
    factsOver: { plan: "subscription", subscriptionActive: false },
  });
  const r = applyEntitlementAuthorityOp(inactive, commitOp("art-a"));
  assert.equal(r.outcome, "refused");
  assert.equal(r.refusal, "subscription_inactive");
});

test("unfinalized artifacts cannot satisfy commit", () => {
  const s = seeded();
  const r = applyEntitlementAuthorityOp(s, commitOp("art-a", { finalized: false }));
  assert.equal(r.outcome, "refused");
  assert.equal(r.refusal, "not_finalized");
  assert.deepEqual(r.state.ownedFiles, {});
});

/* ---------------- pure ledger: validity (§3.1 vii) ---------------- */

test("revoked records refuse commit, grant, and delivery", () => {
  let s = seeded({ withBaseline: true });
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  const revoked = applyEntitlementAuthorityOp(s, {
    type: "sync_facts",
    facts: facts({ revoked: true }),
    now: NOW,
  }).state;
  assert.deepEqual(evaluateEntitlementValidity(revoked), {
    valid: false,
    reason: "revoked",
  });
  assert.equal(applyEntitlementAuthorityOp(revoked, commitOp("art-b")).refusal, "revoked");
  assert.equal(applyEntitlementAuthorityOp(revoked, grantOp("art-l")).refusal, "revoked");
  assert.equal(evaluateDeliveryEligibility(revoked, "art-a").ok, false);
});

test("unpaid and factless records refuse commit (fail closed)", () => {
  const unpaid = seeded({ factsOver: { paid: false } });
  assert.equal(applyEntitlementAuthorityOp(unpaid, commitOp("art-a")).refusal, "not_paid");
  const empty = createEmptyEntitlementAuthorityState(SID);
  assert.equal(applyEntitlementAuthorityOp(empty, commitOp("art-a")).refusal, "no_facts");
});

test("delivery eligibility never consults the balance (access separation)", () => {
  let s = seeded({ factsOver: { plan: "single" } });
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  assert.equal(deriveRemainingAllowance(s), 0);
  assert.deepEqual(evaluateDeliveryEligibility(s, "art-a"), { ok: true });
  assert.equal(evaluateDeliveryEligibility(s, "art-other").ok, false);
  // §E groundwork: the ledger (never a projection) is the cleanup
  // eligibility source — an owned file under a valid entitlement is
  // never cleanup-safe.
  assert.equal(isOwnedUnderValidEntitlement(s, "art-a"), true);
  assert.equal(isOwnedUnderValidEntitlement(s, "art-other"), false);
});

/* ---------------- pure ledger: baseline + grant (§3.1 iv–v) ---------------- */

test("baseline-aware balance: legacy spent preserved, grant not double-subtracted", () => {
  let s = seeded({ withBaseline: true });
  assert.equal(deriveRemainingAllowance(s), 2); // 3 allowance − 1 legacy spent
  const g = applyEntitlementAuthorityOp(s, grantOp("art-legacy"));
  assert.equal(g.outcome, "granted");
  assert.equal(g.state.ownedFiles["art-legacy"].source, "legacy");
  assert.equal(g.state.recoveryDecision, "granted");
  // The legacy entry represents the already-counted baseline spend.
  assert.equal(g.creditsRemaining, 2);
  s = g.state;
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  s = applyEntitlementAuthorityOp(s, commitOp("art-b")).state;
  assert.equal(deriveRemainingAllowance(s), 0);
  assert.equal(applyEntitlementAuthorityOp(s, commitOp("art-c")).refusal, "no_credits");
});

test("grant replay returns the same ownership; a second fingerprint is refused", () => {
  let s = seeded({ withBaseline: true });
  s = applyEntitlementAuthorityOp(s, grantOp("art-legacy")).state;
  const replay = applyEntitlementAuthorityOp(s, grantOp("art-legacy"));
  assert.equal(replay.outcome, "already_granted");
  assert.equal(replay.changed, false);
  const other = applyEntitlementAuthorityOp(s, grantOp("art-other"));
  assert.equal(other.outcome, "refused");
  assert.equal(other.refusal, "already_granted");
});

test("grant guards: baseline, spend, purchase map, support fallback, finalization", () => {
  const noBaseline = seeded();
  assert.equal(applyEntitlementAuthorityOp(noBaseline, grantOp("art-l")).refusal, "no_baseline");

  const noSpend = seeded({ withBaseline: true, baselineOver: { legacySpentCount: 0 } });
  assert.equal(applyEntitlementAuthorityOp(noSpend, grantOp("art-l")).refusal, "no_legacy_spend");

  const noMap = seeded({ withBaseline: true, baselineOver: { purchaseMapId: null } });
  assert.equal(
    applyEntitlementAuthorityOp(noMap, grantOp("art-l")).refusal,
    "grant_requires_support",
  );

  const wrongMap = seeded({ withBaseline: true });
  assert.equal(
    applyEntitlementAuthorityOp(wrongMap, grantOp("art-l", { mapId: "map-2" })).refusal,
    "grant_map_mismatch",
  );

  const unfinalized = seeded({ withBaseline: true });
  assert.equal(
    applyEntitlementAuthorityOp(unfinalized, grantOp("art-l", { finalized: false })).refusal,
    "not_finalized",
  );
});

/* ---------------- pure ledger: compensate (§3.1 vi, §3.2) ---------------- */

test("compensate restores exactly one baseline credit and keeps ledger entries", () => {
  let s = seeded({ withBaseline: true });
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  assert.equal(deriveRemainingAllowance(s), 1); // 3 − 1 spent − 1 commit
  const r = applyEntitlementAuthorityOp(s, {
    type: "compensate",
    consumeToken: "tok-1",
    now: NOW,
  });
  assert.equal(r.outcome, "compensated");
  assert.equal(r.state.recoveryDecision, "compensated");
  assert.equal(r.creditsRemaining, 2);
  // Compensate NEVER removes a ledger entry.
  assert.ok(r.state.ownedFiles["art-a"]);
  const replay = applyEntitlementAuthorityOp(r.state, {
    type: "compensate",
    consumeToken: "tok-1",
    now: NOW,
  });
  assert.equal(replay.outcome, "already_compensated");
  assert.equal(replay.changed, false);
  assert.equal(replay.creditsRemaining, 2);
});

test("grant and compensate are mutually exclusive in both orders", () => {
  const grantedFirst = applyEntitlementAuthorityOp(
    seeded({ withBaseline: true }),
    grantOp("art-legacy"),
  ).state;
  assert.equal(
    applyEntitlementAuthorityOp(grantedFirst, {
      type: "compensate",
      consumeToken: "tok-1",
      now: NOW,
    }).refusal,
    "already_granted",
  );

  const compensatedFirst = applyEntitlementAuthorityOp(seeded({ withBaseline: true }), {
    type: "compensate",
    consumeToken: "tok-1",
    now: NOW,
  }).state;
  assert.equal(
    applyEntitlementAuthorityOp(compensatedFirst, grantOp("art-legacy")).refusal,
    "already_compensated",
  );
});

test("compensate guards: token match, subscription, 72h window boundary", () => {
  const s = seeded({ withBaseline: true });
  assert.equal(
    applyEntitlementAuthorityOp(s, { type: "compensate", consumeToken: "nope", now: NOW })
      .refusal,
    "token_mismatch",
  );

  const sub = seeded({
    factsOver: { plan: "subscription", subscriptionActive: true },
    withBaseline: true,
    baselineOver: { plan: "subscription", allowance: null },
  });
  assert.equal(
    applyEntitlementAuthorityOp(sub, { type: "compensate", consumeToken: "tok-1", now: NOW })
      .refusal,
    "subscription_plan",
  );

  const atBoundary = seeded({
    withBaseline: true,
    baselineOver: { lastConsumeAt: NOW - LEGACY_COMPENSATE_WINDOW_MS },
  });
  assert.equal(
    applyEntitlementAuthorityOp(atBoundary, {
      type: "compensate",
      consumeToken: "tok-1",
      now: NOW,
    }).outcome,
    "compensated",
  );

  const pastBoundary = seeded({
    withBaseline: true,
    baselineOver: { lastConsumeAt: NOW - LEGACY_COMPENSATE_WINDOW_MS - 1 },
  });
  assert.equal(
    applyEntitlementAuthorityOp(pastBoundary, {
      type: "compensate",
      consumeToken: "tok-1",
      now: NOW,
    }).refusal,
    "window_expired",
  );
  assert.equal(LEGACY_COMPENSATE_WINDOW_MS, 72 * HOUR);
});

/* ---------------- pure ledger: baseline capture (§3.2) ---------------- */

test("baseline capture is immutable: re-capture never resets usage", () => {
  let s = seeded({ withBaseline: true });
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  const again = applyEntitlementAuthorityOp(s, {
    type: "capture_baseline",
    baseline: baseline({ legacySpentCount: 0, legacyRemainingBalance: 3 }),
    now: NOW,
  });
  assert.equal(again.outcome, "baseline_already_captured");
  assert.equal(again.changed, false);
  assert.equal(again.state.baseline.legacySpentCount, 1);
  assert.equal(deriveRemainingAllowance(again.state), 1);
});

test("pre-compensated baseline is marked compensated at capture, no phantom credit", () => {
  const s = seeded({
    withBaseline: true,
    baselineOver: { lastCompensatedToken: "tok-1" },
  });
  assert.equal(s.recoveryDecision, "compensated");
  assert.equal(s.baselineCompensationCount, 0);
  assert.equal(deriveRemainingAllowance(s), 2); // already net in the settled record
  assert.equal(applyEntitlementAuthorityOp(s, grantOp("art-l")).refusal, "already_compensated");
});

/* ---------------- pure ledger: rotation + facts ---------------- */

test("capability rotation increments the generation, even when revoked", () => {
  let s = seeded();
  assert.equal(s.capabilityGeneration, 0);
  s = applyEntitlementAuthorityOp(s, { type: "rotate_capability", now: NOW }).state;
  assert.equal(s.capabilityGeneration, 1);
  const revoked = applyEntitlementAuthorityOp(s, {
    type: "sync_facts",
    facts: facts({ revoked: true }),
    now: NOW,
  }).state;
  const r = applyEntitlementAuthorityOp(revoked, { type: "rotate_capability", now: NOW });
  assert.equal(r.outcome, "rotated");
  assert.equal(r.state.capabilityGeneration, 2);
});

test("sync_facts is idempotent for identical facts", () => {
  const s = seeded();
  const r = applyEntitlementAuthorityOp(s, {
    type: "sync_facts",
    facts: facts(),
    now: NOW,
  });
  assert.equal(r.outcome, "facts_synced");
  assert.equal(r.changed, false);
});

/* ---------------- Durable Object (§3.4 restart-durability subset) ---------------- */

/**
 * In-memory stand-in for the SQLite DO storage API, implementing exactly
 * the three statement shapes EntitlementAuthorityDO issues. Rows live in a
 * shared Map so a "restart" (a new DO instance over the same storage)
 * observes precisely what the previous instance persisted.
 */
class FakeSqlStorage {
  constructor(rows = new Map()) {
    this.rows = rows;
    this.failNextWrite = false;
  }

  exec(sql, ...params) {
    const head = sql.trimStart().slice(0, 6).toUpperCase();
    if (head.startsWith("CREATE")) return { toArray: () => [] };
    if (head.startsWith("SELECT")) {
      const row = this.rows.get(params[0]);
      return { toArray: () => (row ? [row] : []) };
    }
    if (head.startsWith("INSERT")) {
      if (this.failNextWrite) {
        this.failNextWrite = false;
        throw new Error("injected storage failure");
      }
      const [sessionId, stateJson, updatedAt] = params;
      this.rows.set(sessionId, {
        session_id: sessionId,
        state_json: stateJson,
        updated_at: updatedAt,
      });
      return { toArray: () => [] };
    }
    throw new Error(`unexpected SQL in fake: ${sql.slice(0, 80)}`);
  }
}

function fakeCtx(sql) {
  return {
    storage: { sql },
    blockConcurrencyWhile(fn) {
      return fn();
    },
  };
}

function newAuthority(sql) {
  return new EntitlementAuthorityDO(fakeCtx(sql), {});
}

test("DO: commit survives an object restart; retry returns the committed outcome", async () => {
  const sql = new FakeSqlStorage();
  const first = newAuthority(sql);
  await first.apply(SID, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  const committed = await first.commit(SID, {
    artifactId: "art-a",
    mapId: "map-1",
    fingerprint: "fp-art-a",
    finalized: true,
    now: NOW,
  });
  assert.equal(committed.outcome, "committed");

  // Restart: a brand-new DO instance over the same storage.
  const restarted = newAuthority(sql);
  const state = await restarted.getState(SID);
  assert.equal(state.ownedFiles["art-a"].source, "commit");
  const retry = await restarted.commit(SID, {
    artifactId: "art-a",
    mapId: "map-1",
    fingerprint: "fp-art-a",
    finalized: true,
    now: NOW + 1,
  });
  assert.equal(retry.outcome, "already_owned");
  assert.equal(retry.creditsRemaining, 2); // exactly one debit, ever
});

test("DO: injected storage failure leaves no partial ledger/balance update", async () => {
  const sql = new FakeSqlStorage();
  const authority = newAuthority(sql);
  await authority.apply(SID, { type: "sync_facts", facts: facts(), now: NOW - 1000 });

  sql.failNextWrite = true;
  await assert.rejects(
    () =>
      authority.commit(SID, {
        artifactId: "art-a",
        mapId: "map-1",
        fingerprint: "fp-art-a",
        finalized: true,
        now: NOW,
      }),
    /injected storage failure/,
  );

  // Nothing was persisted: no ledger entry, no balance movement.
  const after = await newAuthority(sql).getState(SID);
  assert.deepEqual(after.ownedFiles, {});
  assert.equal(after.facts.plan, "pack3");

  // The retry performs one fresh commit — exactly one debit total.
  const retry = await newAuthority(sql).commit(SID, {
    artifactId: "art-a",
    mapId: "map-1",
    fingerprint: "fp-art-a",
    finalized: true,
    now: NOW + 1,
  });
  assert.equal(retry.outcome, "committed");
  assert.equal(retry.creditsRemaining, 2);
});

test("DO: grant/compensate exclusivity and rotation persist across restarts", async () => {
  const sql = new FakeSqlStorage();
  const first = newAuthority(sql);
  await first.apply(SID, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await first.apply(SID, {
    type: "capture_baseline",
    baseline: baseline(),
    now: NOW - 900,
  });
  const granted = await first.grant(SID, {
    artifactId: "art-legacy",
    mapId: "map-1",
    fingerprint: "fp-art-legacy",
    finalized: true,
    now: NOW,
  });
  assert.equal(granted.outcome, "granted");
  await first.rotateCapability(SID, NOW);

  const restarted = newAuthority(sql);
  const state = await restarted.getState(SID);
  assert.equal(state.recoveryDecision, "granted");
  assert.equal(state.capabilityGeneration, 1);
  const comp = await restarted.compensate(SID, { consumeToken: "tok-1", now: NOW });
  assert.equal(comp.outcome, "refused");
  assert.equal(comp.refusal, "already_granted");
});

/* ---------------- client: memory fallback + KV projection ---------------- */

test("client: mutations apply over the memory fallback and republish the projection", async () => {
  __resetEntitlementAuthorityMemoryForTests();
  const clientSid = "cs_test_dl1_slice2_client";
  const client = createEntitlementAuthorityClient();
  const synced = await client.apply(clientSid, {
    type: "sync_facts",
    facts: facts(),
    now: NOW - 1000,
  });
  assert.equal(synced.outcome, "facts_synced");
  const committed = await client.apply(clientSid, commitOp("art-a"));
  assert.equal(committed.outcome, "committed");

  const state = await client.getState(clientSid);
  assert.equal(state.ownedFiles["art-a"].source, "commit");

  const projection = await kv.get(ENTITLEMENT_AUTHORITY_PROJECTION_KV_KEY(clientSid));
  assert.equal(projection.plan, "pack3");
  assert.equal(projection.creditsRemaining, 2);
  assert.deepEqual(projection.ownedArtifactIds, ["art-a"]);
  __resetEntitlementAuthorityMemoryForTests();
});

/* ---------------- wiring pins (Slice 2 stays inert) ---------------- */

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("wiring: DO binding, migration, and worker export exist", () => {
  const wrangler = readFileSync(path.join(appRoot, "wrangler.toml"), "utf8");
  assert.match(wrangler, /name = "ENTITLEMENT_AUTHORITY"/);
  assert.match(wrangler, /class_name = "EntitlementAuthorityDO"/);
  assert.match(wrangler, /tag = "v3-entitlement-authority"/);
  const worker = readFileSync(path.join(appRoot, "cloudflare-worker.ts"), "utf8");
  assert.match(worker, /export \{ EntitlementAuthorityDO \}/);
});

test("wiring: no route or page references the authority yet (inert slice)", () => {
  const appDir = path.join(appRoot, "src/app");
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
        const text = readFileSync(full, "utf8");
        if (text.includes("EntitlementAuthority") || text.includes("entitlementAuthority")) {
          offenders.push(full);
        }
      }
    }
  };
  walk(appDir);
  assert.deepEqual(offenders, []);
});
