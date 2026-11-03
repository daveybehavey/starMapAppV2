/**
 * ESM resolve hooks for hdDownloadEmailDispatch.test.mjs: map the
 * dispatch module's provider/KV imports to the local stubs so the REAL
 * src/lib/hdDownloadEmailDispatch.ts loads under the plain-Node test
 * runner. Everything else defers to the next resolver (tsAliasLoader).
 */
const STUBS = new Map([
  ["@/lib/kv", "./hdKv.stub.mjs"],
  ["@/lib/entitlementsStore", "./hdEntitlementsStore.stub.mjs"],
  ["@/lib/accountAccessLinks", "./hdAccess.stub.mjs"],
  ["@/lib/accountMagicLinkIssue", "./hdAccess.stub.mjs"],
  ["@/lib/accountAccessAlerts", "./hdAccess.stub.mjs"],
  ["@/lib/downloadArchiveStorage", "./hdAccess.stub.mjs"],
]);

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS.get(specifier);
  if (stub) {
    return { url: new URL(stub, import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
