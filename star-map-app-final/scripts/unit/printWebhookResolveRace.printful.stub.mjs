/**
 * Printful v1 stub for printWebhookResolveRace.test.mjs: configured,
 * and every outbound submission is recorded on
 * `globalThis.__whSubmitCalls` so tests can assert the exact number
 * of provider orders a webhook pass created (zero after a mid-pass
 * resolve; exactly one on the unchanged happy path).
 */
export function isPrintfulConfigured() {
  return true;
}

export async function submitPrintfulOrder(input) {
  const calls = (globalThis.__whSubmitCalls ??= []);
  calls.push(input);
  return { ok: true, status: 200, orderId: globalThis.__whSubmitOrderId ?? 555001 };
}
