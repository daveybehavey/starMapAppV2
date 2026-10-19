/**
 * HD pricing ladder (David, confirmed 2026-10-19): single $9 / 3-pack $19 /
 * Unlimited $19/mo / print HD add-on $7. The only change in this round is
 * the 3-pack: $10 -> $19. At $10 the pack priced extra maps at ~$0.50 each
 * and made the single irrational; at $19 the pack is $6.33/map, a ~30%
 * saving vs three singles, and Unlimited is the tier that wins at
 * 3+ maps/month.
 *
 * pricing.ts cannot be imported by the plain-Node unit runner (it pulls
 * "@/lib/printCatalog" through the alias), so the ladder is pinned by
 * source construction — the same pattern as pricingCurrencyLabel.test.mjs —
 * and the derived copy math is pinned arithmetically below.
 *
 * CHARGE-PATH NOTE (gate): the code defaults pinned here drive the site
 * display, the analytics fallbacks, and the checkout price_data fallback.
 * Production checkout PREFERS the Stripe Price object configured via
 * STRIPE_PRICE_ID_PACK3 (see the route pins below) — the $19 charge only
 * goes live when that env var points at a $19 Stripe price. The final
 * pins keep that preference intact so the two can never silently diverge
 * in the other direction either.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");

function readApp(relativePath) {
  return fs.readFileSync(path.join(APP_ROOT, relativePath), "utf8");
}
function readSrc(relativePath) {
  return readApp(path.join("src", relativePath));
}

const LADDER = { single: 900, pack3: 1900, subscription: 1900, printAddon: 700 };

test("pricing.ts defaults pin the confirmed ladder ($9 / $19 / $19 / $7)", () => {
  const src = readSrc("lib/pricing.ts");
  assert.match(src, /parseIntEnv\("PACK3_PRICE_CENTS", 1900\)/);
  assert.match(src, /parseIntEnv\("SUBSCRIPTION_PRICE_CENTS", 1900\)/);
  assert.match(src, /parseIntEnv\("PRINT_DIGITAL_ADDON_PRICE_CENTS", 700\)/);
  // Single stays $9: the legacy base fallback is 900 and PRICE_SINGLE_CENTS
  // inherits it when unset.
  assert.match(src, /parseIntEnv\("PRICE_CENTS", 900\)/);
  // No stale $10 pack default may survive anywhere in the pricing core.
  assert.doesNotMatch(src, /PACK3[^\n]*\b1000\b/);
});

test("analytics fallbacks agree with the ladder (no drift between the three defaults)", () => {
  const analytics = readSrc("lib/analytics.ts");
  assert.match(analytics, /getPublicNumber\("NEXT_PUBLIC_PACK3_PRICE_CENTS", 1900\)/);
  assert.match(analytics, /getPublicNumber\("NEXT_PUBLIC_PRICE_SINGLE_CENTS", 900\)/);
  assert.match(analytics, /getPublicNumber\("NEXT_PUBLIC_SUBSCRIPTION_PRICE_CENTS", 1900\)/);
  assert.match(analytics, /getPublicNumber\("NEXT_PUBLIC_PRINT_DIGITAL_ADDON_PRICE_CENTS", 700\)/);

  const ga4 = readSrc("lib/ga4MeasurementProtocol.ts");
  assert.match(ga4, /getPublicNumber\("PACK3_PRICE_CENTS", 1900\)/);
  assert.doesNotMatch(ga4, /PACK3[^\n]*\b1000\b/);
});

test("homepage savings percent is derived from the tiers, never hardcoded", () => {
  const page = readSrc("app/page.tsx");
  assert.match(page, /\(1 - tiers\.pack3\.amountCents \/ Math\.max\(1, tiers\.single\.amountCents \* 3\)\) \* 100/);
});

test("derived pack math at the confirmed ladder is truthful", () => {
  // $19 for 3 credits = $6.33 per map.
  assert.equal((LADDER.pack3 / 3 / 100).toFixed(2), "6.33");
  // Saving vs three $9 singles, using the homepage's own formula: 30%.
  const savingsPercent = Math.round((1 - LADDER.pack3 / (LADDER.single * 3)) * 100);
  assert.equal(savingsPercent, 30);
  // The pack still saves money vs singles (never a negative or zero claim).
  assert.ok(LADDER.pack3 < LADDER.single * 3);
});

test("checkout keeps the Stripe Price-ID preference for pack3 (production charge gate)", () => {
  const route = readSrc("app/api/checkout/route.ts");
  assert.match(route, /pack3: process\.env\.STRIPE_PRICE_ID_PACK3/);
  assert.match(route, /const useDigitalPriceId = Boolean\(digitalPriceId\) && !useGeoDigitalSinglePricing;/);
  // The price_data fallback (used when no Price ID is configured) charges
  // the tier amount — which is the PACK3 default pinned above.
  assert.match(route, /effectivePlan === "pack3" \? "HD Star Map Export Credits \(3\)"/);
});

test("wrangler.toml configures the exact pack3 Stripe Price ID for the $19 ladder", () => {
  const wrangler = readApp("wrangler.toml");
  // Pinned to the exact ID on purpose: the price object is a deliberate
  // rollout artifact — created for this ladder change and verified
  // against Stripe on 2026-10-19 ($19.00 USD, one-time, same product as
  // the retired $10 price). A silent repoint would change what buyers
  // are charged while every other pin still passed; if the price is
  // ever repointed deliberately, update this pin in the same change.
  assert.match(wrangler, /^STRIPE_PRICE_ID_PACK3 = "price_1USLXuLWqD0o9865w9H6msaa"/m);
  // Display-side pack env must NOT be pinned in wrangler.toml: the code
  // default is the single source for display, so the two flip together.
  assert.doesNotMatch(wrangler, /^PACK3_PRICE_CENTS =/m);
  assert.doesNotMatch(wrangler, /^NEXT_PUBLIC_PACK3_PRICE_CENTS =/m);
});
