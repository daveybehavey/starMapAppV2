/**
 * giftCertificates.test.mjs — StarMapCo gift certificates (the
 * OurImprint product-tier port, David's 2026-11-05 decision).
 *
 * Pins:
 * - certificate prices come from the existing books verbatim (USD
 *   tiers and the native CAD book), for both tiers;
 * - the happy path purchase → issue → redeem → entitlement for BOTH
 *   tiers and BOTH currencies, with the granted entitlement equal to
 *   the purchased tier;
 * - issuance idempotency: a duplicate issuance event for the same
 *   session returns the same record and code and mints nothing new;
 * - negative controls: wrong code, expired code (12-month code
 *   window), already-redeemed code, refunded purchase — all rejected,
 *   with no grant performed;
 * - hash-only storage: the persisted record never contains the
 *   plaintext code, in raw or formatted form;
 * - the certificate email carries the code, the redemption deadline,
 *   and the redemption-vs-download expiry distinction;
 * - route wiring by source pin (the house pattern for route-internal
 *   code): checkout forces the promo/referral exclusion and the
 *   certificate metadata + success URL; the webhook fulfills
 *   certificates BEFORE any buyer settlement; verify never settles a
 *   certificate session.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  GIFT_CERTIFICATE_LIFETIME_MS,
  GIFT_CERTIFICATE_TIERS,
  deriveGiftCertificateCode,
  formatGiftCertificateCode,
  getGiftCertificatePriceCents,
  giftCertificateTierForPlan,
  hashGiftCertificateCode,
  issueGiftCertificate,
  normalizeGiftCertificateCode,
  redeemGiftCertificate,
} = await import("../../src/lib/giftCertificates.ts");
const { renderGiftCertificateEmail } = await import("../../src/lib/giftCertificateEmail.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const SECRET = "test-gift-certificate-signing-secret-0123456789";
const T0 = Date.parse("2026-11-05T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

/** In-memory store honoring the service contract (serial by construction). */
function createMemoryStore() {
  const byHash = new Map();
  const bySession = new Map();
  return {
    records: byHash,
    async findByCodeHash(codeHash) {
      return byHash.get(codeHash) ?? null;
    },
    async findBySessionId(sessionId) {
      return bySession.get(sessionId) ?? null;
    },
    async insertIfAbsent(record) {
      if (byHash.has(record.codeHash) || bySession.has(record.stripeSessionId)) return false;
      byHash.set(record.codeHash, record);
      bySession.set(record.stripeSessionId, record);
      return true;
    },
    async markRedeemed(codeHash, redemption) {
      const record = byHash.get(codeHash);
      if (!record || record.redeemedAt !== null) return false;
      const updated = {
        ...record,
        redeemedAt: redemption.redeemedAt,
        redeemedEntitlementSessionId: redemption.entitlementSessionId,
      };
      byHash.set(codeHash, updated);
      bySession.set(record.stripeSessionId, updated);
      return true;
    },
    async recordEmailOutcome(sessionId, outcome) {
      const record = bySession.get(sessionId);
      if (!record) return;
      const updated = {
        ...record,
        emailSentAt: outcome.sentAt ?? record.emailSentAt,
        emailError: outcome.error,
      };
      byHash.set(record.codeHash, updated);
      bySession.set(sessionId, updated);
    },
  };
}

async function issue(store, { sessionId, plan, currency, now = T0 }) {
  const tier = giftCertificateTierForPlan(plan);
  const result = await issueGiftCertificate(store, SECRET, {
    stripeSessionId: sessionId,
    paymentIntentId: `pi_${sessionId}`,
    plan,
    currency,
    amountCents: getGiftCertificatePriceCents(tier, currency),
    buyerEmail: "buyer@example.com",
    now,
  });
  assert.equal(result.kind, "issued");
  return result;
}

