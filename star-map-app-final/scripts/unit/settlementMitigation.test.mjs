/**
 * settlementMitigation.test.mjs — Option B interim settlement mitigation
 * (M1-01 / M1-02 / M1-06), S61-1 mapping of the S54-3 fix designs.
 *
 * Drives the shared settlement policy in src/lib/entitlementsStore.ts
 * against a fault-injecting fake KV (the real kv object's methods are
 * replaced, following the accountLiteConcurrency pattern), plus structural
 * source pins for the webhook/verify route changes.
 *
 * PASS tests assert the narrowed B behavior. MEASURE tests deliberately
 * demonstrate a RETAINED residual (KV has no conditional write or
 * linearizable read): they pass by showing the exposure exists exactly as
 * documented — they are not closure tests.
 *
 * Negative controls: the structural pins fail on the pre-fix route sources
 * (verify contained `credits += existingCredits`; webhook spread
 * `{ ...current, accessEmailSentAt }` into the session record and spread
 * `...expiredBase` over it; markPaymentIntentRevoked used ordinary kv.set),
 * and the store tests fail against a settlement that rewrites on replay.
 *
 * Fix round (Codex P1): the metadata-completion tests and the
 * access-email completion pin fail against the pre-fix-round head
 * 642e2c70, where already_settled never invoked the caller's builder and
 * the webhook's access-email send was gated on !alreadyPaid alone.
 *
 * Fix round 2 (Codex P2): verify's builder also omitted `created`, the
 * review engine's eligibility anchor (classifyDigitalEntitlement reads
 * record.created via normalizeAnchorMs with NO fallback — a verify-born
 * record classified permanently as invalid_anchor). The stamp is added
 * at birth, NOT to the completion allowlist: the pin below fails on the
 * 7bad1035 verify source, and the control test reproduces the exclusion
 * on the exact pre-fix record shape.
 *
 * Fix round 3 (Codex P2): the mapping prescribes "A cookie preserved" for
 * a refused carry, and verify's comment claimed it — but every successful
 * verify response overwrote the premium cookie with the new session,
 * stranding the buyer's in-browser access to A's remaining credits. The
 * live-entitlement decision (sessionHoldsLiveEntitlement) is behavioural
 * below; the route wiring is pinned: preservation is computed only for a
 * refused carry, and every premium-cookie write — paid fast path,
 * already_settled, fresh settlement — is guarded by it. Both fail on
 * the bfdddd78 sources.
 *
 * Fix round 4 (G-dot gate rejection of the residual acceptance at
 * adbc60fa): metadata completion no longer writes the session record at
 * all — completed values live in the settlement-metadata sidecar and
 * reach consumers through applySettlementMetadata. The earlier
 * completion tests asserted the whole-record merged write; they now
 * assert the stronger invariant (session record byte-identical,
 * completion visible only in the sidecar and the merged view). The new
 * stale-present / write-applied-response-lost tests below fail on
 * adbc60fa, where the completion put republishes its read snapshot.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./tsAliasLoader.mjs", import.meta.url);

process.env.STARMAP_KV_ALLOW_LOCAL = "1";

const { kv } = await import("../../src/lib/kv.ts");
const {
  ENTITLEMENT_KV,
  CARRY_NOT_SUPPORTED_INTERIM,
  SETTLEMENT_METADATA_COMPLETION_FIELDS,
  settleSessionPurchase,
  recordTransferRefusal,
  sessionHoldsLiveEntitlement,
  applySettlementMetadata,
} = await import("../../src/lib/entitlementsStore.ts");
const { classifyDigitalEntitlement, REVIEW_DIGITAL_DELAY_MS } = await import(
  "../../src/lib/reviewRequests.ts",
);

const realKv = { get: kv.get, set: kv.set, setDurable: kv.setDurable };

let data;
let putLog;
let failSetKeys;
let failDurableKeys;
let getHook;

function installFakeKv() {
  data = new Map();
  putLog = [];
  failSetKeys = new Set();
  failDurableKeys = new Set();
  getHook = null;
  kv.get = async (key) => {
    const read = () => (data.has(key) ? structuredClone(data.get(key)) : null);
    return getHook ? getHook(key, read) : read();
  };
  kv.set = async (key, value) => {
    if (failSetKeys.has(key)) throw new Error(`injected set failure for ${key}`);
    data.set(key, structuredClone(value));
    putLog.push({ op: "set", key });
    return "OK";
  };
  kv.setDurable = async (key, value) => {
    if (failDurableKeys.has(key)) throw new Error(`injected durable failure for ${key}`);
    data.set(key, structuredClone(value));
    putLog.push({ op: "setDurable", key });
    return "OK";
  };
}

function restoreKv() {
  kv.get = realKv.get;
  kv.set = realKv.set;
  kv.setDurable = realKv.setDurable;
}

test.beforeEach(() => installFakeKv());
test.afterEach(() => restoreKv());

const sessionKey = (id) => ENTITLEMENT_KV.stripeSession(id);
const sidecarKey = (id) => ENTITLEMENT_KV.settlementMetadata(id);
const sessionPuts = (id) => putLog.filter((entry) => entry.key === sessionKey(id));
const sidecarPuts = (id) => putLog.filter((entry) => entry.key === sidecarKey(id));

/** The consumer view of a session: record merged with its metadata sidecar. */
function mergedView(id) {
  const record = data.get(sessionKey(id));
  if (!record) return null;
  return applySettlementMetadata(record, data.get(sidecarKey(id)) ?? null);
}

function pack3Terms(overrides = {}) {
  return {
    plan: "pack3",
    purchasedCredits: 3,
    orderType: "digital",
    printVariant: null,
    includesDigitalAddOn: false,
    subscription: false,
    amountTotal: 2900,
    currency: "usd",
    paymentIntentId: "pi_1",
    subscriptionId: null,
    customerId: "cus_1",
    ...overrides,
  };
}

function buildFromTerms(terms) {
  return (receipt) => ({
    paid: true,
    settlementReceipt: receipt,
    plan: terms.plan,
    creditsRemaining: terms.purchasedCredits || undefined,
    creditsTotal: terms.purchasedCredits || undefined,
    orderType: terms.orderType,
    includesDigitalAddOn: terms.includesDigitalAddOn,
    subscriptionActive: terms.subscription ? true : undefined,
  });
}

function settle(sessionId, terms) {
  return settleSessionPurchase({
    sessionId,
    paymentIntentId: terms.paymentIntentId,
    purchaseTerms: terms,
    buildInitialRecord: buildFromTerms(terms),
  });
}

