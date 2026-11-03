/**
 * ESM resolve hooks for printWebhookResolveRace.test.mjs: redirect
 * the webhook route's external-service seams to deterministic
 * in-process stubs so the REAL route module (and the REAL resolve
 * route, KV, and authority client) can be driven end to end under
 * the plain-Node test runner. Only the exact specifiers below are
 * redirected, and only in this test process; everything else defers
 * to the next resolver (the ts alias loader).
 */
const stub = (name) => new URL(`./${name}`, import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return { url: stub("printWebhookResolveRace.nextServer.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "stripe") {
    return { url: stub("printWebhookResolveRace.stripe.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "server-only") {
    // The webhook's dependency graph imports the `server-only`
    // marker package (via src/lib/referralLedger.ts), which Next
    // supplies at build time; map it to the local empty stub.
    return { url: stub("serverOnly.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printful") {
    return { url: stub("printWebhookResolveRace.printful.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printfulV2Orders") {
    return { url: stub("printWebhookResolveRace.printfulV2.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printFulfillmentPostSubmit") {
    return { url: stub("printWebhookResolveRace.postSubmit.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printOrderConfirmation") {
    return { url: stub("printWebhookResolveRace.confirmation.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printAssetFulfillment") {
    return { url: stub("printWebhookResolveRace.asset.stub.mjs"), shortCircuit: true };
  }
  if (specifier === "@/lib/printOrderAlerts") {
    return { url: stub("printWebhookResolveRace.alerts.stub.mjs"), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