test("certificate prices are the existing book prices for both tiers and currencies", () => {
  assert.equal(getGiftCertificatePriceCents(GIFT_CERTIFICATE_TIERS.hd_single, "usd"), 900);
  assert.equal(getGiftCertificatePriceCents(GIFT_CERTIFICATE_TIERS.hd_pack3, "usd"), 1900);
  assert.equal(getGiftCertificatePriceCents(GIFT_CERTIFICATE_TIERS.hd_single, "cad"), 1300);
  assert.equal(getGiftCertificatePriceCents(GIFT_CERTIFICATE_TIERS.hd_pack3, "cad"), 2700);
});

test("happy path: issue → redeem grants exactly the purchased tier (both tiers, both currencies)", async () => {
  for (const [plan, currency, credits] of [
    ["single", "usd", 1],
    ["single", "cad", 1],
    ["pack3", "usd", 3],
    ["pack3", "cad", 3],
  ]) {
    const store = createMemoryStore();
    const sessionId = `cs_test_${plan}_${currency}`;
    const issued = await issue(store, { sessionId, plan, currency });
    assert.equal(issued.created, true);
    assert.equal(issued.record.expiresAt, T0 + GIFT_CERTIFICATE_LIFETIME_MS);
    assert.equal(issued.record.amountCents, getGiftCertificatePriceCents(issued.record.tier === "hd_single" ? GIFT_CERTIFICATE_TIERS.hd_single : GIFT_CERTIFICATE_TIERS.hd_pack3, currency));

    let grant = null;
    const redeemed = await redeemGiftCertificate(store, SECRET, {
      code: formatGiftCertificateCode(issued.code),
      now: T0 + DAY_MS,
      grantEntitlement: async (input) => {
        grant = input;
      },
    });
    assert.equal(redeemed.kind, "redeemed", `${plan}/${currency}`);
    assert.equal(redeemed.entitlementSessionId, `giftcert:${sessionId}`);
    assert.ok(grant, "grant callback ran");
    assert.equal(grant.record.plan, plan);
    assert.equal(GIFT_CERTIFICATE_TIERS[grant.record.tier].credits, credits);
    const standing = await store.findBySessionId(sessionId);
    assert.equal(standing.redeemedAt, T0 + DAY_MS);
    assert.equal(standing.redeemedEntitlementSessionId, `giftcert:${sessionId}`);
  }
});

