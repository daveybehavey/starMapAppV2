export function isPrintfulConfigured() { return globalThis.__claimFirstNative !== false; }
export const isPrintfulV2Configured = isPrintfulConfigured;
export async function submitPrintfulOrder(input) {
  (globalThis.__f1SubmitCalls ??= []).push(input);
  return globalThis.__claimFirstSubmit
    ? globalThis.__claimFirstSubmit(input)
    : { ok: true, status: 200, orderId: 555301 };
}
export const submitPrintfulV2CatalogOrder = submitPrintfulOrder;
