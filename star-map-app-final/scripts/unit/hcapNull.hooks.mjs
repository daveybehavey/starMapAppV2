// Explicit null fixture pins refusal bytes and precedence independently of H.
export async function load(url, context, nextLoad) {
  if (url === new URL("../../src/lib/promotionSendCap.ts", import.meta.url).href) {
    return { format: "module", source: "export const PROMOTION_SEND_CAP_H = null;", shortCircuit: true };
  }
  return nextLoad(url, context);
}