test("PASS replay after consumption and reward performs no session write (M1-01)", async () => {
  const id = "cs_replay";
  const terms = pack3Terms();
  const first = await settle(id, terms);
  assert.equal(first.kind, "initialized");
  assert.equal(sessionPuts(id).length, 1);

  // Consumption and a referral reward land after settlement.
  const settled = data.get(sessionKey(id));
  data.set(sessionKey(id), {
    ...settled,
    creditsRemaining: 2,
    creditsTotal: 4,
    lastConsumeToken: "consume_tok_1",
  });
  const snapshot = structuredClone(data.get(sessionKey(id)));
  putLog = [];

  const replay = await settle(id, terms);
  assert.equal(replay.kind, "already_settled");
  assert.equal(sessionPuts(id).length, 0, "replay must not write the session record");
  assert.deepEqual(data.get(sessionKey(id)), snapshot, "spent balance and reward survive replay");
});

test("PASS webhook/verify ordering: second settlement writes nothing", async () => {
  const id = "cs_ordering";
  const terms = pack3Terms();
  const first = await settle(id, terms);
  assert.equal(first.kind, "initialized");
  putLog = [];
  const second = await settle(id, terms);
  assert.equal(second.kind, "already_settled");
  assert.equal(putLog.length, 0, "no writes at all once the receipt is visible");
  assert.equal(data.get(sessionKey(id)).creditsTotal, 3);
});

test("PASS legacy paid record without receipt is adopted by observation only", async () => {
  const id = "cs_legacy";
  const seed = {
    paid: true,
    plan: "pack3",
    creditsTotal: 3,
    creditsRemaining: 0, // zero remaining is a spent purchase, not a missing one
    orderType: "digital",
    includesDigitalAddOn: false,
  };
  data.set(sessionKey(id), structuredClone(seed));

  const outcome = await settle(id, pack3Terms());
  assert.equal(outcome.kind, "already_settled");
  assert.equal(sessionPuts(id).length, 0, "adoption must not touch the session record");
  assert.deepEqual(data.get(sessionKey(id)), seed);

  const adoption = data.get(ENTITLEMENT_KV.settlementAdoption(id));
  assert.ok(adoption, "adoption evidence recorded separately");
  assert.equal(adoption.evidenceKind, "legacy_observation");
  assert.equal(adoption.observedCreditsRemaining, 0);
  assert.equal(adoption.observedCreditsTotal, 3);
  assert.equal(typeof adoption.accountingFingerprint, "string");
});

test("PASS adoption evidence failure never triggers session reconstruction", async () => {
  const id = "cs_legacy_fail";
  const seed = { paid: true, plan: "single", creditsTotal: 1, creditsRemaining: 1, orderType: "digital" };
  data.set(sessionKey(id), structuredClone(seed));
  failDurableKeys.add(ENTITLEMENT_KV.settlementAdoption(id));

  const outcome = await settle(id, pack3Terms({ plan: "single", purchasedCredits: 1 }));
  assert.equal(outcome.kind, "already_settled");
  assert.equal(sessionPuts(id).length, 0);
  assert.deepEqual(data.get(sessionKey(id)), seed);
});

test("PASS metadata conflict with a visible receipt requires reconciliation", async () => {
  const id = "cs_conflict";
  const first = await settle(id, pack3Terms());
  assert.equal(first.kind, "initialized");
  const snapshot = structuredClone(data.get(sessionKey(id)));
  putLog = [];

  const conflict = await settle(id, pack3Terms({ paymentIntentId: "pi_other", purchasedCredits: 1 }));
  assert.equal(conflict.kind, "reconciliation_required");
  assert.equal(putLog.length, 0, "a conflict must not produce a second allowance or any write");
  assert.deepEqual(data.get(sessionKey(id)), snapshot);
});

test("PASS unpaid accounting-bearing record is not normalized into a fresh purchase", async () => {
  const id = "cs_blocking";
  data.set(sessionKey(id), { paid: false, creditsRemaining: 2, creditsTotal: 3, orderType: "digital" });
  const outcome = await settle(id, pack3Terms());
  assert.equal(outcome.kind, "reconciliation_required");
  assert.equal(sessionPuts(id).length, 0);
});

test("PASS expired-style unpaid record without accounting state can still initialize", async () => {
  const id = "cs_expired_then_paid";
  data.set(sessionKey(id), { paid: false, expiredAt: 123, recoveryUrl: "https://example.com/recover" });
  const outcome = await settle(id, pack3Terms());
  assert.equal(outcome.kind, "initialized");
  assert.equal(data.get(sessionKey(id)).paid, true);
  assert.equal(data.get(sessionKey(id)).settlementReceipt.operationId, `purchase:v1:${id}`);
});

test("PASS revocation evidence visible before settlement blocks initialization (M1-06)", async () => {
  const byTombstone = "cs_revoked_pi";
  data.set("stripe:pi:revoked:pi_1", { revoked: true, revokedAt: 1, reason: "refund" });
  const outcomeA = await settle(byTombstone, pack3Terms());
  assert.equal(outcomeA.kind, "revoked");
  assert.equal(outcomeA.sessionWasWritten, false);
  assert.equal(sessionPuts(byTombstone).length, 0);
  assert.equal(data.has(sessionKey(byTombstone)), false);

  const bySideRecord = "cs_revoked_side";
  data.set(ENTITLEMENT_KV.sessionRevoked(bySideRecord), {
    schemaVersion: 1,
    sessionId: bySideRecord,
    revoked: true,
    reason: "dispute",
    paymentIntentId: "pi_1",
    revokedAt: 1,
  });
  const outcomeB = await settle(bySideRecord, pack3Terms());
  assert.equal(outcomeB.kind, "revoked");
  assert.equal(data.has(sessionKey(bySideRecord)), false);
});

test("MEASURE refund landing after the final check, before the put (retained residual)", async () => {
  const id = "cs_race_refund";
  let tombstoneReads = 0;
  getHook = async (key, read) => {
    if (key === "stripe:pi:revoked:pi_1") {
      tombstoneReads += 1;
      // Invisible for the initial and pre-put checks; visible immediately
      // after the put (the post-write check). The put itself is NOT undone.
      if (tombstoneReads <= 2) return null;
      return { revoked: true, revokedAt: 2, reason: "refund" };
    }
    return read();
  };
  const outcome = await settle(id, pack3Terms());
  assert.equal(outcome.kind, "revoked", "post-write check suppresses the success outcome");
  assert.equal(outcome.sessionWasWritten, true, "but the session write already landed");
  assert.equal(
    data.get(sessionKey(id)).paid,
    true,
    "RETAINED RESIDUAL: the stale put published an active record after the refund",
  );
});

