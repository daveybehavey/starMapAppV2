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
