import { timingSafeEqual } from "node:crypto";

/**
 * @param {string | null | undefined} candidate
 * @param {string | null | undefined} configured
 */
export function hasValidAdminToken(candidate, configured) {
  const given = candidate?.trim() || "";
  const expected = configured?.trim() || "";
  if (!given || !expected) return false;
  const givenBuf = Buffer.from(given);
  const expectedBuf = Buffer.from(expected);
  if (givenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(givenBuf, expectedBuf);
}

/**
 * @param {Headers | { get: (name: string) => string | null }} headers
 */
export function readAdminTokenFromHeaders(headers) {
  const printHeader = headers.get("x-print-admin-token")?.trim();
  if (printHeader) return printHeader;

  // Alias for manual ops tools and curl usage.
  const genericHeader = headers.get("x-admin-token")?.trim();
  if (genericHeader) return genericHeader;

  const auth = headers.get("authorization")?.trim() || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}