test("MEASURE stale absence admits competing initialization over settled state (retained residual)", async () => {
  const id = "cs_stale_absence";
  const terms = pack3Terms();
  const first = await settle(id, terms);
  assert.equal(first.kind, "initialized");
  // A credit is consumed after settlement.
  const settled = data.get(sessionKey(id));
  data.set(sessionKey(id), { ...settled, creditsRemaining: 2 });

  // The replay's first read falls through to a stale absence (KV get can
  // return fallback/null); later reads see the real record.
  let sessionReads = 0;
  getHook = async (key, read) => {
    if (key === sessionKey(id)) {
      sessionReads += 1;
      if (sessionReads === 1) return null;
    }
    return read();
  };
  const replay = await settle(id, terms);
  assert.equal(replay.kind, "initialized");
  assert.equal(
    data.get(sessionKey(id)).creditsRemaining,
    3,
    "RETAINED RESIDUAL: stale absence let initialization restore the spent credit",
  );
});

test("PASS concurrent initializers with identical terms converge on a single grant", async () => {
  const id = "cs_concurrent";
  const terms = pack3Terms();
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  getHook = async (key, read) => {
    if (key === sessionKey(id) && arrived < 2) {
      arrived += 1;
      const snapshot = read();
      if (arrived >= 2) release();
      await gate;
      return snapshot; // both readers hold the same absence snapshot
    }
    return read();
  };
  const [a, b] = await Promise.all([settle(id, terms), settle(id, terms)]);
  assert.equal(a.kind, "initialized");
  assert.equal(b.kind, "initialized");
  const final = data.get(sessionKey(id));
  assert.equal(final.creditsTotal, 3, "identical competing initializations must not double the grant");
  assert.equal(final.creditsRemaining, 3);
});

test("PASS persistence boundary: intent failure is ambiguous and writes no session", async () => {
  const id = "cs_intent_fail";
  failDurableKeys.add(ENTITLEMENT_KV.settlementIntent(id));
  const outcome = await settle(id, pack3Terms());
  assert.equal(outcome.kind, "persistence_ambiguous");
  assert.equal(data.has(sessionKey(id)), false, "no grant may be claimed");
});

test("PASS persistence boundary: session-write failure after intent; retry initializes exactly once", async () => {
  const id = "cs_write_fail";
  failSetKeys.add(sessionKey(id));
  const failed = await settle(id, pack3Terms());
  assert.equal(failed.kind, "persistence_ambiguous");
  assert.ok(data.has(ENTITLEMENT_KV.settlementIntent(id)), "intent-only is recorded, and is not paid");
  assert.equal(data.has(sessionKey(id)), false);

  failSetKeys.clear();
  const retried = await settle(id, pack3Terms());
  assert.equal(retried.kind, "initialized");
  assert.equal(sessionPuts(id).length, 1, "exactly one successful session initialization");
  assert.equal(data.get(sessionKey(id)).creditsTotal, 3);
  assert.equal(data.get(sessionKey(id)).settlementReceipt.operationId, `purchase:v1:${id}`);
});

test("PASS carry refusal records zero movement and touches no balances (M1-02 narrowing)", async () => {
  const a = "cs_source_a";
  const b = "cs_dest_b";
  const seedA = { paid: true, plan: "pack3", creditsTotal: 3, creditsRemaining: 2, orderType: "digital" };
  data.set(sessionKey(a), structuredClone(seedA));

  const refusal = await recordTransferRefusal({ sourceSessionId: a, destinationSessionId: b });
  assert.equal(refusal.outcome, CARRY_NOT_SUPPORTED_INTERIM);
  assert.equal(refusal.movedCredits, 0);

  const stored = data.get(ENTITLEMENT_KV.transferRefused(a, b));
  assert.ok(stored, "refusal evidence recorded");
  assert.equal(stored.outcome, "carry_not_supported_interim");
  assert.equal(stored.movedCredits, 0);
  assert.deepEqual(data.get(sessionKey(a)), seedA, "source record untouched");
  assert.equal(sessionPuts(a).length, 0);
  assert.equal(sessionPuts(b).length, 0);
  assert.equal(data.has(sessionKey(b)), false, "no destination record is created by a refusal");
});

test("PASS refusal evidence failure never causes movement", async () => {
  const a = "cs_source_a2";
  const b = "cs_dest_b2";
  failDurableKeys.add(ENTITLEMENT_KV.transferRefused(a, b));
  const refusal = await recordTransferRefusal({ sourceSessionId: a, destinationSessionId: b });
  assert.equal(refusal.movedCredits, 0);
  assert.equal(putLog.filter((entry) => entry.key === sessionKey(a) || entry.key === sessionKey(b)).length, 0);
});

// ---------------------------------------------------------------------------
// Metadata completion (fix round, Codex P1 on PR #447): verify's builder
// omits the webhook-only checkout metadata, so a verify-first record is
// born without it and the webhook's already_settled return previously
// never backfilled it. The builders below mirror the two routes' real
// buildInitialRecord shapes. Every completion test here fails against the
// pre-fix-round head 642e2c70 (already_settled performed no completion).
// ---------------------------------------------------------------------------

const ORDER_METADATA = {
  customerEmail: "buyer@example.com",
  isGift: true,
  printAssetId: "asset_0123456789abcdef0123",
  referralCode: "FRIEND10",
  referrerSessionId: "cs_referrer_seed",
  referralOfferVariant: "gift",
};

/**
 * Mirrors verify/route.ts: accounting/access fields incl. the birth
 * `created` anchor (fix round 2), NO order metadata.
 */
function verifyStyleBuilder(terms) {
  return (receipt) => ({
    paid: true,
    settlementReceipt: receipt,
    created: Date.now(),
    mapId: "map_test",
    revoked: false,
    paymentIntentId: terms.paymentIntentId,
    amountTotal: terms.amountTotal,
    currency: terms.currency,
    plan: terms.plan,
    creditsRemaining: terms.purchasedCredits || undefined,
    creditsTotal: terms.purchasedCredits || undefined,
    subscriptionId: terms.subscriptionId ?? undefined,
    subscriptionActive: terms.subscription ? true : undefined,
    customerId: terms.customerId ?? undefined,
    orderType: terms.orderType,
    printVariant: terms.printVariant ?? undefined,
    includesDigitalAddOn: terms.includesDigitalAddOn,
  });
}

