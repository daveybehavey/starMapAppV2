/**
 * checkoutRecoveryCaslFence.test.mjs — CASL checkout-recovery fence build.
 *
 * Before this build, `sendCheckoutRecoveryAlert` posted straight to
 * Resend with NO consent check, and the template carried neither an
 * unsubscribe link nor a mailing-address footer. These tests pin:
 * - the send is gated on the shipped dispatch authority (the same
 *   checker the promotional transport's fence uses): a consented
 *   address is permitted; unsubscribed, deliverability-suppressed,
 *   no-record, and authority-unavailable cases are refused with ZERO
 *   provider calls, mapped onto the fence's refusal taxonomy
 *   (`promotion_dispatch_refused:<reason>`), with a throwing checker
 *   failing closed as `authority_unavailable`;
 * - the rendered payload carries the promotion system's signed
 *   unsubscribe URL and the business mailing address from the review
 *   engine's binding — the same mechanisms the other sends use;
 * - without those footer facts the send is `not_configured`, never a
 *   silently non-compliant email.
 *
 * Negative-control note: on the unfixed code every refusal/footer
 * assertion below fails — the unfixed send ignores the injected
 * checker entirely and posts a footer-less payload to Resend.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);

process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.RESEND_API_KEY = "re_test_recovery_fence";
process.env.CHECKOUT_RECOVERY_EMAIL_FROM = "StarMapCo <support@starmapco.com>";
process.env.PROMOTION_UNSUBSCRIBE_SECRET = "test-unsubscribe-secret-0123456789";
process.env.REVIEW_REQUEST_MAILING_ADDRESS = "1191 Test Lane, Victoria, BC, Canada";
process.env.NEXT_PUBLIC_SITE_URL = "https://starmapco.com";

const recoveryLib = await import("../../src/lib/checkoutRecoveryAlerts.ts");
const clientLib = await import("../../src/lib/consistencyCoordinator.ts");
const promotionsLib = await import("../../src/lib/promotions.ts");
const { unsubscribePromotionFlow } = await import("../../src/lib/promotionCoordinator.ts");

const MAILING_ADDRESS = "1191 Test Lane, Victoria, BC, Canada";

const okJson = (obj) => ({
  ok: true,
  status: 200,
  json: async () => obj,
  text: async () => JSON.stringify(obj),
  headers: { get: () => null },
});

/** Install a fetch stub that only tolerates Resend calls; returns the
 *  recorded calls. A refusal must leave this array EMPTY. */
function installFetchFake(handler = async () => okJson({ id: "email_1" })) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    assert.ok(u.startsWith("https://api.resend.com/"), `unexpected fetch: ${u}`);
    const call = { url: u, headers: init.headers, body: JSON.parse(init.body) };
    calls.push(call);
    return handler(call, calls);
  };
  return calls;
}

const noFacts = {
  state: null,
  inLegacySubscriptionList: null,
  inLegacySentList: null,
  inLegacyFollowupList: null,
};

function freshClient() {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  return clientLib.createConsistencyCoordinatorClient();
}

async function subscribeViaClient(client, email) {
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  const result = await client.subscribePromotion(name, {
    emailHash,
    source: "test",
    now: Date.now(),
    facts: noFacts,
    couponPayload: promotionsLib.preparePromotionCouponPayload(email, "FIRST50"),
  });
  return { name, emailHash, ...result };
}

const recoveryInput = (email) => ({
  sessionId: "cs_test_recovery_fence",
  email,
  recoveryUrl: "https://starmapco.com/recover/cs_test_recovery_fence",
  orderType: "digital",
  plan: "single",
});

/* --------------------- refusal taxonomy (pure) --------------------- */

