import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPrintfulWebhookFailureError,
  isPrintfulOrderFailureWebhookType,
  isPrintfulOrderHoldWebhookType,
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
});
