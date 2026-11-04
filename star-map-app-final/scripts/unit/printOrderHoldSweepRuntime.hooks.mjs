/**
 * ESM resolve hooks for printOrderHoldSweepRuntime.test.mjs: map the
 * runtime's provider/KV/authority imports to the local stubs so the
 * REAL src/lib/printOrderHoldSweepRuntime.ts loads under the
 * plain-Node test runner. The sweep engine itself
 * (src/lib/printOrderHoldSweep.ts, home of
 * applyHoldSweepStampsToCurrent) loads for real — only its type-only
 * imports touch the stubbed modules, and those are erased. Everything
 * else defers to the next resolver (tsAliasLoader).
 */
const STUBS = new Map([
  ["@/lib/printOrders", "./printOrderHoldSweepRuntime.orders.stub.mjs"],
  ["@/lib/printOrderAlerts", "./printOrderHoldSweepRuntime.alerts.stub.mjs"],
  ["@/lib/printOrderAuthority", "./printOrderHoldSweepRuntime.authority.stub.mjs"],
]);

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS.get(specifier);
  if (stub) {
    return { url: new URL(stub, import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
