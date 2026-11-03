/**
 * ESM resolve hooks for printOrderReviewSweepRuntime.test.mjs: map
 * the runtime's provider/KV/authority imports to the local stubs so
 * the REAL src/lib/printOrderReviewSweepRuntime.ts loads under the
 * plain-Node test runner. Everything else defers to the next
 * resolver (tsAliasLoader).
 */
const STUBS = new Map([
  ["@/lib/printOrders", "./printOrderReviewSweepRuntime.orders.stub.mjs"],
  ["@/lib/printOrderAlerts", "./printOrderReviewSweepRuntime.alerts.stub.mjs"],
  ["@/lib/printOrderAuthority", "./printOrderReviewSweepRuntime.authority.stub.mjs"],
  ["@/lib/printFulfillmentPostSubmit", "./printOrderReviewSweepRuntime.postSubmit.stub.mjs"],
]);

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS.get(specifier);
  if (stub) {
    return { url: new URL(stub, import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
