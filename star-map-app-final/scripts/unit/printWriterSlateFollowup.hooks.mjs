/**
 * ESM resolve hooks for printWriterSlateFollowup.test.mjs: redirect
 * only the operator-alerts seam to a deterministic in-process stub so
 * the REAL writer helpers (printOrders.ts, printOrderFailurePersist.ts)
 * can be driven against the local KV fallback and the in-memory
 * authority client. Everything else defers to the ts alias loader.
 */
const stub = (name) => new URL(`./${name}`, import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/printOrderAlerts") {
    return { url: stub("printWriterSlateFollowup.alerts.stub.mjs"), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
