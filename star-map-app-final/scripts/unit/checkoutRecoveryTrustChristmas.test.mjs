/**
 * Sales plan coverage: checkout recovery helpers, Love-It Guarantee, Christmas banner phases.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
    promotions: "auto",
  });
  assert.deepEqual(buildCheckoutConsentCollection(false), {});
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
  const {
    LOVE_IT_GUARANTEE_LINE,
    DIGITAL_CHECKOUT_SUPPORT_LINE,
    getLoveItGuaranteeFaq,
  } = await loadTs("src/lib/loveItGuarantee.ts");
  assert.match(LOVE_IT_GUARANTEE_LINE, /Love-It Guarantee/i);
  assert.match(LOVE_IT_GUARANTEE_LINE, /damaged|misprinted/i);
  assert.match(LOVE_IT_GUARANTEE_LINE, /No change-of-mind/i);
  assert.match(DIGITAL_CHECKOUT_SUPPORT_LINE, /HD download right after checkout/i);
  assert.match(DIGITAL_CHECKOUT_SUPPORT_LINE, /support@starmapco\.com/i);
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
  // framed_ca tightened to Dec 3 (decision 2026-10-22): Printful
  // fulfilment 2–5 business days + Canada delivery 3–10 business days
  // can push a Dec 9 order past Christmas; Dec 3 worst case is Dec 24.
  assert.equal(CHRISTMAS_ORDER_BY_DATES.framed_ca, "2026-12-03");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.poster_us, "2026-12-09");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.poster_ca, "2026-12-10");
  // No rest-of-world keys: Printful publishes holiday deadlines per
  // destination country only — the framed 2026-11-30 / poster 2026-12-01
  // figures that used to sit here appear in no Printful source and must
  // never come back. ROW surfaces show "Order early" instead.
  assert.equal("framed_row" in CHRISTMAS_ORDER_BY_DATES, false);
  assert.equal("poster_row" in CHRISTMAS_ORDER_BY_DATES, false);
  // Mug / keepsake card: owner-approved provisional cutoffs (2026-10-18).
  assert.equal(CHRISTMAS_ORDER_BY_DATES.mug_us, "2026-12-07");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.mug_ca, "2026-12-08");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.card_us, "2026-12-07");
  assert.equal(CHRISTMAS_ORDER_BY_DATES.card_ca, "2026-12-08");

  const at = (ymd) => Date.parse(`${ymd}T20:00:00.000Z`);

  // Before Nov 1 → order-by only (no discount codes)
  const oct = at("2026-10-13");
  assert.equal(resolveChristmasBannerPhase(oct), "order_by");
  const orderBy = getChristmasBannerContent(oct, "$9");
  assert.ok(orderBy);
  assert.match(orderBy.message, /Dec 8|Dec 9/i);
  assert.match(orderBy.message, /order early/i);
  // (Dec 1(?!0): the genuine poster Canada date "Dec 10" must not trip this.)
  assert.equal(/Nov 30|Dec 1(?!0)/.test(orderBy.message), false);
  assert.equal(orderBy.promoCode, undefined);
  assert.equal(/XMAS15|BLACKFRIDAY25/.test(orderBy.message), false);

  // Nov 1–26 → XMAS15 + order-by
  for (const day of ["2026-11-01", "2026-11-15", "2026-11-26"]) {
    assert.equal(resolveChristmasBannerPhase(at(day)), "xmas15_early", day);
    const content = getChristmasBannerContent(at(day), "$9");
    assert.match(content.message, /15% off prints/i);
    assert.match(content.message, new RegExp(CHRISTMAS_PROMO.xmas15.code));
    assert.match(content.message, /Order by these dates for Christmas/i);
    assert.equal(content.promoCode, "XMAS15");
    const landing = getChristmasLandingPromo(at(day));
    assert.match(landing.discountLine, /15% off prints/i);
    assert.match(landing.digitalExcludedNote, /prints only/i);
  }

  // Nov 27–29 → Black Friday (Nov 30–Dec 1 is cyber_monday, tested below)
  for (const day of ["2026-11-27", "2026-11-28", "2026-11-29"]) {
    assert.equal(resolveChristmasBannerPhase(at(day)), "black_friday", day);
    const content = getChristmasBannerContent(at(day), "$9");
    assert.match(content.message, /Black Friday:\s*25% off prints/i);
    assert.match(content.message, new RegExp(CHRISTMAS_PROMO.blackFriday.code));
    assert.equal(content.promoCode, "BLACKFRIDAY25");
    assert.equal(/XMAS15/.test(content.message), false);
  }

  // Dec 2–10 → last call XMAS15 + order-by deadlines
  for (const day of ["2026-12-02", "2026-12-05", "2026-12-09", "2026-12-10"]) {
    assert.equal(resolveChristmasBannerPhase(at(day)), "xmas15_last_call", day);
    const content = getChristmasBannerContent(at(day), "$9");
    assert.match(content.message, /Last call:\s*15% off prints/i);
    assert.match(content.message, /XMAS15/);
    assert.match(content.message, /Order by these dates for Christmas/i);
    assert.equal(content.promoCode, "XMAS15");
  }

  // Dec 11–25 → $9 HD digital pitch, no discount
  for (const day of ["2026-12-11", "2026-12-25"]) {
    assert.equal(resolveChristmasBannerPhase(at(day)), "digital_last_minute", day);
    const content = getChristmasBannerContent(at(day), "$9");
    assert.match(content.message, /\$9|HD digital/i);
    assert.equal(content.promoCode, undefined);
    assert.equal(/XMAS15|BLACKFRIDAY25|15%|25%/.test(content.message), false);
    const landing = getChristmasLandingPromo(at(day));
    assert.equal(landing.discountLine, null);
    assert.equal(landing.promoCode, null);
  }

  // Dec 26 → Boxing Day phase (detail in the dedicated test below)
  assert.equal(resolveChristmasBannerPhase(at("2026-12-26")), "boxing_day");

  // Dec 27 onward → hidden (off-season)
  const dec27 = at("2026-12-27");
  assert.equal(resolveChristmasBannerPhase(dec27), "hidden");
  assert.equal(getChristmasBannerContent(dec27, "$9"), null);
});

test("Christmas cyber monday and boxing day phases (boundaries + copy)", async () => {
  const {
    resolveChristmasBannerPhase,
    getChristmasBannerContent,
    getChristmasLandingPromo,
    getChristmasDigitalPitchLine,
  } = await loadTs("src/lib/christmasCampaign.ts");

  const at = (ymd) => Date.parse(`${ymd}T20:00:00.000Z`);

  // Nov 29 is the last Black Friday day; Nov 30–Dec 1 is Cyber Monday,
  // presenting the same BLACKFRIDAY25 code with Cyber Monday framing.
  assert.equal(resolveChristmasBannerPhase(at("2026-11-29")), "black_friday");
  for (const day of ["2026-11-30", "2026-12-01"]) {
    assert.equal(resolveChristmasBannerPhase(at(day)), "cyber_monday", day);
    const content = getChristmasBannerContent(at(day), "$9");
    assert.match(content.message, /Cyber Monday:\s*25% off prints/i);
    assert.equal(content.promoCode, "BLACKFRIDAY25");
    assert.equal(content.promoPercent, 25);
    assert.equal(/XMAS15/.test(content.message), false);
    const landing = getChristmasLandingPromo(at(day));
    assert.match(landing.discountLine, /Cyber Monday: 25% off prints/i);
    assert.equal(landing.promoCode, "BLACKFRIDAY25");
    assert.equal(landing.showOrderBy, true);
  }
  // Dec 2 hands back to last call, unchanged.
  assert.equal(resolveChristmasBannerPhase(at("2026-12-02")), "xmas15_last_call");

  // Dec 26 → Boxing Day: XMAS15 (coupon carries no redeem_by expiry) with
  // Boxing Day framing only — Christmas delivery has passed, so no
  // order-by content and no Christmas-delivery promises anywhere.
  const dec26 = at("2026-12-26");
  assert.equal(resolveChristmasBannerPhase(dec26), "boxing_day");
  const content = getChristmasBannerContent(dec26, "$9");
  assert.ok(content);
  assert.match(content.message, /Boxing Day:\s*15% off prints/i);
  assert.equal(content.promoCode, "XMAS15");
  assert.equal(content.promoPercent, 15);
  assert.equal(/Christmas delivery|Order by these dates/i.test(content.message), false);
  const landing = getChristmasLandingPromo(dec26);
  assert.match(landing.discountLine, /Boxing Day: 15% off prints/i);
  assert.equal(landing.promoCode, "XMAS15");
  assert.equal(landing.showOrderBy, false);
  // Regression (Codex P2 on #309): the landing must not render the digital
  // pitch on Dec 26. The only pitch line is Christmas-framed — it reads
  // "last-minute gift through December 25" — which is expired copy under a
  // Boxing Day sale. Lock the helper's framing (so this guard stays
  // meaningful), lock the flag off, then compose everything the page
  // would show for Dec 26 (the pitch renders only when the flag is true)
  // and assert no trace of the stale pitch or Christmas-delivery framing.
  assert.match(getChristmasDigitalPitchLine("$9"), /December 25/);
  assert.equal(landing.showDigitalPitch, false);
  const dec26VisibleCopy = [
    content.message,
    landing.heading,
    landing.discountLine ?? "",
    landing.showDigitalPitch ? getChristmasDigitalPitchLine("$9") : "",
  ].join("\n");
  assert.equal(/December 25/.test(dec26VisibleCopy), false);
  assert.equal(/Christmas delivery|last-minute gift/i.test(dec26VisibleCopy), false);

  // Dec 27 onward is off-season.
  assert.equal(resolveChristmasBannerPhase(at("2026-12-27")), "hidden");
  assert.equal(getChristmasBannerContent(at("2026-12-27"), "$9"), null);
});

test("Christmas promo publicity flag defaults on; FAQ answer names the phase's code only", async () => {
  const { CHRISTMAS_PROMO, CHRISTMAS_PROMO_PUBLICITY, getChristmasPromoCodesFaqAnswer } =
    await loadTs("src/lib/christmasCampaign.ts");

  assert.equal(CHRISTMAS_PROMO_PUBLICITY, true);
  // Source offer mapping the named codes derive from. The FAQ sentence
  // itself carries no percentage; the depths live on the offers.
  assert.deepEqual(CHRISTMAS_PROMO.xmas15, { code: "XMAS15", percent: 15 });
  assert.deepEqual(CHRISTMAS_PROMO.blackFriday, { code: "BLACKFRIDAY25", percent: 25 });

  const XMAS15_ANSWER =
    "No. Seasonal codes such as XMAS15 apply to prints only. HD digital is excluded from those promotions.";
  const BLACK_FRIDAY_ANSWER =
    "No. Seasonal codes such as BLACKFRIDAY25 apply to prints only. HD digital is excluded from those promotions.";
  const NO_CODE_ANSWER =
    "No. Seasonal codes apply to prints only. HD digital is excluded from those promotions.";

  // Explicit Pacific-date clocks (20:00Z is midday in America/Los_Angeles),
  // never the real clock: the FAQ must name exactly the one code the
  // banner/landing builders publicise in the resolved phase — never both
  // codes, never the other phase's code.
  const at = (ymd) => Date.parse(`${ymd}T20:00:00.000Z`);
  const matrix = [
    // xmas15_early: Nov 1–26
    ["2026-11-01", XMAS15_ANSWER],
    ["2026-11-15", XMAS15_ANSWER],
    ["2026-11-26", XMAS15_ANSWER],
    // black_friday: Nov 27–29
    ["2026-11-27", BLACK_FRIDAY_ANSWER],
    ["2026-11-28", BLACK_FRIDAY_ANSWER],
    ["2026-11-29", BLACK_FRIDAY_ANSWER],
    // cyber_monday, including its extension day: Nov 30–Dec 1
    ["2026-11-30", BLACK_FRIDAY_ANSWER],
    ["2026-12-01", BLACK_FRIDAY_ANSWER],
    // xmas15_last_call: Dec 2–10
    ["2026-12-02", XMAS15_ANSWER],
    ["2026-12-05", XMAS15_ANSWER],
    ["2026-12-09", XMAS15_ANSWER],
    ["2026-12-10", XMAS15_ANSWER],
    // boxing_day: Dec 26
    ["2026-12-26", XMAS15_ANSWER],
    // order_by: Oct 1–31
    ["2026-10-01", NO_CODE_ANSWER],
    ["2026-10-31", NO_CODE_ANSWER],
    // digital_last_minute: Dec 11–25
    ["2026-12-11", NO_CODE_ANSWER],
    ["2026-12-25", NO_CODE_ANSWER],
    // hidden: before Oct 1 and from Dec 27
    ["2026-09-30", NO_CODE_ANSWER],
    ["2026-12-27", NO_CODE_ANSWER],
  ];
  for (const [ymd, expected] of matrix) {
    const answer = getChristmasPromoCodesFaqAnswer(at(ymd));
    assert.equal(answer, expected, `FAQ answer at ${ymd}`);
    if (expected === XMAS15_ANSWER) {
      assert.equal(answer.includes("BLACKFRIDAY25"), false, `must not name BLACKFRIDAY25 at ${ymd}`);
    }
    if (expected === BLACK_FRIDAY_ANSWER) {
      assert.equal(answer.includes("XMAS15"), false, `must not name XMAS15 at ${ymd}`);
    }
    if (expected === NO_CODE_ANSWER) {
      assert.equal(/XMAS15|BLACKFRIDAY25/.test(answer), false, `must name neither code at ${ymd}`);
    }
  }
});

test("Christmas promo FAQ answer names no code in any phase while publicity is off", async () => {
  // CHRISTMAS_PROMO_PUBLICITY is a shipped source constant, not a runtime
  // toggle, so the OFF behaviour is exercised through an isolated variant
  // of the module with the constant flipped. The shipped default is not
  // changed and no production runtime toggle is introduced.
  const source = fs.readFileSync(path.join(ROOT, "src/lib/christmasCampaign.ts"), "utf8");
  assert.match(source, /export const CHRISTMAS_PROMO_PUBLICITY = true;/);
  const variantDir = fs.mkdtempSync(path.join(os.tmpdir(), "christmas-campaign-publicity-off-"));
  const variantPath = path.join(variantDir, "christmasCampaign.ts");
  fs.writeFileSync(
    variantPath,
    source.replace(
      "export const CHRISTMAS_PROMO_PUBLICITY = true;",
      "export const CHRISTMAS_PROMO_PUBLICITY = false;"
    )
  );
  try {
    const variant = await import(pathToFileURL(variantPath).href);
    assert.equal(variant.CHRISTMAS_PROMO_PUBLICITY, false);
    const NO_CODE_ANSWER =
      "No. Seasonal codes apply to prints only. HD digital is excluded from those promotions.";
    const at = (ymd) => Date.parse(`${ymd}T20:00:00.000Z`);
    // Every phase — promo phases, Boxing Day, and both hidden windows —
    // falls back to the code-free answer while publicity is off.
    for (const ymd of [
      "2026-09-30",
      "2026-10-01",
      "2026-10-31",
      "2026-11-01",
      "2026-11-15",
      "2026-11-26",
      "2026-11-27",
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-10",
      "2026-12-11",
      "2026-12-25",
      "2026-12-26",
      "2026-12-27",
    ]) {
      const answer = variant.getChristmasPromoCodesFaqAnswer(at(ymd));
      assert.equal(answer, NO_CODE_ANSWER, `publicity-off FAQ answer at ${ymd}`);
      assert.equal(/XMAS15|BLACKFRIDAY25/.test(answer), false, `must name no code at ${ymd}`);
    }
  } finally {
    fs.rmSync(variantDir, { recursive: true, force: true });
  }
});

test("Christmas order-by table rows derive from CHRISTMAS_ORDER_BY_DATES", async () => {
  const { getChristmasOrderByTableRows } = await loadTs("src/lib/christmasCampaign.ts");

  const rows = getChristmasOrderByTableRows();
  assert.deepEqual(
    rows.map((row) => row.product),
    ["Framed print", "Canvas wrap", "Unframed poster", "Mug", "Keepsake card", "HD digital download"]
  );
  const byProduct = new Map(rows.map((row) => [row.product, row]));

  const framed = byProduct.get("Framed print");
  assert.equal(framed.canada, "Dec 3");
  assert.equal(framed.unitedStates, "Dec 8");
  // No rest-of-world date is published for framed/poster/canvas —
  // Printful sets deadlines per destination country only — so, exactly
  // like mug and card below, the cell says "Order early".
  assert.equal(framed.restOfWorld, "Order early");
  assert.equal(framed.instantNote, null);

  // Canvas has no cutoff key of its own — it shares the framed dates.
  const canvas = byProduct.get("Canvas wrap");
  assert.equal(canvas.canada, framed.canada);
  assert.equal(canvas.unitedStates, framed.unitedStates);
  assert.equal(canvas.restOfWorld, framed.restOfWorld);

  const poster = byProduct.get("Unframed poster");
  assert.equal(poster.canada, "Dec 10");
  assert.equal(poster.unitedStates, "Dec 9");
  assert.equal(poster.restOfWorld, "Order early");

  // Mug + keepsake card: owner-approved provisional CA Dec 8 / US Dec 7.
  // No rest-of-world date is confirmed — the cell must say "Order early",
  // never an invented date.
  const mug = byProduct.get("Mug");
  assert.equal(mug.canada, "Dec 8");
  assert.equal(mug.unitedStates, "Dec 7");
  assert.equal(mug.restOfWorld, "Order early");
  assert.equal(mug.instantNote, null);

  const card = byProduct.get("Keepsake card");
  assert.equal(card.canada, "Dec 8");
  assert.equal(card.unitedStates, "Dec 7");
  assert.equal(card.restOfWorld, "Order early");
  assert.equal(card.instantNote, null);

  const digital = byProduct.get("HD digital download");
  assert.equal(digital.canada, null);
  assert.equal(digital.unitedStates, null);
  assert.equal(digital.restOfWorld, null);
  assert.match(digital.instantNote, /download right after checkout/i);
});

test("Christmas order-by summary lines carry no rest-of-world dates", async () => {
  const { getChristmasOrderBySummaryLines } = await loadTs("src/lib/christmasCampaign.ts");

  // These lines feed the landing-page bullets AND the "What are the
  // Christmas order-by dates?" FAQ (visible copy + FaqSchema JSON-LD),
  // so they get the same guarantee as the table: CA/US dates present,
  // rest of world is "order early", never an invented date.
  const lines = getChristmasOrderBySummaryLines();
  // U05: the bullets lead with the earliest cutoff per country —
  // framed prints & canvas wraps in Canada (Dec 3 since the 2026-10-22
  // tightening), mugs & keepsake cards in the US (Dec 7) — ahead of the
  // framed/poster lines.
  assert.deepEqual(lines, [
    "Earliest cutoffs: United States Dec 7 (mugs & keepsake cards) · Canada Dec 3 (framed prints & canvas wraps) · rest of world: order early",
    "Framed & canvas: United States Dec 8 · Canada Dec 3 · rest of world: order early",
    "Posters: United States Dec 9 · Canada Dec 10 · rest of world: order early",
  ]);
  assert.equal(/Nov 30|Dec 1(?!0)/.test(lines.join(" ")), false);
});

test("earliest Christmas cutoff derives from CHRISTMAS_ORDER_BY_DATES (U05)", async () => {
  const { getEarliestChristmasCutoff, getChristmasBannerContent } = await loadTs(
    "src/lib/christmasCampaign.ts"
  );

  // Framed print + canvas wrap hold the tightest Canada deadline
  // (Dec 3); mug + keepsake card hold the tightest US one (Dec 7).
  // A product is listed in `products` when it holds either country's
  // earliest date; the per-country lists keep each country's holders
  // with its own date (a combined label read as a second, wrong US
  // framed date — Dec 7 beside the framed line's Dec 8).
  assert.deepEqual(getEarliestChristmasCutoff(), {
    products: ["Framed print", "Canvas wrap", "Mug", "Keepsake card"],
    canadaProducts: ["Framed print", "Canvas wrap"],
    unitedStatesProducts: ["Mug", "Keepsake card"],
    canada: "Dec 3",
    unitedStates: "Dec 7",
  });

  // The sitewide banner's order-by summary carries that earliest
  // cutoff — the loudest surface names the tightest deadline, in the
  // plain order-by phase and in the promo phases that reuse the line.
  const at = (ymd) => Date.parse(`${ymd}T20:00:00.000Z`);
  const orderByPhase = getChristmasBannerContent(at("2026-10-13"), "$9");
  assert.match(orderByPhase.message, /earliest cutoffs: US Dec 7 \(mugs & keepsake cards\) · Canada Dec 3 \(framed prints & canvas wraps\)/);
  const earlyPhase = getChristmasBannerContent(at("2026-11-15"), "$9");
  assert.match(earlyPhase.message, /earliest cutoffs: US Dec 7 \(mugs & keepsake cards\) · Canada Dec 3 \(framed prints & canvas wraps\)/);
});

test("christmas order-by table wiring: page, component, footer and home links", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/christmas-star-map-gift/page.tsx"), "utf8");
  assert.match(page, /ChristmasOrderByTable/);
  assert.match(page, /getChristmasPromoCodesFaqAnswer/);
  // The FAQ getter receives the page's effective campaign clock — the
  // same clockMs the landing promo builder gets — so the FAQ answer,
  // promo box, URL overrides, and schema input resolve the same phase.
  assert.match(page, /getChristmasPromoCodesFaqAnswer\(clockMs\)/);
  // Visible FAQ rendering and the FaqSchema input are both fed by the one
  // shared faqItems array, so both carry the same phase-correct answer.
  assert.match(page, /\{faqItems\.map\(\(item\) => \(/);
  assert.match(page, /<FaqSchema items=\{faqItems\.map\(/);
  // The landing page must not name the codes itself — they come from the
  // campaign lib so CHRISTMAS_PROMO_PUBLICITY gates every display surface.
  assert.equal(/XMAS15|BLACKFRIDAY25/.test(page), false);

  const component = fs.readFileSync(path.join(ROOT, "src/components/ChristmasOrderByTable.tsx"), "utf8");
  assert.match(component, /getChristmasOrderByTableRows/);
  // U05: no horizontal scroller at any width — small screens get the
  // per-country stacked blocks (every product × both countries visible
  // at 360px), the full table renders at sm+ only.
  assert.equal(/overflow-x-auto|min-w-\[540px\]/.test(component), false);
  assert.match(component, /data-testid="christmas-order-by-stacked"/);
  assert.match(component, /sm:hidden/);
  assert.match(component, /data-testid="christmas-order-by-table"/);
  assert.match(component, /hidden[\s\S]{0,200}sm:block/);
  // Dates must come from the lib, never hardcoded in the component.
  assert.equal(/Dec (8|9|10)|Nov 30/.test(component), false);

  const layout = fs.readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");
  assert.match(layout, /label: "Christmas Gifts", href: "\/christmas-star-map-gift"/);
  assert.match(layout, /isChristmasLandingInSeason/);

  const home = fs.readFileSync(path.join(ROOT, "src/app/HomeStaticSections.tsx"), "utf8");
  assert.match(home, /href="\/christmas-star-map-gift"/);
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
  const sitemapEntries = fs.readFileSync(path.join(ROOT, "src/lib/buildSitemapEntries.ts"), "utf8");
  assert.match(sitemapEntries, /christmas-star-map-gift/);
});

test("customer photo strip is feature-flagged and does not invent reviews", () => {
  const strip = fs.readFileSync(path.join(ROOT, "src/components/CustomerPhotoStrip.tsx"), "utf8");
  assert.match(strip, /isCustomerPhotoStripEnabled/);
  assert.match(strip, /No placeholder/);
  assert.equal(/Trustpilot|★★★★★|fake review/i.test(strip), false);
});
