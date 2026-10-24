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
const {
  ensureEntitlementMigrated,
  checkLegacyWriterFence,
  acquireAccountingLease,
  releaseAccountingLease,
  reconcileLegacyWrite,
} = await import("../../src/lib/entitlementMigration.ts");
const {
  createEntitlementAuthorityClient,
  isLocalAuthorityFallbackAllowed,
  __resetEntitlementAuthorityMemoryForTests,
} = await import("../../src/lib/entitlementAuthority.ts");
const { deriveRemainingAllowance } = await import(
  "../../src/lib/entitlementAuthorityState.ts"
);
const {
  grantReferralRewardViaAuthority,
  reverseReferralRewardViaAuthority,
  isEntitlementAuthorityRoutingEnabled,
  isTransientReferralGrantReason,
} = await import("../../src/lib/referralRewardAuthority.ts");
const {
  createReferralDiscoveryClient,
  __resetReferralDiscoveryMemoryForTests,
} = await import("../../src/lib/referralDiscoveryClient.ts");

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
  __resetReferralDiscoveryMemoryForTests();
  return createEntitlementAuthorityClient();
}

/**
 * Discovery input for wrapper grants (G-dot conformance fix round):
 * the wrapper runs the ReferralDiscoveryDO registration leg and
 * presents the classification evidence on every grant — a grant
 * without it is refused at the machine boundary. The referred
 * session postdates the referrer's migration snapshot (P-c
 * snapshot-order evidence), the ordinary landing posture.
 */
const discoveryFor = () => ({
  discoveryClient: createReferralDiscoveryClient(),
  sessionCreatedAt: NOW + 86_400_000,
  fencingCompletedAt: null,
});

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

  const granted = await grantReferralRewardViaAuthority(client, referrer, "cs_referred_1", 1, load, NOW, discoveryFor());
  assert.equal(granted.status, "granted");
  let state = await client.getState(referrer);
  assert.ok(state.baseline, "grant must migrate the referrer first");
  assert.equal(state.rewardBucketBalance, 1);
  // Purchased side: spent 1 of 1 → 0. Total spendable is the bucket only.
  assert.equal(deriveRemainingAllowance(state), 1);

  const replay = await grantReferralRewardViaAuthority(client, referrer, "cs_referred_1", 1, load, NOW, discoveryFor());
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
  await grantReferralRewardViaAuthority(client, referrer, "cs_referred_1", 1, load, NOW, discoveryFor());

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

test("referral reversal of an unresolved absence defers and creates no baseline", async () => {
  const client = freshClient();
  const referrer = sid();
  // Referrer migrates through an unrelated path; the historical grant
  // lives inside the legacy balance, not the bucket. Unresolved
  // absence is NOT a terminal zero (G-dot conformance: no terminal
  // absence answer without a settled inclusion, an operator receipt,
  // or a Discovery terminal decision behind it) — the authority-routed
  // reversal DEFERS and dedupe stays unfinalized for redelivery. (The
  // terminal pre-bucket answer survives only in the S-OFF legacy
  // posture, in the webhook's own legacy path, not this wrapper.)
  await ensureEntitlementMigrated(client, referrer, async () => record(), NOW);
  const reversal = await reverseReferralRewardViaAuthority(client, referrer, "cs_legacy_grant", NOW);
  assert.equal(reversal.status, "deferred");
  const state = await client.getState(referrer);
  assert.equal(deriveRemainingAllowance(state), 2); // legacy bucket untouched

  // A never-migrated referrer: reversal defers and must not create a
  // baseline as a side effect.
  const stranger = sid();
  const res2 = await reverseReferralRewardViaAuthority(client, stranger, "cs_legacy_grant", NOW);
  assert.equal(res2.status, "deferred");
  const strangerState = await client.getState(stranger);
  assert.equal(strangerState.baseline, null);
});

test("referral round trip: unspent reward is clawed back exactly once", async () => {
  const client = freshClient();
  const referrer = sid();
  const rec = record({ plan: "single", creditsTotal: 1, creditsRemaining: 1, lastConsumeToken: undefined, lastConsumeAt: undefined });
  const load = async () => rec;
  await grantReferralRewardViaAuthority(client, referrer, "cs_referred_9", 1, load, NOW, discoveryFor());
  let state = await client.getState(referrer);
  assert.equal(deriveRemainingAllowance(state), 2); // 1 purchased + 1 reward

  const reversal = await reverseReferralRewardViaAuthority(client, referrer, "cs_referred_9", NOW);
  assert.equal(reversal.status, "reversed");
  assert.equal(reversal.clawed, 1);
  state = await client.getState(referrer);
  assert.equal(deriveRemainingAllowance(state), 1); // purchased credit intact
  assert.equal(state.rewardBucketBalance, 0);
});

/* ---------------- accounting lease exclusion (Codex P1, PR #367) ----------------
 * The finding's interleaving: a legacy consume loads its record and
 * passes a read-only fence; a referral webhook then captures the
 * baseline from the pre-debit record; the consume writes its debit to
 * KV afterwards — authority says 3 credits, KV says 2, and the consume
 * token exists in neither baseline nor ledger. The lease protocol must
 * make that interleaving impossible: migration waits out an in-flight
 * legacy writer and captures the SETTLED record. */

