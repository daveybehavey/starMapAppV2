/**
 * S96 follow-up writer audit F-2…F-11 + riders — regression tests.
 *
 * The audit (base 755e81b1) found that after PR #497 closed the
 * resolve-vs-retry race on the paths it touched, the remaining
 * whole-record KV writers in the print pipeline still persisted
 * caller snapshots across their own awaits, so a concurrent
 * resolution / completion / shipment / hold landing mid-pass could
 * be reverted or erased. This suite pins the fixes:
 *
 *  - F-2 generalized concurrent-state preservation
 *    (preserveLatestConcurrentState) + the advancement predicate.
 *  - F-3/F-11 shared failure persistence
 *    (persistPrintOrderFailureLatestMerged): merges onto the latest
 *    record, refuses when the order advanced past the failure.
 *  - F-9 shared alternate-dispatch completion
 *    (persistAlternateDispatchCompletionLatestMerged).
 *  - F-10 the authority claim refuses an already-fulfilled order
 *    (bound / operator_recovered) with reason "already_fulfilled".
 *  - Rider (a): the promotion unsubscribe token verification is
 *    digest-first (no length early-exit) with an unchanged
 *    acceptance set.
 *  - Rider (b): scripts/check-env.mjs fails when the print margin
 *    guard is explicitly disabled or its server/mirror values
 *    diverge, and stays quiet when they are simply absent.
 *
 * The helper tests drive the REAL modules against the local KV
 * fallback and the in-memory authority client, with only the
 * operator-alerts seam stubbed.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./tsAliasLoader.mjs", import.meta.url);
// Registered last so its resolve hook runs first for the stubbed seam.
register("./printWriterSlateFollowup.hooks.mjs", import.meta.url);

const RUN = Date.now().toString(36);
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), `writer-slate-kv-${RUN}-`));
process.env.STARMAP_PRINT_ORDER_AUTHORITY_LOCAL = "1";
process.env.PROMOTION_UNSUBSCRIBE_SECRET = "writer-slate-test-secret";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");

const { kv } = await import("../../src/lib/kv.ts");
const {
  persistAlternateDispatchCompletionLatestMerged,
  persistPrintOrderRecord,
  preserveLatestConcurrentState,
  printOrderAdvancedPastSnapshot,
  printOrderKey,
} = await import("../../src/lib/printOrders.ts");
const { persistPrintOrderFailureLatestMerged } = await import(
  "../../src/lib/printOrderFailurePersist.ts"
);
const { applyPrintOrderAuthorityOp, createUnboundAuthorityState } = await import(
  "../../src/lib/printOrderAuthorityState.ts"
);
const { bindPrintProviderOrderId } = await import("../../src/lib/printOrderAuthority.ts");
const { createPromotionUnsubscribeToken, verifyPromotionUnsubscribeToken } = await import(
  "../../src/lib/promotionSubscriptions.ts"
);
const { alertCalls } = await import("./printWriterSlateFollowup.alerts.stub.mjs");
const { sendShippingNotification } = await import("../../src/lib/shippingNotifications.ts");
const resendStub = await import("./printWriterSlateFollowup.resend.stub.mjs");

const NOW = Date.now();
let seq = 0;
const nextSession = () => `cs_test_writer_slate_${RUN}_${(seq += 1)}`;

function baseRecord(sessionId, overrides = {}) {
  return {
    status: "pending",
    sessionId,
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
    attempts: 1,
    createdAt: NOW - 60_000,
    customerName: "Test Buyer",
    customerEmail: "buyer@example.test",
    ...overrides,
  };
}

/* ---------------- F-2: generalized preservation ---------------- */

