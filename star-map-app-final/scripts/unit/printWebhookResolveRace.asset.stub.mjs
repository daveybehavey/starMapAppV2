/**
 * Print-asset TTL stub for printWebhookResolveRace.test.mjs: the
 * interleaving seam. Issue #550's window is exactly this await — the
 * webhook pass has persisted its pending record and suspends here
 * while an operator resolve lands. Tests install
 * `globalThis.__whTtlHook` to run the resolve inside the window;
 * without a hook the extension simply succeeds.
 */
export async function extendPrintAssetTtlForFulfillment(printAssetId) {
  const hook = globalThis.__whTtlHook;
  if (typeof hook === "function") {
    await hook(printAssetId);
  }
  return { extended: true };
}