test("duplicate issuance event does not double-issue: same record, same code, nothing new minted", async () => {
  const store = createMemoryStore();
  const first = await issue(store, { sessionId: "cs_test_dup", plan: "pack3", currency: "usd" });
  const second = await issue(store, {
    sessionId: "cs_test_dup",
    plan: "pack3",
    currency: "usd",
    now: T0 + 60_000,
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.code, first.code);
  assert.equal(second.record.issuedAt, first.record.issuedAt);
  assert.equal(second.record.expiresAt, first.record.expiresAt);
  assert.equal(store.records.size, 1);
});

test("wrong and tampered codes are rejected without a grant", async () => {
  const store = createMemoryStore();
  const issued = await issue(store, { sessionId: "cs_test_wrong", plan: "single", currency: "usd" });
  let grants = 0;
  const grantEntitlement = async () => {
    grants += 1;
  };

  const unknown = await redeemGiftCertificate(store, SECRET, {
    code: "AAAA-AAAA-AAAA-AAAA".replaceAll("A", "B"),
    now: T0,
    grantEntitlement,
  });
  assert.deepEqual([unknown.kind, unknown.reason], ["rejected", "invalid_code"]);

  const tampered = `${issued.code.slice(0, 15)}${issued.code.endsWith("0") ? "1" : "0"}`;
  const flipped = await redeemGiftCertificate(store, SECRET, {
    code: tampered,
    now: T0,
    grantEntitlement,
  });
  assert.deepEqual([flipped.kind, flipped.reason], ["rejected", "invalid_code"]);
  assert.equal(grants, 0);
});

test("expired code is rejected at the 12-month boundary; one millisecond earlier it redeems", async () => {
  const store = createMemoryStore();
  const issued = await issue(store, { sessionId: "cs_test_expiry", plan: "single", currency: "usd" });
  let grants = 0;
  const grantEntitlement = async () => {
    grants += 1;
  };
  const atExpiry = await redeemGiftCertificate(store, SECRET, {
    code: issued.code,
    now: T0 + GIFT_CERTIFICATE_LIFETIME_MS,
    grantEntitlement,
  });
  assert.deepEqual([atExpiry.kind, atExpiry.reason], ["rejected", "expired"]);
  assert.equal(grants, 0);

  const justInTime = await redeemGiftCertificate(store, SECRET, {
    code: issued.code,
    now: T0 + GIFT_CERTIFICATE_LIFETIME_MS - 1,
    grantEntitlement,
  });
  assert.equal(justInTime.kind, "redeemed");
  assert.equal(grants, 1);
});

test("an already-redeemed code is rejected on the second attempt", async () => {
  const store = createMemoryStore();
  const issued = await issue(store, { sessionId: "cs_test_twice", plan: "pack3", currency: "cad" });
  let grants = 0;
  const grantEntitlement = async () => {
    grants += 1;
  };
  const first = await redeemGiftCertificate(store, SECRET, {
    code: issued.code,
    now: T0,
    grantEntitlement,
  });
  assert.equal(first.kind, "redeemed");
  const second = await redeemGiftCertificate(store, SECRET, {
    code: issued.code,
    now: T0 + DAY_MS,
    grantEntitlement,
  });
  assert.deepEqual([second.kind, second.reason], ["rejected", "already_redeemed"]);
  assert.equal(grants, 1, "the grant ran exactly once");
});

test("a refunded certificate purchase cannot be redeemed", async () => {
  const store = createMemoryStore();
  const issued = await issue(store, { sessionId: "cs_test_refunded", plan: "single", currency: "usd" });
  let grants = 0;
  const result = await redeemGiftCertificate(store, SECRET, {
    code: issued.code,
    now: T0,
    isPaymentRevoked: async () => true,
    grantEntitlement: async () => {
      grants += 1;
    },
  });
  assert.deepEqual([result.kind, result.reason], ["rejected", "payment_revoked"]);
  assert.equal(grants, 0);
});

test("hash-only storage: the persisted record never contains the plaintext code", async () => {
  const store = createMemoryStore();
  const issued = await issue(store, { sessionId: "cs_test_hashonly", plan: "single", currency: "usd" });
  const persisted = JSON.stringify(issued.record);
  assert.ok(!persisted.includes(issued.code), "raw code absent from the record");
  assert.ok(!persisted.includes(formatGiftCertificateCode(issued.code)), "formatted code absent");
  assert.equal(issued.record.codeHash, hashGiftCertificateCode(SECRET, issued.code));
  assert.notEqual(issued.record.codeHash, issued.code);
  assert.ok(issued.record.salt.length >= 16);
});

test("code derivation is deterministic per (session, salt) and human-error tolerant at entry", async () => {
  const a = deriveGiftCertificateCode(SECRET, "cs_test_x", "salt-one");
  const b = deriveGiftCertificateCode(SECRET, "cs_test_x", "salt-one");
  const c = deriveGiftCertificateCode(SECRET, "cs_test_x", "salt-two");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 16);
  // Lowercase, spaced, dashed and look-alike characters all normalize
  // back to the same code at the redeem form.
  const messy = formatGiftCertificateCode(a).toLowerCase().replaceAll("-", " - ");
  assert.equal(normalizeGiftCertificateCode(messy), a);
  // Letters outside the Crockford alphabet (U) and junk are rejected.
  assert.equal(normalizeGiftCertificateCode("UUUUUUUUUUUUUUUU"), null);
  assert.equal(normalizeGiftCertificateCode("too-short"), null);
  assert.equal(normalizeGiftCertificateCode(""), null);
});

