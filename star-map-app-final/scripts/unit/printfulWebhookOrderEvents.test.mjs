import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPrintfulWebhookFailureError,
  isPrintfulOrderFailureWebhookType,
  PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES,
} from "./printfulWebhookOrderEvents.harness.mjs";

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
