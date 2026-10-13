/**
 * Sales plan coverage: checkout recovery helpers, Love-It Guarantee, Christmas banner phases.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function loadTs(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

test("normalizeCheckoutCustomerEmail accepts valid emails and rejects junk", async () => {
  const { normalizeCheckoutCustomerEmail } = await loadTs("src/lib/checkoutCustomerEmail.ts");
  assert.equal(normalizeCheckoutCustomerEmail("  Buyer@Example.COM "), "buyer@example.com");
  assert.equal(normalizeCheckoutCustomerEmail(""), undefined);
  assert.equal(normalizeCheckoutCustomerEmail("not-an-email"), undefined);
  assert.equal(normalizeCheckoutCustomerEmail(null), undefined);
});

test("checkout session expires_at is ~2 hours from now", async () => {
  const { CHECKOUT_SESSION_TTL_SECONDS, getCheckoutSessionExpiresAt } = await loadTs(
    "src/lib/checkoutSessionExpiry.ts"
  );
  assert.equal(CHECKOUT_SESSION_TTL_SECONDS, 2 * 60 * 60);
  const now = Date.UTC(2026, 9, 13, 12, 0, 0);
  assert.equal(getCheckoutSessionExpiresAt(now), Math.floor(now / 1000) + CHECKOUT_SESSION_TTL_SECONDS);
});

test("promotions consent is optional and errors are detected", async () => {
  const {
    buildCheckoutConsentCollection,
    isPromotionsConsentUnsupportedError,
    shouldAttemptPromotionsConsent,
  } = await loadTs("src/lib/stripeConsentCollection.ts");

  assert.deepEqual(buildCheckoutConsentCollection(true), {
    terms_of_service: "required",
    promotions: "auto",
  });
  assert.deepEqual(buildCheckoutConsentCollection(false), {
    terms_of_service: "required",
  });
  assert.equal(typeof shouldAttemptPromotionsConsent(), "boolean");
  assert.equal(
    isPromotionsConsentUnsupportedError({
      param: "consent_collection[promotions]",
      message: "This account does not support promotions",
    }),
    true
  );
  assert.equal(isPromotionsConsentUnsupportedError({ message: "rate limited" }), false);
});

test("Love-It Guarantee copy is damage/misprint only", async () => {
  const { LOVE_IT_GUARANTEE_LINE, getLoveItGuaranteeFaq } = await loadTs("src/lib/loveItGuarantee.ts");
  assert.match(LOVE_IT_GUARANTEE_LINE, /Love-It Guarantee/i);
  assert.match(LOVE_IT_GUARANTEE_LINE, /damaged|misprinted/i);
  assert.match(LOVE_IT_GUARANTEE_LINE, /No change-of-mind/i);
  const faq = getLoveItGuaranteeFaq();
  assert.match(faq.answer, /reprint/i);
  assert.match(faq.answer, /change-of-mind/i);
});

test("Christmas banner phases follow order-by then digital last-minute then hide", async () => {
  const { resolveChristmasBannerPhase, getChristmasBannerContent, CHRISTMAS_ORDER_BY_DATES } =
    await loadTs("src/lib/christmasCampaign.ts");

  assert.equal(CHRISTMAS_ORDER_BY_DATES.framed_us, "2026-12-08");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.framed_ca, "2026-12-09");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.framed_row, "2026-11-30");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.poster_us, "2026-12-09");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.poster_ca, "2026-12-10");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.poster_row, "2026-12-01");

  // Mid-campaign (Oct) → order-by message
  const oct = Date.parse("2026-10-13T18:00:00-07:00");
  assert.equal(resolveChristmasBannerPhase(oct), "order_by");
  const orderBy = getChristmasBannerContent(oct, "$9");
  assert.ok(orderBy);
  assert.match(orderBy.message, /Dec 8|Dec 9|Nov 30/i);

  // Dec 11 → digital last-minute
  const dec11 = Date.parse("2026-12-11T12:00:00-08:00");
  assert.equal(resolveChristmasBannerPhase(dec11), "digital_last_minute");
  const digital = getChristmasBannerContent(dec11, "$9");
  assert.ok(digital);
  assert.match(digital.message, /\$9|instant HD/i);

  // After Christmas → hidden
  const dec26 = Date.parse("2026-12-26T12:00:00-08:00");
  assert.equal(resolveChristmasBannerPhase(dec26), "hidden");
  assert.equal(getChristmasBannerContent(dec26), null);
});

test("webhook route logs checkout_session_expired without inventing promo codes", () => {
  const webhook = fs.readFileSync(path.join(ROOT, "src/app/api/stripe/webhook/route.ts"), "utf8");
  assert.match(webhook, /checkout_session_expired/);
  assert.match(webhook, /hasCustomerEmail/);
  assert.match(webhook, /recoveryEligible/);
  const checkout = fs.readFileSync(path.join(ROOT, "src/app/api/checkout/route.ts"), "utf8");
  assert.equal(/promotionCodes\.create|coupons\.create/.test(checkout), false);
});

test("christmas landing page and sitemap entry exist", () => {
  const pagePath = path.join(ROOT, "src/app/christmas-star-map-gift/page.tsx");
  assert.ok(fs.existsSync(pagePath));
  const page = fs.readFileSync(pagePath, "utf8");
  assert.match(page, /Christmas order-by dates/);
  assert.match(page, /LOVE_IT_GUARANTEE_LINE/);
  const sitemap = fs.readFileSync(path.join(ROOT, "src/app/sitemap.ts"), "utf8");
  assert.match(sitemap, /christmas-star-map-gift/);
});

test("customer photo strip is feature-flagged and does not invent reviews", () => {
  const strip = fs.readFileSync(path.join(ROOT, "src/components/CustomerPhotoStrip.tsx"), "utf8");
  assert.match(strip, /isCustomerPhotoStripEnabled/);
  assert.match(strip, /No placeholder/);
  assert.equal(/Trustpilot|★★★★★|fake review/i.test(strip), false);
});
