/**
 * ESM resolve hooks for referralVisitRace.test.mjs: redirect the
 * visit route's framework seams to deterministic in-process stubs
 * so the REAL route module (and the REAL KV) can be driven end to
 * end under the plain-Node test runner. Only the exact specifiers
 * below are redirected, and only in this test process; everything
 * else defers to the next resolver (the ts alias loader).
 */
const stub = (name) => new URL(`./${name}`, import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return { url: stub("referralVisitRace.nextServer.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "server-only") {
    // The route's dependency graph imports the `server-only`
    // marker package (via src/lib/referralLedger.ts), which Next
    // supplies at build time; map it to the local empty stub.
    return { url: stub("serverOnly.stub.mjs"), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
