/**
 * ESM resolve hook for dl1Slice4Route.test.mjs: plain Node cannot resolve
 * the `next/server` package subpath (it resolves to an extensionless
 * directory entry), so map it to the package's server.js entry. Only the
 * route-level S4 tests register this hook.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return {
      url: new URL("../../node_modules/next/server.js", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
