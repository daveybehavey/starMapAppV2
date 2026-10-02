import { timingSafeEqual } from "node:crypto";

/** Mirror of src/lib/adminAuth.hasValidAdminToken for node:test (no TS loader). */
function hasValidAdminToken(candidate, configured) {
  const given = candidate?.trim?.() || "";
  const expected = configured?.trim?.() || "";
  if (!given || !expected) return false;
  const givenBuf = Buffer.from(given);
  const expectedBuf = Buffer.from(expected);
  if (givenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(givenBuf, expectedBuf);
}

/** Mirror of src/lib/funnelDashboardAccess.isFunnelProductionRuntime */
export function isFunnelProductionRuntime(env = {}) {
  const vercelEnv = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercelEnv) return vercelEnv === "production";
  return (env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

export function getConfiguredFunnelDashboardToken(env = {}) {
  return (env.FUNNEL_DASHBOARD_TOKEN ?? "").trim();
}

/** Mirror of src/lib/funnelDashboardAccess.hasFunnelDashboardAccess */
export function hasFunnelDashboardAccess(candidateToken, env = {}) {
  const configured = getConfiguredFunnelDashboardToken(env);
  if (!configured) {
    return !isFunnelProductionRuntime(env);
  }
  return hasValidAdminToken(candidateToken, configured);
}
