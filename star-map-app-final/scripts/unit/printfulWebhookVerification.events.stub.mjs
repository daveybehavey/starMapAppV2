export const calls = [];
export const kv = {
  get: async () => { throw new Error("unexpected KV read before API confirmation"); },
  set: async () => { throw new Error("unexpected KV mutation"); },
};
export const isPrintfulOrderFailureWebhookType = (type) => ["order_failed", "order_canceled"].includes(type);
export const isPrintfulOrderHoldWebhookType = (type) => type === "order_put_hold";
export async function resolvePrintfulWebhookOrderSessionId(input) {
  calls.push(["resolve", input]);
  return input.externalId || "cs_test_indexed";
}
export async function sendShippingNotification(...input) {
  calls.push(["ship", ...input]);
  return { ok: true, status: "sent", provider: "test" };
}
export async function applyPrintfulOrderFailureFromWebhook(input) {
  calls.push(["fail", input]);
  return { ok: true, status: "updated", sessionId: input.externalId };
}
export async function applyPrintfulOrderHoldFromWebhook(input) {
  calls.push(["hold", input]);
  return { ok: true, status: "updated", sessionId: input.externalId };
}