test("exclusion: migration waits out an in-flight legacy writer and captures the settled record", async () => {
  const client = freshClient();
  const id = sid();
  let current = record(); // pack3: total 3, remaining 2, one spend (tok-1)

  // The legacy consume begins: it holds the writer lease (as the routes
  // now do) while it mutates its record.
  const writer = await acquireAccountingLease(client, id, "legacy_write", { now: NOW });
  assert.equal(writer.status, "acquired");

  // Migration arriving mid-consume cannot capture yet.
  const pending = ensureEntitlementMigrated(client, id, async () => current, NOW);
  const blocked = await Promise.race([
    pending.then(() => "finished"),
    new Promise((resolve) => setTimeout(() => resolve("still-waiting"), 400)),
  ]);
  assert.equal(blocked, "still-waiting");
  const midState = await client.getState(id);
  assert.equal(midState.baseline, null);

  // The consume settles: one more credit spent, token recorded in KV.
  current = record({ creditsRemaining: 1, lastConsumeToken: "tok-2", lastConsumeAt: NOW });
  await releaseAccountingLease(client, id, writer.leaseId);

  // The SAME migration now completes — against the settled record, so
  // the second spend is IN the baseline, not lost behind it.
  const res = await pending;
  assert.equal(res.status, "migrated");
  assert.equal(res.state.baseline.legacySpentCount, 2);
  assert.equal(res.state.baseline.legacyRemainingBalance, 1);
  assert.equal(res.state.baseline.lastConsumeToken, "tok-2");
  assert.equal(deriveRemainingAllowance(res.state), 1);
});

test("exclusion: a legacy writer arriving after capture is fenced, not busy", async () => {
  const client = freshClient();
  const id = sid();
  await ensureEntitlementMigrated(client, id, async () => record(), NOW);
  const res = await acquireAccountingLease(client, id, "legacy_write", { now: NOW });
  assert.equal(res.status, "fenced");
});

test("exclusion: a stuck lease yields migration_busy, and the grant path skips with that reason", async () => {
  const client = freshClient();
  const id = sid();
  // A writer lease with a long TTL that is never released in-test.
  const held = await client.apply(id, {
    type: "acquire_accounting_lease",
    leaseId: "stuck-writer",
    kind: "legacy_write",
    ttlMs: 60_000,
    now: Date.now(),
  });
  assert.equal(held.outcome, "lease_acquired");

  const t0 = Date.now();
  const res = await ensureEntitlementMigrated(client, id, async () => record());
  assert.equal(res.status, "migration_busy");
  assert.ok(Date.now() - t0 < 10_000, "busy must surface within the wait window");

  const grant = await grantReferralRewardViaAuthority(
    client,
    id,
    "cs_referred_busy",
    1,
    async () => record(),
  );
  assert.equal(grant.status, "skipped");
  assert.equal(grant.reason, "migration_busy");
});

/* ---------------- authority routing activation gate (Codex P1, PR #367) ---------------- */

test("routing gate: default off; only explicit truthy values enable it", () => {
  assert.equal(isEntitlementAuthorityRoutingEnabled({}), false);
  assert.equal(isEntitlementAuthorityRoutingEnabled({ DL1_AUTHORITY_ROUTING_ENABLED: "" }), false);
  assert.equal(isEntitlementAuthorityRoutingEnabled({ DL1_AUTHORITY_ROUTING_ENABLED: "0" }), false);
  assert.equal(isEntitlementAuthorityRoutingEnabled({ DL1_AUTHORITY_ROUTING_ENABLED: "false" }), false);
  assert.equal(isEntitlementAuthorityRoutingEnabled({ DL1_AUTHORITY_ROUTING_ENABLED: "1" }), true);
  assert.equal(isEntitlementAuthorityRoutingEnabled({ DL1_AUTHORITY_ROUTING_ENABLED: "true" }), true);
  assert.equal(isEntitlementAuthorityRoutingEnabled({ DL1_AUTHORITY_ROUTING_ENABLED: " YES " }), true);
});

test("transient grant reasons: only contention and outage are retryable", () => {
  assert.equal(isTransientReferralGrantReason("migration_busy"), true);
  assert.equal(isTransientReferralGrantReason("authority_unavailable"), true);
  assert.equal(isTransientReferralGrantReason("balance_out_of_range"), false);
  assert.equal(isTransientReferralGrantReason("no_record"), false);
  assert.equal(isTransientReferralGrantReason("invalid_baseline"), false);
  assert.equal(isTransientReferralGrantReason("refused"), false);
});

test("authority outage surfaces as transient statuses on both referral paths", async () => {
  const deadClient = { getState: async () => null, apply: async () => null };
  const grant = await grantReferralRewardViaAuthority(
    deadClient,
    sid(),
    "cs_referred_outage",
    1,
    async () => record(),
    NOW,
  );
  assert.equal(grant.status, "skipped");
  assert.equal(grant.reason, "authority_unavailable");
  assert.equal(isTransientReferralGrantReason(grant.reason), true);

  const reversal = await reverseReferralRewardViaAuthority(deadClient, sid(), "cs_referred_outage", NOW);
  assert.equal(reversal.status, "authority_unavailable");
});

