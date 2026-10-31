/**
 * caslSendAlignment.test.mjs — CASL send-alignment build (S93-5 Part 1,
 * issue #468).
 *
 * Pins the shared List-Unsubscribe header + CASL identification-footer
 * builders across the three commercial send classes, and the
 * send-agnostic mailing-address binding migration:
 * - promotions: the frozen payload carries the compliance contract
 *   (version + frozen headers); the copy renders sender identity,
 *   mailing address, and the SAME signed URL in HTML, text, and
 *   headers; Resend and SendGrid both carry the message headers;
 *   legacy (pre-contract) payloads and withdrawn compliance
 *   configuration fail closed as `unconfigured` with ZERO provider
 *   calls; the automation webhook cannot bypass the gate; a compliant
 *   payload retries byte-identically after an environment change.
 * - review requests: the shared builders reproduce the engine's
 *   long-standing header/footer bytes exactly (the opt-out route
 *   implements one-click POST, so the one-click headers stay), and a
 *   blank opt-out URL is now rejected.
 * - checkout recovery: the send carries the shared headers over the
 *   same resolved promotion URL its footer renders; missing footer
 *   facts stay `not_configured` with zero provider calls.
 *
 * One-click verification (design precondition): the promotion
 * /unsubscribe surface is a GET page (src/app/unsubscribe/page.tsx)
 * with NO POST route handler, so promotions/recovery must NOT emit
 * List-Unsubscribe-Post — these tests pin its ABSENCE there and its
 * PRESENCE (unchanged) on review sends.
 *
 * Negative-control note: on the unfixed code there are no shared
 * builders, no payload contract, and no compliance gate — the
 * promotions assertions (headers on the payload/provider body, the
 * address in the copy, the legacy-payload refusal) and the recovery
 * header assertions all fail there.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);

process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.RESEND_API_KEY = "test-resend-key";
process.env.PROMOTION_EMAIL_FROM = "StarMapCo <promo@starmapco.com>";
process.env.PROMOTION_UNSUBSCRIBE_SECRET = "test-only-unsubscribe-secret";
process.env.COMMERCIAL_EMAIL_MAILING_ADDRESS = "1191 Test Lane, Victoria, BC, Canada";
process.env.NEXT_PUBLIC_SITE_URL = "https://starmapco.com";
delete process.env.REVIEW_REQUEST_MAILING_ADDRESS;
delete process.env.SENDGRID_API_KEY;
delete process.env.PROMOTION_AUTOMATION_WEBHOOK_URL;
delete process.env.REFERRAL_SIGNING_SECRET;
delete process.env.STRIPE_WEBHOOK_SECRET;
delete process.env.STRIPE_SECRET_KEY;

const layoutLib = await import("../../src/lib/transactionalEmailLayout.ts");
const promotionsLib = await import("../../src/lib/promotions.ts");
const subscriptionsLib = await import("../../src/lib/promotionSubscriptions.ts");
const reviewEmailLib = await import("../../src/lib/reviewRequestEmail.ts");
const reviewRequestsLib = await import("../../src/lib/reviewRequests.ts");
const recoveryLib = await import("../../src/lib/checkoutRecoveryAlerts.ts");

const ADDRESS = "1191 Test Lane, Victoria, BC, Canada";
const NEW_ADDRESS = "22 Alignment Way, Victoria, BC, Canada";
const permitAll = async () => ({ permitted: true });
/** HTML-escaped form of a URL, as the shared footer builder renders it. */
const escapedUrl = (u) => u.replace(/&/g, "&amp;");

const okJson = (obj) => ({
  ok: true,
  status: 200,
  json: async () => obj,
  text: async () => JSON.stringify(obj),
  headers: { get: () => null },
});

/** Record every provider call (any host); returns the calls array. */
function installFetchFake(handler = async () => okJson({ id: "email_1" })) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const call = {
      url: String(url),
      headers: init?.headers ?? {},
      body: init?.body ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    return handler(call, calls);
  };
  return calls;
}

