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
  const nowSec = Math.floor(now / 1000);
  assert.equal(getCheckoutSessionExpiresAt(now), nowSec - (nowSec % 300) + CHECKOUT_SESSION_TTL_SECONDS);
  // Stripe minimum is 30 minutes; quantized TTL must stay well above it.
  assert.ok(getCheckoutSessionExpiresAt(now) - nowSec >= CHECKOUT_SESSION_TTL_SECONDS - 300);
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

test("Christmas campaign now override parses YYYY-MM-DD and ISO", async () => {
  const { parseChristmasCampaignNowOverride, resolveChristmasCampaignNowMs, getPacificCalendarDate } =
    await loadTs("src/lib/christmasCampaign.ts");

  assert.equal(parseChristmasCampaignNowOverride(""), null);
  assert.equal(parseChristmasCampaignNowOverride("not-a-date"), null);
  const fromYmd = parseChristmasCampaignNowOverride("2026-11-15");
  assert.ok(typeof fromYmd === "number");
  assert.equal(getPacificCalendarDate(fromYmd), "2026-11-15");

  const fromIso = parseChristmasCampaignNowOverride("2026-11-28T15:30:00-08:00");
  assert.ok(typeof fromIso === "number");
  assert.equal(getPacificCalendarDate(fromIso), "2026-11-28");

  const forced = resolveChristmasCampaignNowMs({ nowMs: 1_700_000_000_000 });
  assert.equal(forced, 1_700_000_000_000);
  const viaOverride = resolveChristmasCampaignNowMs({ override: "2026-12-05" });
  assert.equal(getPacificCalendarDate(viaOverride), "2026-12-05");
});

test("Christmas banner discount windows (Pacific) cover each promo phase", async () => {
  const {
    resolveChristmasBannerPhase,
    getChristmasBannerContent,
    getChristmasLandingPromo,
    CHRISTMAS_ORDER_BY_DATES,
    CHRISTMAS_PROMO,
  } = await loadTs("src/lib/christmasCampaign.ts");

  assert.equal(CHRISTMAS_ORDER_BY_DATES.framed_us, "2026-12-08");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.framed_ca, "2026-12-09");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.framed_row, "2026-11-30");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.poster_us, "2026-12-09");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.poster_ca, "2026-12-10");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.poster_row, "2026-12-01");

  const at = (ymd) => Date.parse(`${ymd}T20:00:00.000Z`);

  // Before Nov 1 → order-by only (no discount codes)
  const oct = at("2026-10-13");
  assert.equal(resolveChristmasBannerPhase(oct), "order_by");
  const orderBy = getChristmasBannerContent(oct, "$9");
  assert.ok(orderBy);
  assert.match(orderBy.message, /Dec 8|Dec 9|Nov 30/i);
  assert.equal(orderBy.promoCode, undefined);
  assert.equal(/XMAS15|BLACKFRIDAY20/.test(orderBy.message), false);

  // Nov 1–27 → XMAS15 + order-by
  for (const day of ["2026-11-01", "2026-11-15", "2026-11-27"]) {
    assert.equal(resolveChristmasBannerPhase(at(day)), "xmas15_early", day);
    const content = getChristmasBannerContent(at(day), "$9");
    assert.match(content.message, /15% off prints/i);
    assert.match(content.message, new RegExp(CHRISTMAS_PROMO.xmas15.code));
    assert.match(content.message, /Order by for Christmas/i);
    assert.equal(content.promoCode, "XMAS15");
    const landing = getChristmasLandingPromo(at(day));
    assert.match(landing.discountLine, /15% off prints/i);
    assert.match(landing.digitalExcludedNote, /prints only/i);
  }

  // Nov 28–Dec 1 → Black Friday
  for (const day of ["2026-11-28", "2026-11-30", "2026-12-01"]) {
    assert.equal(resolveChristmasBannerPhase(at(day)), "black_friday", day);
    const content = getChristmasBannerContent(at(day), "$9");
    assert.match(content.message, /Black Friday:\s*20% off prints/i);
    assert.match(content.message, new RegExp(CHRISTMAS_PROMO.blackFriday.code));
    assert.equal(content.promoCode, "BLACKFRIDAY20");
    assert.equal(/XMAS15/.test(content.message), false);
  }

  // Dec 2–9 → last call XMAS15 + order-by deadlines
  for (const day of ["2026-12-02", "2026-12-05", "2026-12-09"]) {
    assert.equal(resolveChristmasBannerPhase(at(day)), "xmas15_last_call", day);
    const content = getChristmasBannerContent(at(day), "$9");
    assert.match(content.message, /Last call:\s*15% off prints/i);
    assert.match(content.message, /XMAS15/);
    assert.match(content.message, /Order by for Christmas/i);
    assert.equal(content.promoCode, "XMAS15");
  }

  // Dec 10/11–25 → $9 HD instant pitch, no discount
  for (const day of ["2026-12-10", "2026-12-11", "2026-12-25"]) {
    assert.equal(resolveChristmasBannerPhase(at(day)), "digital_last_minute", day);
    const content = getChristmasBannerContent(at(day), "$9");
    assert.match(content.message, /\$9|instant HD/i);
    assert.equal(content.promoCode, undefined);
    assert.equal(/XMAS15|BLACKFRIDAY20|15%|20%/.test(content.message), false);
    const landing = getChristmasLandingPromo(at(day));
    assert.equal(landing.discountLine, null);
    assert.equal(landing.promoCode, null);
  }

  // After Christmas → hidden
  const dec26 = at("2026-12-26");
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
