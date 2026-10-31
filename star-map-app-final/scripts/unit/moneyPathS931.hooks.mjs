/**
 * ESM resolve hooks for moneyPathS931.test.mjs: the webhook route's
 * dependency graph imports the `server-only` marker package (via
 * src/lib/referralLedger.ts), which is not installed in this repo —
 * Next supplies it at build time. Map it to the local empty stub so
 * the REAL route module loads under the plain-Node test runner.
 * Everything else defers to the next resolver.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: new URL("./serverOnly.stub.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
