import { kv } from "./kv";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetIn: number;
};

/**
 * Simple sliding window rate limiter using KV storage.
 *
 * @param key - Unique identifier for the rate limit (e.g., "maps:192.168.1.1")
 * @param limit - Maximum requests allowed in the window
 * @param windowSeconds - Time window in seconds
 * @returns Object with allowed status, remaining requests, and reset time
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const windowKey = `ratelimit:${key}:${windowStart}`;
  const resetIn = windowStart + windowSeconds - now;

  try {
    // Prefer atomic increment when available to reduce race-window overruns.
    const current = await kv.incr(windowKey, 1, { ex: windowSeconds + 5 });
    if (current > limit) {
      return { allowed: false, remaining: 0, resetIn };
    }
    return { allowed: true, remaining: Math.max(0, limit - current), resetIn };
  } catch (error) {
    // On KV failure, allow the request but log the error
    console.error("Rate limit check failed:", error);
    return { allowed: true, remaining: limit, resetIn };
  }
}

/**
 * Extract client IP from request headers.
 * Handles common proxy headers (Cloudflare, Vercel, nginx).
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;

  // Cloudflare
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  // Vercel / general proxies
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  // Vercel specific
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;

  // Fallback: Generate a semi-unique identifier to avoid shared rate limit bucket
  // This isn't perfect but prevents all unknown users from sharing one bucket
  const userAgent = headers.get("user-agent") ?? "";
  const acceptLang = headers.get("accept-language") ?? "";
  const fingerprint = `${userAgent}:${acceptLang}`;

  // Simple hash to create a consistent identifier for the same browser
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `anon-${Math.abs(hash).toString(36)}`;
}

/** Live smoke / deploy QA — bypass per-IP buckets that false-fail after parallel probes. */
export function isInternalMonitoringRequest(request: Request): boolean {
  const ua = request.headers.get("user-agent")?.trim() ?? "";
  return ua.startsWith("StarMapCo-LiveSmoke/");
}

/**
 * Generate rate limit response headers.
 */
export function getRateLimitHeaders(
  remaining: number,
  limit: number,
  resetIn: number
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(resetIn),
  };
}

/**
 * Create a 429 Too Many Requests response.
 */
export function rateLimitResponse(resetIn: number): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(resetIn),
      },
    }
  );
}
