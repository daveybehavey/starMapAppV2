#!/usr/bin/env node

/**
 * Offline product-level contribution report from a sanitized paid-session export.
 *
 * Local file input only. No network. Aggregate output only.
 * Estimates use repository configured Stripe fees, print COGS, and Printful shipping
 * matrices — not actual processor fees or Printful invoices.
 *
 * Usage:
 *   npm run qa:product-contribution -- --input <sanitized.json> [--format table|json]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isQaStripeSession } from "../src/lib/commerceAnalyticsQa.mjs";
import {
  DEFAULT_STRIPE_FIXED_CENTS,
  DEFAULT_STRIPE_PERCENT,
  estimateStripeFeeCents,
  getConfiguredPrintProductCostCents,
  getConfiguredShippingCostCents,
  getStripeFeeConfig,
  isSupportedDigitalPlan,
  isSupportedPrintVariant,
} from "./lib/commerceCostEstimates.mjs";

export const PRODUCT_CONTRIBUTION_CONTRACT = Object.freeze({
  schemaVersion: 1,
  npmScript: "qa:product-contribution",
  formats: Object.freeze(["table", "json"]),
  labels: Object.freeze({
    reportKind: "estimated_pre_fixed_cost_product_contribution",
    notAccountingProfit: true,
    notCashRemaining: true,
    feeSource: "configured_estimate",
    cogsSource: "configured_estimate",
    shippingCostSource: "configured_printful_shipping_matrix",
  }),
});

/** Allowed top-level document keys. */
const ALLOWED_DOCUMENT_KEYS = new Set(["schema_version", "records", "notes"]);

/** Allowed per-record fields (sanitized export contract). */
export const ALLOWED_RECORD_FIELDS = Object.freeze([
  "paid_at",
  "currency",
  "amount_total",
  "order_type",
  "plan",
  "print_variant",
  "include_digital",
  "include_card",
  "shipping_country",
  "shipping_charge_cents",
  "shipping_subsidy_cents",
  "discount_cents",
  "qa_run",
  "qa_ops_checkout",
  "qa_source",
]);

const ALLOWED_RECORD_FIELD_SET = new Set(ALLOWED_RECORD_FIELDS);

/**
 * Stripe checkout metadata aliases for canonical include_digital / include_card.
 * Recognized in snake/camel/Pascal forms via normalizeRecordFieldKey.
 */
export const CHECKOUT_ADDON_ALIAS_NORMALIZED = Object.freeze({
  include_digital: "print_include_digital",
  include_card: "print_include_card",
});

/**
 * Stripe checkout metadata aliases for canonical shipping fields.
 * Checkout writes `metadata.print_shipping_country` / `print_shipping_charge_cents` /
 * `print_shipping_subsidy_cents` on paid print sessions (see checkout route).
 */
export const CHECKOUT_SHIPPING_ALIAS_NORMALIZED = Object.freeze({
  shipping_country: "print_shipping_country",
  shipping_charge_cents: "print_shipping_charge_cents",
  shipping_subsidy_cents: "print_shipping_subsidy_cents",
});

/**
 * @param {string} key
 */
export function isCheckoutAddonAliasKey(key) {
  if (typeof key !== "string" || !key) return false;
  const normalized = normalizeRecordFieldKey(key);
  return (
    normalized === CHECKOUT_ADDON_ALIAS_NORMALIZED.include_digital ||
    normalized === CHECKOUT_ADDON_ALIAS_NORMALIZED.include_card
  );
}

/**
 * @param {string} key
 */
export function isCheckoutShippingAliasKey(key) {
  if (typeof key !== "string" || !key) return false;
  const normalized = normalizeRecordFieldKey(key);
  return (
    normalized === CHECKOUT_SHIPPING_ALIAS_NORMALIZED.shipping_country ||
    normalized === CHECKOUT_SHIPPING_ALIAS_NORMALIZED.shipping_charge_cents ||
    normalized === CHECKOUT_SHIPPING_ALIAS_NORMALIZED.shipping_subsidy_cents
  );
}

/**
 * Any documented Stripe checkout metadata alias that must not be stripped as unknown.
 * @param {string} key
 */
export function isCheckoutMetadataAliasKey(key) {
  return isCheckoutAddonAliasKey(key) || isCheckoutShippingAliasKey(key);
}

/**
 * Documented valid forms for include_digital / include_card and their checkout aliases.
 * Malformed values must fail closed — never coerce to false.
 */
export const STRICT_INCLUDE_BOOL_TRUE_STRINGS = Object.freeze(["1", "true", "yes"]);
export const STRICT_INCLUDE_BOOL_FALSE_STRINGS = Object.freeze(["0", "false", "no"]);

/**
 * Strict boolean parse for include flags only (not QA markers).
 * Accepts: boolean; integer 0|1; trimmed case-insensitive strings 1/true/yes/0/false/no.
 * Rejects: malformed strings (e.g. "tru"), other numbers, objects, arrays, null, etc.
 * Errors name the field only — never echo the input value.
 *
 * @param {unknown} value
 * @param {number} index
 * @param {string} fieldLabel
 */
export function parseStrictIncludeBool(value, index, fieldLabel) {
  const err = () => {
    throw new Error(`records[${index}]: invalid boolean value for ${fieldLabel}`);
  };

  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (Object.is(value, 1)) return true;
    if (Object.is(value, 0)) return false;
    err();
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (STRICT_INCLUDE_BOOL_TRUE_STRINGS.includes(normalized)) return true;
    if (STRICT_INCLUDE_BOOL_FALSE_STRINGS.includes(normalized)) return false;
    err();
  }

  err();
}

