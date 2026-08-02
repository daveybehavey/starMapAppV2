/**
 * Shared helpers for live checkout probes that must QA-tag Stripe Checkout Sessions.
 */

export const LIVE_PRINT_CONVERSION_QA_SOURCE = "live_print_conversion_checkout_only";
export const LIVE_MERCH_CHECKOUT_PROBE_QA_SOURCE = "live_merch_checkout_probe";
export const LIVE_C1_M1_CHECKOUT_PROOF_QA_SOURCE = "live_c1_m1_checkout_proof";

/**
 * @param {string} source
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {Record<string, string>}
 */
export function buildQaCheckoutHeaders(source, env = process.env) {
  const token = typeof env.PRINT_ADMIN_TOKEN === "string" ? env.PRINT_ADMIN_TOKEN.trim() : "";
  const normalizedSource = String(source ?? "")
    .trim()
    .toLowerCase();
  if (!token) {
    throw new Error(
      "BLOCKER: PRINT_ADMIN_TOKEN is required before creating QA-tagged checkout sessions (fail-closed).",
    );
  }
  if (!normalizedSource) {
    throw new Error("BLOCKER: qa_source is required before creating QA-tagged checkout sessions.");
  }
  return {
    "x-admin-token": token,
    "x-qa-run": "true",
    "x-qa-source": normalizedSource,
  };
}

/**
 * Fail before network dispatch when the probe cannot guarantee canonical QA markers.
 *
 * @param {string} source
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function assertQaCheckoutDispatchAllowed(source, env = process.env) {
  const headers = buildQaCheckoutHeaders(source, env);
  if (headers["x-qa-run"] !== "true") {
    throw new Error("BLOCKER: qa_run marker missing from outbound checkout headers.");
  }
  if (!headers["x-qa-source"]) {
    throw new Error("BLOCKER: qa_source marker missing from outbound checkout headers.");
  }
  return headers;
}