/** Mirrors webhook/route.ts: the verify fields plus the order metadata. */
function webhookStyleBuilder(terms, metadata = ORDER_METADATA) {
  const base = verifyStyleBuilder(terms);
  return (receipt) => ({
    ...base(receipt),
    created: 1_700_000_000_000,
    customerEmail: metadata.customerEmail,
    isGift: metadata.isGift,
    printAssetId: metadata.printAssetId,
    referralCode: metadata.referralCode,
    referrerSessionId: metadata.referrerSessionId,
    referralOfferVariant: metadata.referralOfferVariant,
  });
}

function settleWith(sessionId, terms, builder) {
  return settleSessionPurchase({
    sessionId,
    paymentIntentId: terms.paymentIntentId,
    purchaseTerms: terms,
    buildInitialRecord: builder,
  });
}

function withoutCompletionFields(record) {
  const copy = { ...record };
  for (const field of SETTLEMENT_METADATA_COMPLETION_FIELDS) delete copy[field];
  return copy;
}

test("PASS completion: verify-first record is completed by the webhook call (Codex P1)", async () => {
  const id = "cs_complete_ordering";
  const terms = pack3Terms();

  const first = await settleWith(id, terms, verifyStyleBuilder(terms));
  assert.equal(first.kind, "initialized");
  const born = data.get(sessionKey(id));
  for (const field of SETTLEMENT_METADATA_COMPLETION_FIELDS) {
    assert.equal(born[field], undefined, `verify-born record must lack ${field}`);
  }

  // A credit is consumed after settlement; completion must not restore it.
  data.set(sessionKey(id), { ...born, creditsRemaining: 1 });
  const before = structuredClone(data.get(sessionKey(id)));
  putLog = [];

  const second = await settleWith(id, terms, webhookStyleBuilder(terms));
  assert.equal(second.kind, "already_settled");
  assert.deepEqual(
    [...second.completedMetadataFields].sort(),
    [...SETTLEMENT_METADATA_COMPLETION_FIELDS].sort(),
    "all six allowlisted fields completed",
  );
  // Fix round 4: completion writes ONLY the sidecar — the session record
  // is byte-identical, so the consumption that landed before completion
  // cannot be restored by it, even from a stale read.
  assert.equal(sessionPuts(id).length, 0, "completion performs no session-record write");
  assert.equal(sidecarPuts(id).length, 1, "exactly one sidecar write");

  const after = data.get(sessionKey(id));
  assert.deepEqual(after, before, "session record byte-identical across completion");
  assert.equal(after.creditsRemaining, 1, "spent balance is not reconstructed");
  assert.deepEqual(after.settlementReceipt, before.settlementReceipt);

  const merged = mergedView(id);
  for (const field of SETTLEMENT_METADATA_COMPLETION_FIELDS) {
    assert.deepEqual(merged[field], ORDER_METADATA[field], `${field} visible via the merged view`);
    assert.equal(after[field], undefined, `${field} is NOT stamped onto the session record`);
  }
  assert.deepEqual(
    withoutCompletionFields(merged),
    withoutCompletionFields(before),
    "merged view differs from the record only in the completed fields",
  );
});

test("PASS completion: webhook-first ordering — verify changes nothing afterwards", async () => {
  const id = "cs_complete_webhook_first";
  const terms = pack3Terms();
  const first = await settleWith(id, terms, webhookStyleBuilder(terms));
  assert.equal(first.kind, "initialized");
  const snapshot = structuredClone(data.get(sessionKey(id)));
  putLog = [];

  const second = await settleWith(id, terms, verifyStyleBuilder(terms));
  assert.equal(second.kind, "already_settled");
  assert.deepEqual(second.completedMetadataFields, []);
  assert.equal(sessionPuts(id).length, 0, "verify replay on a complete record writes nothing");
  assert.equal(sidecarPuts(id).length, 0, "no sidecar write when nothing is missing anywhere");
  assert.deepEqual(data.get(sessionKey(id)), snapshot);
});

test("PASS completion never overwrites a value that is already present", async () => {
  const id = "cs_complete_no_overwrite";
  const terms = pack3Terms();
  await settleWith(id, terms, verifyStyleBuilder(terms));
  // Another writer has since stamped email + gift provenance of its own.
  const born = data.get(sessionKey(id));
  data.set(sessionKey(id), { ...born, customerEmail: "kept@example.com", isGift: true });

  const candidate = webhookStyleBuilder(terms, {
    ...ORDER_METADATA,
    customerEmail: "other@example.com",
    isGift: false,
  });
  putLog = [];
  const outcome = await settleWith(id, terms, candidate);
  assert.equal(outcome.kind, "already_settled");
  assert.deepEqual(
    [...outcome.completedMetadataFields].sort(),
    ["printAssetId", "referralCode", "referralOfferVariant", "referrerSessionId"].sort(),
    "only the still-absent fields are completed",
  );
  const after = data.get(sessionKey(id));
  assert.equal(after.customerEmail, "kept@example.com", "present email is never overwritten");
  assert.equal(after.isGift, true, "present gift provenance is never overwritten");
  assert.equal(sessionPuts(id).length, 0, "completion wrote no session record");
  const merged = mergedView(id);
  assert.equal(merged.customerEmail, "kept@example.com", "record-present value wins over the sidecar");
  assert.equal(merged.isGift, true);
  assert.equal(merged.printAssetId, ORDER_METADATA.printAssetId, "absent field completed via the sidecar");
});

test("PASS completion performs no write when nothing is missing", async () => {
  const id = "cs_complete_noop";
  const terms = pack3Terms();
  await settleWith(id, terms, webhookStyleBuilder(terms));
  const snapshot = structuredClone(data.get(sessionKey(id)));
  putLog = [];

  const replay = await settleWith(id, terms, webhookStyleBuilder(terms));
  assert.equal(replay.kind, "already_settled");
  assert.deepEqual(replay.completedMetadataFields, []);
  assert.equal(sessionPuts(id).length, 0, "observed replay with complete metadata writes nothing");
  assert.deepEqual(data.get(sessionKey(id)), snapshot);
});