test("subscription purchases and secret-less operation are refused at issuance", async () => {
  const store = createMemoryStore();
  const subscription = await issueGiftCertificate(store, SECRET, {
    stripeSessionId: "cs_test_sub",
    paymentIntentId: "pi_sub",
    plan: "subscription",
    currency: "usd",
    amountCents: 1900,
    buyerEmail: "buyer@example.com",
    now: T0,
  });
  assert.deepEqual([subscription.kind, subscription.reason], ["refused", "not_a_certificate_tier"]);

  const noSecret = await issueGiftCertificate(store, null, {
    stripeSessionId: "cs_test_nosecret",
    paymentIntentId: "pi_nosecret",
    plan: "single",
    currency: "usd",
    amountCents: 900,
    buyerEmail: "buyer@example.com",
    now: T0,
  });
  assert.deepEqual([noSecret.kind, noSecret.reason], ["refused", "signing_secret_unavailable"]);
});

test("certificate email carries the code, the deadline, and the expiry distinction", async () => {
  const store = createMemoryStore();
  const issued = await issue(store, { sessionId: "cs_test_email", plan: "pack3", currency: "cad" });
  const rendered = renderGiftCertificateEmail({
    buyerName: "Alex Buyer",
    tier: GIFT_CERTIFICATE_TIERS.hd_pack3,
    amountCents: issued.record.amountCents,
    currency: "cad",
    code: issued.code,
    expiresAt: issued.record.expiresAt,
    siteUrl: "https://starmapco.com",
  });
  assert.ok(rendered.html.includes(formatGiftCertificateCode(issued.code)));
  assert.ok(rendered.text.includes(formatGiftCertificateCode(issued.code)));
  assert.ok(rendered.text.includes("starmapco.com/redeem"));
  assert.ok(rendered.text.includes("November 5, 2027"), "12-month redemption deadline is stated");
  assert.ok(
    rendered.text.includes("paid downloads do not expire"),
    "the redeemed download's no-expiry terms are distinguished from the code window",
  );
  assert.ok(!rendered.text.toLowerCase().includes("instant"));
});

test("delivery preparation runs before consumption; its failure leaves the code redeemable", async () => {
  const store = createMemoryStore();
  const issued = await issue(store, { sessionId: "cs_test_delivery", plan: "single", currency: "usd" });
  let grants = 0;
  const grantEntitlement = async () => {
    grants += 1;
  };

  let redeemedAtPrepareTime = "unset";
  await assert.rejects(
    redeemGiftCertificate(store, SECRET, {
      code: issued.code,
      now: T0,
      grantEntitlement,
      prepareDelivery: async () => {
        const standing = await store.findBySessionId("cs_test_delivery");
        redeemedAtPrepareTime = standing.redeemedAt;
        throw new Error("claim token persistence failed");
      },
    }),
    /claim token persistence failed/,
  );
  assert.equal(redeemedAtPrepareTime, null, "delivery is prepared while the code is still unconsumed");
  const standingAfterFailure = await store.findBySessionId("cs_test_delivery");
  assert.equal(standingAfterFailure.redeemedAt, null, "a delivery failure does not consume the code");

  const retry = await redeemGiftCertificate(store, SECRET, {
    code: issued.code,
    now: T0 + DAY_MS,
    grantEntitlement,
    prepareDelivery: async () => {},
  });
  assert.equal(retry.kind, "redeemed", "the same code redeems on retry after a delivery failure");
  assert.equal(grants, 2, "the grant re-ran on retry (production grant is create-if-absent)");
});

