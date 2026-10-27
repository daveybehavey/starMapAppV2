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
 *
 * Slice 3 addendum (migration baseline + fencing + R1 reward bucket):
 * - reward bucket ops: grants are idempotent and bucket-only, commits
 *   spend the bucket first, and a reversal can remove only unspent bucket
 *   credits — never purchased credits, owned files, or a negative balance;
 * - the bucket conservation rules join the authority-boundary validation;
 * - the inert wiring pin is replaced by the Slice 3 wiring contract:
 *   exactly the consume/compensate routes and the Stripe webhook may
 *   reference the authority, and both routes consult the fence first.
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
  buildEntitlementAuthorityProjection,
  countPaidCommits,
  createEmptyEntitlementAuthorityState,
  deriveRemainingAllowance,
  evaluateDeliveryEligibility,
  evaluateEntitlementValidity,
  isOwnedUnderValidEntitlement,
  isValidEntitlementAuthorityState,
  isValidEntitlementBaseline,
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

test("grant after a paid commit preserves the commit entry and consumes the decision", () => {
  let s = seeded({ withBaseline: true });
  s = applyEntitlementAuthorityOp(s, commitOp("art-x", { now: NOW - 500 })).state;
  const before = s.ownedFiles["art-x"];
  assert.equal(before.source, "commit");
  const g = applyEntitlementAuthorityOp(s, grantOp("art-x"));
  assert.equal(g.outcome, "already_owned");
  // The paid entry is preserved byte-for-byte.
  assert.deepEqual(g.state.ownedFiles["art-x"], before);
  // The one-time recovery decision is consumed — nothing remains owed —
  // and exclusivity still holds against a later compensate.
  assert.equal(g.state.recoveryDecision, "granted");
  const c = applyEntitlementAuthorityOp(g.state, {
    type: "compensate",
    consumeToken: "tok-1",
    now: NOW,
  });
  assert.equal(c.refusal, "already_granted");
});

