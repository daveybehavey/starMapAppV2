#!/usr/bin/env node
/**
 * Checkout-only live print conversion probe.
 *
 * Creates unpaid Stripe Checkout Sessions for framed (digital add-on) and unframed
 * print variants, tags them with canonical QA metadata, validates the hosted Stripe
 * URL shape, then stops. Never enters payment details, creates coupons/promos,
 * charges, refunds, or submits fulfillment.
 *
 * Usage:
 *   node scripts/live-print-conversion-qa.mjs [--checkout-only] [--print-variant poster_framed|poster_unframed|both]
 *   node scripts/live-print-conversion-qa.mjs --site https://starmapco.com
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isQaStripeSession } from "../src/lib/commerceAnalyticsQa.mjs";
import {
  assertQaCheckoutDispatchAllowed,
} from "./qa-checkout-headers.mjs";
import { loadQaPrintAssetDataUrl, uploadQaPrintAsset } from "./qa-print-asset.mjs";

const DEFAULT_SITE = "https://starmapco.com";
/**
 * Canonical production origin from repository config (`wrangler.toml` NEXT_PUBLIC_SITE_URL).
 * Fail-closed allowlist is exactly this origin — no broad host inventing.
 */
export const CANONICAL_PRODUCTION_SITE_ORIGIN = "https://starmapco.com";
const SUPPORTED_VARIANTS = Object.freeze(["poster_framed", "poster_unframed"]);
/** Canonical marker recognized by isQaStripeSession (live_print_conversion* prefix). */
const CANONICAL_QA_SOURCE = "live_print_conversion_checkout_only";
const CHECKOUT_SESSION_ID_PATH_RE = /^\/c\/pay\/(cs_(?:live|test)_[A-Za-z0-9]+)$/;

/**
 * Mirror of src/lib/stripeCheckoutNavigation.isValidStripeCheckoutUrl (plain JS for node --test).
 * @param {string} url
 */
export function isValidStripeCheckoutUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "checkout.stripe.com" &&
      parsed.pathname.startsWith("/c/pay/") &&
      parsed.hash.length > 1
    );
  } catch {
    return false;
  }
}

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
 * @param {Response} response
 */
export function assertNoRedirectEscape(response) {
  if (response.status >= 300 && response.status < 400) {
    throw new Error("BLOCKER: refusing redirect on secret-bearing checkout request (fail-closed).");
  }
  return true;
}

const SENSITIVE_OUTPUT_PATTERNS = Object.freeze([
  /\bcs_(test|live)_[A-Za-z0-9]+/i,
  /\bpi_[A-Za-z0-9]+/i,
  /\bpm_[A-Za-z0-9]+/i,
  /checkout\.stripe\.com/i,
  /https?:\/\/\S+/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /"metadata"\s*:/,
  /"customer_details"\s*:/,
  /"shipping_details"\s*:/,
  /Bearer\s+[A-Za-z0-9._\-]+/i,
  /sk_(live|test)_[A-Za-z0-9]+/i,
  /PRINT_ADMIN_TOKEN\s*=/i,
]);

/** Built without embedding callable capability identifiers as contiguous source tokens. */
const FORBIDDEN_CAPABILITY_NEEDLES = Object.freeze([
  ["coupons", "create"].join("."),
  ["promotionCodes", "create"].join("."),
  ["payment_intents", "create"].join("."),
  ["refunds", "create"].join("."),
  ["charges", "create"].join("."),
  ["waitFor", "Paid", "Verification"].join(""),
  ["submit", "Fulfillment"].join(""),
  ["chromium", "launch"].join("."),
  ["page", "fill"].join("."),
  ["card", "Number"].join(""),
]);

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const args = {
    site: DEFAULT_SITE,
    checkoutOnly: true,
    variants: /** @type {string[]} */ ([...SUPPORTED_VARIANTS]),
    shippingCountry: "US",
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--site" && next) {
      args.site = assertTrustedLiveProbeSite(String(next));
      i += 1;
      continue;
    }
    if (token === "--print-variant" && next) {
      const raw = String(next).trim().toLowerCase();
      if (raw === "both") {
        args.variants = [...SUPPORTED_VARIANTS];
      } else if (SUPPORTED_VARIANTS.includes(raw)) {
        args.variants = [raw];
      } else {
        throw new Error(`Unsupported --print-variant ${raw}. Use poster_framed, poster_unframed, or both.`);
      }
      i += 1;
      continue;
    }
    if (token === "--shipping-country" && next) {
      args.shippingCountry = String(next).trim().toUpperCase().slice(0, 2);
      i += 1;
      continue;
    }
    if (token === "--checkout-only") {
      args.checkoutOnly = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
    }
  }
  return args;
}