test("PASS completion reads only the allowlist: candidate accounting values are ignored", async () => {
  const id = "cs_complete_allowlist_only";
  const terms = pack3Terms();
  await settleWith(id, terms, verifyStyleBuilder(terms));
  const before = structuredClone(data.get(sessionKey(id)));

  // A candidate whose accounting fields disagree wildly with the settled
  // record (same purchase terms, so no receipt conflict): completion must
  // take its metadata and nothing else — not even a forged receipt.
  const hostile = (receipt) => ({
    paid: true,
    settlementReceipt: { ...receipt, initializedAt: 999, operationId: "purchase:v1:forged" },
    created: 999,
    creditsRemaining: 99,
    creditsTotal: 99,
    subscriptionActive: true,
    ...ORDER_METADATA,
  });
  const outcome = await settleWith(id, terms, hostile);
  assert.equal(outcome.kind, "already_settled");
  const after = data.get(sessionKey(id));
  assert.deepEqual(after, before, "hostile candidate moves nothing on the session record");
  assert.equal(after.creditsTotal, 3);
  assert.equal(after.subscriptionActive, undefined);
  assert.equal(after.created, before.created, "created is not completable — the birth stamp stands");
  assert.equal(mergedView(id).customerEmail, ORDER_METADATA.customerEmail);
  // The sidecar itself holds ONLY allowlisted fields, even when the
  // candidate offered accounting values alongside them.
  const sidecar = data.get(sidecarKey(id));
  assert.equal(sidecar.creditsRemaining, undefined);
  assert.equal(sidecar.settlementReceipt, undefined);
  assert.equal(sidecar.subscriptionActive, undefined);
});

test("PASS completion stamps explicit isGift=false provenance (absence is not a value)", async () => {
  const id = "cs_complete_gift_false";
  const terms = pack3Terms();
  await settleWith(id, terms, verifyStyleBuilder(terms));
  const outcome = await settleWith(
    id,
    terms,
    webhookStyleBuilder(terms, { ...ORDER_METADATA, isGift: false }),
  );
  assert.equal(outcome.kind, "already_settled");
  assert.ok(outcome.completedMetadataFields.includes("isGift"));
  assert.equal(data.get(sidecarKey(id)).isGift, false, "explicit false is recorded in the sidecar, not skipped");
  assert.equal(mergedView(id).isGift, false, "explicit false reaches consumers via the merged view");
  assert.equal(data.get(sessionKey(id)).isGift, undefined, "not stamped onto the session record");
});

test("PASS completion write failure is persistence_ambiguous and a retry completes", async () => {
  const id = "cs_complete_write_fail";
  const terms = pack3Terms();
  await settleWith(id, terms, verifyStyleBuilder(terms));
  const before = structuredClone(data.get(sessionKey(id)));

  // Fix round 4: the completion write targets the sidecar key now.
  failDurableKeys.add(sidecarKey(id));
  const failed = await settleWith(id, terms, webhookStyleBuilder(terms));
  assert.equal(failed.kind, "persistence_ambiguous", "never a silent success");
  assert.deepEqual(data.get(sessionKey(id)), before, "failed completion leaves the record untouched");
  assert.equal(data.get(sidecarKey(id)), undefined, "failed completion leaves no sidecar behind");

  failDurableKeys.clear();
  const retried = await settleWith(id, terms, webhookStyleBuilder(terms));
  assert.equal(retried.kind, "already_settled");
  assert.equal(retried.completedMetadataFields.length, SETTLEMENT_METADATA_COMPLETION_FIELDS.length);
  assert.equal(mergedView(id).customerEmail, ORDER_METADATA.customerEmail);
});

// ---------------------------------------------------------------------------
// Fix round 4 (G-dot gate rejection at adbc60fa): the three blocking
// findings were (1) completion republishes stale accounting — the test
// below is the gate's own SEQUENTIAL history, settlement → consumption →
// completion-from-stale-read; (2) the residual was misdescribed as
// concurrency-only (same history); (3) getOrCreateClaimToken still
// replaced the whole session record — covered in claimTokenClosure tests.
// Every test in this section fails on adbc60fa.
// ---------------------------------------------------------------------------

test("PASS round 4: completion from a STALE read cannot restore a landed consumption", async () => {
  const id = "cs_r4_stale_present";
  const terms = pack3Terms();
  await settleWith(id, terms, verifyStyleBuilder(terms));
  const staleSnapshot = structuredClone(data.get(sessionKey(id)));
  assert.equal(staleSnapshot.creditsRemaining, 3);

  // A consumption lands after settlement: the live record now holds 2.
  data.set(sessionKey(id), { ...staleSnapshot, creditsRemaining: 2, lastConsumeToken: "tok_r4" });
  const liveSnapshot = structuredClone(data.get(sessionKey(id)));

  // The completing call reads a STALE snapshot (still showing 3 credits).
  let staleArmed = true;
  getHook = (key, read) => {
    if (staleArmed && key === sessionKey(id)) {
      staleArmed = false;
      return structuredClone(staleSnapshot);
    }
    return read();
  };
  putLog = [];
  const outcome = await settleWith(id, terms, webhookStyleBuilder(terms));
  assert.equal(outcome.kind, "already_settled");
  assert.equal(outcome.completedMetadataFields.length, SETTLEMENT_METADATA_COMPLETION_FIELDS.length);
  assert.equal(sessionPuts(id).length, 0, "completion never writes the session record");
  assert.deepEqual(
    data.get(sessionKey(id)),
    liveSnapshot,
    "the landed consumption survives completion from a stale read — 3→2 stays 2",
  );
  assert.equal(mergedView(id).customerEmail, ORDER_METADATA.customerEmail);
});

test("PASS round 4: rewards added between read and completion are preserved", async () => {
  const id = "cs_r4_rewards";
  const terms = pack3Terms();
  await settleWith(id, terms, verifyStyleBuilder(terms));
  const born = data.get(sessionKey(id));
  // Referral reward + consumption land before the completing call.
  data.set(sessionKey(id), {
    ...born,
    creditsRemaining: 2,
    creditsTotal: 4,
    referralCreditsEarned: 1,
  });
  const before = structuredClone(data.get(sessionKey(id)));

  const outcome = await settleWith(id, terms, webhookStyleBuilder(terms));
  assert.equal(outcome.kind, "already_settled");
  assert.deepEqual(data.get(sessionKey(id)), before, "reward state byte-identical after completion");
  const merged = mergedView(id);
  assert.equal(merged.creditsTotal, 4);
  assert.equal(merged.referralCreditsEarned, 1);
  assert.equal(merged.customerEmail, ORDER_METADATA.customerEmail);
  assert.deepEqual(merged.settlementReceipt, before.settlementReceipt, "receipt integrity preserved");
});

test("PASS round 4: revocation visible before completion still wins — no write of any kind", async () => {
  const id = "cs_r4_revoked_pre";
  const terms = pack3Terms();
  await settleWith(id, terms, verifyStyleBuilder(terms));
  data.set(ENTITLEMENT_KV.sessionRevoked(id), { revoked: true, reason: "refund", revokedAt: Date.now() });
  putLog = [];
  const outcome = await settleWith(id, terms, webhookStyleBuilder(terms));
  assert.equal(outcome.kind, "revoked");
  assert.equal(outcome.sessionWasWritten, false, "no session write exists on the completion path");
  assert.equal(sessionPuts(id).length, 0);
  assert.equal(sidecarPuts(id).length, 0, "revoked sessions gain no metadata sidecar");
  assert.equal(data.get(sidecarKey(id)), undefined);
});