/**
 * Resolve a canonical boolean from the canonical key and/or its checkout alias.
 * Present values use strict include-bool parsing (malformed → schema error).
 * Conflicting present values fail closed (field names only — never echo values).
 * @param {Record<string, unknown>} raw
 * @param {number} index
 * @param {string} canonicalKey
 * @param {string} aliasNormalizedKey
 */
export function resolveCanonicalBoolWithAlias(raw, index, canonicalKey, aliasNormalizedKey) {
  /** @type {{ key: string; value: unknown }[]} */
  const present = [];
  for (const key of Object.keys(raw)) {
    if (key === canonicalKey || normalizeRecordFieldKey(key) === aliasNormalizedKey) {
      present.push({ key, value: raw[key] });
    }
  }
  if (present.length === 0) return false;

  const parsed = present.map((entry) => {
    const label =
      entry.key === canonicalKey || normalizeRecordFieldKey(entry.key) === canonicalKey
        ? canonicalKey
        : aliasNormalizedKey;
    return parseStrictIncludeBool(entry.value, index, label);
  });
  const first = parsed[0];
  if (parsed.some((value) => value !== first)) {
    throw new Error(`records[${index}]: conflicting values for ${canonicalKey} and ${aliasNormalizedKey}`);
  }
  return first;
}

/**
 * Normalize a shipping-country field value (ISO-2 after trim/upper).
 * Errors name the field only — never echo the input value.
 * @param {unknown} value
 * @param {number} index
 * @param {string} fieldLabel
 */
export function normalizeShippingCountryValue(value, index, fieldLabel) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim().toUpperCase();
    return normalized || null;
  }
  throw new Error(`records[${index}]: invalid value for ${fieldLabel}`);
}

/**
 * Resolve canonical shipping_country from the canonical key and/or checkout alias
 * `print_shipping_country` (snake/camel/Pascal). Matching values succeed; conflicts fail closed.
 * @param {Record<string, unknown>} raw
 * @param {number} index
 */
export function resolveCanonicalShippingCountryWithAlias(raw, index) {
  const canonicalKey = "shipping_country";
  const aliasNormalizedKey = CHECKOUT_SHIPPING_ALIAS_NORMALIZED.shipping_country;
  /** @type {{ key: string; value: unknown }[]} */
  const present = [];
  for (const key of Object.keys(raw)) {
    if (key === canonicalKey || normalizeRecordFieldKey(key) === aliasNormalizedKey) {
      present.push({ key, value: raw[key] });
    }
  }
  if (present.length === 0) return null;

  const parsed = present.map((entry) => {
    const label =
      entry.key === canonicalKey || normalizeRecordFieldKey(entry.key) === canonicalKey
        ? canonicalKey
        : aliasNormalizedKey;
    return normalizeShippingCountryValue(entry.value, index, label);
  });
  const first = parsed[0];
  if (parsed.some((value) => value !== first)) {
    throw new Error(`records[${index}]: conflicting values for ${canonicalKey} and ${aliasNormalizedKey}`);
  }
  return first;
}

/**
 * Resolve a non-negative integer cents field from the canonical key and/or checkout alias.
 * Reuses assertNonNegativeIntegerCents (no broadened accepted forms).
 * Conflicting present values fail closed (field names only — never echo values).
 * @param {Record<string, unknown>} raw
 * @param {number} index
 * @param {string} canonicalKey
 * @param {string} aliasNormalizedKey
 */
export function resolveCanonicalCentsWithAlias(raw, index, canonicalKey, aliasNormalizedKey) {
  /** @type {{ key: string; value: unknown }[]} */
  const present = [];
  for (const key of Object.keys(raw)) {
    if (key === canonicalKey || normalizeRecordFieldKey(key) === aliasNormalizedKey) {
      present.push({ key, value: raw[key] });
    }
  }
  if (present.length === 0) return null;

  const parsed = present.map((entry) => {
    const label =
      entry.key === canonicalKey || normalizeRecordFieldKey(entry.key) === canonicalKey
        ? canonicalKey
        : aliasNormalizedKey;
    return assertNonNegativeIntegerCents(entry.value, `records[${index}].${label}`);
  });
  const first = parsed[0];
  if (parsed.some((value) => value !== first)) {
    throw new Error(`records[${index}]: conflicting values for ${canonicalKey} and ${aliasNormalizedKey}`);
  }
  return first;
}

/**
 * Known sensitive / row-identifying keys. Presence fails closed.
 * (Do not list allowed QA markers here.)
 */
export const SENSITIVE_RECORD_FIELDS = Object.freeze([
  "id",
  "session_id",
  "sessionId",
  "checkout_session_id",
  "client_reference_id",
  "clientReferenceId",
  "customer",
  "customer_id",
  "customer_email",
  "customer_details",
  "email",
  "name",
  "first_name",
  "last_name",
  "full_name",
  "buyer_name",
  "buyerName",
  "phone",
  "address",
  "shipping_details",
  "shipping_address",
  "billing_address",
  "payment_intent",
  "payment_intent_id",
  "paymentIntentId",
  "payment_method",
  "payment_method_details",
  "charge_id",
  "chargeId",
  "order_id",
  "orderId",
  "map_id",
  "mapId",
  "print_asset_id",
  "printAssetId",
  "print_card_asset_id",
  "printCardAssetId",
  "card_print_asset_id",
  "cardPrintAssetId",
  "metadata",
  "raw",
  "stripe",
  "printful",
  "token",
  "secret",
  "authorization",
  "password",
]);

/** Known merch checkout metadata keys (unsupported by this contribution report). */
export const UNSUPPORTED_MERCH_RECORD_FIELDS = Object.freeze([
  "print_merch_family",
  "printMerchFamily",
  "print_merch_catalog_variant_id",
  "printMerchCatalogVariantId",
  "print_merch_size",
  "printMerchSize",
  "print_merch_color",
  "printMerchColor",
]);

