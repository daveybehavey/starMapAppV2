/**
 * entitlementMigration.test.mjs — DL-1 Slice 3: one-time migration
 * baseline + legacy writer fencing + R1 reward-bucket routing.
 *
 * Pins (build plan Slice 3 acceptance; v3 §3.2 migration cases, §3.4 race
 * case; R1 option A):
 * - the baseline builder derives settled history from the legacy record
 *   (exhausted Single, partially spent pack3, pre-compensated consume,
 *   missing token, missing mapId) and fails closed with a named reason on
 *   every inconsistent shape instead of guessing;
 * - baseline conservation: the derived spendable total after capture
 *   equals the legacy record's balance — including a reward-inflated
 *   Single whose settled total exceeds the plan allowance (the whole
 *   pre-migration balance is the legacy bucket; no retroactive split);
 * - ensure-migration is idempotent and race-safe: re-running it (even
 *   against a KV record changed after capture) never resets the baseline
 *   or restores spent credits; concurrent triggers yield one baseline;
 * - the fence reports open / fenced / authority_unavailable, and an
 *   unreachable authority is never treated as "no baseline";
 * - the production memory-fallback hardening (PR #362 cutover note): a
 *   bare CI=1 no longer permits the in-memory authority fallback;
 * - referral routing (referralRewardAuthority): a grant migrates the
 *   referrer and lands in the bucket; a reversal claws back only unspent
 *   bucket credits; a pre-bucket (legacy-era) grant's reversal reclaims
 *   zero and creates no baseline as a side effect.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./entitlementAuthority.hooks.mjs", import.meta.url);

process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";

const { buildBaselineFromLegacyRecord } = await import(
  "../../src/lib/entitlementMigration.ts"
);
const { ensureEntitlementMigrated, checkLegacyWriterFence } = await import(
  "../../src/lib/entitlementMigration.ts"
);
const {
  createEntitlementAuthorityClient,
  isLocalAuthorityFallbackAllowed,
  __resetEntitlementAuthorityMemoryForTests,
} = await import("../../src/lib/entitlementAuthority.ts");
const { deriveRemainingAllowance } = await import(
  "../../src/lib/entitlementAuthorityState.ts"
);
const { grantReferralRewardViaAuthority, reverseReferralRewardViaAuthority } =
  await import("../../src/lib/referralRewardAuthority.ts");

const NOW = Date.UTC(2026, 9, 22, 13, 0, 0);
const HOUR = 60 * 60 * 1000;

let seq = 0;
const sid = () => `cs_test_dl1_slice3_${++seq}`;

const record = (over = {}) => ({
  paid: true,
  revoked: false,
  created: NOW - 30 * 24 * HOUR,
  mapId: "map-1",
  plan: "pack3",
  creditsRemaining: 2,
  creditsTotal: 3,
  lastConsumeToken: "tok-1",
  lastConsumeAt: NOW - HOUR,
  ...over,
});

function freshClient() {
  __resetEntitlementAuthorityMemoryForTests();
  return createEntitlementAuthorityClient();
}

/* ---------------- baseline builder: settled shapes ---------------- */

test("builder: partially spent pack3 derives spent count and preserves the balance", () => {
  const built = buildBaselineFromLegacyRecord(record(), NOW);
  assert.equal(built.status, "ready");
  assert.equal(built.baseline.allowance, 3);
  assert.equal(built.baseline.legacySpentCount, 1);
  assert.equal(built.baseline.legacyRemainingBalance, 2);
  assert.equal(built.baseline.purchaseMapId, "map-1");
  assert.equal(built.baseline.lastConsumeToken, "tok-1");
});

test("builder: exhausted Single (the Guy shape) — spent 1, remaining 0", () => {
  const built = buildBaselineFromLegacyRecord(
    record({ plan: "single", creditsTotal: 1, creditsRemaining: 0 }),
    NOW,
  );
  assert.equal(built.status, "ready");
  assert.equal(built.baseline.legacySpentCount, 1);
  assert.equal(built.baseline.legacyRemainingBalance, 0);
});