/** Run `fn` with env overrides, restoring the prior values afterwards. */
async function withEnv(overrides, fn) {
  const prior = {};
  for (const key of Object.keys(overrides)) {
    prior[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
}

/* ------------------------- shared builders ------------------------- */

test("builders: header builder — URL only, no one-click, no mailto", () => {
  const headers = layoutLib.buildListUnsubscribeHeaders({
    unsubscribeUrl: "https://starmapco.com/unsubscribe?email=a%40b.co&token=t",
    oneClick: false,
  });
  assert.deepEqual(headers, {
    "List-Unsubscribe": "<https://starmapco.com/unsubscribe?email=a%40b.co&token=t>",
  });
});

test("builders: header builder — one-click + mailto reproduce the review engine's exact bytes", () => {
  const headers = layoutLib.buildListUnsubscribeHeaders({
    unsubscribeUrl: "https://starmapco.com/api/reviews/opt-out?e=a%40b.co&t=tok",
    mailtoAddress: "support@starmapco.com",
    oneClick: true,
  });
  assert.deepEqual(headers, {
    "List-Unsubscribe":
      "<https://starmapco.com/api/reviews/opt-out?e=a%40b.co&t=tok>, <mailto:support@starmapco.com?subject=unsubscribe>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
});

test("builders: header builder rejects blank and line-breaking values", () => {
  assert.throws(() =>
    layoutLib.buildListUnsubscribeHeaders({ unsubscribeUrl: "  ", oneClick: false }),
  );
  assert.throws(() =>
    layoutLib.buildListUnsubscribeHeaders({
      unsubscribeUrl: "https://x.test/u\nList-Unsubscribe-Post: forged",
      oneClick: false,
    }),
  );
});

test("builders: footer renders identity/address/reason and escapes HTML facts", () => {
  const footer = layoutLib.buildCaslIdentificationFooter({
    senderIdentity: "StarMapCo",
    mailingAddress: "A & B <Lane> 5",
    unsubscribeUrl: "https://x.test/u?a=1&b=2",
    unsubscribeLabel: "Unsubscribe",
    receivingReasonHtmlText: "You're receiving this.",
    receivingReasonText: "You're receiving this.",
    presentation: "dark",
  });
  assert.ok(footer.html.includes("StarMapCo · A &amp; B &lt;Lane&gt; 5"));
  assert.ok(footer.html.includes('href="https://x.test/u?a=1&amp;b=2"'));
  // The reason is authored class copy, inserted as written (the
  // classes' long-standing bytes carry its apostrophe raw).
  assert.ok(footer.html.includes("You're receiving this."));
  assert.ok(footer.text.includes("StarMapCo · A & B <Lane> 5"));
  assert.ok(footer.text.includes("Unsubscribe: https://x.test/u?a=1&b=2"));
});

test("builders: footer rejects blank identity/address/URL/label", () => {
  const base = {
    senderIdentity: "StarMapCo",
    mailingAddress: ADDRESS,
    unsubscribeUrl: "https://x.test/u",
    unsubscribeLabel: "Unsubscribe",
    presentation: "dark",
  };
  assert.throws(() => layoutLib.buildCaslIdentificationFooter({ ...base, senderIdentity: " " }));
  assert.throws(() => layoutLib.buildCaslIdentificationFooter({ ...base, mailingAddress: "" }));
  assert.throws(() => layoutLib.buildCaslIdentificationFooter({ ...base, unsubscribeUrl: "" }));
  assert.throws(() => layoutLib.buildCaslIdentificationFooter({ ...base, unsubscribeLabel: " " }));
});

test("resolver: new binding wins, deprecated fallback works, blanks fall through", () => {
  const resolve = layoutLib.resolveCommercialEmailMailingAddress;
  assert.equal(
    resolve({ COMMERCIAL_EMAIL_MAILING_ADDRESS: " New ", REVIEW_REQUEST_MAILING_ADDRESS: "Old" }),
    "New",
  );
  assert.equal(resolve({ REVIEW_REQUEST_MAILING_ADDRESS: "Old" }), "Old");
  assert.equal(
    resolve({ COMMERCIAL_EMAIL_MAILING_ADDRESS: "  ", REVIEW_REQUEST_MAILING_ADDRESS: "Old" }),
    "Old",
  );
  assert.equal(resolve({}), null);
  assert.equal(resolve({ COMMERCIAL_EMAIL_MAILING_ADDRESS: " " }), null);
});

/* ---------------------------- promotions --------------------------- */

test("promotions: prepared coupon payload carries the compliance contract and aligned facts", () => {
  const email = "coupon@example.com";
  const url = subscriptionsLib.getPromotionUnsubscribeUrl(email);
  assert.ok(url, "the synthetic secret resolves a signed URL");
  const payload = promotionsLib.preparePromotionCouponPayload(email, "FIRST50");
  assert.equal(payload.complianceFormatVersion, promotionsLib.PROMOTION_COMPLIANCE_FORMAT_VERSION);
  assert.deepEqual(payload.headers, { "List-Unsubscribe": `<${url}>` });
  assert.ok(!("List-Unsubscribe-Post" in payload.headers), "no one-click header for promotions");
  assert.ok(payload.text.includes(`StarMapCo · ${ADDRESS}`));
  assert.ok(payload.text.includes(`Unsubscribe: ${url}`));
  assert.ok(payload.html.includes(`StarMapCo · ${ADDRESS}`));
  assert.ok(payload.html.includes(`href="${escapedUrl(url)}"`));
});

test("promotions: prepared followup payload carries the contract and keeps its schedule", () => {
  const email = "followup@example.com";
  const url = subscriptionsLib.getPromotionUnsubscribeUrl(email);
  const payload = promotionsLib.preparePromotionFollowupPayload(
    email,
    "FIRST50",
    "2026-11-02T00:00:00.000Z",
  );
  assert.equal(payload.kind, "followup");
  assert.equal(payload.scheduledAtIso, "2026-11-02T00:00:00.000Z");
  assert.equal(payload.complianceFormatVersion, promotionsLib.PROMOTION_COMPLIANCE_FORMAT_VERSION);
  assert.deepEqual(payload.headers, { "List-Unsubscribe": `<${url}>` });
  assert.ok(payload.text.includes(`StarMapCo · ${ADDRESS}`));
  assert.ok(payload.html.includes(`href="${escapedUrl(url)}"`));
});

test("promotions: Resend leg carries the frozen headers as MESSAGE headers", async () => {
  const payload = promotionsLib.preparePromotionCouponPayload("resend@example.com", "FIRST50");
  const calls = installFetchFake();
  const outcome = await promotionsLib.deliverPromotionSend(payload, "idem-align-1", {
    checkDispatchPermission: permitAll,
  });
  assert.equal(outcome.outcome, "accepted");
  assert.equal(outcome.provider, "resend");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.headers, payload.headers);
  assert.equal(calls[0].headers["Idempotency-Key"], "idem-align-1");
  assert.ok(calls[0].headers.Authorization, "HTTP auth stays in the HTTP headers");
  assert.ok(!("List-Unsubscribe" in calls[0].headers), "message headers are not HTTP headers");
  assert.ok(calls[0].body.text.includes(`StarMapCo · ${ADDRESS}`));
});

test("promotions: SendGrid leg carries the frozen headers in its headers field", async () => {
  const payload = promotionsLib.preparePromotionCouponPayload("sendgrid@example.com", "FIRST50");
  const calls = installFetchFake(async () => ({
    ok: true,
    status: 202,
    json: async () => ({}),
    text: async () => "",
    headers: { get: (name) => (name === "x-message-id" ? "sg-1" : null) },
  }));
  const outcome = await withEnv({ RESEND_API_KEY: undefined, SENDGRID_API_KEY: "test-sg-key" }, () =>
    promotionsLib.deliverPromotionSend(payload, "idem-align-2", {
      checkDispatchPermission: permitAll,
    }),
  );
  assert.equal(outcome.outcome, "accepted");
  assert.equal(outcome.provider, "sendgrid");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith("https://api.sendgrid.com/"));
  assert.deepEqual(calls[0].body.headers, payload.headers);
});

test("promotions NEGATIVE CONTROL: a legacy pre-contract payload refuses unconfigured, zero calls", async () => {
  const prepared = promotionsLib.preparePromotionCouponPayload("legacy@example.com", "FIRST50");
  const legacy = { ...prepared };
  delete legacy.headers;
  delete legacy.complianceFormatVersion;
  const calls = installFetchFake();
  const outcome = await promotionsLib.deliverPromotionSend(legacy, "idem-align-3", {
    checkDispatchPermission: permitAll,
  });
  assert.deepEqual(outcome, {
    outcome: "unconfigured",
    provider: "none",
    error: "promotion_compliance_unconfigured",
  });
  assert.equal(calls.length, 0);
});

test("promotions NEGATIVE CONTROL: withdrawn compliance configuration refuses, zero calls", async () => {
  const payload = promotionsLib.preparePromotionCouponPayload("withdrawn@example.com", "FIRST50");
  const calls = installFetchFake();
  const outcome = await withEnv(
    { COMMERCIAL_EMAIL_MAILING_ADDRESS: undefined, REVIEW_REQUEST_MAILING_ADDRESS: undefined },
    () =>
      promotionsLib.deliverPromotionSend(payload, "idem-align-4", {
        checkDispatchPermission: permitAll,
      }),
  );
  assert.deepEqual(outcome, {
    outcome: "unconfigured",
    provider: "none",
    error: "promotion_compliance_unconfigured",
  });
  assert.equal(calls.length, 0);
});

test("promotions NEGATIVE CONTROL: preparation without facts freezes an undispatchable payload", async () => {
  const payload = await withEnv(
    { COMMERCIAL_EMAIL_MAILING_ADDRESS: undefined, REVIEW_REQUEST_MAILING_ADDRESS: undefined },
    async () => promotionsLib.preparePromotionCouponPayload("nofacts@example.com", "FIRST50"),
  );
  assert.equal(payload.complianceFormatVersion, undefined);
  assert.equal(payload.headers, undefined);
  assert.ok(!payload.text.includes("Test Lane"), "no identification block renders without facts");
  const calls = installFetchFake();
  const outcome = await promotionsLib.deliverPromotionSend(payload, "idem-align-5", {
    checkDispatchPermission: permitAll,
  });
  assert.equal(outcome.outcome, "unconfigured");
  assert.equal(calls.length, 0);
});

test("promotions NEGATIVE CONTROL: the webhook leg cannot bypass the compliance gate", async () => {
  const payload = promotionsLib.preparePromotionCouponPayload("webhook@example.com", "FIRST50");
  const calls = installFetchFake();
  const outcome = await withEnv(
    {
      RESEND_API_KEY: undefined,
      SENDGRID_API_KEY: undefined,
      PROMOTION_AUTOMATION_WEBHOOK_URL: "https://hooks.example.test/promotion",
    },
    async () => {
      assert.equal(promotionsLib.selectPromotionProvider(), null);
      return promotionsLib.deliverPromotionSend(payload, "idem-align-6", {
        checkDispatchPermission: permitAll,
      });
    },
  );
  assert.equal(outcome.outcome, "unconfigured");
  assert.equal(calls.length, 0, "the webhook is never fetched for a compliant delivery");
});

test("promotions: a compliant payload retries byte-identically after an environment change", async () => {
  const payload = promotionsLib.preparePromotionCouponPayload("frozen@example.com", "FIRST50");
  const calls = installFetchFake();
  const outcome = await withEnv({ COMMERCIAL_EMAIL_MAILING_ADDRESS: NEW_ADDRESS }, () =>
    promotionsLib.deliverPromotionSend(payload, "idem-align-7", {
      checkDispatchPermission: permitAll,
    }),
  );
  assert.equal(outcome.outcome, "accepted");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].body.text.includes(ADDRESS), "the frozen address is submitted");
  assert.ok(!calls[0].body.text.includes(NEW_ADDRESS), "the changed env value is NOT re-rendered in");
  assert.deepEqual(calls[0].body.headers, payload.headers);
});