test("PASS round 4: revocation landing during the sidecar write is reported, session untouched", async () => {
  const id = "cs_r4_revoked_post";
  const terms = pack3Terms();
  await settleWith(id, terms, verifyStyleBuilder(terms));
  const before = structuredClone(data.get(sessionKey(id)));
  // Evidence is absent at the settlement's early read and at the
  // pre-write check, and present at the post-write check (the third
  // tombstone read in this flow).
  const tombKey = ENTITLEMENT_KV.sessionRevoked(id);
  let tombReads = 0;
  getHook = (key, read) => {
    if (key === tombKey) {
      tombReads += 1;
      if (tombReads >= 3) return { revoked: true, reason: "refund", revokedAt: Date.now() };
      return null;
    }
    return read();
  };
  putLog = [];
  const outcome = await settleWith(id, terms, webhookStyleBuilder(terms));
  assert.equal(outcome.kind, "revoked");
  assert.equal(outcome.sessionWasWritten, false, "the sidecar write is not a session write");
  assert.equal(sessionPuts(id).length, 0);
  assert.deepEqual(data.get(sessionKey(id)), before, "session record untouched");
  assert.ok(data.get(sidecarKey(id)), "the sidecar write itself landed (reported, not hidden)");
});

test("PASS round 4: sidecar write applied but response lost — stale retry does not double-apply", async () => {
  const id = "cs_r4_response_lost";
  const terms = pack3Terms();
  await settleWith(id, terms, verifyStyleBuilder(terms));
  const before = structuredClone(data.get(sessionKey(id)));

  const realSetDurable = kv.setDurable;
  let lostOnce = false;
  kv.setDurable = async (key, value) => {
    if (key === sidecarKey(id) && !lostOnce) {
      lostOnce = true;
      data.set(key, structuredClone(value)); // the write APPLIES…
      throw new Error("injected: response lost after apply"); // …the caller sees failure
    }
    return realSetDurable(key, value);
  };
  const first = await settleWith(id, terms, webhookStyleBuilder(terms));
  kv.setDurable = realSetDurable;
  assert.equal(first.kind, "persistence_ambiguous", "the lost response is reported honestly");
  const landedSidecar = data.get(sidecarKey(id));
  assert.equal(landedSidecar.customerEmail, ORDER_METADATA.customerEmail, "the write did land");

  putLog = [];
  const retry = await settleWith(id, terms, webhookStyleBuilder(terms));
  assert.equal(retry.kind, "already_settled");
  assert.deepEqual(retry.completedMetadataFields, [], "retry observes the landed completion — nothing to redo");
  assert.equal(sidecarPuts(id).length, 0, "no second sidecar write");
  assert.deepEqual(data.get(sidecarKey(id)), landedSidecar, "sidecar not rewritten or duplicated");
  assert.deepEqual(data.get(sessionKey(id)), before, "session record byte-identical throughout");
});

test("PASS round 4: applySettlementMetadata precedence and allowlist containment", async () => {
  const record = {
    paid: true,
    sessionId: "cs_r4_merge",
    customerEmail: "record@example.com",
    creditsRemaining: 2,
  };
  const sidecar = {
    schemaVersion: 1,
    sessionId: "cs_r4_merge",
    customerEmail: "sidecar@example.com",
    isGift: true,
    creditsRemaining: 99,
    claimToken: "forged-token",
    recordedAt: 1,
    updatedAt: 1,
  };
  const merged = applySettlementMetadata(record, sidecar);
  assert.equal(merged.customerEmail, "record@example.com", "record-present value wins");
  assert.equal(merged.isGift, true, "absent field filled from the sidecar");
  assert.equal(merged.creditsRemaining, 2, "non-allowlist sidecar fields never leak");
  assert.equal(merged.claimToken, undefined);
  assert.equal(applySettlementMetadata(record, null), record, "no sidecar = identity");
  assert.equal(record.isGift, undefined, "merge never mutates the record");
});

// ---------------------------------------------------------------------------
// Fix round 2 (Codex P2): the review engine anchors digital eligibility on
// record.created with no fallback. `created` is a BIRTH field: verify's
// builder stamps it like the webhook's; completion deliberately cannot
// supply it (not on the allowlist, candidate value never read — see the
// hostile-candidate test above).
// ---------------------------------------------------------------------------

test("PASS verify-first record is review-classifiable on its birth anchor (fix round 2)", async () => {
  const id = "cs_anchor_verify_first";
  const terms = pack3Terms();
  const before = Date.now();
  const first = await settleWith(id, terms, verifyStyleBuilder(terms));
  const after = Date.now();
  assert.equal(first.kind, "initialized");
  const born = data.get(sessionKey(id));
  assert.equal(typeof born.created, "number", "verify-born record carries created");
  assert.ok(
    born.created >= before && born.created <= after,
    "created is stamped at verify birth",
  );

  // The webhook lands second: completion fills the remaining eligibility
  // fields (email, explicit non-gift provenance) but must not move the
  // anchor — the webhook builder's own created stamp is never read.
  const second = await settleWith(
    id,
    terms,
    webhookStyleBuilder(terms, { ...ORDER_METADATA, isGift: false }),
  );
  assert.equal(second.kind, "already_settled");
  const settled = data.get(sessionKey(id));
  assert.equal(settled.created, born.created, "anchor survives completion untouched");
  assert.notEqual(
    settled.created,
    1_700_000_000_000,
    "the webhook builder's created was not adopted",
  );

  // Fix round 4: the review engine reads the merged view (record +
  // sidecar); classification input is that view.
  const classification = classifyDigitalEntitlement(
    mergedView(id),
    settled.created + REVIEW_DIGITAL_DELAY_MS,
  );
  assert.equal(classification.outcome, "due");
  assert.equal(classification.kind, "digital");
  assert.equal(classification.email, ORDER_METADATA.customerEmail);
  assert.equal(classification.anchorAt, settled.created);
});