test("builder: missing consume token keeps the spend spent (support-only recovery)", () => {
  const built = buildBaselineFromLegacyRecord(
    record({ plan: "single", creditsTotal: 1, creditsRemaining: 0, lastConsumeToken: undefined, lastConsumeAt: undefined }),
    NOW,
  );
  assert.equal(built.status, "ready");
  assert.equal(built.baseline.legacySpentCount, 1);
  assert.equal(built.baseline.lastConsumeToken, null);
});

test("builder: missing mapId baselines with a null purchase map (grant falls back to support)", () => {
  const built = buildBaselineFromLegacyRecord(record({ mapId: undefined }), NOW);
  assert.equal(built.status, "ready");
  assert.equal(built.baseline.purchaseMapId, null);
  assert.equal(built.facts.mapId, null);
});

test("builder: subscription record baselines as unlimited with no spend", () => {
  const built = buildBaselineFromLegacyRecord(
    record({
      plan: "subscription",
      subscriptionActive: true,
      creditsRemaining: undefined,
      creditsTotal: undefined,
      lastConsumeToken: undefined,
      lastConsumeAt: undefined,
    }),
    NOW,
  );
  assert.equal(built.status, "ready");
  assert.equal(built.baseline.allowance, null);
  assert.equal(built.baseline.legacyRemainingBalance, null);
  assert.equal(built.baseline.legacySpentCount, 0);
});

test("builder: reward-inflated Single — settled total above plan allowance is captured whole", () => {
  // Bought 1, earned 1 referral reward pre-migration, spent nothing: the
  // legacy writers raised creditsTotal alongside the balance. R1-A: the
  // whole balance is the legacy bucket; no fabricated paid/reward split.
  const built = buildBaselineFromLegacyRecord(
    record({ plan: "single", creditsTotal: 2, creditsRemaining: 2, lastConsumeToken: undefined, lastConsumeAt: undefined }),
    NOW,
  );
  assert.equal(built.status, "ready");
  assert.equal(built.baseline.allowance, 2);
  assert.equal(built.baseline.legacySpentCount, 0);
  assert.match(built.baseline.accessTermsNote, /exceeds the single plan allowance/);
});

/* ---------------- baseline builder: fail-closed shapes ---------------- */

test("builder: inconsistent records are pending with named reasons, never guessed", () => {
  const cases = [
    [{ paid: false }, "record_not_paid"],
    [{ plan: undefined }, "missing_plan"],
    [{ creditsTotal: undefined }, "missing_credits_total"],
    [{ creditsTotal: 0 }, "allowance_below_plan"],
    [{ creditsRemaining: undefined }, "missing_credits_remaining"],
    [{ creditsRemaining: 4 }, "balance_out_of_range"],
    [{ creditsRemaining: -1 }, "balance_out_of_range"],
    [{ creditsRemaining: 1.5 }, "balance_out_of_range"],
    // Compensation evidence without a consume token.
    [{ lastConsumeToken: undefined, lastCompensatedToken: "tok-9" }, "inconsistent_consume_evidence"],
    // A subscription carrying consume evidence contradicts its plan.
    [
      { plan: "subscription", subscriptionActive: true, creditsTotal: undefined, creditsRemaining: undefined },
      "inconsistent_consume_evidence",
    ],
  ];
  for (const [over, reason] of cases) {
    const built = buildBaselineFromLegacyRecord(record(over), NOW);
    assert.equal(built.status, "pending", JSON.stringify(over));
    assert.equal(built.reason, reason, JSON.stringify(over));
  }
});

/* ---------------- ensure: capture, conservation, idempotence ---------------- */

test("ensure migrates once; the derived balance equals the legacy balance (conservation)", async () => {
  const client = freshClient();
  const id = sid();
  const rec = record();
  const res = await ensureEntitlementMigrated(client, id, async () => rec, NOW);
  assert.equal(res.status, "migrated");
  assert.equal(deriveRemainingAllowance(res.state), rec.creditsRemaining);
  assert.equal(res.state.facts.plan, "pack3");
  assert.equal(res.state.baseline.legacySpentCount, 1);
});

test("ensure: a pre-compensated consume is marked compensated at capture", async () => {
  const client = freshClient();
  const id = sid();
  const rec = record({ lastCompensatedToken: "tok-1" });
  const res = await ensureEntitlementMigrated(client, id, async () => rec, NOW);
  assert.equal(res.status, "migrated");
  assert.equal(res.state.recoveryDecision, "compensated");
  assert.equal(res.state.baselineCompensationCount, 0); // netted in the baseline
});