export function usage() {
  return `Usage:
  node scripts/live-print-conversion-qa.mjs [--checkout-only] [options]

Options:
  --site <url>                 Default ${DEFAULT_SITE}
  --print-variant <id>         poster_framed | poster_unframed | both (default both)
  --shipping-country <CC>      ISO country (default US)
  --checkout-only              Required mode: stop after Stripe hosted URL validation (default)

Notes:
  --site must be exactly ${CANONICAL_PRODUCTION_SITE_ORIGIN} (wrangler NEXT_PUBLIC_SITE_URL).
  Requires PRINT_ADMIN_TOKEN so /api/checkout can apply qa_run + qa_source markers.
  Admin token is never attached until the trusted-origin check passes.
  Requires STRIPE_SECRET_KEY for read-only retrieval that independently verifies
  exact persisted markers on the unpaid Checkout Session before success.
  Never creates coupons, promotion codes, payments, refunds, or fulfillment.
`;
}

/**
 * Fail closed before map/asset/session creation unless read-only Stripe retrieval
 * can independently verify canonical QA metadata after checkout.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function assertStripeQaVerificationCapability(env = process.env) {
  const stripeSecret = typeof env.STRIPE_SECRET_KEY === "string" ? env.STRIPE_SECRET_KEY.trim() : "";
  if (!stripeSecret) {
    throw new Error(
      "BLOCKER: STRIPE_SECRET_KEY is required for read-only QA metadata verification before reporting success (fail-closed).",
    );
  }
  return stripeSecret;
}

/**
 * @param {string} printVariant
 */
export function buildPrintCheckoutBody(printVariant) {
  const includeDigitalAddOn = printVariant === "poster_framed";
  return {
    orderType: "print",
    plan: "single",
    printVariant,
    includeDigitalAddOn,
    includeCardAddOn: false,
    shippingCountry: "US",
  };
}

/**
 * Build the outbound checkout request that MUST include canonical QA markers.
 * Throws before any network dispatch when markers cannot be guaranteed.
 * Trusted-origin check runs before PRINT_ADMIN_TOKEN is read or attached.
 *
 * @param {{ site: string, printVariant: string, mapId: string, printAssetId: string, shippingCountry?: string }} input
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function buildQaTaggedCheckoutRequest(input, env = process.env) {
  const trustedSite = assertTrustedLiveProbeSite(input.site);
  const headers = assertQaCheckoutDispatchAllowed(CANONICAL_QA_SOURCE, env);
  const body = {
    ...buildPrintCheckoutBody(input.printVariant),
    mapId: input.mapId,
    printAssetId: input.printAssetId,
    shippingCountry: input.shippingCountry || "US",
  };
  // Negative control: refuse to dispatch if body somehow carries payment/promo side channels.
  if ("promoCode" in body || "couponId" in body || "promotionCodeId" in body) {
    throw new Error("BLOCKER: checkout-only probe must not send promo/coupon fields.");
  }
  return {
    url: `${trustedSite}/api/checkout`,
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
    redirect: /** @type {RequestRedirect} */ ("manual"),
  };
}

/**
 * Require byte-for-byte exact persisted Stripe metadata (no trim/case/truthy aliases).
 * @param {Record<string, string | undefined> | null | undefined} metadata
 * @param {string} [expectedSource]
 */
