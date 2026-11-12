export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") return {
    url: "data:text/javascript," + encodeURIComponent("export async function cookies() { return globalThis.metaCheckoutTestCookies; }"),
    shortCircuit: true,
  };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  // Any accidental Stripe dependency is observable in A6, with no live access.
  if (specifier === "stripe") return { url: new URL("./metaCheckoutStripe.stub.mjs", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
