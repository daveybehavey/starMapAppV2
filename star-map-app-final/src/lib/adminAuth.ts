import { timingSafeEqual } from "node:crypto";

export function hasValidAdminToken(candidate: string | null | undefined, configured: string | null | undefined) {
  const given = candidate?.trim() || "";
  const expected = configured?.trim() || "";
  if (!given || !expected) return false;
  const givenBuf = Buffer.from(given);
  const expectedBuf = Buffer.from(expected);
  if (givenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(givenBuf, expectedBuf);
}

export function readAdminTokenFromHeaders(headers: Headers) {
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