export function assertCanonicalQaMetadata(metadata, expectedSource = CANONICAL_QA_SOURCE) {
  const qaRun = metadata?.qa_run;
  const qaSource = metadata?.qa_source;
  if (qaRun !== "true") {
    throw new Error('BLOCKER: checkout session missing exact qa_run="true".');
  }
  if (qaSource !== expectedSource) {
    throw new Error(`BLOCKER: checkout session missing exact qa_source=${expectedSource}.`);
  }
  if (!isQaStripeSession({ metadata: { qa_run: "true", qa_source: expectedSource } })) {
    throw new Error("BLOCKER: isQaStripeSession does not recognize canonical QA markers.");
  }
  return true;
}

/**
 * Validate hosted Stripe URL without echoing it.
 * Accepts only the repository's strict HTTPS / exact-host / /c/pay/ / nonempty-fragment contract.
 * @param {unknown} url
 */
export function assertHostedStripeCheckoutUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("Checkout response missing hosted Stripe URL.");
  }
  if (!isValidStripeCheckoutUrl(url.trim())) {
    throw new Error("Checkout response URL is not a Stripe-hosted checkout handoff.");
  }
  return true;
}

/**
 * @param {unknown} text
 */
export function containsSensitiveOperatorText(text) {
  return SENSITIVE_OUTPUT_PATTERNS.some((pattern) => pattern.test(String(text ?? "")));
}

/**
 * @param {unknown} text
 */
export function assertSafeOutput(text) {
  if (containsSensitiveOperatorText(text)) {
    throw new Error("Refusing to print sensitive or identifying live-print-conversion output");
  }
}

/**
 * @param {{ write?: Function } | null | undefined} stderr
 * @param {string} message
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function writeOperatorError(stderr, message, env = process.env) {
  let candidate = String(message ?? "").trim();
  const token = typeof env.PRINT_ADMIN_TOKEN === "string" ? env.PRINT_ADMIN_TOKEN.trim() : "";
  if (token && candidate.includes(token)) {
    candidate = "Live print conversion QA failed (details redacted).";
  }
  const safe =
    candidate && !containsSensitiveOperatorText(candidate)
      ? candidate
      : "Live print conversion QA failed (details redacted).";
  const stream = stderr && typeof stderr.write === "function" ? stderr : process.stderr;
  stream.write(`${safe}\n`);
  return safe;
}

/**
 * @param {{ checks?: Array<{ name: string, ok: boolean }>, passed?: number, failed?: number, variants?: string[] }} summary
 */
export function formatAggregateReport(summary) {
  const passed = Number(summary.passed ?? 0);
  const failed = Number(summary.failed ?? 0);
  const variants = Array.isArray(summary.variants) ? summary.variants.join(",") : "none";
  const lines = [
    "live_print_conversion_qa",
    `mode=checkout_only`,
    `variants=${variants}`,
    `passed=${passed}`,
    `failed=${failed}`,
    `status=${failed === 0 ? "passed" : "failed"}`,
  ];
  if (Array.isArray(summary.checks)) {
    for (const check of summary.checks) {
      lines.push(`check=${check.name}:${check.ok ? "pass" : "fail"}`);
    }
  }
  const output = `${lines.join("\n")}\n`;
  assertSafeOutput(output);
  return output;
}

/**
 * Negative-control helper: empty / no-op stubs must fail.
 * @param {string} [scriptPath]
 */
