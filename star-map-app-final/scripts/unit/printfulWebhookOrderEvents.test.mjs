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
