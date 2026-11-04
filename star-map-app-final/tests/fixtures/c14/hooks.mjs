// Same ESM service-seam pattern as scripts/unit/printRetryResolveRace.hooks.mjs.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "stripe") return { url: new URL("./stripe.mjs", import.meta.url).href, shortCircuit: true };
  if (specifier === "server-only") return { url: new URL("../../../scripts/unit/serverOnly.stub.mjs", import.meta.url).href, shortCircuit: true };
  if (specifier === "next/server") return { url: new URL("../../../node_modules/next/server.js", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
