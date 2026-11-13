export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/printful" || specifier === "@/lib/printfulV2Orders") {
    return { url: new URL("./printRetryClaimFirst.provider.stub.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
