/**
 * Printful V2 catalog stub for printWebhookResolveRace.test.mjs:
 * configured, and every outbound submission is recorded on
 * `globalThis.__whSubmitCallsV2` (same assertion contract as the v1
 * stub).
 */
export function isPrintfulV2Configured() {
  return true;
}

export async function submitPrintfulV2CatalogOrder(input) {
  const calls = (globalThis.__whSubmitCallsV2 ??= []);
  calls.push(input);
  return { ok: true, status: 200, orderId: globalThis.__whSubmitOrderIdV2 ?? 666001 };
}
