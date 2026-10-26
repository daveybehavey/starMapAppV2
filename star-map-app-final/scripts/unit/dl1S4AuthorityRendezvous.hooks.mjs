/**
 * ESM resolve hook for dl1Slice4Route.test.mjs: redirect ONLY the
 * archive route module's own "@/lib/entitlementAuthority" import to
 * the rendezvous wrapper (dl1S4AuthorityRendezvous.mjs) so the
 * area-3 race tests can force the stale-snapshot interleaving
 * deterministically. Every other specifier and importer delegates
 * to the next hook in the chain unchanged. Only the route-level S4
 * tests register this hook.
 */
export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === "@/lib/entitlementAuthority" &&
    typeof context.parentURL === "string" &&
    context.parentURL.endsWith("/src/app/api/download/archive/route.ts")
  ) {
    return {
      url: new URL("./dl1S4AuthorityRendezvous.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
