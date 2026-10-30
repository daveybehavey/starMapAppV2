/**
 * ESM resolve hook for reviewRequests.test.mjs: maps the
 * `cloudflare:workers` specifier (imported by Durable Object classes) to
 * the local stub so the REAL ReviewRequestSuppressionDO class can load
 * under the plain-Node test runner. Everything else defers to the next
 * resolver (tsAliasLoader).
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: new URL("./cloudflareWorkers.stub.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