/**
 * Normalize camelCase / PascalCase / mixed keys to snake_case lower for matching.
 * @param {string} key
 */
export function normalizeRecordFieldKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

const SENSITIVE_FIELD_SET = new Set(
  SENSITIVE_RECORD_FIELDS.flatMap((k) => [k.toLowerCase(), normalizeRecordFieldKey(k)])
);

const UNSUPPORTED_MERCH_FIELD_SET = new Set(
  UNSUPPORTED_MERCH_RECORD_FIELDS.flatMap((k) => [k.toLowerCase(), normalizeRecordFieldKey(k)])
);

/**
 * Fail-closed sensitive / row-identifying field detection (before unknown stripping).
 * Covers snake_case, camelCase, and PascalCase variants.
 * @param {string} key
 */
export function isSensitiveRecordFieldKey(key) {
  if (typeof key !== "string" || !key) return false;
  if (ALLOWED_RECORD_FIELD_SET.has(key)) return false;
  // Documented Stripe checkout metadata aliases are not PII — normalize them instead.
  // (e.g. print_shipping_charge_cents would otherwise match the broad /charge/ pattern.)
  if (isCheckoutMetadataAliasKey(key)) return false;

  const lower = key.toLowerCase();
  const normalized = normalizeRecordFieldKey(key);

  if (SENSITIVE_FIELD_SET.has(lower) || SENSITIVE_FIELD_SET.has(normalized) || SENSITIVE_FIELD_SET.has(key)) {
    return true;
  }

  // Broad patterns on normalized snake_case (and original) — never match allowed schema keys.
  const patterns = [
    /email/,
    /phone/,
    /address/,
    /(^|_)(first|last|full|buyer)_?name(s)?(_|$)/,
    /(^|_)name(s)?(_|$)/,
    /customer/,
    /session/,
    /client_reference/,
    /payment_intent/,
    /payment_method/,
    /payment/,
    /charge/,
    /(^|_)order_id(_|$)/,
    /(^|_)map_id(_|$)/,
    /asset_id/,
    /print_.*_asset/,
    /token/,
    /secret/,
    /password/,
    /authorization/,
    /metadata/,
    /(^|_)raw(_|$)/,
    /(^|_)stripe(_|$)/,
    /(^|_)printful(_|$)/,
  ];

  return patterns.some((pattern) => pattern.test(normalized) || pattern.test(lower));
}

/**
 * Merch checkout identity markers are unsupported by this report (no merch COGS model yet).
 * Fail closed — never strip and reclassify as poster/canvas contribution.
 * @param {string} key
 */
export function isUnsupportedMerchFieldKey(key) {
  if (typeof key !== "string" || !key) return false;
  if (ALLOWED_RECORD_FIELD_SET.has(key)) return false;

  const lower = key.toLowerCase();
  const normalized = normalizeRecordFieldKey(key);

  if (
    UNSUPPORTED_MERCH_FIELD_SET.has(lower) ||
    UNSUPPORTED_MERCH_FIELD_SET.has(normalized) ||
    UNSUPPORTED_MERCH_FIELD_SET.has(key)
  ) {
    return true;
  }

  // Any print_merch_* marker after camelCase→snake normalization.
  // Do NOT match raw lowercase `printmerch…` — that incorrectly treats unrelated
  // merchant/processor keys like printMerchantCountry as merch.
  return /^print_merch(_|$)/.test(normalized);
}

const GENERIC_OPERATOR_FAILURE =
  "Product contribution failed. Check the sanitized input path and schema; then retry.";

const SENSITIVE_OUTPUT_PATTERNS = Object.freeze([
  /\bcs_(test|live)_[A-Za-z0-9]+/i,
  /\bpi_[A-Za-z0-9]+/i,
  /\bpm_[A-Za-z0-9]+/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /"metadata"\s*:/,
  /"customer_details"\s*:/,
  /"shipping_details"\s*:/,
  /Bearer\s+[A-Za-z0-9._\-]+/i,
  /authorization\s*:\s*\S+/i,
]);

function usage() {
  return `Usage: node scripts/product-contribution.mjs --input <sanitized.json> [--format table|json]

Offline estimated pre-fixed-cost product contribution from a sanitized paid-session export.

Flags:
  --input <path>     Local JSON file (required). No network access.
  --format <mode>    table (default) or json
  -h, --help         Show this help

Input must be schema_version ${PRODUCT_CONTRIBUTION_CONTRACT.schemaVersion} with a records array.
Only aggregate fields are printed. Sensitive/row-identifying keys are rejected.
Fees, COGS, and shipping costs are configured estimates — not accounting profit or cash remaining.
`;
}

export function containsSensitiveOperatorText(text) {
  return SENSITIVE_OUTPUT_PATTERNS.some((pattern) => pattern.test(String(text ?? "")));
}

export function writeOperatorError(stderr, message) {
  const candidate = String(message ?? "").trim();
  const safe = candidate && !containsSensitiveOperatorText(candidate) ? candidate : GENERIC_OPERATOR_FAILURE;
  const stream = stderr && typeof stderr.write === "function" ? stderr : process.stderr;
  stream.write(`${safe}\n`);
  return safe;
}

export function assertSafeOutput(text) {
  if (containsSensitiveOperatorText(text)) {
    throw new Error("Refusing to print sensitive or detailed product-contribution output");
  }
}

/**
 * Negative-control helper: empty / gross-only / no-op stubs must fail.
 */