/* ---------------- post-write reconcile backstop (Codex P2, PR #367) ---------------- */

test("reconcile: no baseline or a baseline holding the post-write state is ok", async () => {
  const client = freshClient();
  const id = sid();
  const pre = { creditsRemaining: 2, lastConsumeToken: "tok-1", lastCompensatedToken: null };
  const post = { creditsRemaining: 1, lastConsumeToken: "tok-2", lastCompensatedToken: null };
  const noRestore = async () => { throw new Error("must not restore"); };

  assert.equal(
    await reconcileLegacyWrite(client, id, { pre, post, loadCurrent: async () => post, restorePre: noRestore }),
    "ok",
  );

  // Capture a baseline from the SETTLED (post-write) record.
  await ensureEntitlementMigrated(client, id, async () => record({ creditsRemaining: 1, lastConsumeToken: "tok-2" }), NOW);
  assert.equal(
    await reconcileLegacyWrite(client, id, { pre, post, loadCurrent: async () => post, restorePre: noRestore }),
    "ok",
  );
});

test("reconcile: a baseline that captured the pre-write state restores the pre-image", async () => {
  const client = freshClient();
  const id = sid();
  // Baseline captured from the pre-write record (remaining 2, tok-1).
  await ensureEntitlementMigrated(client, id, async () => record(), NOW);

  const pre = { creditsRemaining: 2, lastConsumeToken: "tok-1", lastCompensatedToken: null };
  const post = { creditsRemaining: 1, lastConsumeToken: "tok-2", lastCompensatedToken: null };
  let current = post;
  let restored = false;
  const res = await reconcileLegacyWrite(client, id, {
    pre,
    post,
    loadCurrent: async () => current,
    restorePre: async () => { restored = true; current = pre; },
  });
  assert.equal(res, "restored");
  assert.equal(restored, true);
  assert.deepEqual(current, pre);
});

test("reconcile: moved-on KV or an unrelated baseline is a conflict, never a restore", async () => {
  const client = freshClient();
  const id = sid();
  await ensureEntitlementMigrated(client, id, async () => record(), NOW);
  const pre = { creditsRemaining: 2, lastConsumeToken: "tok-1", lastCompensatedToken: null };
  const post = { creditsRemaining: 1, lastConsumeToken: "tok-2", lastCompensatedToken: null };
  let restored = false;
  const restorePre = async () => { restored = true; };

  // KV no longer holds this write (a later writer moved it on).
  const movedOn = { creditsRemaining: 0, lastConsumeToken: "tok-3", lastCompensatedToken: null };
  assert.equal(
    await reconcileLegacyWrite(client, id, { pre, post, loadCurrent: async () => movedOn, restorePre }),
    "conflict",
  );
  assert.equal(restored, false);

  // Baseline matches neither side.
  const neither = { creditsRemaining: 3, lastConsumeToken: "tok-9", lastCompensatedToken: null };
  const id2 = sid();
  await ensureEntitlementMigrated(client, id2, async () => record({ creditsRemaining: 3, creditsTotal: 3, lastConsumeToken: undefined, lastConsumeAt: undefined }), NOW);
  assert.equal(
    await reconcileLegacyWrite(client, id2, { pre: neither, post, loadCurrent: async () => post, restorePre }),
    "conflict",
  );
  assert.equal(restored, false);

  const deadClient = { getState: async () => null, apply: async () => null };
  assert.equal(
    await reconcileLegacyWrite(deadClient, id, { pre, post, loadCurrent: async () => post, restorePre }),
    "authority_unavailable",
  );
});

test("migration: a capture refused for lease loss retries from a fresh record (Codex P2, PR #367)", async () => {
  const client = freshClient();
  const id = sid();
  let loads = 0;
  const res = await ensureEntitlementMigrated(client, id, async () => {
    loads += 1;
    if (loads === 1) {
      // The reproduced interleaving: this migration stalled past its
      // lease; a consume acquired the (expired) lease, settled, and
      // released. The record below is the STALE pre-debit one.
      const acq = await client.apply(id, {
        type: "acquire_accounting_lease",
        leaseId: "consume-lease",
        kind: "legacy_write",
        ttlMs: 15_000,
        now: NOW + 20_000,
      });
      assert.equal(acq.outcome, "lease_acquired");
      await client.apply(id, {
        type: "release_accounting_lease",
        leaseId: "consume-lease",
        now: NOW + 20_000,
      });
      return record();
    }
    // Fresh load on retry: the settled post-debit record.
    return record({ creditsRemaining: 1, lastConsumeToken: "tok-2" });
  }, NOW);
  assert.equal(res.status, "migrated");
  assert.equal(loads, 2);
  // The baseline reflects the settled debit, never the stale record.
  assert.equal(res.state.baseline.legacyRemainingBalance, 1);
  assert.equal(res.state.baseline.legacySpentCount, 2);
  assert.equal(res.state.baseline.lastConsumeToken, "tok-2");
});