test("CONTROL pre-fix verify shape (no created) classifies as invalid_anchor", async () => {
  const id = "cs_anchor_prefix_shape";
  const terms = pack3Terms();
  // The 7bad1035 verify builder: identical to today's except it never
  // stamped `created`. Even after the webhook completes every allowlisted
  // field, the record has no anchor and the exclusion is permanent —
  // this is the defect fix round 2 removes at birth.
  const preFixVerifyBuilder = (receipt) => {
    const record = verifyStyleBuilder(terms)(receipt);
    delete record.created;
    return record;
  };
  await settleWith(id, terms, preFixVerifyBuilder);
  await settleWith(
    id,
    terms,
    webhookStyleBuilder(terms, { ...ORDER_METADATA, isGift: false }),
  );
  const settled = data.get(sessionKey(id));
  assert.equal(
    settled.created,
    undefined,
    "completion cannot supply the anchor (not allowlisted)",
  );
  assert.deepEqual(
    classifyDigitalEntitlement(mergedView(id), Date.now() + REVIEW_DIGITAL_DELAY_MS),
    { outcome: "excluded", kind: "digital", reason: "invalid_anchor" },
    "even the merged view (all six fields completed) has no anchor",
  );
});

// ---------------------------------------------------------------------------
// Fix round 3 (Codex P2): a refused carry must leave the buyer's premium
// cookie on session A while A still holds live entitlement — the cookie
// is the browser's only handle on A's credits. The decision logic is
// behavioural here (sessionHoldsLiveEntitlement, read-only); the route
// wiring is pinned in the structural section below. On bfdddd78 the
// helper does not exist and every successful verify response overwrote
// the cookie unconditionally.
// ---------------------------------------------------------------------------

test("PASS live-entitlement: paid with credits remaining is live (fix round 3)", async () => {
  const id = "cs_cookie_a_live_credits";
  data.set(sessionKey(id), { paid: true, plan: "pack3", creditsRemaining: 2, creditsTotal: 3 });
  assert.equal(await sessionHoldsLiveEntitlement(id), true);
  assert.equal(putLog.length, 0, "the liveness check is read-only");
});

test("PASS live-entitlement: paid with an active subscription is live (fix round 3)", async () => {
  const id = "cs_cookie_a_live_sub";
  data.set(sessionKey(id), {
    paid: true,
    plan: "subscription",
    creditsRemaining: 0,
    subscriptionActive: true,
  });
  assert.equal(await sessionHoldsLiveEntitlement(id), true);
});

test("PASS live-entitlement: exhausted, revoked, absent, and unpaid are not live (fix round 3)", async () => {
  data.set(sessionKey("cs_cookie_a_spent"), {
    paid: true,
    plan: "pack3",
    creditsRemaining: 0,
    creditsTotal: 3,
  });
  assert.equal(await sessionHoldsLiveEntitlement("cs_cookie_a_spent"), false, "exhausted");

  data.set(sessionKey("cs_cookie_a_revoked"), {
    paid: true,
    plan: "pack3",
    creditsRemaining: 2,
    revoked: true,
  });
  assert.equal(await sessionHoldsLiveEntitlement("cs_cookie_a_revoked"), false, "record revoked");

  data.set(sessionKey("cs_cookie_a_unpaid"), { paid: false, plan: "pack3", creditsRemaining: 2 });
  assert.equal(await sessionHoldsLiveEntitlement("cs_cookie_a_unpaid"), false, "unpaid");

  assert.equal(await sessionHoldsLiveEntitlement("cs_cookie_a_absent"), false, "absent");
  assert.equal(putLog.length, 0, "the liveness check is read-only");
});

test("PASS live-entitlement: durable revocation evidence defeats a stale paid record (fix round 3)", async () => {
  const sideId = "cs_cookie_a_revoked_side";
  data.set(sessionKey(sideId), { paid: true, plan: "pack3", creditsRemaining: 2 });
  data.set(ENTITLEMENT_KV.sessionRevoked(sideId), { revoked: true, reason: "refund" });
  assert.equal(
    await sessionHoldsLiveEntitlement(sideId),
    false,
    "session side evidence revokes liveness",
  );

  const piId = "cs_cookie_a_revoked_pi";
  data.set(sessionKey(piId), {
    paid: true,
    plan: "pack3",
    creditsRemaining: 2,
    paymentIntentId: "pi_revoked_1",
  });
  data.set("stripe:pi:revoked:pi_revoked_1", { revoked: true, reason: "refund" });
  assert.equal(await sessionHoldsLiveEntitlement(piId), false, "PI tombstone revokes liveness");
});

// ---------------------------------------------------------------------------
// Structural pins for the route-level changes. Each pin fails on the pre-fix
// source (verified against the base commit during development).
// ---------------------------------------------------------------------------

const webhookSource = readFileSync(
  new URL("../../src/app/api/stripe/webhook/route.ts", import.meta.url),
  "utf8",
);
const verifySource = readFileSync(
  new URL("../../src/app/api/stripe/verify/route.ts", import.meta.url),
  "utf8",
);

test("PIN verify: no cross-session balance addition remains (M1-02)", () => {
  assert.equal(verifySource.includes("credits += existingCredits"), false);
  assert.equal(verifySource.includes("existingCredits"), false);
  assert.ok(verifySource.includes("recordTransferRefusal"));
  assert.ok(verifySource.includes("CARRY_NOT_SUPPORTED_INTERIM"));
});

test("PIN verify: settlement goes through the shared policy and fast path checks revocation evidence", () => {
  assert.ok(verifySource.includes("settleSessionPurchase"));
  assert.ok(verifySource.includes("readSessionRevocationEvidence"));
  assert.ok(verifySource.includes("settlement_persistence_ambiguous") || verifySource.includes("persistence_ambiguous"));
});

test("PIN webhook: access-email outcome is a sidecar, not a session replacement", () => {
  assert.ok(webhookSource.includes("ENTITLEMENT_KV.accessEmailResult"));
  assert.equal(/\.\.\.current,\s*\n\s*accessEmailSentAt/.test(webhookSource), false);
});

test("PIN webhook: expired recovery success is a sidecar; no expiredBase spread over the session", () => {
  assert.ok(webhookSource.includes("ENTITLEMENT_KV.recoveryResult"));
  assert.equal(webhookSource.includes("...expiredBase"), false);
  assert.equal(webhookSource.includes("expiredBase"), false);
});

test("PIN webhook: revocation evidence is durable and PI resolution happens on the mapped branch (M1-06)", () => {
  assert.ok(webhookSource.includes("ENTITLEMENT_KV.sessionRevoked"));
  assert.ok(webhookSource.includes("recordRevocationUnresolved"));
  const tombstoneFn = webhookSource.slice(
    webhookSource.indexOf("async function markPaymentIntentRevoked"),
    webhookSource.indexOf("async function markPaymentIntentRevoked") + 400,
  );
  assert.ok(tombstoneFn.includes("setDurable"), "PI tombstone must be a durable write");
  // The session-known refund branch resolves the PI before the reversal.
  const refundBranch = webhookSource.slice(webhookSource.indexOf('case "charge.refunded"'));
  const mappedBranch = refundBranch.slice(0, refundBranch.indexOf('case "charge.dispute.created"'));
  assert.ok(mappedBranch.includes("markPaymentIntentRevoked"));
  assert.ok(mappedBranch.includes("recordRevocationUnresolved"));
});