export function assertScriptIsNotNoOp(scriptPath = fileURLToPath(import.meta.url)) {
  const absolute = path.resolve(scriptPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Product contribution script missing: ${absolute}`);
  }
  const bytes = fs.statSync(absolute).size;
  if (bytes <= 0) {
    throw new Error(`Product contribution script is empty (0 bytes): ${absolute}`);
  }
  const source = fs.readFileSync(absolute, "utf8");
  if (!source.includes("estimated_pre_fixed_cost_contribution_cents")) {
    throw new Error("Product contribution script does not compute estimated contribution");
  }
  if (!source.includes("estimateStripeFeeCents")) {
    throw new Error("Product contribution script does not use shared Stripe fee estimates");
  }
  if (
    !source.includes("getConfiguredPrintProductCostCents") &&
    !source.includes("getConfiguredShippingCostCents")
  ) {
    throw new Error("Product contribution script does not use configured product/shipping costs");
  }
  if (!/--input/.test(source)) {
    throw new Error("Product contribution script does not accept --input");
  }
  // Gross-revenue-only stub detection: must subtract fees and product/shipping costs.
  const hasContributionFormula =
    source.includes("revenueCents - stripeFeeCents - productCostCents - shipping.amountCents") ||
    source.includes("revenueCents - stripeFeeCents");
  const hasCostSide = source.includes("productCostCents") && source.includes("shipping.amountCents");
  if (!hasContributionFormula || !hasCostSide) {
    throw new Error("Product contribution script appears to be gross-revenue-only or incomplete");
  }
  return { bytes, absolute };
}

export function parseArgs(argv) {
  let inputPath;
  let format = "table";

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-h" || token === "--help") {
      return { help: true };
    }
    if (token === "--input") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error("Missing value for --input");
      inputPath = next;
      i += 1;
      continue;
    }
    if (token === "--format") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error("Missing value for --format");
      const normalized = String(next).trim().toLowerCase();
      if (!PRODUCT_CONTRIBUTION_CONTRACT.formats.includes(normalized)) {
        throw new Error(`--format must be one of: ${PRODUCT_CONTRIBUTION_CONTRACT.formats.join(", ")}`);
      }
      format = normalized;
      i += 1;
      continue;
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  if (!inputPath) {
    throw new Error("Missing required --input <sanitized.json>");
  }

  return { help: false, inputPath, format };
}

function assertLocalInputPath(inputPath, cwd = process.cwd()) {
  const absolute = path.resolve(cwd, inputPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Input file not found: ${path.basename(absolute)}`);
  }
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) {
    throw new Error("Input path must be a local file");
  }
  return absolute;
}