/* --------------------------- review sends -------------------------- */

test("review: builder reproduces the legacy headers and footer bytes exactly", () => {
  const optOutUrl = "https://starmapco.com/api/reviews/opt-out?e=buyer%40example.com&t=tok123";
  for (const kind of ["digital", "physical"]) {
    const built = reviewEmailLib.buildReviewRequestEmail({
      kind,
      siteUrl: "https://starmapco.com",
      supportEmail: "support@starmapco.com",
      mailingAddress: ADDRESS,
      optOutUrl,
    });
    assert.deepEqual(built.headers, {
      "List-Unsubscribe": `<${optOutUrl}>, <mailto:support@starmapco.com?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    assert.ok(
      built.html.includes(
        `StarMapCo · ${ADDRESS}<br/>You're receiving this one-time email because you ordered from StarMapCo. <a href="${escapedUrl(optOutUrl)}"`,
      ),
    );
    assert.ok(built.text.includes(`StarMapCo · ${ADDRESS}`));
    assert.ok(built.text.includes(`Unsubscribe from review requests: ${optOutUrl}`));
    assert.ok(
      !built.text.includes("You're receiving this one-time email"),
      "the receiving reason stays HTML-only, as before",
    );
  }
});

test("review: a blank opt-out URL is rejected (and a blank address still is)", () => {
  const base = {
    kind: "digital",
    siteUrl: "https://starmapco.com",
    supportEmail: "support@starmapco.com",
    mailingAddress: ADDRESS,
    optOutUrl: "https://starmapco.com/api/reviews/opt-out?e=x&t=y",
  };
  assert.throws(() => reviewEmailLib.buildReviewRequestEmail({ ...base, optOutUrl: "  " }));
  assert.throws(() => reviewEmailLib.buildReviewRequestEmail({ ...base, mailingAddress: " " }));
});