test("PIN webhook: settlement goes through the shared policy", () => {
  assert.ok(webhookSource.includes("settleSessionPurchase"));
  assert.ok(webhookSource.includes("settlement_reconciliation_required"));
  assert.ok(webhookSource.includes("settlement_persistence_ambiguous"));
});

test("PIN verify: birth record stamps created, the review anchor (fix round 2)", () => {
  // classifyDigitalEntitlement anchors eligibility on record.created with
  // no fallback; a verify-born record without it is permanently excluded
  // as invalid_anchor. The stamp belongs at birth — `created` is NOT on
  // the metadata-completion allowlist and completion never reads it.
  // Fails on the 7bad1035 verify source, whose builder has no `created`.
  const start = verifySource.indexOf("buildInitialRecord: (receipt) => ({");
  assert.ok(start >= 0, "verify builder located");
  const block = verifySource.slice(start, verifySource.indexOf("}),", start));
  assert.ok(
    block.includes("created: Date.now()"),
    "verify builder must stamp created at birth, mirroring the webhook builder",
  );
  assert.equal(
    SETTLEMENT_METADATA_COMPLETION_FIELDS.includes("created"),
    false,
    "created must stay off the completion allowlist (birth, not completion)",
  );
});

test("PIN webhook: access-email send admits the metadata-completion path (Codex P1)", () => {
  // On a verify-first purchase the webhook call that completes the record's
  // customerEmail must still run the (dedupe-guarded) access-email send;
  // gating it on !alreadyPaid alone is what stranded those buyers on the
  // 409 missing_customer_email path.
  assert.ok(webhookSource.includes("completedMetadataFields"));
  assert.ok(webhookSource.includes("!alreadyPaid || completedSettlementMetadata"));
});

test("PIN verify: refused carry preserves a live incoming cookie on every success path (fix round 3)", () => {
  // The mapping prescribes "A cookie preserved" for a refused carry, but
  // on bfdddd78 every successful verify response overwrote the premium
  // cookie with the new session — stranding the buyer's in-browser access
  // to A's remaining credits. Preservation is decided ONLY for a refused
  // carry (a different session's cookie), by the read-only liveness
  // check; no-carry requests take the exact pre-fix path (guard false).
  assert.ok(verifySource.includes("sessionHoldsLiveEntitlement"));
  assert.ok(
    verifySource.includes(
      "const preserveIncomingCookie = carryRequested\n    ? await sessionHoldsLiveEntitlement(incomingSessionId as string)\n    : false;",
    ),
    "preservation is computed for refused carries only",
  );
  // Every premium-cookie write in the route — paid fast path,
  // already_settled, fresh settlement — sits behind the guard, and no
  // unguarded write remains.
  const cookieWrites = verifySource.split("cookies.set(PREMIUM_COOKIE_NAME").length - 1;
  assert.equal(cookieWrites, 3, "verify writes the premium cookie at exactly three sites");
  assert.equal(verifySource.includes("if (hasDigitalEntitlement) {"), false);
  assert.equal(verifySource.includes("if (settledHasDigitalEntitlement) {"), false);
  assert.equal(
    verifySource.split("&& !preserveIncomingCookie) {").length - 1,
    3,
    "all three cookie writes are guarded by !preserveIncomingCookie",
  );
  // The comment must state the actual rule — preserved only while the
  // incoming session holds live entitlement — not the old blanket claim.
  assert.ok(
    verifySource.includes("only while the incoming session still holds live entitlement"),
  );
  assert.equal(verifySource.includes("never overwritten by this path"), false);
});

// ---------------------------------------------------------------------------
// Fix round 4 pins (G-dot gate rejection at adbc60fa). Each fails on the
// adbc60fa sources: completion wrote the whole merged record back to the
// session key; getOrCreateClaimToken finished with a session-record
// replacement; the link route held its own inline issuance ending in the
// same replacement; the claim route consulted only the inline field.
// ---------------------------------------------------------------------------

const storeSource = readFileSync(
  new URL("../../src/lib/entitlementsStore.ts", import.meta.url),
  "utf8",
);
const accessLinksSource = readFileSync(
  new URL("../../src/lib/accountAccessLinks.ts", import.meta.url),
  "utf8",
);
const claimRouteSource = readFileSync(
  new URL("../../src/app/api/entitlements/claim/route.ts", import.meta.url),
  "utf8",
);
const linkRouteSource = readFileSync(
  new URL("../../src/app/api/entitlements/link/route.ts", import.meta.url),
  "utf8",
);

test("PIN round 4: completion writes only the metadata sidecar, never the session record", () => {
  assert.ok(storeSource.includes("ENTITLEMENT_KV.settlementMetadata(sessionId), sidecarRecord"));
  assert.equal(storeSource.includes("await kv.setDurable(key, merged)"), false,
    "the whole-record completion put is gone");
  assert.ok(storeSource.includes("applySettlementMetadata"), "consumers merge via the shared helper");
});

test("PIN round 4: claim issuance performs zero session-record writes (S60-1 closure)", () => {
  assert.equal(accessLinksSource.includes("stripeSession"), false,
    "the issuance helper never references the session key");
  assert.equal(
    accessLinksSource.includes("kv.set(sessionKey(sessionId), { ...record, claimToken: token })"),
    false,
    "the caller-held-record replacement write is gone (doc comments may quote it; the write may not exist)",
  );
  assert.ok(accessLinksSource.includes("ENTITLEMENT_KV.claimPointer"), "governing pointer is the token's home");
});

test("PIN round 4: claim route honors the governing pointer with the inline field as legacy fallback", () => {
  assert.ok(claimRouteSource.includes("ENTITLEMENT_KV.claimPointer"));
  assert.ok(claimRouteSource.includes("governingToken"), "superseded tokens are rejected");
});

test("PIN round 4: link route issues through the shared helper, no inline session write", () => {
  assert.ok(linkRouteSource.includes("getOrCreateClaimToken"));
  assert.equal(
    linkRouteSource.includes("kv.set(ENTITLEMENT_KV.stripeSession(sessionId), { ...record, claimToken: token })"),
    false,
    "the inline whole-record issuance write is gone",
  );
  assert.equal(linkRouteSource.includes("crypto.randomUUID()"), false,
    "no second inline issuance implementation remains");
});