test("ensure is idempotent: a changed KV record afterwards never resets the baseline", async () => {
  const client = freshClient();
  const id = sid();
  let current = record();
  const load = async () => current;
  const first = await ensureEntitlementMigrated(client, id, load, NOW);
  assert.equal(first.status, "migrated");

  // The legacy world moves on (a later stale projection / record rewrite);
  // re-running migration must not re-import it or restore spent credits.
  current = record({ creditsRemaining: 3, lastConsumeToken: "tok-later" });
  const second = await ensureEntitlementMigrated(client, id, load, NOW + HOUR);
  assert.equal(second.status, "already_migrated");
  assert.deepEqual(second.state.baseline, first.state.baseline);
  assert.equal(deriveRemainingAllowance(second.state), 2);
});

test("ensure: concurrent triggers produce exactly one baseline", async () => {
  const client = freshClient();
  const id = sid();
  const rec = record();
  const load = async () => rec;
  const [a, b] = await Promise.all([
    ensureEntitlementMigrated(client, id, load, NOW),
    ensureEntitlementMigrated(client, id, load, NOW),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, ["already_migrated", "migrated"]);
  const state = await client.getState(id);
  assert.equal(state.baseline.legacySpentCount, 1);
  assert.equal(deriveRemainingAllowance(state), 2);
});

test("ensure: pending records and missing records do not capture", async () => {
  const client = freshClient();
  const pending = await ensureEntitlementMigrated(
    client,
    sid(),
    async () => record({ creditsRemaining: 99 }),
    NOW,
  );
  assert.equal(pending.status, "migration_pending");
  assert.equal(pending.reason, "balance_out_of_range");

  const missing = await ensureEntitlementMigrated(client, sid(), async () => null, NOW);
  assert.equal(missing.status, "no_record");
});

test("ensure: an unreachable authority fails closed", async () => {
  const deadClient = { getState: async () => null, apply: async () => null };
  const res = await ensureEntitlementMigrated(deadClient, sid(), async () => record(), NOW);
  assert.equal(res.status, "authority_unavailable");
});

/* ---------------- fence ---------------- */

test("fence: open before migration, fenced after, unavailable is not open", async () => {
  const client = freshClient();
  const id = sid();
  assert.equal((await checkLegacyWriterFence(client, id)).status, "open");
  await ensureEntitlementMigrated(client, id, async () => record(), NOW);
  assert.equal((await checkLegacyWriterFence(client, id)).status, "fenced");

  const deadClient = { getState: async () => null, apply: async () => null };
  assert.equal((await checkLegacyWriterFence(deadClient, id)).status, "authority_unavailable");
});

/* ---------------- production fallback hardening (PR #362 note) ---------------- */

test("memory fallback permission: bare CI=1 is not enough anymore", () => {
  assert.equal(isLocalAuthorityFallbackAllowed({}), false);
  assert.equal(isLocalAuthorityFallbackAllowed({ CI: "1" }), false);
  assert.equal(isLocalAuthorityFallbackAllowed({ CI: "1", NODE_ENV: "production" }), false);
  assert.equal(isLocalAuthorityFallbackAllowed({ NODE_ENV: "production" }), false);
  assert.equal(isLocalAuthorityFallbackAllowed({ STARMAP_ENTITLEMENT_AUTHORITY_LOCAL: "1" }), true);
  assert.equal(isLocalAuthorityFallbackAllowed({ NODE_ENV: "development" }), true);
  assert.equal(isLocalAuthorityFallbackAllowed({ NODE_ENV: "test" }), true);
});

/* ---------------- referral routing (R1-A) ---------------- */

test("referral grant migrates the referrer and lands in the bucket, idempotently", async () => {
  const client = freshClient();
  const referrer = sid();
  const rec = record({ plan: "single", creditsTotal: 1, creditsRemaining: 0, lastConsumeToken: "tok-old", lastConsumeAt: NOW - 72 * HOUR });
  const load = async () => rec;

  const granted = await grantReferralRewardViaAuthority(client, referrer, "cs_referred_1", 1, load, NOW);
  assert.equal(granted.status, "granted");
  let state = await client.getState(referrer);
  assert.ok(state.baseline, "grant must migrate the referrer first");
  assert.equal(state.rewardBucketBalance, 1);
  // Purchased side: spent 1 of 1 → 0. Total spendable is the bucket only.
  assert.equal(deriveRemainingAllowance(state), 1);

  const replay = await grantReferralRewardViaAuthority(client, referrer, "cs_referred_1", 1, load, NOW);
  assert.equal(replay.status, "already_granted");
  state = await client.getState(referrer);
  assert.equal(state.rewardBucketBalance, 1);
});

test("referral grant skips (fail closed) when the referrer cannot be baselined", async () => {
  const client = freshClient();
  const res = await grantReferralRewardViaAuthority(
    client,
    sid(),
    "cs_referred_x",
    1,
    async () => record({ creditsRemaining: 99 }),
    NOW,
  );
  assert.equal(res.status, "skipped");
  assert.equal(res.reason, "balance_out_of_range");
});

test("referral reversal claws back only the unspent bucket; purchased value unreachable", async () => {
  const client = freshClient();
  const referrer = sid();
  const rec = record(); // pack3: purchased remaining 2
  const load = async () => rec;
  await grantReferralRewardViaAuthority(client, referrer, "cs_referred_1", 1, load, NOW);

  // Spend the reward on a file (commit spends the bucket first).
  const committed = await client.apply(referrer, {
    type: "commit",
    artifactId: "art-a",
    mapId: "map-1",
    fingerprint: "fp-art-a",
    finalized: true,
    now: NOW,
  });
  assert.equal(committed.outcome, "committed");
  assert.equal(committed.state.ownedFiles["art-a"].rewardFunded, true);

  // The referred purchase is refunded: the clawback finds the bucket
  // spent and reclaims ZERO — the file and the 2 purchased credits stand.
  const reversal = await reverseReferralRewardViaAuthority(client, referrer, "cs_referred_1", NOW);
  assert.equal(reversal.status, "reversed");
  assert.equal(reversal.clawed, 0);
  const state = await client.getState(referrer);
  assert.ok(state.ownedFiles["art-a"]);
  assert.equal(deriveRemainingAllowance(state), 2);

  const replay = await reverseReferralRewardViaAuthority(client, referrer, "cs_referred_1", NOW);
  assert.equal(replay.status, "already_reversed");
});

test("referral reversal of a pre-bucket grant reclaims zero and creates no baseline", async () => {
  const client = freshClient();
  const referrer = sid();
  // Referrer migrates through an unrelated path; the historical grant
  // lives inside the legacy balance, not the bucket.
  await ensureEntitlementMigrated(client, referrer, async () => record(), NOW);
  const reversal = await reverseReferralRewardViaAuthority(client, referrer, "cs_legacy_grant", NOW);
  assert.equal(reversal.status, "not_bucket_grant");
  const state = await client.getState(referrer);
  assert.equal(deriveRemainingAllowance(state), 2); // legacy bucket untouched

  // A never-migrated referrer: reversal is a no-op and must not create a
  // baseline as a side effect.
  const stranger = sid();
  const res2 = await reverseReferralRewardViaAuthority(client, stranger, "cs_legacy_grant", NOW);
  assert.equal(res2.status, "not_bucket_grant");
  const strangerState = await client.getState(stranger);
  assert.equal(strangerState.baseline, null);
});

test("referral round trip: unspent reward is clawed back exactly once", async () => {
  const client = freshClient();
  const referrer = sid();
  const rec = record({ plan: "single", creditsTotal: 1, creditsRemaining: 1, lastConsumeToken: undefined, lastConsumeAt: undefined });
  const load = async () => rec;
  await grantReferralRewardViaAuthority(client, referrer, "cs_referred_9", 1, load, NOW);
  let state = await client.getState(referrer);
  assert.equal(deriveRemainingAllowance(state), 2); // 1 purchased + 1 reward

  const reversal = await reverseReferralRewardViaAuthority(client, referrer, "cs_referred_9", NOW);
  assert.equal(reversal.status, "reversed");
  assert.equal(reversal.clawed, 1);
  state = await client.getState(referrer);
  assert.equal(deriveRemainingAllowance(state), 1); // purchased credit intact
  assert.equal(state.rewardBucketBalance, 0);
});
