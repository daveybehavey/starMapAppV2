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
  }),
  poster_framed: Object.freeze({
    cogsEnv: "PRINT_COGS_POSTER_FRAMED_CENTS",
    defaultCogsCents: 5200,
    shippingProfile: "poster_framed",
  }),
  canvas_wrap: Object.freeze({
    cogsEnv: "PRINT_COGS_CANVAS_WRAP_CENTS",
    defaultCogsCents: 2800,
    shippingProfile: "poster_framed",
  }),
  mug_11oz: Object.freeze({
    cogsEnv: "PRINT_COGS_MUG_11OZ_CENTS",
    defaultCogsCents: 1200,
    shippingProfile: "poster_unframed",
  }),
  card_4x6: Object.freeze({
    cogsEnv: "PRINT_COGS_CARD_4X6_CENTS",
    defaultCogsCents: 450,
    shippingProfile: "poster_unframed",
  }),
});

export const SUPPORTED_PRINT_VARIANTS = Object.freeze(Object.keys(PRINT_VARIANT_COST_ROWS).sort());

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
