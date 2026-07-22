/**
 * Shared configured cost/fee estimates for offline commercial reports.
 *
 * Keep defaults aligned with:
 * - src/lib/printMargin.ts (Stripe fee defaults / env keys)
 * - src/lib/printCatalog.ts (variant COGS defaults + shipping profiles)
 * - src/lib/printfulShipping.ts + data/printful-shipping.json
 *
 * These are configured estimates — not actual Stripe balance fees or Printful invoices.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Matches printMargin.ts DEFAULT_STRIPE_PERCENT */
export const DEFAULT_STRIPE_PERCENT = 0.029;
/** Matches printMargin.ts DEFAULT_STRIPE_FIXED_CENTS */
export const DEFAULT_STRIPE_FIXED_CENTS = 30;

export const STRIPE_PERCENT_ENV = "PRINT_MARGIN_STRIPE_PERCENT";
export const STRIPE_FIXED_ENV = "PRINT_MARGIN_STRIPE_FIXED_CENTS";

/**
 * Catalog COGS + shipping-profile mirror of PRINT_CATALOG (printCatalog.ts).
 * Unit tests assert these stay in sync with the TypeScript source.
 */
export const PRINT_VARIANT_COST_ROWS = Object.freeze({
  poster_unframed: Object.freeze({
    cogsEnv: "PRINT_COGS_POSTER_UNFRAMED_CENTS",
    defaultCogsCents: 1300,
    shippingProfile: "poster_unframed",
    printfulVariantId: 6242,
  }),
  poster_framed: Object.freeze({
    cogsEnv: "PRINT_COGS_POSTER_FRAMED_CENTS",
    defaultCogsCents: 5200,
    shippingProfile: "poster_framed",
    printfulVariantId: 4654,
  }),
  canvas_wrap: Object.freeze({
    cogsEnv: "PRINT_COGS_CANVAS_WRAP_CENTS",
    defaultCogsCents: 2800,
    shippingProfile: "poster_framed",
    printfulVariantId: 19291,
  }),
  mug_11oz: Object.freeze({
    cogsEnv: "PRINT_COGS_MUG_11OZ_CENTS",
    defaultCogsCents: 1200,
    shippingProfile: "poster_unframed",
    printfulVariantId: 9323,
  }),
  card_4x6: Object.freeze({
    cogsEnv: "PRINT_COGS_CARD_4X6_CENTS",
    defaultCogsCents: 450,
    shippingProfile: "poster_unframed",
    printfulVariantId: 14457,
  }),
});

export const SUPPORTED_PRINT_VARIANTS = Object.freeze(Object.keys(PRINT_VARIANT_COST_ROWS).sort());

/**
 * Offline snapshot of Printful **public catalog base** wholesale prices (USD minor units).
 *
 * Observed via unauthenticated `GET https://api.printful.com/products/variant/{id}`
 * on 2026-07-22. These are NOT used in contribution math — configured `PRINT_COGS_*`
 * / catalog defaults remain the estimate source so live margin guard stays aligned.
 *
 * Public catalog base ≠ landed regional Printful invoice cost (taxes, region surcharges,
 * packaging). Prefer H2 invoice reconciliation for actuals.
 */
export const PRINTFUL_PUBLIC_CATALOG_BASE_REFERENCE = Object.freeze({
  observed_at: "2026-07-22",
  source: "printful_public_catalog_variant_endpoint",
  currency: "USD",
  used_in_contribution_math: false,
  variants: Object.freeze({
    poster_unframed: Object.freeze({
      printfulVariantId: 6242,
      catalog_label: "Enhanced Matte Paper Poster 18″×18″",
      public_catalog_base_cents: 1239,
    }),
    poster_framed: Object.freeze({
      printfulVariantId: 4654,
      catalog_label: "Enhanced Matte Paper Framed Poster (Black/14″×14″)",
      public_catalog_base_cents: 3315,
    }),
    canvas_wrap: Object.freeze({
      printfulVariantId: 19291,
      catalog_label: "Canvas (in) (6″×6″) — entry size per upsell matrix",
      public_catalog_base_cents: 1372,
    }),
    mug_11oz: Object.freeze({
      printfulVariantId: 9323,
      catalog_label: "Black Glossy Mug (11 oz)",
      public_catalog_base_cents: 795,
    }),
    card_4x6: Object.freeze({
      printfulVariantId: 14457,
      catalog_label: "Greeting Card (4″×6″)",
      public_catalog_base_cents: 250,
    }),
  }),
});

const DIGITAL_PLANS = new Set(["single", "pack3", "subscription"]);