test("review: engine config resolves the address through the shared precedence", () => {
  const probes = { resendConfigured: true };
  const both = reviewRequestsLib.resolveReviewEngineConfig(
    { COMMERCIAL_EMAIL_MAILING_ADDRESS: " New Addr ", REVIEW_REQUEST_MAILING_ADDRESS: "Old Addr" },
    probes,
  );
  assert.equal(both.mailingAddress, "New Addr");
  const fallback = reviewRequestsLib.resolveReviewEngineConfig(
    { REVIEW_REQUEST_MAILING_ADDRESS: "Old Addr" },
    probes,
  );
  assert.equal(fallback.mailingAddress, "Old Addr");
  const none = reviewRequestsLib.resolveReviewEngineConfig({}, probes);
  assert.equal(none.mailingAddress, "");
});

/* ------------------------- checkout recovery ----------------------- */

const recoveryInput = (email) => ({
  sessionId: "cs_test_alignment",
  email,
  recoveryUrl: "https://starmapco.com/recover/cs_test_alignment",
  orderType: "digital",
  plan: "single",
});

test("recovery: the Resend payload carries the shared headers over the footer's URL", async () => {
  const email = "recover@example.com";
  const url = subscriptionsLib.getPromotionUnsubscribeUrl(email);
  const calls = installFetchFake();
  const result = await recoveryLib.sendCheckoutRecoveryAlert(recoveryInput(email), {
    checkDispatchPermission: permitAll,
  });
  assert.equal(result.delivered, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.headers, { "List-Unsubscribe": `<${url}>` });
  assert.ok(calls[0].body.text.includes(`StarMapCo · ${ADDRESS}`));
  assert.ok(calls[0].body.text.includes(`Unsubscribe: ${url}`));
  assert.ok(calls[0].body.html.includes(`href="${escapedUrl(url)}"`));
  assert.equal(
    calls[0].headers["Idempotency-Key"],
    recoveryLib.buildCheckoutRecoveryResendIdempotencyKey("cs_test_alignment"),
    "the deterministic idempotency key is unchanged",
  );
});