function assertNonNegativeIntegerCents(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer minor-unit amount`);
  }
  if (value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function assertRequiredAmountTotal(value) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("amount_total must be an integer minor-unit amount");
  }
  if (value < 0) {
    throw new Error("amount_total must be a non-negative integer");
  }
  return value;
}

/**
 * Reject sensitive keys; strip unknown non-sensitive keys with warnings.
 * @returns {{ record: object; warnings: string[] }}
 */
export function sanitizeRecord(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`records[${index}] must be an object`);
  }

  const warnings = [];
  for (const key of Object.keys(raw)) {
    // Documented checkout aliases are normalized below — never treat as sensitive/unknown.
    if (ALLOWED_RECORD_FIELD_SET.has(key) || isCheckoutMetadataAliasKey(key)) {
      continue;
    }
    // Sensitive detection must fail closed before unknown-field stripping.
    if (isSensitiveRecordFieldKey(key)) {
      throw new Error(`records[${index}] contains sensitive or row-identifying field "${key}" (rejected)`);
    }
    // Merch identity must fail closed — never strip and reclassify as poster/canvas COGS.
    if (isUnsupportedMerchFieldKey(key)) {
      throw new Error(
        `records[${index}] contains unsupported merch field "${key}" (merch contribution model not supported; rejected)`
      );
    }
    warnings.push(`records[${index}]: stripped unknown field "${key}"`);
  }

  const amountTotal = assertRequiredAmountTotal(raw.amount_total);
  const currencyRaw = raw.currency;
  if (typeof currencyRaw !== "string" || !currencyRaw.trim()) {
    throw new Error(`records[${index}].currency is required`);
  }
  const currency = currencyRaw.trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error(`records[${index}].currency must be a 3-letter ISO code`);
  }

  const orderType =
    raw.order_type === undefined || raw.order_type === null
      ? null
      : String(raw.order_type).trim().toLowerCase();

  const planRaw = raw.plan === undefined || raw.plan === null ? null : String(raw.plan).trim().toLowerCase();
  const plan = planRaw || null;

  const printVariant =
    raw.print_variant === undefined || raw.print_variant === null
      ? null
      : String(raw.print_variant).trim().toLowerCase();

  const includeDigital = resolveCanonicalBoolWithAlias(
    raw,
    index,
    "include_digital",
    CHECKOUT_ADDON_ALIAS_NORMALIZED.include_digital
  );
  const includeCard = resolveCanonicalBoolWithAlias(
    raw,
    index,
    "include_card",
    CHECKOUT_ADDON_ALIAS_NORMALIZED.include_card
  );

  // Impossible metadata combinations — fail closed.
  if (orderType === "digital" && printVariant) {
    throw new Error(`records[${index}]: digital order_type cannot include print_variant`);
  }
  if (orderType === "digital" && (includeDigital || includeCard)) {
    throw new Error(`records[${index}]: digital order_type cannot include print bundle flags`);
  }
  if (orderType === "print" && plan && plan !== "single") {
    // Print checkout may set plan=single with the HD add-on; pack3/subscription (or any
    // other nonblank plan) on print is an impossible metadata combination — fail closed
    // regardless of include_digital / include_card.
    // Field/category only — never interpolate the rejected plan value (under-sanitized
    // exports may embed PII, tokens, or log-injection text in that field).
    throw new Error(`records[${index}]: print order_type has unsupported plan`);
  }
  // Checkout only sets print_include_card when print + poster_framed + !digital add-on.
  if (includeCard) {
    const cardAllowed = orderType === "print" && printVariant === "poster_framed" && !includeDigital;
    if (!cardAllowed) {
      throw new Error(
        `records[${index}]: include_card is only valid for print poster_framed without include_digital`
      );
    }
  }

  const shippingCountry = resolveCanonicalShippingCountryWithAlias(raw, index);
  const shippingChargeCents = resolveCanonicalCentsWithAlias(
    raw,
    index,
    "shipping_charge_cents",
    CHECKOUT_SHIPPING_ALIAS_NORMALIZED.shipping_charge_cents
  );
  const shippingSubsidyCents = resolveCanonicalCentsWithAlias(
    raw,
    index,
    "shipping_subsidy_cents",
    CHECKOUT_SHIPPING_ALIAS_NORMALIZED.shipping_subsidy_cents
  );

  const record = {
    paid_at: raw.paid_at === undefined || raw.paid_at === null ? null : String(raw.paid_at),
    currency,
    amount_total: amountTotal,
    order_type: orderType,
    plan,
    print_variant: printVariant,
    include_digital: includeDigital,
    include_card: includeCard,
    shipping_country: shippingCountry,
    shipping_charge_cents: shippingChargeCents,
    shipping_subsidy_cents: shippingSubsidyCents,
    discount_cents: assertNonNegativeIntegerCents(raw.discount_cents, `records[${index}].discount_cents`),
    qa_run: raw.qa_run === undefined ? undefined : raw.qa_run,
    qa_ops_checkout: raw.qa_ops_checkout === undefined ? undefined : raw.qa_ops_checkout,
    qa_source: raw.qa_source === undefined || raw.qa_source === null ? undefined : String(raw.qa_source),
  };

  return { record, warnings };
}

/**
 * @param {unknown} document
 */
export function parseSanitizedDocument(document) {
  if (Array.isArray(document)) {
    throw new Error("Input must be an object with schema_version and records (not a bare array)");
  }
  if (!document || typeof document !== "object") {
    throw new Error("Input must be a JSON object");
  }

  for (const key of Object.keys(document)) {
    if (!ALLOWED_DOCUMENT_KEYS.has(key)) {
      if (isSensitiveRecordFieldKey(key)) {
        throw new Error(`Input contains sensitive top-level field "${key}" (rejected)`);
      }
      throw new Error(`Input contains unknown top-level field "${key}" (rejected)`);
    }
  }

  if (document.schema_version !== PRODUCT_CONTRIBUTION_CONTRACT.schemaVersion) {
    throw new Error(
      `schema_version must be ${PRODUCT_CONTRIBUTION_CONTRACT.schemaVersion} (got ${JSON.stringify(document.schema_version)})`
    );
  }
  if (!Array.isArray(document.records)) {
    throw new Error("records must be an array");
  }

  const warnings = [];
  const records = [];
  for (let i = 0; i < document.records.length; i += 1) {
    const { record, warnings: rowWarnings } = sanitizeRecord(document.records[i], i);
    warnings.push(...rowWarnings);
    records.push(record);
  }

  return { records, warnings };
}

export function isExcludedQaRecord(record) {
  return isQaStripeSession({
    metadata: {
      qa_run: record.qa_run === undefined ? undefined : String(record.qa_run),
      qa_ops_checkout: record.qa_ops_checkout === undefined ? undefined : String(record.qa_ops_checkout),
      qa_source: record.qa_source,
    },
  });
}

/**
 * Deterministic product group key.
 * @returns {{ groupKey: string; groupLabel: string; kind: string }}
 */
export function classifyProductGroup(record) {
  const orderType = record.order_type;

  if (orderType === "digital") {
    // Missing / blank / unsupported plan must NOT default to digital:single.
    const plan = typeof record.plan === "string" ? record.plan.trim().toLowerCase() : record.plan;
    if (!plan || !isSupportedDigitalPlan(plan)) {
      return { groupKey: "unknown", groupLabel: "unknown / unclassified", kind: "unknown" };
    }
    const labels = {
      single: "HD digital single",
      pack3: "digital pack (pack3)",
      subscription: "digital subscription",
    };
    return {
      groupKey: `digital:${plan}`,
      groupLabel: labels[plan],
      kind: "digital",
    };
  }

  if (orderType === "print") {
    const variant = record.print_variant;
    if (!variant || !isSupportedPrintVariant(variant)) {
      return { groupKey: "unknown", groupLabel: "unknown / unclassified", kind: "unknown" };
    }
    const parts = [`print:${variant}`];
    const labelParts = [variant];
    if (record.include_digital) {
      parts.push("digital");
      labelParts.push("HD digital");
    }
    if (record.include_card) {
      parts.push("card");
      labelParts.push("card");
    }
    return {
      groupKey: parts.join("+"),
      groupLabel: labelParts.length === 1 ? `print ${variant}` : `print ${labelParts.join(" + ")}`,
      kind: record.include_digital || record.include_card ? "bundle" : "print",
    };
  }

  return { groupKey: "unknown", groupLabel: "unknown / unclassified", kind: "unknown" };
}

/**
 * @returns {{
 *   resolved: boolean;
 *   unresolvedReason: string | null;
 *   stripeFeeCents: number;
 *   productCostCents: number | null;
 *   shippingCostCents: number | null;
 *   shippingChargeCents: number;
 *   shippingSubsidyCents: number;
 *   discountCents: number;
 *   contributionCents: number | null;
 * }}
 */
export function estimateRecordContribution(record, feeConfig, env = process.env) {
  const revenueCents = record.amount_total;
  const stripeFeeCents = estimateStripeFeeCents(revenueCents, feeConfig);
  const shippingChargeCents = record.shipping_charge_cents ?? 0;
  const shippingSubsidyCents = record.shipping_subsidy_cents ?? 0;
  const discountCents = record.discount_cents ?? 0;

  const classification = classifyProductGroup(record);

  if (classification.kind === "unknown") {
    return {
      resolved: false,
      unresolvedReason: "unknown_product_metadata",
      stripeFeeCents,
      productCostCents: null,
      shippingCostCents: null,
      shippingChargeCents,
      shippingSubsidyCents,
      discountCents,
      contributionCents: null,
    };
  }

  if (classification.kind === "digital") {
    // Digital: no configured product/shipping COGS; contribution = revenue − estimated fees.
    const contributionCents = revenueCents - stripeFeeCents;
    return {
      resolved: true,
      unresolvedReason: null,
      stripeFeeCents,
      productCostCents: 0,
      shippingCostCents: 0,
      shippingChargeCents,
      shippingSubsidyCents,
      discountCents,
      contributionCents,
    };
  }

  // Print / bundle
  const productCostCents = getConfiguredPrintProductCostCents(
    {
      printVariant: record.print_variant,
      includeCard: Boolean(record.include_card),
    },
    env
  );
  if (productCostCents === null) {
    return {
      resolved: false,
      unresolvedReason: "missing_product_cost",
      stripeFeeCents,
      productCostCents: null,
      shippingCostCents: null,
      shippingChargeCents,
      shippingSubsidyCents,
      discountCents,
      contributionCents: null,
    };
  }

  if (!record.shipping_country) {
    return {
      resolved: false,
      unresolvedReason: "missing_shipping_country",
      stripeFeeCents,
      productCostCents,
      shippingCostCents: null,
      shippingChargeCents,
      shippingSubsidyCents,
      discountCents,
      contributionCents: null,
    };
  }

  const shipping = getConfiguredShippingCostCents(record.print_variant, record.shipping_country);
  if (!shipping) {
    return {
      resolved: false,
      unresolvedReason: "shipping_estimate_unavailable",
      stripeFeeCents,
      productCostCents,
      shippingCostCents: null,
      shippingChargeCents,
      shippingSubsidyCents,
      discountCents,
      contributionCents: null,
    };
  }

  // Fail closed when the shipping matrix currency does not match the paid session currency.
  if (shipping.currency.toLowerCase() !== record.currency.toLowerCase()) {
    return {
      resolved: false,
      unresolvedReason: "shipping_currency_mismatch",
      stripeFeeCents,
      productCostCents,
      shippingCostCents: shipping.amountCents,
      shippingChargeCents,
      shippingSubsidyCents,
      discountCents,
      contributionCents: null,
    };
  }

  // amount_total already reflects discounts and customer shipping charge (incl. free-shipping waiver).
  // Do not subtract discount_cents or shipping_subsidy_cents again.
  const contributionCents = revenueCents - stripeFeeCents - productCostCents - shipping.amountCents;

  return {
    resolved: true,
    unresolvedReason: null,
    stripeFeeCents,
    productCostCents,
    shippingCostCents: shipping.amountCents,
    shippingChargeCents,
    shippingSubsidyCents,
    discountCents,
    contributionCents,
  };
}

function emptyGroup(groupKey, groupLabel, kind) {
  return {
    group_key: groupKey,
    group_label: groupLabel,
    kind,
    paid_order_count: 0,
    collected_revenue_cents: 0,
    estimated_stripe_fees_cents: 0,
    estimated_product_cost_cents: 0,
    estimated_shipping_cost_cents: 0,
    shipping_charge_cents: 0,
    shipping_subsidy_cents: 0,
    discount_cents_reported: 0,
    estimated_pre_fixed_cost_contribution_cents: 0,
    contribution_per_order_cents: null,
    contribution_margin_percent: null,
    unresolved_count: 0,
    unresolved_revenue_cents: 0,
    unresolved_reasons: {},
    resolved_order_count: 0,
  };
}

function finalizeGroup(group) {
  if (group.resolved_order_count > 0) {
    group.contribution_per_order_cents = Math.round(
      group.estimated_pre_fixed_cost_contribution_cents / group.resolved_order_count
    );
    const denom = group.collected_revenue_cents - group.unresolved_revenue_cents;
    if (denom > 0) {
      group.contribution_margin_percent =
        Math.round((group.estimated_pre_fixed_cost_contribution_cents / denom) * 10000) / 100;
    } else {
      group.contribution_margin_percent = null;
    }
  } else {
    group.contribution_per_order_cents = null;
    group.contribution_margin_percent = null;
    // Unresolved-only groups: zero out cost/fee contribution fields that would imply a fabricated margin
    group.estimated_stripe_fees_cents = 0;
    group.estimated_product_cost_cents = 0;
    group.estimated_shipping_cost_cents = 0;
    group.estimated_pre_fixed_cost_contribution_cents = 0;
  }

  // Sort unresolved reason keys
  const reasons = Object.keys(group.unresolved_reasons).sort();
  const sortedReasons = {};
  for (const key of reasons) sortedReasons[key] = group.unresolved_reasons[key];
  group.unresolved_reasons = sortedReasons;
  return group;
}

/**
 * Build aggregate report. Input row order must not affect results.
 */
export function buildProductContributionReport(records, { env = process.env } = {}) {
  const feeConfig = getStripeFeeConfig(env);
  const byCurrency = new Map();

  // Stable processing: sort a copy so input order cannot change aggregates
  const sorted = [...records].map((record, index) => ({ record, index }));
  sorted.sort((a, b) => {
    const c = a.record.currency.localeCompare(b.record.currency);
    if (c !== 0) return c;
    const groupA = classifyProductGroup(a.record).groupKey;
    const groupB = classifyProductGroup(b.record).groupKey;
    const g = groupA.localeCompare(groupB);
    if (g !== 0) return g;
    return a.index - b.index;
  });

  for (const { record } of sorted) {
    const currency = record.currency;
    if (!byCurrency.has(currency)) {
      byCurrency.set(currency, {
        currency,
        input_record_count: 0,
        excluded_qa_count: 0,
        excluded_qa_revenue_cents: 0,
        paid_order_count: 0,
        collected_revenue_cents: 0,
        estimated_stripe_fees_cents: 0,
        estimated_product_cost_cents: 0,
        estimated_shipping_cost_cents: 0,
        shipping_charge_cents: 0,
        shipping_subsidy_cents: 0,
        discount_cents_reported: 0,
        estimated_pre_fixed_cost_contribution_cents: 0,
        unresolved_count: 0,
        unresolved_revenue_cents: 0,
        groups: new Map(),
      });
    }
    const section = byCurrency.get(currency);
    section.input_record_count += 1;

    if (isExcludedQaRecord(record)) {
      section.excluded_qa_count += 1;
      section.excluded_qa_revenue_cents += record.amount_total;
      continue;
    }

    const classification = classifyProductGroup(record);
    if (!section.groups.has(classification.groupKey)) {
      section.groups.set(
        classification.groupKey,
        emptyGroup(classification.groupKey, classification.groupLabel, classification.kind)
      );
    }
    const group = section.groups.get(classification.groupKey);
    group.paid_order_count += 1;
    group.collected_revenue_cents += record.amount_total;
    section.paid_order_count += 1;
    section.collected_revenue_cents += record.amount_total;

    const estimate = estimateRecordContribution(record, feeConfig, env);
    group.shipping_charge_cents += estimate.shippingChargeCents;
    group.shipping_subsidy_cents += estimate.shippingSubsidyCents;
    group.discount_cents_reported += estimate.discountCents;
    section.shipping_charge_cents += estimate.shippingChargeCents;
    section.shipping_subsidy_cents += estimate.shippingSubsidyCents;
    section.discount_cents_reported += estimate.discountCents;

    if (!estimate.resolved) {
      group.unresolved_count += 1;
      group.unresolved_revenue_cents += record.amount_total;
      const reason = estimate.unresolvedReason || "unresolved";
      group.unresolved_reasons[reason] = (group.unresolved_reasons[reason] || 0) + 1;
      section.unresolved_count += 1;
      section.unresolved_revenue_cents += record.amount_total;
      continue;
    }

    group.resolved_order_count += 1;
    group.estimated_stripe_fees_cents += estimate.stripeFeeCents;
    group.estimated_product_cost_cents += estimate.productCostCents;
    group.estimated_shipping_cost_cents += estimate.shippingCostCents;
    group.estimated_pre_fixed_cost_contribution_cents += estimate.contributionCents;

    section.estimated_stripe_fees_cents += estimate.stripeFeeCents;
    section.estimated_product_cost_cents += estimate.productCostCents;
    section.estimated_shipping_cost_cents += estimate.shippingCostCents;
    section.estimated_pre_fixed_cost_contribution_cents += estimate.contributionCents;
  }

  const currencies = [...byCurrency.keys()].sort();
  const currencySections = currencies.map((currency) => {
    const section = byCurrency.get(currency);
    const groups = [...section.groups.values()]
      .map(finalizeGroup)
      .sort((a, b) => a.group_key.localeCompare(b.group_key));

    let contributionPerOrder = null;
    let contributionMarginPercent = null;
    const resolvedOrders = groups.reduce((sum, g) => sum + g.resolved_order_count, 0);
    if (resolvedOrders > 0) {
      contributionPerOrder = Math.round(section.estimated_pre_fixed_cost_contribution_cents / resolvedOrders);
      const denom = section.collected_revenue_cents - section.unresolved_revenue_cents;
      if (denom > 0) {
        contributionMarginPercent =
          Math.round((section.estimated_pre_fixed_cost_contribution_cents / denom) * 10000) / 100;
      }
    }

    return {
      currency,
      input_record_count: section.input_record_count,
      excluded_qa_count: section.excluded_qa_count,
      excluded_qa_revenue_cents: section.excluded_qa_revenue_cents,
      paid_order_count: section.paid_order_count,
      collected_revenue_cents: section.collected_revenue_cents,
      estimated_stripe_fees_cents: section.estimated_stripe_fees_cents,
      estimated_product_cost_cents: section.estimated_product_cost_cents,
      estimated_shipping_cost_cents: section.estimated_shipping_cost_cents,
      shipping_charge_cents: section.shipping_charge_cents,
      shipping_subsidy_cents: section.shipping_subsidy_cents,
      discount_cents_reported: section.discount_cents_reported,
      estimated_pre_fixed_cost_contribution_cents: section.estimated_pre_fixed_cost_contribution_cents,
      contribution_per_order_cents: contributionPerOrder,
      contribution_margin_percent: contributionMarginPercent,
      unresolved_count: section.unresolved_count,
      unresolved_revenue_cents: section.unresolved_revenue_cents,
      groups,
    };
  });

  return {
    ok: true,
    report_kind: PRODUCT_CONTRIBUTION_CONTRACT.labels.reportKind,
    schema_version: PRODUCT_CONTRIBUTION_CONTRACT.schemaVersion,
    disclaimer: {
      estimated_not_actual: true,
      not_accounting_profit: true,
      not_cash_remaining: true,
      stripe_fees: "configured_estimate",
      product_cogs: "configured_estimate",
      shipping_cost: "configured_printful_shipping_matrix",
      shipping_subsidy_and_discount: "informational_only_not_subtracted_again_from_amount_total",
      formula: "collected_revenue − estimated_stripe_fees − estimated_product_cost − estimated_shipping_cost",
      stripe_fee_defaults: {
        percent: DEFAULT_STRIPE_PERCENT,
        fixed_cents: DEFAULT_STRIPE_FIXED_CENTS,
        env_percent: "PRINT_MARGIN_STRIPE_PERCENT",
        env_fixed: "PRINT_MARGIN_STRIPE_FIXED_CENTS",
      },
    },
    fee_config_used: {
      percent: feeConfig.percent,
      fixed_cents: feeConfig.fixedCents,
    },
    currency_sections: currencySections,
  };
}

export function formatJsonReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function formatCents(cents) {
  if (cents === null || cents === undefined) return "n/a";
  return String(cents);
}

export function formatTableReport(report) {
  const lines = [];
  lines.push("Product contribution (estimated pre-fixed-cost)");
  lines.push("NOTE: configured estimates — not accounting profit or cash remaining.");
  lines.push(
    `fee_config: percent=${report.fee_config_used.percent} fixed_cents=${report.fee_config_used.fixed_cents}`
  );
  lines.push(`formula: ${report.disclaimer.formula}`);
  lines.push("");

  for (const section of report.currency_sections) {
    lines.push(`currency: ${section.currency}`);
    lines.push(
      `  input=${section.input_record_count} paid=${section.paid_order_count} excluded_qa=${section.excluded_qa_count} unresolved=${section.unresolved_count}`
    );
    lines.push(
      `  revenue_cents=${section.collected_revenue_cents} fees_est=${section.estimated_stripe_fees_cents} product_est=${section.estimated_product_cost_cents} ship_cost_est=${section.estimated_shipping_cost_cents}`
    );
    lines.push(
      `  ship_charge=${section.shipping_charge_cents} ship_subsidy=${section.shipping_subsidy_cents} discount_reported=${section.discount_cents_reported}`
    );
    lines.push(
      `  contribution_cents=${section.estimated_pre_fixed_cost_contribution_cents} per_order=${formatCents(section.contribution_per_order_cents)} margin_pct=${formatCents(section.contribution_margin_percent)}`
    );
    lines.push("  groups:");
    for (const group of section.groups) {
      lines.push(
        `    - ${group.group_key} | orders=${group.paid_order_count} revenue=${group.collected_revenue_cents} contrib=${group.estimated_pre_fixed_cost_contribution_cents} per_order=${formatCents(group.contribution_per_order_cents)} margin_pct=${formatCents(group.contribution_margin_percent)} unresolved=${group.unresolved_count}`
      );
    }
    lines.push("");
  }

  if (report.currency_sections.length === 0) {
    lines.push("currency: (none)");
    lines.push("  no records");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Prove aggregate output never contains row-level identifying fields.
 */
export function assertAggregateOnly(report) {
  const json = JSON.stringify(report);
  if (containsSensitiveOperatorText(json)) {
    throw new Error("Aggregate report failed sensitive-output check");
  }
  const forbiddenKeys = ["records", "session_id", "customer_email", "email", "metadata", "payment_intent"];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(report, key)) {
      throw new Error(`Aggregate report must not include top-level "${key}"`);
    }
  }
  // No per-row arrays
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && "amount_total" in item && "paid_at" in item) {
          throw new Error("Aggregate report must not include row-level records");
        }
        walk(item);
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (SENSITIVE_FIELD_SET.has(k.toLowerCase())) {
          throw new Error(`Aggregate report must not include field "${k}"`);
        }
        walk(v);
      }
    }
  };
  walk(report);
}

export function runProductContribution({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  cwd = process.cwd(),
  readFileSyncImpl = fs.readFileSync,
} = {}) {
  try {
    let args;
    try {
      args = parseArgs(argv);
    } catch (error) {
      writeOperatorError(stderr, error instanceof Error ? error.message : GENERIC_OPERATOR_FAILURE);
      return 1;
    }

    if (args.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }

    let absoluteInput;
    try {
      absoluteInput = assertLocalInputPath(args.inputPath, cwd);
    } catch (error) {
      writeOperatorError(stderr, error instanceof Error ? error.message : GENERIC_OPERATOR_FAILURE);
      return 1;
    }

    let rawText;
    try {
      rawText = readFileSyncImpl(absoluteInput, "utf8");
    } catch {
      writeOperatorError(stderr, "Failed to read input file");
      return 1;
    }

    let document;
    try {
      document = JSON.parse(rawText);
    } catch {
      writeOperatorError(stderr, "Invalid JSON in input file");
      return 1;
    }

    let parsed;
    try {
      parsed = parseSanitizedDocument(document);
    } catch (error) {
      writeOperatorError(stderr, error instanceof Error ? error.message : GENERIC_OPERATOR_FAILURE);
      return 1;
    }

    for (const warning of parsed.warnings) {
      if (!containsSensitiveOperatorText(warning)) {
        stderr.write(`warning: ${warning}\n`);
      }
    }

    const report = buildProductContributionReport(parsed.records, { env });
    try {
      assertAggregateOnly(report);
    } catch {
      writeOperatorError(stderr, "Product contribution refused to print unsafe aggregate output.");
      return 1;
    }

    const output = args.format === "json" ? formatJsonReport(report) : formatTableReport(report);
    try {
      assertSafeOutput(output);
    } catch {
      writeOperatorError(stderr, "Product contribution refused to print unsafe aggregate output.");
      return 1;
    }
    stdout.write(output);
    return 0;
  } catch {
    writeOperatorError(stderr, GENERIC_OPERATOR_FAILURE);
    return 1;
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const code = runProductContribution();
  process.exitCode = code;
}