test("refusal mapping: consent refusals are terminal, authority_unavailable stays retryable", () => {
  const { checkoutRecoveryDispatchRefusedResult: refused } = recoveryLib;
  assert.deepEqual(refused("unsubscribed"), {
    delivered: false,
    provider: "none",
    retryability: "terminal",
    errorCode: "promotion_dispatch_refused:unsubscribed",
  });
  assert.deepEqual(refused("deliverability_suppressed"), {
    delivered: false,
    provider: "none",
    retryability: "terminal",
    errorCode: "promotion_dispatch_refused:deliverability_suppressed",
  });
  assert.deepEqual(refused("no_permission_record"), {
    delivered: false,
    provider: "none",
    retryability: "terminal",
    errorCode: "promotion_dispatch_refused:no_permission_record",
  });
  assert.deepEqual(refused("authority_unavailable"), {
    delivered: false,
    provider: "none",
    retryability: "retryable",
    errorCode: "promotion_dispatch_refused:authority_unavailable",
  });
});

/* --------------- injected checker: the fence seam ------------------ */

test("injected checker: every refusal reason stops the send with zero provider calls", async () => {
  const cases = [
    ["unsubscribed", "terminal"],
    ["deliverability_suppressed", "terminal"],
    ["no_permission_record", "terminal"],
    ["authority_unavailable", "retryable"],
  ];
  for (const [reason, retryability] of cases) {
    const calls = installFetchFake();
    const result = await recoveryLib.sendCheckoutRecoveryAlert(recoveryInput("case@example.com"), {
      checkDispatchPermission: async () => ({ permitted: false, reason }),
    });
    assert.equal(result.delivered, false, reason);
    assert.equal(result.provider, "none", reason);
    assert.equal(result.errorCode, `promotion_dispatch_refused:${reason}`, reason);
    assert.equal(result.retryability, retryability, reason);
    assert.equal(calls.length, 0, `refused (${reason}) must not touch the provider`);
  }
});

test("injected checker: a throwing checker fails closed as authority_unavailable", async () => {
  const calls = installFetchFake();
  const result = await recoveryLib.sendCheckoutRecoveryAlert(recoveryInput("boom@example.com"), {
    checkDispatchPermission: async () => {
      throw new Error("authority exploded");
    },
  });
  assert.deepEqual(result, {
    delivered: false,
    provider: "none",
    retryability: "retryable",
    errorCode: "promotion_dispatch_refused:authority_unavailable",
  });
  assert.equal(calls.length, 0);
});

test("injected checker: permitted sends exactly once and the payload carries the CASL footer", async () => {
  const calls = installFetchFake();
  const result = await recoveryLib.sendCheckoutRecoveryAlert(recoveryInput("buyer@example.com"), {
    checkDispatchPermission: async () => ({ permitted: true }),
  });
  assert.equal(result.delivered, true);
  assert.equal(result.provider, "resend");
  assert.equal(calls.length, 1, "a permitted recovery send reaches the provider exactly once");

  const { text, html } = calls[0].body;
  // Unsubscribe: the promotion system's signed URL (same surface the fence enforces).
  assert.ok(text.includes("Unsubscribe: https://starmapco.com/unsubscribe?"), text);
  assert.ok(text.includes("token="), "the unsubscribe URL is signed");
  assert.ok(html.includes("/unsubscribe?"), html);
  assert.ok(html.includes(">Unsubscribe</a>"), html);
  // Sender identification: the mailing address from the review engine's binding.
  assert.ok(text.includes(`StarMapCo · ${MAILING_ADDRESS}`), text);
  assert.ok(html.includes(MAILING_ADDRESS), html);
});

/* ---------------- footer facts: fail closed ------------------------ */

test("footer: without the mailing-address binding the send is not_configured, zero provider calls", async () => {
  const saved = process.env.REVIEW_REQUEST_MAILING_ADDRESS;
  delete process.env.REVIEW_REQUEST_MAILING_ADDRESS;
  try {
    const calls = installFetchFake();
    const result = await recoveryLib.sendCheckoutRecoveryAlert(recoveryInput("buyer@example.com"), {
      checkDispatchPermission: async () => ({ permitted: true }),
    });
    assert.deepEqual(result, {
      delivered: false,
      provider: "none",
      retryability: "not_configured",
      errorCode: "checkout_recovery_footer_not_configured",
    });
    assert.equal(calls.length, 0);
  } finally {
    process.env.REVIEW_REQUEST_MAILING_ADDRESS = saved;
  }
});

