import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPrintfulWebhookFailureError,
  isPrintfulOrderFailureWebhookType,
  isPrintfulOrderHoldWebhookType,
  holdProviderIdConflicts,
  mergeHoldAnnotationsIntoLatestRecord,
  mergeTerminalFailureIntoLatestRecord,
  PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES,
  PRINTFUL_ORDER_HOLD_WEBHOOK_TYPE,
} from "./printfulWebhookOrderEvents.harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const eventsSource = fs.readFileSync(
  path.join(appRoot, "src/lib/printfulWebhookOrderEvents.ts"),
  "utf8",
);
const printfulRouteSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/printful/webhook/route.ts"),
  "utf8",
);

test("PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES covers failure lifecycle events", () => {
  assert.equal(PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES.has("order_failed"), true);
  assert.equal(PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES.has("order_canceled"), true);
  assert.equal(PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES.has("order_put_hold"), false);
  assert.equal(isPrintfulOrderFailureWebhookType("package_shipped"), false);
  assert.equal(isPrintfulOrderFailureWebhookType("order_put_hold"), false);
});

test("buildPrintfulWebhookFailureError includes event, reason, and status", () => {
  assert.equal(
    buildPrintfulWebhookFailureError("order_failed", "File download failed", "failed"),
    "printful_order_failed:File download failed:status=failed",
  );
});

test("buildPrintfulWebhookFailureError trims empty fields", () => {
  assert.equal(buildPrintfulWebhookFailureError("order_canceled", "", ""), "printful_order_canceled");
});

/* ================= S96-1 F1 — order_put_hold is handled, not ignored ================= */

test("S96-1 F1: order_put_hold is a hold event, never a terminal failure event", () => {
  assert.equal(PRINTFUL_ORDER_HOLD_WEBHOOK_TYPE, "order_put_hold");
  assert.equal(isPrintfulOrderHoldWebhookType("order_put_hold"), true);
  assert.equal(isPrintfulOrderHoldWebhookType(" order_put_hold "), true);
  assert.equal(isPrintfulOrderHoldWebhookType("order_failed"), false);
  assert.equal(isPrintfulOrderFailureWebhookType("order_put_hold"), false);
  assert.equal(PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES.has("order_put_hold"), false);
});

