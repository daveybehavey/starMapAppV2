/**
 * Fail-closed QA checkout tagging helpers (plain JS for node --test and TS imports).
 *
 * Ops probes may request QA session metadata via headers. Markers are applied only when a
 * configured admin token validates. Ordinary buyer requests never send these headers and are
 * unchanged. Invalid QA requests must not silently create untagged live sessions.
 */

import { hasValidAdminToken, readAdminTokenFromHeaders } from "./adminAuth.mjs";

/**
 * @typedef {{ enabled: boolean, source: string | null, status: "absent" | "enabled" | "unauthorized" }} QaRequestContext
 */

/**
 * @param {string | null | undefined} value
 */
function normalizeValue(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * @param {string | null | undefined} value
 */
function normalizeLower(value) {
  return normalizeValue(value).toLowerCase();
}

/**
 * @param {string | null | undefined} value
 */
export function normalizeQaSource(value) {
  return normalizeLower(value)
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/**
 * @param {Headers | { get: (name: string) => string | null }} headers
 * @param {string | null | undefined} configuredAdminToken
 * @returns {QaRequestContext}
 */
export function resolveQaRequestContext(headers, configuredAdminToken) {
  const requestedQaRun = normalizeLower(headers.get("x-qa-run")) === "true";
  const qaSource = normalizeQaSource(headers.get("x-qa-source"));
  if (!requestedQaRun && !qaSource) {
    return { enabled: false, source: null, status: "absent" };
  }

  const candidate = readAdminTokenFromHeaders(headers);
  if (!hasValidAdminToken(candidate, configuredAdminToken)) {
    return { enabled: false, source: null, status: "unauthorized" };
  }

  return {
    enabled: true,
    source: qaSource || "qa_script",
    status: "enabled",
  };
}

/**
 * Apply canonical QA markers onto Stripe Checkout Session metadata.
 * No-op when QA context is not enabled so ordinary buyer metadata is unchanged.
 *
 * @param {Record<string, string>} metadata
 * @param {{ enabled?: boolean, source?: string | null } | null | undefined} qaContext
 */
export function applyQaCheckoutMetadata(metadata, qaContext) {
  if (!qaContext?.enabled) return metadata;
  metadata.qa_run = "true";
  const source = normalizeQaSource(qaContext.source);
  if (source) metadata.qa_source = source;
  return metadata;
}

/**
 * Idempotency segment so QA-tagged sessions never reuse ordinary buyer cached URLs.
 * Returns `"qa"` only when QA context is authenticated/enabled; otherwise `""`
 * so ordinary buyer keys keep the pre-QA-PR byte-for-byte format.
 *
 * @param {{ enabled?: boolean } | null | undefined} qaContext
 */
export function qaCheckoutIdempotencyTag(qaContext) {
  return qaContext?.enabled ? "qa" : "";
}

/**
 * Compose the trailing mapId segment of a checkout idempotency key.
 * Ordinary buyer: `${base}:${mapId}` (pre-PR contract).
 * QA enabled: `${base}:qa:${mapId}`.
 *
 * @param {string} baseWithoutMapId
 * @param {{ enabled?: boolean } | null | undefined} qaContext
 * @param {string} mapId
 */
export function appendCheckoutIdempotencyQaSegment(baseWithoutMapId, qaContext, mapId) {
  const tag = qaCheckoutIdempotencyTag(qaContext);
  if (tag) {
    return `${baseWithoutMapId}:${tag}:${mapId}`;
  }
  return `${baseWithoutMapId}:${mapId}`;
}