test("footer: without any unsubscribe signing secret the send is not_configured, zero provider calls", async () => {
  const keys = [
    "PROMOTION_UNSUBSCRIBE_SECRET",
    "REFERRAL_SIGNING_SECRET",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_SECRET_KEY",
  ];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  try {
    const calls = installFetchFake();
    const result = await recoveryLib.sendCheckoutRecoveryAlert(recoveryInput("buyer@example.com"), {
      checkDispatchPermission: async () => ({ permitted: true }),
    });
    assert.deepEqual(result, {
      delivered: false,
      provider: "none",
      retryability: "not_configured",
      errorCode: "checkout_recovery_footer_not_configured",
    });
    assert.equal(calls.length, 0);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test("footer resolver: both facts come from the shared mechanisms", () => {
  const footer = recoveryLib.resolveCheckoutRecoveryEmailFooter("buyer@example.com");
  assert.ok(footer, "footer resolves when the bindings are present");
  assert.equal(footer.mailingAddress, MAILING_ADDRESS);
  assert.ok(footer.unsubscribeUrl.startsWith("https://starmapco.com/unsubscribe?"));
});

/* --------- default checker against real authority state ------------ */

test("default checker: a subscribed (consented) address receives the recovery email", async () => {
  const client = freshClient();
  const email = "consented@example.com";
  await subscribeViaClient(client, email);

  const calls = installFetchFake();
  const result = await recoveryLib.sendCheckoutRecoveryAlert(recoveryInput(email));
  assert.equal(result.delivered, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].body.text.includes("/unsubscribe?"));
  assert.ok(calls[0].body.text.includes(MAILING_ADDRESS));
});

test("default checker: an unsubscribed address is refused with zero provider calls", async () => {
  const client = freshClient();
  const email = "gone@example.com";
  await subscribeViaClient(client, email);
  await unsubscribePromotionFlow({ email, reason: "email_link" });

  const calls = installFetchFake();
  const result = await recoveryLib.sendCheckoutRecoveryAlert(recoveryInput(email));
  assert.deepEqual(result, {
    delivered: false,
    provider: "none",
    retryability: "terminal",
    errorCode: "promotion_dispatch_refused:unsubscribed",
  });
  assert.equal(calls.length, 0, "an unsubscribed address must not receive the recovery email");
});

test("default checker: a deliverability-suppressed address is refused with zero provider calls", async () => {
  const client = freshClient();
  const email = "bounced@example.com";
  const { name, emailHash } = await subscribeViaClient(client, email);
  await client.recordDeliverabilitySuppression(name, {
    emailHash,
    now: Date.now(),
    eventRef: "test_bounce",
    facts: noFacts,
  });

  const calls = installFetchFake();
  const result = await recoveryLib.sendCheckoutRecoveryAlert(recoveryInput(email));
  assert.deepEqual(result, {
    delivered: false,
    provider: "none",
    retryability: "terminal",
    errorCode: "promotion_dispatch_refused:deliverability_suppressed",
  });
  assert.equal(calls.length, 0, "a deliverability-suppressed address must not receive the recovery email");
});

test("default checker: no permission record anywhere refuses with zero provider calls", async () => {
  freshClient();
  const calls = installFetchFake();
  const result = await recoveryLib.sendCheckoutRecoveryAlert(recoveryInput("recovery-ghost-7f3@example.com"));
  assert.deepEqual(result, {
    delivered: false,
    provider: "none",
    retryability: "terminal",
    errorCode: "promotion_dispatch_refused:no_permission_record",
  });
  assert.equal(calls.length, 0);
});