test("F-2: preserveLatestConcurrentState carries resolution, shipment, and confirmation state from latest", () => {
  const next = baseRecord("cs_f2", { status: "pending" });
  const latest = baseRecord("cs_f2", {
    operatorResolvedAt: NOW - 1_000,
    operatorResolvedProvider: "printful",
    operatorResolvedNote: "manual order 123",
    shippedAt: NOW - 900,
    shippingNotificationSentAt: NOW - 800,
    shippingNotificationProvider: "resend",
    shippingNotificationTrackingNumber: "TRACK1",
    printConfirmationSentAt: NOW - 700,
    printConfirmationMessageId: "msg_1",
  });
  const merged = preserveLatestConcurrentState(next, latest);
  assert.equal(merged.operatorResolvedAt, NOW - 1_000);
  assert.equal(merged.operatorResolvedProvider, "printful");
  assert.equal(merged.operatorResolvedNote, "manual order 123");
  assert.equal(merged.shippedAt, NOW - 900);
  assert.equal(merged.shippingNotificationSentAt, NOW - 800);
  assert.equal(merged.shippingNotificationTrackingNumber, "TRACK1");
  assert.equal(merged.printConfirmationSentAt, NOW - 700);
  assert.equal(merged.printConfirmationMessageId, "msg_1");
});

test("F-2: caller-owned fields are not overwritten by the sync", () => {
  const next = baseRecord("cs_f2", { printConfirmationSentAt: NOW, printConfirmationError: undefined });
  const latest = baseRecord("cs_f2", {
    printConfirmationSentAt: NOW - 5_000,
    printConfirmationError: "previous failure",
    shippedAt: NOW - 4_000,
  });
  const merged = preserveLatestConcurrentState(
    next,
    latest,
    new Set(["printConfirmationSentAt", "printConfirmationMessageId", "printConfirmationError"]),
  );
  assert.equal(merged.printConfirmationSentAt, NOW);
  assert.equal(merged.printConfirmationError, undefined);
  // Non-owned fields still sync.
  assert.equal(merged.shippedAt, NOW - 4_000);
});

test("F-2: printOrderAdvancedPastSnapshot detects each advancement class", () => {
  const snap = baseRecord("cs_f2");
  assert.equal(printOrderAdvancedPastSnapshot(snap, { ...snap }), false);
  assert.equal(printOrderAdvancedPastSnapshot(snap, { ...snap, status: "sent" }), true);
  assert.equal(printOrderAdvancedPastSnapshot(snap, { ...snap, operatorResolvedAt: NOW }), true);
  assert.equal(printOrderAdvancedPastSnapshot(snap, { ...snap, shippedAt: NOW }), true);
  assert.equal(
    printOrderAdvancedPastSnapshot(snap, { ...snap, shippedAt: NOW }, { ignoreShippedAt: true }),
    false,
  );
  assert.equal(printOrderAdvancedPastSnapshot(snap, { ...snap, providerHoldAt: NOW }), true);
  assert.equal(printOrderAdvancedPastSnapshot(snap, { ...snap, printfulOrderId: 991 }), true);
  // Neutral field movement is not advancement.
  assert.equal(
    printOrderAdvancedPastSnapshot(snap, { ...snap, customerEmail: "other@example.test", attempts: 9 }),
    false,
  );
});

/* ---------------- F-10: claim refuses fulfilled ---------------- */

test("F-10: alternate-dispatch claim is refused when the authority is bound", () => {
  let state = createUnboundAuthorityState("cs_f10_bound", 1);
  state = applyPrintOrderAuthorityOp(state, {
    type: "bind_provider_order_id",
    printfulOrderId: 4242,
    now: 2,
  }).state;
  assert.equal(state.lifecycle, "bound");
  const claim = applyPrintOrderAuthorityOp(state, {
    type: "claim_alternate_dispatch",
    dispatchId: "dispatch-1",
    now: 3,
  });
  assert.equal(claim.ok, false);
  assert.equal(claim.reason, "already_fulfilled");
});