test("recovery NEGATIVE CONTROL: no address binding anywhere → not_configured, zero calls", async () => {
  const calls = installFetchFake();
  const result = await withEnv(
    { COMMERCIAL_EMAIL_MAILING_ADDRESS: undefined, REVIEW_REQUEST_MAILING_ADDRESS: undefined },
    () =>
      recoveryLib.sendCheckoutRecoveryAlert(recoveryInput("noaddr@example.com"), {
        checkDispatchPermission: permitAll,
      }),
  );
  assert.deepEqual(result, {
    delivered: false,
    provider: "none",
    retryability: "not_configured",
    errorCode: "checkout_recovery_footer_not_configured",
  });
  assert.equal(calls.length, 0);
});

test("recovery NEGATIVE CONTROL: no signing secret → no URL → not_configured, zero calls", async () => {
  const calls = installFetchFake();
  const result = await withEnv({ PROMOTION_UNSUBSCRIBE_SECRET: undefined }, () =>
    recoveryLib.sendCheckoutRecoveryAlert(recoveryInput("nosecret@example.com"), {
      checkDispatchPermission: permitAll,
    }),
  );
  assert.deepEqual(result, {
    delivered: false,
    provider: "none",
    retryability: "not_configured",
    errorCode: "checkout_recovery_footer_not_configured",
  });
  assert.equal(calls.length, 0);
});

test("recovery: the deprecated fallback binding alone still resolves the footer", async () => {
  const calls = installFetchFake();
  const result = await withEnv(
    {
      COMMERCIAL_EMAIL_MAILING_ADDRESS: undefined,
      REVIEW_REQUEST_MAILING_ADDRESS: "77 Fallback Road, Victoria, BC, Canada",
    },
    () =>
      recoveryLib.sendCheckoutRecoveryAlert(recoveryInput("fallback@example.com"), {
        checkDispatchPermission: permitAll,
      }),
  );
  assert.equal(result.delivered, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].body.text.includes("StarMapCo · 77 Fallback Road, Victoria, BC, Canada"));
});
