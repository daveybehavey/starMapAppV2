// Arithmetic/integration fixture only. The production constant stays null.
export async function load(url, context, nextLoad) {
  if (url === new URL("../../src/lib/promotionSendCap.ts", import.meta.url).href) {
    return { format: "module", source: "export const PROMOTION_SEND_CAP_H = 25;", shortCircuit: true };
  }
  return nextLoad(url, context);
}
