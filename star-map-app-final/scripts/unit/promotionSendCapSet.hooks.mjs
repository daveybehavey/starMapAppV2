/** Test-only positive-H fixture: preserve the existing fence regression tables.
 * No runtime override, environment switch, or source-file mutation is exposed.
 */
export async function load(url, context, nextLoad) {
  if (url === new URL("../../src/lib/promotionSendCap.ts", import.meta.url).href) {
    return {
      format: "module",
      source: "export const PROMOTION_SEND_CAP_H = 1;",
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