test("F-10: claim still succeeds on an unbound order and still refuses terminal failure", () => {
  const unbound = createUnboundAuthorityState("cs_f10_open", 1);
  const claim = applyPrintOrderAuthorityOp(unbound, {
    type: "claim_alternate_dispatch",
    dispatchId: "dispatch-1",
    now: 2,
  });
  assert.equal(claim.ok, true);
  assert.equal(claim.claimAcquired, true);

  let terminal = createUnboundAuthorityState("cs_f10_term", 1);
  terminal = applyPrintOrderAuthorityOp(terminal, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    now: 2,
  }).state;
  const blocked = applyPrintOrderAuthorityOp(terminal, {
    type: "claim_alternate_dispatch",
    dispatchId: "dispatch-1",
    now: 3,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "terminal_blocks_claim");
  // And a recovered terminal order is fulfilled, not claimable.
  const recovered = applyPrintOrderAuthorityOp(terminal, {
    type: "operator_recover",
    printfulOrderId: 777,
    now: 4,
  }).state;
  assert.equal(recovered.lifecycle, "operator_recovered");
  const claimRecovered = applyPrintOrderAuthorityOp(recovered, {
    type: "claim_alternate_dispatch",
    dispatchId: "dispatch-1",
    now: 5,
  });
  assert.equal(claimRecovered.ok, false);
  assert.equal(claimRecovered.reason, "already_fulfilled");
});

/* ---------------- F-3/F-11: failure persistence ---------------- */

test("F-3/F-11: failure persist merges onto the latest record (neutral movement kept)", async () => {
  const sessionId = nextSession();
  await persistPrintOrderRecord(sessionId, baseRecord(sessionId));
  // A concurrent neutral update lands after the failing pass read it.
  await persistPrintOrderRecord(
    sessionId,
    baseRecord(sessionId, { attempts: 4, customerEmail: "updated@example.test" }),
  );
  const outcome = await persistPrintOrderFailureLatestMerged({
    sessionId,
    failureRecord: baseRecord(sessionId, { status: "failed", error: "provider_timeout" }),
  });
  assert.equal(outcome.persisted, true);
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "failed");
  assert.equal(stored.error, "provider_timeout");
  assert.equal(stored.customerEmail, "updated@example.test");
  assert.equal(stored.attempts, 4);
  // The (stubbed, delivered) failure alert stamped the merged record.
  assert.ok(stored.operatorFailureAlertedAt > 0);
  assert.equal(stored.operatorFailureAlertProvider, "resend");
  assert.ok(alertCalls.some((c) => c.kind === "failure" && c.sessionId === sessionId));
});

test("F-3/F-11: failure persist is refused when the order completed mid-pass", async () => {
  const sessionId = nextSession();
  await persistPrintOrderRecord(sessionId, baseRecord(sessionId));
  await persistPrintOrderRecord(
    sessionId,
    baseRecord(sessionId, { status: "sent", sentAt: NOW - 500, printfulOrderId: 5150 }),
  );
  const outcome = await persistPrintOrderFailureLatestMerged({
    sessionId,
    failureRecord: baseRecord(sessionId, { status: "failed", error: "stale_failure" }),
  });
  assert.equal(outcome.persisted, false);
  assert.equal(outcome.reason, "advanced_past_failure");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(stored.printfulOrderId, 5150);
  assert.equal(stored.error, undefined);
});

test("F-3/F-11: failure persist is refused when the authority is already fulfilled", async () => {
  const sessionId = nextSession();
  await persistPrintOrderRecord(sessionId, baseRecord(sessionId));
  const bind = await bindPrintProviderOrderId(sessionId, 6001);
  assert.equal(bind.ok, true);
  const outcome = await persistPrintOrderFailureLatestMerged({
    sessionId,
    failureRecord: baseRecord(sessionId, { status: "failed", error: "late_failure" }),
  });
  assert.equal(outcome.persisted, false);
  assert.equal(outcome.reason, "advanced_past_failure");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "pending");
});

test("F-3/F-11: failure persist is refused when a resolution landed mid-pass", async () => {
  const sessionId = nextSession();
  await persistPrintOrderRecord(sessionId, baseRecord(sessionId));
  await persistPrintOrderRecord(
    sessionId,
    baseRecord(sessionId, {
      status: "sent",
      operatorResolvedAt: NOW - 100,
      operatorResolvedProvider: "manual",
    }),
  );
  const outcome = await persistPrintOrderFailureLatestMerged({
    sessionId,
    failureRecord: baseRecord(sessionId, { status: "failed", error: "racing_failure" }),
  });
  assert.equal(outcome.persisted, false);
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.operatorResolvedAt, NOW - 100);
  assert.equal(stored.status, "sent");
});