test("route wiring: checkout exclusion, webhook order, verify refusal (source pins)", () => {
  const checkout = read("src/app/api/checkout/route.ts");
  assert.ok(checkout.includes('metadata[GIFT_CERTIFICATE_METADATA_KEY] = "true"'));
  assert.ok(checkout.includes("`${siteOrigin()}/gift-card/success?session_id={CHECKOUT_SESSION_ID}`"));
  assert.ok(checkout.includes('selectedPromotion.source = "none"'), "certificate forces no promotion");
  assert.ok(checkout.includes("referralCode: giftCertificate ? undefined : referral.code"));
  assert.ok(checkout.includes("if (!giftCertificate)"), "certificate purchases skip the map assertion");
  assert.ok(checkout.includes("promoCode = undefined"), "certificate disregards a sent promo code");
  // Tier C gate fix: certificate purchases force isGift, so the reuse
  // identity needs its own segment — otherwise a certificate and a
  // plain gift purchase of the same map/plan share a cached URL /
  // Stripe idempotency key and the second buyer gets the wrong
  // flavour's session. Append-only: non-certificate keys unchanged.
  assert.ok(
    checkout.includes('const certSegment = input.giftCertificate ? ":cert" : "";'),
    "certificate purchases carry their own idempotency-key segment",
  );
  assert.ok(
    checkout.includes("`${baseWithoutMapId}${certSegment}`"),
    "cert segment is appended to the pinned key base, after the gift and copy segments",
  );
  assert.match(
    checkout,
    /const idempotencyKey = checkoutIdempotencyKey\(\{[\s\S]*?giftCertificate,[\s\S]*?\}\);/,
    "the POST handler passes giftCertificate into the reuse identity",
  );

  const webhook = read("src/app/api/stripe/webhook/route.ts");
  const fulfillmentStart = webhook.indexOf("async function processCheckoutFulfillment");
  const fulfillmentSlice = webhook.slice(fulfillmentStart, fulfillmentStart + 6000);
  const certBranch = fulfillmentSlice.indexOf("isGiftCertificateSessionMetadata(fulfilledSession.metadata)");
  const buyerSettlement = fulfillmentSlice.indexOf("markSessionPaid(fulfilledSession)");
  assert.ok(certBranch >= 0, "certificate branch exists in fulfillment");
  assert.ok(buyerSettlement > certBranch, "certificates fulfill before any buyer settlement");

  const verify = read("src/app/api/stripe/verify/route.ts");
  const certGuard = verify.indexOf("isGiftCertificateSessionMetadata(session.metadata)");
  const settle = verify.indexOf("settleSessionPurchase({");
  assert.ok(certGuard >= 0 && settle > certGuard, "verify refuses certificate sessions before settling");

  // Tier C gate fixes (Codex P1s): issuance serializes on the stable
  // session id (concurrent passes mint different salts, so the code
  // hash cannot serialize them); the service prepares delivery before
  // consuming the code; the redeem route's grant is create-if-absent
  // under serialization (an overwrite would replenish spent credits)
  // and mints the claim token inside prepareDelivery.
  const service = read("src/lib/giftCertificates.ts");
  assert.ok(
    service.includes("withSerializedKvUpdate(GIFT_CERTIFICATE_KV.bySession(record.stripeSessionId)"),
    "issuance insert serializes on the checkout session id",
  );
  const prepareCall = service.indexOf("await input.prepareDelivery({ entitlementSessionId, record })");
  const consumeCall = service.indexOf("const consumed = await store.markRedeemed(codeHash, {");
  assert.ok(prepareCall >= 0 && consumeCall > prepareCall, "delivery is prepared before the code is consumed");

  const redeemRoute = read("src/app/api/gift-certificates/redeem/route.ts");
  assert.ok(redeemRoute.includes("withSerializedKvUpdate(key, async () => {"), "grant is serialized per entitlement");
  assert.ok(redeemRoute.includes("if (existing) return;"), "grant is create-if-absent, never an overwrite");
  assert.ok(redeemRoute.includes("prepareDelivery: async ({ entitlementSessionId }) => {"), "route supplies delivery preparation");
  assert.ok(redeemRoute.includes("await getOrCreateClaimToken(entitlementSessionId, entitlement);"), "claim token is minted during delivery preparation");
});
