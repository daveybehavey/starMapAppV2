/**
 * Printful stub for printRetryResolveRace.test.mjs: configured, and
 * every outbound submission is recorded on
 * `globalThis.__f1SubmitCalls` so tests can assert the exact number
 * of provider orders a retry pass created (zero after a mid-pass
 * resolve; exactly one on the unchanged happy path).
 */
export function isPrintfulConfigured() {
  return true;
}

export async function submitPrintfulOrder(input) {
  const calls = (globalThis.__f1SubmitCalls ??= []);
  calls.push(input);
  return { ok: true, status: 200, orderId: globalThis.__f1SubmitOrderId ?? 555001 };
}
