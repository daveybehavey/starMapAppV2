/**
 * Shared fail-closed trusted-origin helpers for live QA probes that attach
 * PRINT_ADMIN_TOKEN. Canonical production origin matches wrangler.toml
 * NEXT_PUBLIC_SITE_URL — no broad allowlist.
 *
 * These helpers must not read PRINT_ADMIN_TOKEN.
 */

/** Exact trusted production origin for secret-bearing live probe dispatch. */
export const CANONICAL_PRODUCTION_SITE_ORIGIN = "https://starmapco.com";

/**
 * Fail-closed trusted-origin policy for live probes that may dispatch PRINT_ADMIN_TOKEN.
 * Grounded in wrangler.toml NEXT_PUBLIC_SITE_URL / canonical production origin only.
 *
 * @param {unknown} site
 * @returns {string} normalized origin with no trailing slash (https://starmapco.com)
 */
export function assertTrustedLiveProbeSite(site) {
  if (typeof site !== "string" || !site.trim()) {
    throw new Error("BLOCKER: --site must be the canonical HTTPS production origin.");
  }
  let parsed;
  try {
    parsed = new URL(site.trim());
  } catch {
    throw new Error("BLOCKER: --site is not a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("BLOCKER: --site must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("BLOCKER: --site must not include credentials.");
  }
  if (parsed.hostname !== "starmapco.com") {
    throw new Error("BLOCKER: --site host is not the canonical trusted production origin.");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("BLOCKER: --site must not use a non-default port.");
  }
  if (parsed.pathname && parsed.pathname !== "/") {
    throw new Error("BLOCKER: --site must be origin-only (no path).");
  }
  if (parsed.search) {
    throw new Error("BLOCKER: --site must not include a query string.");
  }
  if (parsed.hash) {
    throw new Error("BLOCKER: --site must not include a fragment.");
  }
  const origin = `https://${parsed.hostname}`;
  if (origin !== CANONICAL_PRODUCTION_SITE_ORIGIN) {
    throw new Error("BLOCKER: --site is not the canonical trusted production origin.");
  }
  return origin;
}

/**
 * Reject redirect responses so admin-token requests cannot escape to an untrusted origin.
 * Callers must use `redirect: "manual"` on secret-bearing requests.
 *
 * @param {Response | { status: number, redirected?: boolean, url?: string }} response
 * @param {string} [requestUrl]
 */
export function assertNoRedirectEscape(response, requestUrl) {
  if (!response || typeof response.status !== "number") {
    throw new Error("BLOCKER: missing fetch response for redirect check.");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error("BLOCKER: refusing redirect on secret-bearing checkout request (fail-closed).");
  }
  if (typeof response.redirected === "boolean" && response.redirected) {
    throw new Error("BLOCKER: refusing redirected secret-bearing request (fail-closed).");
  }
  if (requestUrl && typeof response.url === "string" && response.url) {
    let expected;
    let actual;
    try {
      expected = new URL(requestUrl);
      actual = new URL(response.url);
    } catch {
      throw new Error("BLOCKER: invalid URL in secret-bearing redirect check.");
    }
    if (actual.origin !== expected.origin) {
      throw new Error("BLOCKER: refusing cross-origin response on secret-bearing request (fail-closed).");
    }
  }
  return true;
}
