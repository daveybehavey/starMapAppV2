import { hasValidAdminToken } from "@/lib/adminAuth";

export type FunnelDashboardAccessEnv = {
  NODE_ENV?: string | null;
  VERCEL_ENV?: string | null;
  FUNNEL_DASHBOARD_TOKEN?: string | null;
};

/**
 * Prefer VERCEL_ENV when present so Preview/Staging (NODE_ENV=production)
 * is not treated as the live production surface.
 */
export function isFunnelProductionRuntime(env: FunnelDashboardAccessEnv = process.env): boolean {
  const vercelEnv = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercelEnv) return vercelEnv === "production";
  return (env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

export function getConfiguredFunnelDashboardToken(
  env: FunnelDashboardAccessEnv = process.env,
): string {
  return (env.FUNNEL_DASHBOARD_TOKEN ?? "").trim();
}

/**
 * Production must never expose the funnel dashboard without a configured token.
 * Outside production, an unset token keeps local/dev open for convenience.
 * When a token is configured, the candidate must match (timing-safe).
 */
export function hasFunnelDashboardAccess(
  candidateToken: string | null | undefined,
  env: FunnelDashboardAccessEnv = process.env,
): boolean {
  const configured = getConfiguredFunnelDashboardToken(env);
  if (!configured) {
    return !isFunnelProductionRuntime(env);
  }
  return hasValidAdminToken(candidateToken, configured);
}