test("grant guards: baseline, spend, purchase map, support fallback, finalization", () => {
  const noBaseline = seeded();
  assert.equal(applyEntitlementAuthorityOp(noBaseline, grantOp("art-l")).refusal, "no_baseline");

  const noSpend = seeded({
    withBaseline: true,
    baselineOver: { legacySpentCount: 0, legacyRemainingBalance: 3 },
  });
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

/* ------------- authority-boundary validation (G-dot P2, PR #362) ------------- */

test("validation: token-less spent baseline is support-only for grant; the spend still counts", () => {
  const s = seeded({ withBaseline: true, baselineOver: { lastConsumeToken: null } });
  assert.equal(deriveRemainingAllowance(s), 2); // the spend remains spent
  const g = applyEntitlementAuthorityOp(s, grantOp("art-legacy"));
  assert.equal(g.outcome, "refused");
  assert.equal(g.refusal, "grant_requires_support");
});

test("validation: compensate requires an actual baseline spend", () => {
  const s = seeded({
    withBaseline: true,
    baselineOver: { legacySpentCount: 0, legacyRemainingBalance: 3 },
  });
  const c = applyEntitlementAuthorityOp(s, {
    type: "compensate",
    consumeToken: "tok-1",
    now: NOW,
  });
  assert.equal(c.outcome, "refused");
  assert.equal(c.refusal, "no_legacy_spend");
});

test("validation: malformed facts/baseline payloads are refused at the boundary", () => {
  const s0 = seeded();
  const badFacts = applyEntitlementAuthorityOp(s0, {
    type: "sync_facts",
    facts: { ...facts(), paid: "yes" },
    now: NOW,
  });
  assert.equal(badFacts.refusal, "invalid_facts");
  const badBaseline = applyEntitlementAuthorityOp(s0, {
    type: "capture_baseline",
    baseline: { ...baseline(), legacySpentCount: -1 },
    now: NOW,
  });
  assert.equal(badBaseline.refusal, "invalid_baseline");
  const nanBaseline = applyEntitlementAuthorityOp(s0, {
    type: "capture_baseline",
    baseline: { ...baseline(), legacySpentCount: Number.NaN },
    now: NOW,
  });
  assert.equal(nanBaseline.refusal, "invalid_baseline");
});

test("validation: the shape validator accepts states the machine itself produces", () => {
  let s = seeded({ withBaseline: true });
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  assert.equal(isValidEntitlementAuthorityState(s), true);
  assert.equal(
    isValidEntitlementAuthorityState(createEmptyEntitlementAuthorityState(SID)),
    true,
  );
});

test("DO: persisted state missing a count field fails closed — no NaN accounting", async () => {
  const sql = new FakeSqlStorage();
  const authority = newAuthority(sql);
  await authority.apply(SID, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await authority.commit(SID, {
    artifactId: "art-a",
    mapId: "map-1",
    fingerprint: "fp-art-a",
    finalized: true,
    now: NOW,
  });
  // Corrupt the persisted document the way the gate reproduced it: valid
  // JSON with baselineCompensationCount removed.
  const row = sql.rows.get(SID);
  const parsed = JSON.parse(row.state_json);
  delete parsed.baselineCompensationCount;
  sql.rows.set(SID, { ...row, state_json: JSON.stringify(parsed) });
  await assert.rejects(() => newAuthority(sql).getState(SID), /malformed/);
  await assert.rejects(
    () =>
      newAuthority(sql).commit(SID, {
        artifactId: "art-b",
        mapId: "map-1",
        fingerprint: "fp-art-b",
        finalized: true,
        now: NOW,
      }),
    /malformed/,
  );
});

test("DO: inconsistent persisted bookkeeping (compensations without spends) fails closed", async () => {
  const sql = new FakeSqlStorage();
  const authority = newAuthority(sql);
  await authority.apply(SID, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await authority.apply(SID, {
    type: "capture_baseline",
    baseline: baseline({ legacySpentCount: 0, legacyRemainingBalance: 3 }),
    now: NOW - 900,
  });
  const row = sql.rows.get(SID);
  const parsed = JSON.parse(row.state_json);
  parsed.baselineCompensationCount = 1;
  sql.rows.set(SID, { ...row, state_json: JSON.stringify(parsed) });
  await assert.rejects(() => newAuthority(sql).getState(SID), /malformed/);
});

test("validation: baseline conservation — remaining must equal allowance minus spent", () => {
  const s0 = seeded();
  // G-dot round-2 reproduction: allowance 1, spent 0, remaining 0 claims a
  // credit both never spent and no longer available; the derivation would
  // silently mint it back.
  const contradictory = applyEntitlementAuthorityOp(s0, {
    type: "capture_baseline",
    baseline: baseline({
      plan: "single",
      allowance: 1,
      legacyRemainingBalance: 0,
      legacySpentCount: 0,
    }),
    now: NOW,
  });
  assert.equal(contradictory.outcome, "refused");
  assert.equal(contradictory.refusal, "invalid_baseline");
  // Spent beyond the allowance is equally impossible in a settled record.
  const overspent = applyEntitlementAuthorityOp(s0, {
    type: "capture_baseline",
    baseline: baseline({ legacySpentCount: 4, legacyRemainingBalance: null }),
    now: NOW,
  });
  assert.equal(overspent.refusal, "invalid_baseline");
  // A subscription baseline carries no finite allowance by definition.
  const subAllowance = applyEntitlementAuthorityOp(s0, {
    type: "capture_baseline",
    baseline: baseline({ plan: "subscription", allowance: 3, legacyRemainingBalance: null }),
    now: NOW,
  });
  assert.equal(subAllowance.refusal, "invalid_baseline");
  assert.equal(isValidEntitlementBaseline(baseline()), true);
});

test("validation: compensation count/token must agree with the recovery decision", () => {
  // G-dot round-2 reproduction: a compensation already counted beside an
  // "unresolved" decision would let a legacy grant run on top of the
  // restored credit — file AND credit for a single spend.
  const gdotCase = seeded({
    withBaseline: true,
    baselineOver: { plan: "single", allowance: 1, legacyRemainingBalance: 0, legacySpentCount: 1 },
  });
  gdotCase.baselineCompensationCount = 1;
  assert.equal(isValidEntitlementAuthorityState(gdotCase), false);

  // Codex round-2 reproduction: pack3, two spends, one compensation already
  // counted while decision/token deny it — a second compensate would
  // restore the same spend again (balance 2 → 3 on a 3-credit pack).
  const codexCase = seeded({
    withBaseline: true,
    baselineOver: { legacySpentCount: 2, legacyRemainingBalance: 1 },
  });
  codexCase.baselineCompensationCount = 1;
  assert.equal(isValidEntitlementAuthorityState(codexCase), false);

  // A recorded compensated token beside an unresolved decision is the same
  // contradiction seen from its other view.
  const tokenCase = seeded({ withBaseline: true });
  tokenCase.compensatedConsumeToken = "tok-1";
  assert.equal(isValidEntitlementAuthorityState(tokenCase), false);
});

test("validation: compensation cardinality is exact in both directions", () => {
  // G-dot round-3 case 1: pack3, two spends, compensated decision/token,
  // but count 2 — this model can compensate only the latest consume, once,
  // so the correct count is 1 and the correct balance 2, never 3.
  let overCounted = seeded({
    withBaseline: true,
    baselineOver: { legacySpentCount: 2, legacyRemainingBalance: 1 },
  });
  overCounted = applyEntitlementAuthorityOp(overCounted, {
    type: "compensate",
    consumeToken: "tok-1",
    now: NOW,
  }).state;
  assert.equal(overCounted.baselineCompensationCount, 1);
  assert.equal(deriveRemainingAllowance(overCounted), 2);
  assert.equal(isValidEntitlementAuthorityState(overCounted), true);
  overCounted.baselineCompensationCount = 2;
  assert.equal(isValidEntitlementAuthorityState(overCounted), false);

  // G-dot round-3 case 2: the latest consume was already compensated
  // before baseline capture; an authority count of 1 counts that same
  // restore once in the baseline and once again locally.
  const preCounted = seeded({
    withBaseline: true,
    baselineOver: { lastCompensatedToken: "tok-1" },
  });
  assert.equal(preCounted.recoveryDecision, "compensated");
  assert.equal(preCounted.baselineCompensationCount, 0);
  preCounted.baselineCompensationCount = 1;
  assert.equal(isValidEntitlementAuthorityState(preCounted), false);

  // A granted decision carrying compensation bookkeeping is the same
  // impossibility in the other non-compensated decision.
  let granted = seeded({ withBaseline: true });
  granted = applyEntitlementAuthorityOp(granted, grantOp("art-legacy")).state;
  assert.equal(granted.recoveryDecision, "granted");
  granted.baselineCompensationCount = 1;
  assert.equal(isValidEntitlementAuthorityState(granted), false);
});

test("validation: a pre-compensated baseline forces the compensated shape (reverse implication)", () => {
  // G-dot round-4: the baseline establishes its latest consume was already
  // compensated in the settled record. Anything but decision compensated +
  // matching token + count 0 leaves that consume recoverable a second
  // time whenever another historical spend remains.
  const unresolvedForm = seeded({
    withBaseline: true,
    baselineOver: { legacySpentCount: 2, legacyRemainingBalance: 1, lastCompensatedToken: "tok-1" },
  });
  assert.equal(unresolvedForm.recoveryDecision, "compensated"); // capture marked it
  unresolvedForm.recoveryDecision = "unresolved";
  unresolvedForm.compensatedConsumeToken = null;
  assert.equal(unresolvedForm.baselineCompensationCount, 0);
  assert.equal(isValidEntitlementAuthorityState(unresolvedForm), false);

  const grantedForm = seeded({
    withBaseline: true,
    baselineOver: { lastCompensatedToken: "tok-1" },
  });
  grantedForm.recoveryDecision = "granted";
  assert.equal(isValidEntitlementAuthorityState(grantedForm), false);
});

test("validation: machine-produced compensated states stay valid", () => {
  // Authority-compensated: compensate() itself produces count 1 + the
  // compensated decision + the baseline's last-consume token.
  let s = seeded({ withBaseline: true });
  s = applyEntitlementAuthorityOp(s, {
    type: "compensate",
    consumeToken: "tok-1",
    now: NOW,
  }).state;
  assert.equal(s.recoveryDecision, "compensated");
  assert.equal(s.baselineCompensationCount, 1);
  assert.equal(isValidEntitlementAuthorityState(s), true);

  // Pre-compensated at capture (the legitimate case G-dot named): the
  // settled record already compensated the last consume, so capture marks
  // the decision while the authority's own count stays 0 — its restore is
  // already netted in the baseline's spent count.
  const pre = seeded({
    withBaseline: true,
    baselineOver: { lastCompensatedToken: "tok-1" },
  });
  assert.equal(pre.recoveryDecision, "compensated");
  assert.equal(pre.baselineCompensationCount, 0);
  assert.equal(isValidEntitlementAuthorityState(pre), true);
});

test("DO: persisted compensation count contradicting the decision fails closed", async () => {
  const sql = new FakeSqlStorage();
  const authority = newAuthority(sql);
  await authority.apply(SID, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await authority.apply(SID, {
    type: "capture_baseline",
    baseline: baseline({
      plan: "single",
      allowance: 1,
      legacyRemainingBalance: 0,
      legacySpentCount: 1,
    }),
    now: NOW - 900,
  });
  const row = sql.rows.get(SID);
  const parsed = JSON.parse(row.state_json);
  parsed.baselineCompensationCount = 1; // the decision stays "unresolved"
  sql.rows.set(SID, { ...row, state_json: JSON.stringify(parsed) });
  await assert.rejects(() => newAuthority(sql).getState(SID), /malformed/);
});

test("DO: persisted baseline breaking conservation fails closed", async () => {
  const sql = new FakeSqlStorage();
  const authority = newAuthority(sql);
  await authority.apply(SID, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await authority.apply(SID, {
    type: "capture_baseline",
    baseline: baseline(),
    now: NOW - 900,
  });
  const row = sql.rows.get(SID);
  const parsed = JSON.parse(row.state_json);
  parsed.baseline.allowance = 1;
  parsed.baseline.legacyRemainingBalance = 0;
  parsed.baseline.legacySpentCount = 0;
  sql.rows.set(SID, { ...row, state_json: JSON.stringify(parsed) });
  await assert.rejects(() => newAuthority(sql).getState(SID), /malformed/);
});

test("DO: persisted over-counted compensation fails closed", async () => {
  const sql = new FakeSqlStorage();
  const authority = newAuthority(sql);
  await authority.apply(SID, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await authority.apply(SID, {
    type: "capture_baseline",
    baseline: baseline({ legacySpentCount: 2, legacyRemainingBalance: 1 }),
    now: NOW - 900,
  });
  await authority.apply(SID, { type: "compensate", consumeToken: "tok-1", now: NOW - 800 });
  const row = sql.rows.get(SID);
  const parsed = JSON.parse(row.state_json);
  assert.equal(parsed.baselineCompensationCount, 1);
  parsed.baselineCompensationCount = 2;
  sql.rows.set(SID, { ...row, state_json: JSON.stringify(parsed) });
  await assert.rejects(() => newAuthority(sql).getState(SID), /malformed/);
});

test("DO: persisted pre-compensated baseline with an unresolved decision fails closed", async () => {
  const sql = new FakeSqlStorage();
  const authority = newAuthority(sql);
  await authority.apply(SID, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await authority.apply(SID, {
    type: "capture_baseline",
    baseline: baseline({
      legacySpentCount: 2,
      legacyRemainingBalance: 1,
      lastCompensatedToken: "tok-1",
    }),
    now: NOW - 900,
  });
  const row = sql.rows.get(SID);
  const parsed = JSON.parse(row.state_json);
  assert.equal(parsed.recoveryDecision, "compensated"); // capture marked it
  parsed.recoveryDecision = "unresolved";
  parsed.compensatedConsumeToken = null;
  sql.rows.set(SID, { ...row, state_json: JSON.stringify(parsed) });
  await assert.rejects(() => newAuthority(sql).getState(SID), /malformed/);
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
  assert.match(worker, /export const EntitlementAuthorityDO = Sentry\.instrumentDurableObjectWithSentry\(/);
});

test("wiring: only the fenced routes and the webhook reference the authority (Slices 3+4)", () => {
  const appDir = path.join(appRoot, "src/app");
  const referencers = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
        const text = readFileSync(full, "utf8");
        if (
          text.includes("EntitlementAuthority") ||
          text.includes("entitlementAuthority") ||
          text.includes("entitlementMigration") ||
          text.includes("referralRewardAuthority")
        ) {
          referencers.push(path.relative(appDir, full));
        }
      }
    }
  };
  walk(appDir);
  assert.deepEqual(
    referencers.sort(),
    [
      path.join("api/entitlements/compensate/route.ts"),
      path.join("api/entitlements/consume/route.ts"),
      path.join("api/stripe/webhook/route.ts"),
      // DL-1 Slice 4 (brief §5.4/§5.9): the archive route is the
      // publication protocol's caller — it references the authority
      // client for getState/apply of the four publication ops only.
      path.join("api/download/archive/route.ts"),
    ].sort(),
  );

  // Both legacy routes must acquire the accounting lease BEFORE the
  // record is even loaded — a lease taken after the load would leave
  // the check-to-write race the lease exists to close (Codex P1,
  // PR #367), and the legacy helper must run inside the lease.
  for (const [rel, helper] of [
    [path.join("api/entitlements/consume/route.ts"), "applyHdCreditConsume(record"],
    [path.join("api/entitlements/compensate/route.ts"), "applyHdCreditCompensate(record"],
  ]) {
    const text = readFileSync(path.join(appDir, rel), "utf8");
    const leaseAt = text.indexOf("acquireAccountingLease(");
    const loadAt = text.indexOf("kv.get<StripeSessionEntitlement>");
    const helperAt = text.indexOf(helper);
    const releaseAt = text.indexOf("releaseAccountingLease(");
    assert.ok(leaseAt >= 0, `${rel} must call acquireAccountingLease`);
    assert.ok(loadAt > leaseAt, `${rel} must lease before loading the record`);
    assert.ok(helperAt > leaseAt, `${rel} must lease before ${helper}`);
    assert.ok(releaseAt > helperAt, `${rel} must release after ${helper}`);
  }

  // The webhook's authority routing must stay behind the activation
  // gate: an ungated grant path would migrate referrers into the
  // undebited-download hole the gate exists to prevent (Codex P1).
  const webhook = readFileSync(
    path.join(appDir, "api/stripe/webhook/route.ts"),
    "utf8",
  );
  assert.match(webhook, /isEntitlementAuthorityRoutingEnabled\(\)/);

  // Both routes must seal the lease BEFORE the KV write and reconcile
  // AFTER it — a write without the seal can land behind a baseline
  // captured from a stalled holder (Codex P2, PR #367).
  for (const rel of [
    path.join("api/entitlements/consume/route.ts"),
    path.join("api/entitlements/compensate/route.ts"),
  ]) {
    const text = readFileSync(path.join(appDir, rel), "utf8");
    const sealAt = text.indexOf("sealAccountingLease(");
    const writeAt = text.indexOf("kv.set(ENTITLEMENT_KV.stripeSession(sessionId), updatedRecord)");
    const reconcileAt = text.indexOf("reconcileLegacyWrite(");
    assert.ok(sealAt >= 0, `${rel} must seal the lease`);
    assert.ok(writeAt > sealAt, `${rel} must seal before writing`);
    assert.ok(reconcileAt > writeAt, `${rel} must reconcile after writing`);
  }

  // Refund/dispute events must defer their dedupe so a transiently
  // deferred reversal can actually be redelivered (Codex P2, PR #367).
  assert.match(webhook, /isReferralReversalEvent/);
  assert.match(webhook, /deferDedupeUntilSuccess =[\s\S]*isReferralReversalEvent/);
});

/* ---------------- reward bucket (Slice 3, R1-A) ---------------- */

const grantRewardOp = (grantId, amount = 1, over = {}) => ({
  type: "grant_reward",
  grantId,
  amount,
  now: NOW,
  // Supported-path defaults (G-dot conformance fix round): the
  // machine requires the shell-attested registration outcome, and
  // missing classification evidence is unresolved — never native
  // admission. Bare calls present the attested leg plus P-c
  // snapshot-order evidence (the identity postdates the seeded
  // snapshot), the ordinary grant posture.
  discoveryRegistration: "registered",
  classificationEvidence: {
    sessionCreatedAt: NOW + 86_400_000,
    fencingCompletedAt: null,
    witness: "absent",
  },
  ...over,
});
const reverseRewardOp = (grantId, over = {}) => ({
  type: "reverse_reward",
  grantId,
  now: NOW,
  ...over,
});

test("reward grant lands in the bucket, spendable but tracked separately", () => {
  let s = seeded({ withBaseline: true }); // pack3, legacy spent 1, purchased remaining 2
  const r = applyEntitlementAuthorityOp(s, grantRewardOp("cs_referred_1"));
  assert.equal(r.outcome, "reward_granted");
  assert.equal(r.state.rewardBucketBalance, 1);
  assert.equal(r.state.rewardGrantedTotal, 1);
  // Total spendable = 2 purchased + 1 reward; the split stays visible.
  assert.equal(r.creditsRemaining, 3);
  const projection = buildEntitlementAuthorityProjection(r.state);
  assert.equal(projection.purchasedCreditsRemaining, 2);
  assert.equal(projection.rewardCreditsRemaining, 1);
  assert.equal(isValidEntitlementAuthorityState(r.state), true);
});

test("reward grant is idempotent per grant id; a conflicting amount fails closed", () => {
  let s = seeded({ withBaseline: true });
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_referred_1", 2)).state;
  const replay = applyEntitlementAuthorityOp(s, grantRewardOp("cs_referred_1", 2));
  assert.equal(replay.outcome, "reward_already_granted");
  assert.equal(replay.changed, false);
  assert.equal(replay.state.rewardBucketBalance, 2);
  const conflict = applyEntitlementAuthorityOp(s, grantRewardOp("cs_referred_1", 3));
  assert.equal(conflict.outcome, "refused");
  assert.equal(conflict.refusal, "invalid_reward");
});

test("reward grant refuses invalid shapes, missing facts, revocation, subscriptions", () => {
  const empty = createEmptyEntitlementAuthorityState(SID);
  const noFacts = applyEntitlementAuthorityOp(empty, grantRewardOp("g1"));
  assert.equal(noFacts.refusal, "no_facts");

  let s = seeded({ withBaseline: true });
  assert.equal(applyEntitlementAuthorityOp(s, grantRewardOp("g", 0)).refusal, "invalid_reward");
  assert.equal(applyEntitlementAuthorityOp(s, grantRewardOp("g", 1.5)).refusal, "invalid_reward");
  assert.equal(applyEntitlementAuthorityOp(s, grantRewardOp("  ", 1)).refusal, "invalid_reward");

  const revoked = seeded({ factsOver: { revoked: true }, withBaseline: true });
  assert.equal(applyEntitlementAuthorityOp(revoked, grantRewardOp("g2")).refusal, "revoked");

  const sub = seeded({
    factsOver: { plan: "subscription", subscriptionActive: true },
    baselineOver: {
      plan: "subscription",
      allowance: null,
      legacyRemainingBalance: null,
      legacySpentCount: 0,
      lastConsumeToken: null,
      lastConsumeAt: null,
    },
    withBaseline: true,
  });
  assert.equal(applyEntitlementAuthorityOp(sub, grantRewardOp("g3")).refusal, "subscription_plan");
});

test("commit spends the reward bucket first and marks the entry rewardFunded", () => {
  let s = seeded({ withBaseline: true }); // purchased remaining 2
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_referred_1")).state;
  const c1 = applyEntitlementAuthorityOp(s, commitOp("art-a"));
  assert.equal(c1.outcome, "committed");
  assert.equal(c1.state.ownedFiles["art-a"].rewardFunded, true);
  assert.equal(c1.state.rewardBucketBalance, 0);
  assert.equal(c1.state.rewardSpentTotal, 1);
  // Purchased side untouched by the reward-funded commit: still 2.
  assert.equal(buildEntitlementAuthorityProjection(c1.state).purchasedCreditsRemaining, 2);
  assert.equal(c1.creditsRemaining, 2);
  const c2 = applyEntitlementAuthorityOp(c1.state, commitOp("art-b"));
  assert.equal(c2.state.ownedFiles["art-b"].rewardFunded, false);
  assert.equal(buildEntitlementAuthorityProjection(c2.state).purchasedCreditsRemaining, 1);
  assert.equal(isValidEntitlementAuthorityState(c2.state), true);
});

test("clawback removes only the unspent bucket — purchased credits and files survive", () => {
  let s = seeded({ withBaseline: true }); // pack3: purchased remaining 2
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_r1")).state;
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_r2")).state;
  assert.equal(deriveRemainingAllowance(s), 4); // 2 purchased + 2 reward
  // Spend one reward on a file; the second reward stays unspent.
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  assert.equal(s.rewardBucketBalance, 1);

  // Bucket credits are fungible (as they were in the legacy combined
  // balance): one of the two granted credits was spent on the file, so the
  // bucket holds exactly ONE unspent credit. The first reversal removes
  // that one unspent credit; the second finds the bucket empty and
  // reclaims zero. Across both reversals the clawback never exceeds
  // granted − spent, and neither reversal touches the owned file or the
  // purchased side.
  const first = applyEntitlementAuthorityOp(s, reverseRewardOp("cs_r1"));
  assert.equal(first.outcome, "reward_reversed");
  assert.equal(first.rewardClawed, 1);
  assert.ok(first.state.ownedFiles["art-a"]);
  assert.equal(first.creditsRemaining, 2); // purchased only; bucket empty

  const unspent = applyEntitlementAuthorityOp(first.state, reverseRewardOp("cs_r2"));
  assert.equal(unspent.rewardClawed, 0);
  assert.equal(unspent.state.rewardBucketBalance, 0);
  assert.equal(unspent.state.rewardClawedTotal, 1);
  assert.equal(unspent.creditsRemaining, 2); // purchased side intact
  assert.ok(unspent.state.ownedFiles["art-a"]);
  assert.equal(isValidEntitlementAuthorityState(unspent.state), true);

  // Replay is an idempotent no-op; an unknown grant fails closed.
  const replay = applyEntitlementAuthorityOp(unspent.state, reverseRewardOp("cs_r2"));
  assert.equal(replay.outcome, "reward_reversal_already_applied");
  assert.equal(replay.changed, false);
  const unknown = applyEntitlementAuthorityOp(unspent.state, reverseRewardOp("cs_nope"));
  assert.equal(unknown.outcome, "refused");
  assert.equal(unknown.refusal, "unknown_reward_grant");
});

test("clawback of a partially spent multi-credit grant is bounded by the bucket", () => {
  let s = seeded({ withBaseline: true });
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_big", 3)).state;
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state; // spends 1 of 3
  s = applyEntitlementAuthorityOp(s, commitOp("art-b")).state; // spends 2 of 3
  const rev = applyEntitlementAuthorityOp(s, reverseRewardOp("cs_big"));
  assert.equal(rev.rewardClawed, 1); // only the one unspent bucket credit
  assert.equal(rev.state.rewardBucketBalance, 0);
  assert.equal(Object.keys(rev.state.ownedFiles).length, 2);
  assert.equal(isValidEntitlementAuthorityState(rev.state), true);
});

test("validator rejects persisted states that break reward conservation", () => {
  let s = seeded({ withBaseline: true });
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_r1")).state;
  assert.equal(isValidEntitlementAuthorityState(s), true);
  // Bucket overstated (balance no longer equals granted − spent − clawed).
  assert.equal(
    isValidEntitlementAuthorityState({ ...s, rewardBucketBalance: 5 }),
    false,
  );
  // Grant bookkeeping that disagrees with the totals.
  assert.equal(
    isValidEntitlementAuthorityState({ ...s, rewardGrantedTotal: 2 }),
    false,
  );
  // A claw recorded without a reversal.
  const clawWithoutReversal = structuredClone(s);
  clawWithoutReversal.rewardGrants["cs_r1"].clawedAmount = 1;
  clawWithoutReversal.rewardClawedTotal = 1;
  clawWithoutReversal.rewardBucketBalance = 0;
  assert.equal(isValidEntitlementAuthorityState(clawWithoutReversal), false);
  // Spent total with no reward-funded commit entry to carry it.
  const spentWithoutEntry = structuredClone(s);
  spentWithoutEntry.rewardSpentTotal = 1;
  spentWithoutEntry.rewardBucketBalance = 0;
  assert.equal(isValidEntitlementAuthorityState(spentWithoutEntry), false);
});

/* ---------------- accounting lease (Slice 3, Codex P1 on PR #367) ---------------- */

const acquireLeaseOp = (leaseId, kind = "legacy_write", over = {}) => ({
  type: "acquire_accounting_lease",
  leaseId,
  kind,
  ttlMs: 15_000,
  now: NOW,
  ...over,
});
const releaseLeaseOp = (leaseId, over = {}) => ({
  type: "release_accounting_lease",
  leaseId,
  now: NOW,
  ...over,
});

test("lease: acquire grants when free; a second holder is refused until expiry or release", () => {
  let s = seeded();
  const first = applyEntitlementAuthorityOp(s, acquireLeaseOp("lease-a"));
  assert.equal(first.outcome, "lease_acquired");
  s = first.state;
  assert.equal(s.accountingLease.leaseId, "lease-a");

  const rival = applyEntitlementAuthorityOp(s, acquireLeaseOp("lease-b", "migration"));
  assert.equal(rival.outcome, "refused");
  assert.equal(rival.refusal, "lease_held");
  assert.equal(rival.state.accountingLease.leaseId, "lease-a");

  // The holder may renew its own lease.
  const renewed = applyEntitlementAuthorityOp(s, acquireLeaseOp("lease-a", "legacy_write", { now: NOW + 5_000 }));
  assert.equal(renewed.outcome, "lease_acquired");
  assert.equal(renewed.state.accountingLease.expiresAt, NOW + 5_000 + 15_000);

  // After the TTL lapses the lease is treated as abandoned.
  const afterExpiry = applyEntitlementAuthorityOp(
    renewed.state,
    acquireLeaseOp("lease-b", "migration", { now: NOW + 5_000 + 15_001 }),
  );
  assert.equal(afterExpiry.outcome, "lease_acquired");
  assert.equal(afterExpiry.state.accountingLease.leaseId, "lease-b");
});

test("lease: release clears only the holder's lease and is idempotent", () => {
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, acquireLeaseOp("lease-a")).state;

  const wrongHolder = applyEntitlementAuthorityOp(s, releaseLeaseOp("lease-b"));
  assert.equal(wrongHolder.outcome, "lease_released");
  assert.equal(wrongHolder.changed, false);
  assert.equal(wrongHolder.state.accountingLease.leaseId, "lease-a");

  const released = applyEntitlementAuthorityOp(s, releaseLeaseOp("lease-a"));
  assert.equal(released.outcome, "lease_released");
  assert.equal(released.changed, true);
  assert.equal(released.state.accountingLease, null);

  const again = applyEntitlementAuthorityOp(released.state, releaseLeaseOp("lease-a"));
  assert.equal(again.outcome, "lease_released");
  assert.equal(again.changed, false);
});

test("lease: a legacy writer is fenced for good once a baseline exists", () => {
  const s = seeded({ withBaseline: true });
  const legacy = applyEntitlementAuthorityOp(s, acquireLeaseOp("lease-a", "legacy_write"));
  assert.equal(legacy.outcome, "refused");
  assert.equal(legacy.refusal, "already_migrated");
  // Migration itself may still acquire (it observes the baseline and stops).
  const migration = applyEntitlementAuthorityOp(s, acquireLeaseOp("lease-m", "migration"));
  assert.equal(migration.outcome, "lease_acquired");
});

test("lease: malformed acquire shapes fail closed", () => {
  const s = seeded();
  for (const op of [
    acquireLeaseOp(""),
    acquireLeaseOp("lease-a", "bogus"),
    acquireLeaseOp("lease-a", "legacy_write", { ttlMs: 0 }),
    acquireLeaseOp("lease-a", "legacy_write", { ttlMs: 1.5 }),
  ]) {
    const res = applyEntitlementAuthorityOp(s, op);
    assert.equal(res.outcome, "refused");
    assert.equal(res.refusal, "invalid_lease");
  }
});

test("validator: a well-formed lease passes, a malformed one fails closed, an absent field is the free state", () => {
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, acquireLeaseOp("lease-a")).state;
  assert.equal(isValidEntitlementAuthorityState(s), true);

  const malformed = structuredClone(s);
  malformed.accountingLease = { leaseId: "lease-a", kind: "bogus", expiresAt: NOW + 1 };
  assert.equal(isValidEntitlementAuthorityState(malformed), false);

  const noExpiry = structuredClone(s);
  noExpiry.accountingLease = { leaseId: "lease-a", kind: "migration", expiresAt: "soon" };
  assert.equal(isValidEntitlementAuthorityState(noExpiry), false);

  // States persisted before the lease existed carry no field: valid,
  // and the machine reads them as unleased.
  const preLease = structuredClone(s);
  delete preLease.accountingLease;
  assert.equal(isValidEntitlementAuthorityState(preLease), true);
});

test("lease seal: holder extends before writing; expired or foreign seals are refused", () => {
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, acquireLeaseOp("lease-a")).state;

  const sealed = applyEntitlementAuthorityOp(s, {
    type: "seal_accounting_lease",
    leaseId: "lease-a",
    ttlMs: 5_000,
    now: NOW + 10_000,
  });
  assert.equal(sealed.outcome, "lease_sealed");
  assert.equal(sealed.state.accountingLease.expiresAt, NOW + 10_000 + 5_000);

  const foreign = applyEntitlementAuthorityOp(s, {
    type: "seal_accounting_lease",
    leaseId: "lease-b",
    ttlMs: 5_000,
    now: NOW,
  });
  assert.equal(foreign.outcome, "refused");
  assert.equal(foreign.refusal, "lease_not_held");

  // The reproduced hazard: a holder that stalled past its TTL must not
  // be able to seal (and therefore must not write) after expiry.
  const expired = applyEntitlementAuthorityOp(s, {
    type: "seal_accounting_lease",
    leaseId: "lease-a",
    ttlMs: 5_000,
    now: NOW + 15_001,
  });
  assert.equal(expired.outcome, "refused");
  assert.equal(expired.refusal, "lease_expired");

  const noLease = applyEntitlementAuthorityOp(seeded(), {
    type: "seal_accounting_lease",
    leaseId: "lease-a",
    ttlMs: 5_000,
    now: NOW,
  });
  assert.equal(noLease.outcome, "refused");
  assert.equal(noLease.refusal, "lease_not_held");

  const badTtl = applyEntitlementAuthorityOp(s, {
    type: "seal_accounting_lease",
    leaseId: "lease-a",
    ttlMs: 0,
    now: NOW,
  });
  assert.equal(badTtl.outcome, "refused");
  assert.equal(badTtl.refusal, "invalid_lease");
});

test("capture: lease-conditional — stale capturers are refused, the live holder captures", () => {
  // Holder captures with its own live lease id.
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, acquireLeaseOp("lease-a")).state;
  const own = applyEntitlementAuthorityOp(s, {
    type: "capture_baseline",
    baseline: baseline(),
    expectedLeaseId: "lease-a",
    now: NOW,
  });
  assert.equal(own.outcome, "baseline_captured");

  // A capturer whose lease expired mid-flight is refused.
  let s2 = seeded();
  s2 = applyEntitlementAuthorityOp(s2, acquireLeaseOp("lease-a")).state;
  const expired = applyEntitlementAuthorityOp(s2, {
    type: "capture_baseline",
    baseline: baseline(),
    expectedLeaseId: "lease-a",
    now: NOW + 15_001,
  });
  assert.equal(expired.outcome, "refused");
  assert.equal(expired.refusal, "lease_expired");
  assert.equal(expired.state.baseline, null);

  // A foreign lease id is refused while another holder's lease is live.
  const foreign = applyEntitlementAuthorityOp(s2, {
    type: "capture_baseline",
    baseline: baseline(),
    expectedLeaseId: "lease-b",
    now: NOW,
  });
  assert.equal(foreign.outcome, "refused");
  assert.equal(foreign.refusal, "lease_not_held");

  // Even without an expected id, capture cannot barge through a live lease.
  const barging = applyEntitlementAuthorityOp(s2, {
    type: "capture_baseline",
    baseline: baseline(),
    now: NOW,
  });
  assert.equal(barging.outcome, "refused");
  assert.equal(barging.refusal, "lease_not_held");

  // No lease anywhere: the pre-lease direct capture semantics are intact.
  const direct = applyEntitlementAuthorityOp(seeded(), {
    type: "capture_baseline",
    baseline: baseline(),
    now: NOW,
  });
  assert.equal(direct.outcome, "baseline_captured");
});
