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