/* ---------------- F-9: alternate completion ---------------- */

const attemptedMarker = (dispatchId) => ({
  dispatchId,
  state: "attempted",
  attemptedAt: NOW - 2_000,
});

test("F-9: completion merges onto latest and preserves a mid-flight shipment", async () => {
  const sessionId = nextSession();
  const dispatchId = `dispatch_${sessionId}`;
  const snapshot = baseRecord(sessionId, { alternateDispatch: attemptedMarker(dispatchId) });
  await persistPrintOrderRecord(sessionId, snapshot);
  // The shipment anchors while the outbound webhook call is in flight.
  await persistPrintOrderRecord(sessionId, {
    ...snapshot,
    shippedAt: NOW - 100,
    shippingNotificationSentAt: NOW - 90,
    shippingNotificationTrackingNumber: "TRACK9",
  });
  const outcome = await persistAlternateDispatchCompletionLatestMerged({
    sessionId,
    snapshot,
    completion: {
      webhookStatus: 202,
      sentAt: NOW,
      printAssetUrl: "https://assets.example.test/proof.png",
      alternateDispatch: { dispatchId, state: "accepted", attemptedAt: NOW - 2_000, respondedAt: NOW, httpStatus: 202 },
    },
  });
  assert.equal(outcome.persisted, true);
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(stored.shippedAt, NOW - 100);
  assert.equal(stored.shippingNotificationTrackingNumber, "TRACK9");
  assert.equal(stored.alternateDispatch.state, "accepted");
  assert.equal(stored.sentAt, NOW);
});

test("F-9: completion is refused when a resolution landed mid-flight", async () => {
  const sessionId = nextSession();
  const dispatchId = `dispatch_${sessionId}`;
  const snapshot = baseRecord(sessionId, { alternateDispatch: attemptedMarker(dispatchId) });
  await persistPrintOrderRecord(sessionId, snapshot);
  await persistPrintOrderRecord(sessionId, {
    ...snapshot,
    status: "sent",
    operatorResolvedAt: NOW - 50,
    printfulOrderId: 7007,
  });
  const outcome = await persistAlternateDispatchCompletionLatestMerged({
    sessionId,
    snapshot,
    completion: {
      webhookStatus: 200,
      sentAt: NOW,
      printAssetUrl: "https://assets.example.test/proof.png",
      alternateDispatch: { dispatchId, state: "accepted", attemptedAt: NOW - 2_000, respondedAt: NOW, httpStatus: 200 },
    },
  });
  assert.equal(outcome.persisted, false);
  assert.equal(outcome.reason, "completion_superseded");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.printfulOrderId, 7007);
});

/* ---------------- Rider (a): unsubscribe token ---------------- */

/* ----- F-8 gate fix C (PR #505 review): sequential vs concurrent stamps ----- */

test("F-8 gate fix C: a sequential reshipment's stamp replaces the previous shipment's stamp", async () => {
  resendStub.__resetResendStub();
  const sessionId = nextSession();
  const stampA = NOW - 120_000;
  await persistPrintOrderRecord(
    sessionId,
    baseRecord(sessionId, {
      status: "sent",
      sentAt: NOW - 180_000,
      shippedAt: NOW - 150_000,
      shippingNotificationSentAt: stampA,
      shippingNotificationProvider: "resend",
      shippingNotificationTrackingNumber: "TRACK-A",
      shippingNotificationMessageId: "msg_a",
    }),
  );
  const sent = await sendShippingNotification(sessionId, { trackingNumber: "TRACK-B" });
  assert.equal(sent.status, "sent");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.shippingNotificationTrackingNumber, "TRACK-B");
  assert.ok(stored.shippingNotificationSentAt > stampA, "B's stamp landed");
  // Redelivery of B's event dedupes — no second customer email.
  const again = await sendShippingNotification(sessionId, { trackingNumber: "TRACK-B" });
  assert.equal(again.status, "already_sent");
  assert.equal(resendStub.sendCalls.length, 1);
});

