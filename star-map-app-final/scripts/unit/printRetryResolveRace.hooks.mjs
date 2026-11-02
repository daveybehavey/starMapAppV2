/**
 * ESM resolve hooks for printRetryResolveRace.test.mjs: redirect the
 * retry route's external-service seams to deterministic in-process
 * stubs so the REAL route module (and the REAL resolve route, KV, and
 * authority client) can be driven end to end under the plain-Node
 * test runner. Only the exact specifiers below are redirected, and
 * only in this test process; everything else defers to the next
 * resolver (the ts alias loader).
 */
const stub = (name) => new URL(`./${name}`, import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return { url: stub("printRetryResolveRace.nextServer.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "stripe") {
    return { url: stub("printRetryResolveRace.stripe.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printful") {
    return { url: stub("printRetryResolveRace.printful.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printFulfillmentPostSubmit") {
    return { url: stub("printRetryResolveRace.postSubmit.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printOrderConfirmation") {
    return { url: stub("printRetryResolveRace.confirmation.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printAssetFulfillment") {
    return { url: stub("printRetryResolveRace.asset.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printOrderAlerts") {
    return { url: stub("printRetryResolveRace.alerts.stub.mjs"), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
