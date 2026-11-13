// Explicit null fixture pins refusal bytes and precedence independently of H.
export async function load(url, context, nextLoad) {
  if (url === new URL("../../src/lib/promotionSendCap.ts", import.meta.url).href) {
    return { format: "module", source: "export const PROMOTION_SEND_CAP_H = null;", shortCircuit: true };
  }
  return nextLoad(url, context);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@opennextjs/cloudflare') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(
    'export const getCloudflareContext = () => ({env: {SEND_CAP_SERVICE: {fetch: async () => Response.json({"permitted":false,"reason":"send_cap_unset"})}}});'
  ) };
  return nextResolve(specifier, context);
}
