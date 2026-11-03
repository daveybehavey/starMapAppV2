/**
 * Key-builder + retention-plan model of src/lib/printOrders.ts for the
 * review-sweep runtime tests: printOrderKey is copied verbatim; the
 * retention plan is reduced to its persist branch (records in these
 * tests are freshly created, so the creation-anchored window is open)
 * plus the fail-closed delete for a malformed createdAt — the TTL
 * arithmetic itself is pinned by printOrders' own suites.
 */
export const printOrderKey = (sessionId) => `print:order:${sessionId}`;

export function resolvePrintOrderKvWrite(createdAt) {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    return { action: "delete" };
  }
  return { action: "persist", ttlSeconds: 3600 };
}