test("F-8 gate fix C: a stamp advancing DURING the send supersedes this pass's outcome", async () => {
  resendStub.__resetResendStub();
  const sessionId = nextSession();
  await persistPrintOrderRecord(
    sessionId,
    baseRecord(sessionId, { status: "sent", sentAt: NOW - 180_000, shippedAt: NOW - 150_000 }),
  );
  const stampC = NOW + 60_000;
  resendStub.__setResendBehaviour({
    onSend: async () => {
      const current = await kv.get(printOrderKey(sessionId));
      await persistPrintOrderRecord(sessionId, {
        ...current,
        shippingNotificationSentAt: stampC,
        shippingNotificationProvider: "resend",
        shippingNotificationTrackingNumber: "TRACK-C",
        shippingNotificationMessageId: "msg_c",
      });
    },
  });
  const sent = await sendShippingNotification(sessionId, { trackingNumber: "TRACK-B" });
  assert.equal(sent.status, "sent", "the email did go out");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.shippingNotificationTrackingNumber, "TRACK-C", "the concurrent stamp stands");
  assert.equal(stored.shippingNotificationSentAt, stampC);
  resendStub.__resetResendStub();
});

test("F-8 gate fix C: a failure outcome never erases a standing success stamp", async () => {
  resendStub.__resetResendStub();
  const sessionId = nextSession();
  const stampA = NOW - 120_000;
  await persistPrintOrderRecord(
    sessionId,
    baseRecord(sessionId, {
      status: "sent",
      sentAt: NOW - 180_000,
      shippedAt: NOW - 150_000,
      shippingNotificationSentAt: stampA,
      shippingNotificationProvider: "resend",
      shippingNotificationTrackingNumber: "TRACK-A",
      shippingNotificationMessageId: "msg_a",
    }),
  );
  resendStub.__setResendBehaviour({ result: { ok: false, error: "provider_down" } });
  const failed = await sendShippingNotification(sessionId, { trackingNumber: "TRACK-B" });
  assert.equal(failed.status, "failed");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.shippingNotificationTrackingNumber, "TRACK-A");
  assert.equal(stored.shippingNotificationSentAt, stampA);
  resendStub.__resetResendStub();
});

test("rider (a): unsubscribe token verifies digest-first with an unchanged acceptance set", () => {
  const email = "Reader@Example.test";
  const token = createPromotionUnsubscribeToken(email);
  assert.ok(token);
  assert.equal(verifyPromotionUnsubscribeToken(email, token), true);
  assert.equal(verifyPromotionUnsubscribeToken("reader@example.test", token), true);
  // Same-length forgery, different-length forgery, empty, and a token
  // minted for a different address all refuse.
  const forged = (token[0] === "A" ? "B" : "A") + token.slice(1);
  assert.equal(forged.length, token.length);
  assert.equal(verifyPromotionUnsubscribeToken(email, forged), false);
  assert.equal(verifyPromotionUnsubscribeToken(email, token.slice(0, 8)), false);
  assert.equal(verifyPromotionUnsubscribeToken(email, `${token}extra`), false);
  assert.equal(verifyPromotionUnsubscribeToken(email, ""), false);
  assert.equal(verifyPromotionUnsubscribeToken("other@example.test", token), false);
});

/* ---------------- Rider (b): check-env posture ---------------- */