test("S96-1 F1: hold handling is pinned in the TS sources", () => {
  assert.match(eventsSource, /applyPrintfulOrderHoldFromWebhook/);
  assert.match(eventsSource, /providerHoldAt: existing\.providerHoldAt \?\? now/);
  assert.match(eventsSource, /sendPrintOrderHoldAlert/);
  assert.match(eventsSource, /superseded_by_terminal_failure/);
  // The terminal projection clears any recorded hold.
  assert.match(eventsSource, /providerHoldAt: undefined/);
  // The route dispatches holds to their handler instead of the ignored fallback.
  assert.match(printfulRouteSource, /isPrintfulOrderHoldWebhookType\(eventType\)/);
  assert.match(printfulRouteSource, /handleOrderHold/);
  // Gate round 3: hold annotations merge onto the latest record before
  // persisting — a shipment landing during the alert must survive.
  assert.match(eventsSource, /mergeHoldAnnotationsIntoLatestRecord\(\{\s+existing,\s+fresh,\s+annotations: nextRecord/);
  assert.match(eventsSource, /superseded_by_shipment/);
  assert.match(eventsSource, /superseded_by_operator_resolve/);
});

/* ============ Gate round 3 — hold persist merges onto the latest record ============ */

const holdBase = {
  sessionId: "cs_hold_merge",
  status: "sent",
  printfulOrderId: "9911",
  createdAt: 1_700_000_000_000,
};
const holdAnnotations = {
  ...holdBase,
  providerHoldAt: 1_700_000_100_000,
  providerHoldReason: "address_issue",
  providerHoldOrderStatus: "onhold",
  operatorHoldAlertedAt: 1_700_000_100_000,
  operatorHoldAlertProvider: "resend",
  operatorHoldAlertError: undefined,
};

test("S96-1 F1 (gate round 3): a shipment landing during the alert supersedes the hold write", () => {
  const merge = mergeHoldAnnotationsIntoLatestRecord({
    existing: holdBase,
    fresh: { ...holdBase, shippedAt: 1_700_000_090_000, status: "sent" },
    annotations: holdAnnotations,
  });
  assert.deepEqual(merge, { outcome: "superseded", reason: "shipment" });
});

test("S96-1 F1 (gate round 3): a terminal failure on the fresh record supersedes the hold write", () => {
  const merge = mergeHoldAnnotationsIntoLatestRecord({
    existing: holdBase,
    fresh: { ...holdBase, status: "failed", terminalEventType: "order_failed" },
    annotations: holdAnnotations,
  });
  assert.deepEqual(merge, { outcome: "superseded", reason: "terminal_failure" });
});

test("S96-1 F1 (gate round 3): an operator resolve that cleared a recorded hold supersedes the hold write", () => {
  const merge = mergeHoldAnnotationsIntoLatestRecord({
    existing: { ...holdBase, providerHoldAt: 1_700_000_050_000 },
    fresh: { ...holdBase },
    annotations: holdAnnotations,
  });
  assert.deepEqual(merge, { outcome: "superseded", reason: "operator_resolve" });
});

test("S96-1 F1 (gate round 10): a resolve landing during the FIRST hold alert supersedes the hold write", () => {
  // No hold was persisted when the pass began, so there is nothing to
  // "disappear" — the advanced operatorResolvedAt stamp is the signal.
  const merge = mergeHoldAnnotationsIntoLatestRecord({
    existing: { ...holdBase },
    fresh: { ...holdBase, operatorResolvedAt: 1_700_000_090_000 },
    annotations: holdAnnotations,
  });
  assert.deepEqual(merge, { outcome: "superseded", reason: "operator_resolve" });
  // A resolve from BEFORE this pass (stamp unchanged) does not block a
  // genuinely new hold.
  const later = mergeHoldAnnotationsIntoLatestRecord({
    existing: { ...holdBase, operatorResolvedAt: 1_700_000_010_000 },
    fresh: { ...holdBase, operatorResolvedAt: 1_700_000_010_000 },
    annotations: holdAnnotations,
  });
  assert.equal(later.outcome, "merged");
});

test("S96-1 F1 (gate round 3): the merge keeps the fresh record's fields and applies only the annotations", () => {
  const merge = mergeHoldAnnotationsIntoLatestRecord({
    existing: holdBase,
    fresh: { ...holdBase, printfulOrderId: "9922", error: undefined },
    annotations: holdAnnotations,
  });
  assert.equal(merge.outcome, "merged");
  assert.equal(merge.record.printfulOrderId, "9922");
  assert.equal(merge.record.providerHoldAt, 1_700_000_100_000);
  assert.equal(merge.record.providerHoldReason, "address_issue");
  assert.equal(merge.record.operatorHoldAlertedAt, 1_700_000_100_000);
});

test("S96-1 F1 (gate round 3): a concurrent delivery's alert success is never regressed by this pass's alert error", () => {
  const merge = mergeHoldAnnotationsIntoLatestRecord({
    existing: holdBase,
    fresh: {
      ...holdBase,
      providerHoldAt: 1_700_000_099_000,
      operatorHoldAlertedAt: 1_700_000_099_500,
      operatorHoldAlertProvider: "resend",
    },
    annotations: {
      ...holdAnnotations,
      operatorHoldAlertedAt: undefined,
      operatorHoldAlertProvider: "resend",
      operatorHoldAlertError: "print_alert_not_configured",
    },
  });
  assert.equal(merge.outcome, "merged");
  assert.equal(merge.record.providerHoldAt, 1_700_000_099_000);
  assert.equal(merge.record.operatorHoldAlertedAt, 1_700_000_099_500);
  assert.equal(merge.record.operatorHoldAlertError, undefined);
});

/* ============ Gate round 6 — hold events reject conflicting provider IDs ============ */

test("S96-1 F1 (gate round 6): a hold naming a different provider order than the authority's bound order conflicts", () => {
  assert.equal(holdProviderIdConflicts("222", "111"), true);
  assert.equal(holdProviderIdConflicts("111", "111"), false);
  // Nothing bound yet, or the event names no order: nothing to conflict with.
  assert.equal(holdProviderIdConflicts("222", null), false);
  assert.equal(holdProviderIdConflicts(null, "111"), false);
  assert.equal(holdProviderIdConflicts(null, null), false);
  // The handler rejects conflicts before any record write or alert.
  assert.match(eventsSource, /holdProviderIdConflicts\(printfulOrderId, authority\.printfulOrderId\)/);
  assert.match(eventsSource, /reason: "conflicting_provider_id"/);
});

test("S96-1 F1 (gate round 7): an already-shipped record rejects the hold before any alert is sent", () => {
  // superseded_by_shipment appears twice in the handler: the early
  // pre-alert rejection and the post-alert merge mapping.
  assert.ok(eventsSource.split("superseded_by_shipment").length >= 3);
  assert.match(eventsSource, /if \(existing\.shippedAt\) \{/);
});

test("S96-1 F7: package_shipped with an unresolved session is retryable (503), never a 200 ACK", () => {
  // Extract the shipped handler body and pin its unresolved branch.
  const start = printfulRouteSource.indexOf("async function handlePackageShipped");
  assert.ok(start >= 0, "handlePackageShipped exists in the route");
  const handler = printfulRouteSource.slice(start, start + 2400);
  assert.match(handler, /status: "session_unresolved"/);
  assert.match(handler, /\{ status: 503 \}/);
  assert.match(handler, /package_shipped session unresolved \(retryable\)/);
  // The pre-F7 shape — a 200 "ignored" ACK for the unresolved case —
  // must not return: it dropped the shipment notification permanently.
  assert.doesNotMatch(handler, /status: "ignored",\s+reason: "session_unresolved"/);
});

/* ================= #551 N2 — terminal persist merges onto the latest record ================= */

const terminalBase = {
  sessionId: "cs_terminal_merge",
  status: "sent",
  printfulOrderId: "8811",
  createdAt: 1_700_000_000_000,
};
const terminalProjection = {
  ...terminalBase,
  status: "failed",
  error: "printful_order_failed:status=failed",
  terminalEventType: "order_failed",
  operatorFailureAlertedAt: 1_700_000_100_000,
  operatorFailureAlertProvider: "resend",
  operatorFailureAlertError: undefined,
};

test("#551 N2: shipment annotations landing during the review/alert awaits survive the terminal persist", () => {
  // The shipping writer anchors the shipment fact + delivered-email
  // stamp onto the (failed) record while the terminal pass is suspended
  // in its file review / alert awaits. The merge must keep them, or the
  // persist erases the shipment and a later event resends the email.
  const merged = mergeTerminalFailureIntoLatestRecord({
    fresh: {
      ...terminalBase,
      shippedAt: 1_700_000_090_000,
      shippingNotificationSentAt: 1_700_000_091_000,
      shippingNotificationProvider: "resend",
      shippingNotificationTrackingNumber: "9400111899223856928499",
      shippingNotificationMessageId: "msg_ship_1",
    },
    terminal: terminalProjection,
  });
  assert.equal(merged.status, "failed");
  assert.equal(merged.error, "printful_order_failed:status=failed");
  assert.equal(merged.terminalEventType, "order_failed");
  assert.equal(merged.shippedAt, 1_700_000_090_000);
  assert.equal(merged.shippingNotificationSentAt, 1_700_000_091_000);
  assert.equal(merged.shippingNotificationTrackingNumber, "9400111899223856928499");
  assert.equal(merged.shippingNotificationMessageId, "msg_ship_1");
  assert.equal(merged.operatorFailureAlertedAt, 1_700_000_100_000);
});

test("#551 N2: the terminal projection clears a hold episode recorded on the fresh record", () => {
  const merged = mergeTerminalFailureIntoLatestRecord({
    fresh: {
      ...terminalBase,
      providerHoldAt: 1_700_000_050_000,
      providerHoldReason: "address_issue",
      providerHoldOrderStatus: "onhold",
      operatorHoldAlertedAt: 1_700_000_050_500,
      operatorHoldAlertProvider: "resend",
      operatorHoldEscalatedAt: 1_700_000_060_000,
    },
    terminal: terminalProjection,
  });
  assert.equal(merged.providerHoldAt, undefined);
  assert.equal(merged.providerHoldReason, undefined);
  assert.equal(merged.providerHoldOrderStatus, undefined);
  assert.equal(merged.operatorHoldAlertedAt, undefined);
  assert.equal(merged.operatorHoldEscalatedAt, undefined);
});

test("#551 N2: a concurrent delivery's failure-alert success is never regressed by this pass's alert error", () => {
  const merged = mergeTerminalFailureIntoLatestRecord({
    fresh: {
      ...terminalBase,
      operatorFailureAlertedAt: 1_700_000_099_500,
      operatorFailureAlertProvider: "resend",
    },
    terminal: {
      ...terminalProjection,
      operatorFailureAlertedAt: undefined,
      operatorFailureAlertProvider: "resend",
      operatorFailureAlertError: "print_alert_not_configured",
    },
  });
  assert.equal(merged.operatorFailureAlertedAt, 1_700_000_099_500);
  assert.equal(merged.operatorFailureAlertProvider, "resend");
  assert.equal(merged.operatorFailureAlertError, undefined);
});

test("#551 N2: unrelated fresh fields (resolve stamps, file-review state) survive untouched", () => {
  const merged = mergeTerminalFailureIntoLatestRecord({
    fresh: {
      ...terminalBase,
      operatorResolvedAt: 1_700_000_080_000,
      operatorResolvedNote: "refunded via Stripe",
      fileReviewState: "failed",
      fileReviewCheckedAt: 1_700_000_085_000,
    },
    terminal: terminalProjection,
  });
  assert.equal(merged.operatorResolvedAt, 1_700_000_080_000);
  assert.equal(merged.operatorResolvedNote, "refunded via Stripe");
  assert.equal(merged.fileReviewState, "failed");
  assert.equal(merged.fileReviewCheckedAt, 1_700_000_085_000);
});

test("#551 N2: the terminal handler re-reads and merges before persisting (pinned in source)", () => {
  assert.match(eventsSource, /mergeTerminalFailureIntoLatestRecord\(\{ fresh, terminal: nextRecord \}\)/);
  assert.match(
    eventsSource,
    /persistPrintOrderRecord\(sessionId, recordToPersist, \{ allowClearTerminalFailure: true \}\)/,
  );
  // The alert_failed outcome is decided on the MERGED record, so a
  // concurrent delivery's recorded success does not surface as a
  // retryable alert failure for this pass.
  assert.match(eventsSource, /if \(recordToPersist\.operatorFailureAlertError\)/);
});

test("S96-1 F7: package_shipped with a resolved session but no tracking stays a 200 ignore (pinned, deliberate)", () => {
  const start = printfulRouteSource.indexOf("async function handlePackageShipped");
  const handler = printfulRouteSource.slice(start, start + 2400);
  // Correlation exists once the session resolves; a redelivery of the
  // same payload cannot supply the missing tracking number, so there
  // is nothing for a retry to recover. See the PR body for the full
  // disposition.
  assert.match(handler, /reason: "tracking_number_missing"/);
});
