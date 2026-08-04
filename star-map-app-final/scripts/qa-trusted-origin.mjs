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
 * Raw spelling is checked before URL normalization so inputs that `new URL()` would
 * erase (dot-segments, `%2e%2e`, empty `?` / `#`, etc.) are rejected.
 *
 * @param {unknown} site
 * @returns {string} normalized origin with no trailing slash (https://starmapco.com)
 */
export function assertTrustedLiveProbeSite(site) {
  if (typeof site !== "string") {
    throw new Error("BLOCKER: --site must be the canonical HTTPS production origin.");
  }
  const raw = site.trim();
  if (!raw) {
    throw new Error("BLOCKER: --site must be the canonical HTTPS production origin.");
  }
  // Exact canonical spellings only — optional trailing slash is the sole allowed variant.
  if (raw !== CANONICAL_PRODUCTION_SITE_ORIGIN && raw !== `${CANONICAL_PRODUCTION_SITE_ORIGIN}/`) {
    throw new Error("BLOCKER: --site must be the exact canonical HTTPS production origin.");
  }

  let parsed;
  try {
    parsed = new URL(raw);
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
  if (parsed.search || raw.includes("?")) {
    throw new Error("BLOCKER: --site must not include a query string.");
  }
  if (parsed.hash || raw.includes("#")) {
    throw new Error("BLOCKER: --site must not include a fragment.");
  }
  const origin = `https://${parsed.hostname}`;
  if (origin !== CANONICAL_PRODUCTION_SITE_ORIGIN) {
    throw new Error("BLOCKER: --site is not the canonical trusted production origin.");
  }
  return CANONICAL_PRODUCTION_SITE_ORIGIN;
}

/**
 * Resolve the trusted live-probe site before any secret-bearing dotenv / token load.
 * Hostile or malformed SITE_URL fails closed without invoking `loadSecrets`.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   readSiteUrlFromFiles?: () => string | undefined,
 *   loadSecrets?: () => void,
 * }} [options]
 * @returns {string}
 */
export function resolveTrustedSiteUrlBeforeSecrets(options = {}) {
  const env = options.env ?? {};
  const readSiteUrlFromFiles =
    typeof options.readSiteUrlFromFiles === "function" ? options.readSiteUrlFromFiles : () => undefined;
  const loadSecrets = typeof options.loadSecrets === "function" ? options.loadSecrets : () => {};

  const fromEnv = typeof env.SITE_URL === "string" ? env.SITE_URL.trim() : "";
  // Only consult dotenv files when SITE_URL is not already present in the process env.
  const fromFiles = fromEnv ? undefined : readSiteUrlFromFiles();
  const candidate =
    fromEnv || (typeof fromFiles === "string" ? fromFiles.trim() : "") || CANONICAL_PRODUCTION_SITE_ORIGIN;
  const site = assertTrustedLiveProbeSite(candidate);
  loadSecrets();
  return site;
}

/**
 * Reject redirect responses so admin-token / secret-key requests cannot escape.
 * Callers must use `redirect: "manual"` on those requests.
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

/**
 * Fetch wrapper that forces `redirect: "manual"` and fails closed on every 3xx
 * before credentials (e.g. STRIPE_SECRET_KEY / Authorization) can be forwarded.
 *
 * @param {typeof fetch} [baseFetch]
 * @returns {typeof fetch}
 */
export function createSecretBearingFetch(baseFetch = globalThis.fetch) {
  return async (input, init = {}) => {
    let requestUrl = "";
    /** @type {RequestInfo | URL} */
    let nextInput = input;
    /** @type {RequestInit} */
    let nextInit = { ...(init || {}), redirect: "manual" };

    if (typeof input === "string") {
      requestUrl = input;
    } else if (typeof URL !== "undefined" && input instanceof URL) {
      requestUrl = input.toString();
    } else if (
      input &&
      typeof input === "object" &&
      typeof (/** @type {{ url?: string }} */ (input).url) === "string"
    ) {
      requestUrl = /** @type {{ url: string }} */ (input).url;
      if (typeof Request !== "undefined" && input instanceof Request) {
        nextInput = new Request(input, { redirect: "manual" });
        nextInit = { redirect: "manual" };
      }
    } else {
      requestUrl = String(input);
    }

    const response = await baseFetch(nextInput, nextInit);
    assertNoRedirectEscape(response, requestUrl);
    return response;
  };
}