function runCheckEnv(extraEnv) {
  const env = {
    ...process.env,
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    NEXT_PUBLIC_SITE_URL: "https://example.test",
    PRICE_CENTS: "4900",
    CURRENCY: "USD",
    NEXT_PUBLIC_PRICE_CENTS: "4900",
    NEXT_PUBLIC_CURRENCY: "USD",
    ...extraEnv,
  };
  try {
    const stdout = execFileSync(process.execPath, [path.join(appRoot, "scripts/check-env.mjs")], {
      cwd: appRoot,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: stdout };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

test("rider (b): check-env fails when the margin guard is explicitly disabled", () => {
  const { out } = runCheckEnv({ PRINT_MARGIN_GUARD_ENABLED: "false" });
  assert.match(out, /Print margin guard is explicitly disabled/);
});

test("rider (b): check-env fails on server/mirror divergence and stays quiet when the vars are absent", () => {
  const diverged = runCheckEnv({
    PRINT_MIN_MARGIN_CENTS: "1000",
    NEXT_PUBLIC_PRINT_MIN_MARGIN_CENTS: "500",
  });
  assert.match(diverged.out, /PRINT_MIN_MARGIN_CENTS and NEXT_PUBLIC_PRINT_MIN_MARGIN_CENTS must match/);

  const absent = runCheckEnv({
    PRINT_MARGIN_GUARD_ENABLED: "",
    NEXT_PUBLIC_PRINT_MARGIN_GUARD_ENABLED: "",
    PRINT_MIN_MARGIN_CENTS: "",
    NEXT_PUBLIC_PRINT_MIN_MARGIN_CENTS: "",
  });
  assert.doesNotMatch(absent.out, /Print margin guard is explicitly disabled/);
  assert.doesNotMatch(absent.out, /must match/);
  assert.doesNotMatch(absent.out, /Missing optional PRINT_MARGIN_GUARD_ENABLED/);
  assert.doesNotMatch(absent.out, /Missing optional PRINT_MIN_MARGIN_CENTS/);
});

/* ---------------- Source pins for the route wiring ---------------- */

const readSource = (rel) => fs.readFileSync(path.join(appRoot, rel), "utf8");

test("source pins: F-4/F-5/F-6/F-7 wiring is present in the routes", () => {
  const webhookSource = readSource("src/app/api/stripe/webhook/route.ts");
  assert.match(webhookSource, /persistPrintOrderFailureLatestMerged\(\{\s+sessionId: session\.id,/);
  assert.match(webhookSource, /S96 follow-up writer audit F-4/);
  assert.match(webhookSource, /alternate_dispatch_blocked_already_fulfilled/);
  assert.match(webhookSource, /persistAlternateDispatchCompletionLatestMerged\(\{\s+sessionId: session\.id,/);

  const retrySource = readSource("src/app/api/print/orders/retry/route.ts");
  assert.match(retrySource, /persistPrintOrderFailureLatestMerged\(\{\s+sessionId,/);
  assert.match(retrySource, /S96 follow-up writer audit F-5/);
  assert.match(retrySource, /S96 follow-up writer audit F-6/);
  assert.match(retrySource, /authority_already_fulfilled/);
  assert.match(retrySource, /fulfillment_advanced_during_retry/);
  // PR #505 gate fix B: the post-claim stand-down releases the claim
  // it acquired before returning, so the order is not stranded.
  assert.match(retrySource, /releaseAlternateFulfillmentDispatchClaim\(sessionId, dispatchId\)/);

  const authorityStateSource = readSource("src/lib/printOrderAuthorityState.ts");
  assert.match(authorityStateSource, /release_alternate_dispatch_claim/);

  const resolveSource = readSource("src/app/api/print/orders/resolve/route.ts");
  assert.match(resolveSource, /S96 follow-up writer audit F-7/);
  // PR #505 gate fix A: two-phase reads around the index ops — the
  // persisted record is built from the post-index re-read.
  assert.match(resolveSource, /transitionStillOwned/);
  assert.match(resolveSource, /freshBeforeIndex/);

  const shippingSource = readSource("src/lib/shippingNotifications.ts");
  assert.match(shippingSource, /S96 follow-up writer audit F-8/);
  assert.match(shippingSource, /shipping_notification_unrecorded/);

  const failurePersistSource = readSource("src/lib/printOrderFailurePersist.ts");
  assert.match(failurePersistSource, /S96 follow-up writer audit F-3 \+ F-11/);
});