function parseIntEnv(value, fallback, minimum = 0) {
  const parsed = value ? Number.parseInt(String(value).trim(), 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

function parseFloatEnv(value, fallback, minimum = 0) {
  const parsed = value ? Number.parseFloat(String(value).trim()) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function getStripeFeeConfig(env = process.env) {
  return {
    percent: parseFloatEnv(env?.[STRIPE_PERCENT_ENV], DEFAULT_STRIPE_PERCENT, 0),
    fixedCents: parseIntEnv(env?.[STRIPE_FIXED_ENV], DEFAULT_STRIPE_FIXED_CENTS, 0),
  };
}

/**
 * Matches printMargin.ts estimateStripeFeeCents.
 * @param {number} revenueCents
 * @param {{ percent?: number; fixedCents?: number }} [config]
 */
export function estimateStripeFeeCents(revenueCents, config = {}) {
  const percent = Number.isFinite(config.percent) ? config.percent : DEFAULT_STRIPE_PERCENT;
  const fixedCents = Number.isFinite(config.fixedCents) ? config.fixedCents : DEFAULT_STRIPE_FIXED_CENTS;
  if (!Number.isFinite(revenueCents) || revenueCents <= 0) return 0;
  return Math.round(revenueCents * percent) + fixedCents;
}

/**
 * @param {unknown} value
 * @returns {value is keyof typeof PRINT_VARIANT_COST_ROWS}
 */
export function isSupportedPrintVariant(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PRINT_VARIANT_COST_ROWS, value);
}

/**
 * @param {unknown} value
 */
export function isSupportedDigitalPlan(value) {
  return typeof value === "string" && DIGITAL_PLANS.has(value);
}

/**
 * Configured product COGS for a print variant (env override or catalog default).
 * @param {string} variant
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {number | null}
 */
export function getConfiguredProductCostCents(variant, env = process.env) {
  if (!isSupportedPrintVariant(variant)) return null;
  const row = PRINT_VARIANT_COST_ROWS[variant];
  return parseIntEnv(env?.[row.cogsEnv], row.defaultCogsCents, 0);
}

/**
 * @param {string} variant
 * @returns {"poster_unframed" | "poster_framed" | null}
 */
export function getShippingProfile(variant) {
  if (!isSupportedPrintVariant(variant)) return null;
  return PRINT_VARIANT_COST_ROWS[variant].shippingProfile;
}

let cachedShippingMap = null;

function loadShippingMap() {
  if (cachedShippingMap) return cachedShippingMap;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const jsonPath = path.resolve(here, "../../data/printful-shipping.json");
  const raw = fs.readFileSync(jsonPath, "utf8");
  cachedShippingMap = JSON.parse(raw);
  return cachedShippingMap;
}

/**
 * Configured Printful shipping estimate in minor units (matches getPrintShippingEstimate).
 * @param {string} variant
 * @param {string | null | undefined} country
 * @returns {{ amountCents: number; currency: string } | null}
 */
export function getConfiguredShippingCostCents(variant, country) {
  if (!country || typeof country !== "string") return null;
  const code = country.trim().toUpperCase();
  if (!code) return null;
  const profile = getShippingProfile(variant);
  if (!profile) return null;
  const map = loadShippingMap();
  const rate = map?.[profile]?.[code] ?? null;
  if (!rate || !Number.isFinite(rate.rate)) return null;
  return {
    amountCents: Math.round(rate.rate * 100),
    currency: String(rate.currency || map.currency || "USD").toUpperCase(),
  };
}

/**
 * Product cost for a print order including optional card add-on COGS.
 * @param {{ printVariant: string; includeCard?: boolean }} input
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function getConfiguredPrintProductCostCents(input, env = process.env) {
  const base = getConfiguredProductCostCents(input.printVariant, env);
  if (base === null) return null;
  let total = base;
  if (input.includeCard) {
    const card = getConfiguredProductCostCents("card_4x6", env);
    if (card === null) return null;
    total += card;
  }
  return total;
}

/**
 * Aggregate-only comparison of configured COGS defaults vs public catalog base snapshot.
 * Does not change contribution math; for operator diagnostics / JSON report footnotes.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function getConfiguredVsPublicCatalogBaseDeltas(env = process.env) {
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];
  for (const variant of SUPPORTED_PRINT_VARIANTS) {
    const configured = getConfiguredProductCostCents(variant, env);
    const ref = PRINTFUL_PUBLIC_CATALOG_BASE_REFERENCE.variants[variant];
    if (configured === null || !ref) continue;
    rows.push({
      print_variant: variant,
      printful_variant_id: ref.printfulVariantId,
      configured_cogs_cents: configured,
      public_catalog_base_cents: ref.public_catalog_base_cents,
      configured_minus_catalog_base_cents: configured - ref.public_catalog_base_cents,
      catalog_label: ref.catalog_label,
    });
  }
  return {
    observed_at: PRINTFUL_PUBLIC_CATALOG_BASE_REFERENCE.observed_at,
    source: PRINTFUL_PUBLIC_CATALOG_BASE_REFERENCE.source,
    currency: PRINTFUL_PUBLIC_CATALOG_BASE_REFERENCE.currency,
    used_in_contribution_math: false,
    note:
      "Public catalog base is wholesale list price only; contribution uses configured PRINT_COGS_* estimates aligned with printMargin/printCatalog.",
    rows,
  };
}