export function assertScriptIsNotNoOp(scriptPath = fileURLToPath(import.meta.url)) {
  const absolute = path.resolve(scriptPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Live print conversion QA script missing: ${absolute}`);
  }
  const bytes = fs.statSync(absolute).size;
  if (bytes <= 0) {
    throw new Error(`Live print conversion QA script is empty (0 bytes): ${absolute}`);
  }
  const source = fs.readFileSync(absolute, "utf8");
  if (!source.includes(CANONICAL_QA_SOURCE)) {
    throw new Error("Live print conversion QA script missing canonical qa_source marker.");
  }
  if (!source.includes("assertQaCheckoutDispatchAllowed") && !source.includes("buildQaTaggedCheckoutRequest")) {
    throw new Error("Live print conversion QA script missing fail-closed QA dispatch guard.");
  }
  if (!source.includes("assertStripeQaVerificationCapability") || !source.includes("verifyCreatedSessionQaMetadata")) {
    throw new Error("Live print conversion QA script missing mandatory Stripe QA metadata verification.");
  }
  if (!source.includes("assertTrustedLiveProbeSite") || !source.includes("extractCheckoutSessionIdFromPayPath")) {
    throw new Error("Live print conversion QA script missing trusted-origin or path-bound session guards.");
  }
  // Ignore this guard's own needle table when scanning for forbidden capabilities.
  const scanSource = source.replace(/FORBIDDEN_CAPABILITY_NEEDLES[\s\S]*?\];/, "FORBIDDEN_CAPABILITY_NEEDLES = [];");
  for (const needle of FORBIDDEN_CAPABILITY_NEEDLES) {
    if (scanSource.includes(needle)) {
      throw new Error(`Live print conversion QA script must not include capability ${needle}`);
    }
  }
  return true;
}

/**
 * Static package-script drift guard.
 * @param {string} [packageJsonPath]
 */
export function assertPackageScriptWired(packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json")) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const script = pkg?.scripts?.["qa:live-print-conversion"];
  if (script !== "node scripts/live-print-conversion-qa.mjs") {
    throw new Error("package.json qa:live-print-conversion drifted from scripts/live-print-conversion-qa.mjs");
  }
  assertScriptIsNotNoOp(path.resolve(path.dirname(packageJsonPath), "scripts/live-print-conversion-qa.mjs"));
  return true;
}

/**
 * Negative control: constructing a live checkout without QA metadata must fail.
 * @param {{ site: string, printVariant: string, mapId: string, printAssetId: string }} input
 */
export function assertUntaggedLiveSessionDispatchRejected(input) {
  let threw = false;
  try {
    buildQaTaggedCheckoutRequest(input, { PRINT_ADMIN_TOKEN: "" });
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error("Negative control failed: untagged live checkout dispatch was allowed.");
  }
  return true;
}

function buildSyntheticMapRecipe() {
  return {
    version: 1,
    seed: "qa-live-print-conversion-checkout-only",
    datetimeISO: "2024-06-01T20:00:00.000Z",
    location: {
      name: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: "Europe/Paris",
    },
    selectedStyle: "navyGold",
    aspectRatio: "square",
    shape: "rectangle",
    textBoxes: [
      {
        id: "title",
        label: "Title",
        text: "QA Print Map",
        fontFamily: "cinzel",
        color: "#d7b56c",
        size: 40,
        align: "center",
      },
    ],
    renderOptions: {
      visualMode: "enhanced",
      constellationLines: "thin",
    },
  };
}

/**
 * Extract Checkout Session ID only from the canonical `/c/pay/<session-id>` pathname segment.
 * Never scans fragment, query, or unrelated URL components.
 *
 * @param {unknown} checkoutUrl
 * @returns {string}
 */
export function extractCheckoutSessionIdFromPayPath(checkoutUrl) {
  assertHostedStripeCheckoutUrl(checkoutUrl);
  const parsed = new URL(String(checkoutUrl).trim());
  const match = parsed.pathname.match(CHECKOUT_SESSION_ID_PATH_RE);
  if (!match) {
    throw new Error("BLOCKER: Checkout Session ID missing from canonical /c/pay/ pathname segment.");
  }
  return match[1];
}

/**
 * Independently retrieve the created Checkout Session and require canonical QA metadata.
 * Never prints identifiers.
 *
 * @param {string} checkoutUrl
 * @param {string} stripeSecret
 */
export async function verifyCreatedSessionQaMetadata(checkoutUrl, stripeSecret) {
  const sessionId = extractCheckoutSessionIdFromPayPath(checkoutUrl);
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  assertCanonicalQaMetadata(session.metadata ?? {});
  if (session.payment_status && session.payment_status !== "unpaid") {
    throw new Error("BLOCKER: checkout-only probe must leave sessions unpaid.");
  }
  return true;
}

/**
 * @param {string} site
 * @param {string} printVariant
 * @param {string} shippingCountry
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export async function runVariantCheckoutOnly(site, printVariant, shippingCountry, env = process.env) {
  // Fail closed before any map/asset/session creation or admin-token attachment.
  const trustedSite = assertTrustedLiveProbeSite(site);
  assertQaCheckoutDispatchAllowed(CANONICAL_QA_SOURCE, env);
  const stripeSecret = assertStripeQaVerificationCapability(env);

  const mapRes = await fetch(`${trustedSite}/api/maps`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildSyntheticMapRecipe()),
    cache: "no-store",
    redirect: "manual",
  });
  assertNoRedirectEscape(mapRes);
  const mapJson = await mapRes.json().catch(() => ({}));
  if (!mapRes.ok || typeof mapJson?.id !== "string") {
    throw new Error(`Map create failed (status=${mapRes.status}).`);
  }

  const dataUrl = loadQaPrintAssetDataUrl("proof");
  const assetRes = await uploadQaPrintAsset({ site: trustedSite, mapId: mapJson.id, dataUrl, source: "editor" });
  if (assetRes.status !== 200 || typeof assetRes.json?.assetId !== "string") {
    throw new Error(`Print asset upload failed (status=${assetRes.status}).`);
  }

  const request = buildQaTaggedCheckoutRequest(
    {
      site: trustedSite,
      printVariant,
      mapId: mapJson.id,
      printAssetId: assetRes.json.assetId,
      shippingCountry,
    },
    env,
  );

  const checkoutRes = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
    cache: "no-store",
    redirect: "manual",
  });
  assertNoRedirectEscape(checkoutRes);
  const checkoutJson = await checkoutRes.json().catch(() => ({}));
  if (!checkoutRes.ok) {
    const code = typeof checkoutJson?.code === "string" ? checkoutJson.code : "checkout_failed";
    throw new Error(`Print checkout API failed (status=${checkoutRes.status}, code=${code}).`);
  }
  assertHostedStripeCheckoutUrl(checkoutJson?.url);

  // Mandatory independent verification — never report success from URL presence alone.
  await verifyCreatedSessionQaMetadata(String(checkoutJson.url), stripeSecret);

  return {
    name: `variant_${printVariant}`,
    ok: true,
  };
}

/**
 * @param {string[]} [argv]
 * @param {{ stdout?: { write: Function }, stderr?: { write: Function }, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} [io]
 */
export async function main(argv = process.argv.slice(2), io = {}) {
  assertScriptIsNotNoOp();
  assertPackageScriptWired();

  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;

  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    writeOperatorError(stderr, error instanceof Error ? error.message : String(error));
    return 1;
  }

  if (args.help) {
    const text = usage();
    assertSafeOutput(text);
    stdout.write(`${text}\n`);
    return 0;
  }

  if (!args.checkoutOnly) {
    writeOperatorError(stderr, "Only --checkout-only mode is supported by this restored probe.", env);
    return 1;
  }

  try {
    args.site = assertTrustedLiveProbeSite(args.site);
  } catch (error) {
    writeOperatorError(stderr, error instanceof Error ? error.message : String(error), env);
    return 1;
  }

  assertUntaggedLiveSessionDispatchRejected({
    site: args.site,
    printVariant: "poster_framed",
    mapId: "00000000-0000-4000-8000-000000000099",
    printAssetId: "00000000-0000-4000-8000-000000000098",
  });

  /** @type {Array<{ name: string, ok: boolean }>} */
  const checks = [];

  for (const variant of args.variants) {
    try {
      const result = await runVariantCheckoutOnly(args.site, variant, args.shippingCountry, env);
      checks.push(result);
    } catch (error) {
      writeOperatorError(stderr, error instanceof Error ? error.message : String(error), env);
      checks.push({ name: `variant_${variant}`, ok: false });
    }
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok).length;
  const report = formatAggregateReport({
    checks,
    passed,
    failed,
    variants: args.variants,
  });
  stdout.write(report);
  return failed === 0 ? 0 : 1;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      writeOperatorError(process.stderr, error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
