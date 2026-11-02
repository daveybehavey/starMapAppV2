/**
 * Key-builder model of src/lib/entitlementsStore.ts for the S96-1 F5
 * dispatch tests — the builders used by hdDownloadEmailDispatch.ts,
 * copied verbatim; withSettlementMetadata is the identity merge (the
 * stub KV holds no settlement-metadata sidecar).
 */
export const SETTLEMENT_SCHEMA_VERSION = 1;

export const ENTITLEMENT_KV = {
  stripeSession: (sessionId) => `stripe:session:${sessionId}`,
  accessEmailDedupe: (sessionId) => `stripe:access_link:email:${sessionId}`,
  hdArchiveEmailDedupe: (sessionId) => `stripe:hd_archive:email:${sessionId}`,
  hdInitialEmailResult: (sessionId) => `stripe:hd-email:initial-result:v1:${sessionId}`,
  hdArchiveEmailResult: (sessionId) => `stripe:hd-email:archive-result:v1:${sessionId}`,
};

export async function withSettlementMetadata(_sessionId, record) {
  return record;
}
