#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import Stripe from "stripe";
import { chromium } from "playwright";
import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

const DEFAULT_SITE = "https://starmapco.com";
const DEFAULT_VARIANT = "poster_framed";
const DEFAULT_COUNTRY = "US";
const MINIMAL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function parseArgs(argv) {
  const args = {
    site: DEFAULT_SITE,
    headless: true,
    out: "reports/live-print-conversion-qa.json",
    createPromo: true,
    forcePromoField: false,
    promoCode: (process.env.QA_PROMO_CODE || "").trim(),
    printVariant: DEFAULT_VARIANT,
    shippingCountry: DEFAULT_COUNTRY,
    includeDigitalAddOn: true,
    preflightOnly: false,
    allowMarginBlock: false,
    uiFlow: false,
    checkoutOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--site" && next) {
      args.site = next.replace(/\/+$/, "");
      i += 1;
      continue;
    }
    if (token === "--out" && next) {
      args.out = next;
      i += 1;
      continue;
    }
    if (token === "--print-variant" && next) {
      args.printVariant = next.trim();
      i += 1;
      continue;
    }
    if (token === "--shipping-country" && next) {
      args.shippingCountry = next.trim().toUpperCase();
      i += 1;
      continue;
    }
    if (token === "--no-digital-addon") {
      args.includeDigitalAddOn = false;
      continue;
    }
    if (token === "--headed") {
      args.headless = false;
      continue;
    }
    if (token === "--no-promo") {
      args.createPromo = false;
      args.promoCode = "";
      continue;
    }
    if (token === "--promo-code" && next) {
      args.promoCode = next.trim();
      i += 1;
      continue;
    }
    if (token === "--promo-field") {
      args.forcePromoField = true;
      continue;
    }
    if (token === "--preflight-only") {
      args.preflightOnly = true;
      continue;
    }
    if (token === "--allow-margin-block") {
      args.allowMarginBlock = true;
      continue;
    }
    if (token === "--ui-flow") {
      args.uiFlow = true;
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

function usage() {
  return `Usage:
  node scripts/live-print-conversion-qa.mjs [options]

Options:
  --site <url>                 Default ${DEFAULT_SITE}
  --print-variant <id>         poster_framed | poster_unframed (default ${DEFAULT_VARIANT})
  --shipping-country <CC>      ISO country (default ${DEFAULT_COUNTRY})
  --no-digital-addon           Checkout framed/unframed print only (no HD add-on)
  --promo-code <code>          Existing Stripe promotion code (or QA_PROMO_CODE env)
  --no-promo                   Skip promo (full-price live checkout; card required)
  --promo-field                Apply promo via Stripe hosted field instead of pre-applied session
  --preflight-only             Margin estimate only; no browser
  --allow-margin-block         Exit 0 when checkout is blocked by print margin guard (diagnostic)
  --ui-flow                    Exercise editor paywall UI (default: API map + asset + checkout)
  --checkout-only              Stop after Stripe Checkout URL (no payment)
  --headed                     Run browser headed
  --out <path>                 JSON report path

Notes:
  Default path creates map + print asset + checkout session via API, then completes Stripe in the browser.
  Use --ui-flow to validate editor print CTAs separately.
`;
}

function parseIntEnv(name, fallback) {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolEnv(name, fallback) {
  return parseBoolValue(process.env[name], fallback);
}

function parseBoolValue(raw, fallback) {
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!normalized) return fallback;
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return fallback;
}

async function loadWranglerProductionVars() {
  const filePath = path.resolve(process.cwd(), "wrangler.toml");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const vars = {};
    let inVars = false;
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim() === "[vars]") {
        inVars = true;
        continue;
      }
      if (inVars && /^\[/.test(line.trim())) break;
      if (!inVars) continue;
      const match = line.match(/^([A-Z0-9_]+)\s*=\s*"([^"]*)"/);
      if (match) vars[match[1]] = match[2];
    }
    return vars;
  } catch {
    return {};
  }
}

function envWithWranglerFallback(name, wranglerVars, fallback) {
  if (process.env[name]?.trim()) return process.env[name].trim();
  if (wranglerVars[name]) return wranglerVars[name];
  return fallback;
}

async function loadShippingCents(variant, country) {
  const filePath = path.resolve(process.cwd(), "data/printful-shipping.json");
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  const profile = variant === "poster_framed" ? "poster_framed" : "poster_unframed";
  const row = data?.[profile]?.[country];
  if (!row || typeof row.rate !== "number") return null;
  return Math.round(row.rate * 100);
}

async function estimateMarginIfHundredPercentOff(args) {
  const wranglerVars = await loadWranglerProductionVars();
  const marginGuardEnabled = parseBoolValue(
    envWithWranglerFallback("PRINT_MARGIN_GUARD_ENABLED", wranglerVars, "false"),
    false,
  );
  const minMarginCents = (() => {
    const raw = envWithWranglerFallback("PRINT_MIN_MARGIN_CENTS", wranglerVars, "0");
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  })();
  const stripePercent = Number.parseFloat(
    envWithWranglerFallback("PRINT_MARGIN_STRIPE_PERCENT", wranglerVars, "0.029"),
  );
  const stripeFixedCents = parseIntEnv(
    envWithWranglerFallback("PRINT_MARGIN_STRIPE_FIXED_CENTS", wranglerVars, "30"),
    30,
  );

  const framedCents = parseIntEnv(
    envWithWranglerFallback("PRINT_FRAMED_PRICE_CENTS", wranglerVars, "9900"),
    9900,
  );
  const unframedCents = parseIntEnv(
    envWithWranglerFallback("PRINT_UNFRAMED_PRICE_CENTS", wranglerVars, "4900"),
    4900,
  );
  const digitalAddOnCents = parseIntEnv(
    envWithWranglerFallback("PRINT_DIGITAL_ADDON_PRICE_CENTS", wranglerVars, "700"),
    700,
  );
  const printCents = args.printVariant === "poster_unframed" ? unframedCents : framedCents;
  const addonCents = args.includeDigitalAddOn ? digitalAddOnCents : 0;
  const shippingChargeCents =
    (await loadShippingCents(args.printVariant, args.shippingCountry)) ??
    parseIntEnv("PRINT_STANDARD_SHIPPING_CENTS", 1399);

  const cogsCents =
    args.printVariant === "poster_unframed"
      ? parseIntEnv(
          envWithWranglerFallback("PRINT_COGS_POSTER_UNFRAMED_CENTS", wranglerVars, "1300"),
          1300,
        )
      : parseIntEnv(
          envWithWranglerFallback("PRINT_COGS_POSTER_FRAMED_CENTS", wranglerVars, "5200"),
          5200,
        );

  const productSubtotalCents = printCents + addonCents;
  const discountCents = productSubtotalCents;
  const baseRevenueCents = productSubtotalCents + shippingChargeCents;
  const revenueCents = Math.max(0, baseRevenueCents - discountCents);
  const fulfillmentCents = cogsCents + shippingChargeCents;
  const stripeFeeCents =
    revenueCents > 0 ? Math.round(revenueCents * stripePercent) + stripeFixedCents : 0;
  const marginCents = revenueCents - stripeFeeCents - fulfillmentCents;
  const enforced = marginGuardEnabled && minMarginCents > 0;
  const blocked = enforced && marginCents < minMarginCents;

  return {
    marginGuardEnabled,
    minMarginCents,
    printVariant: args.printVariant,
    shippingCountry: args.shippingCountry,
    includeDigitalAddOn: args.includeDigitalAddOn,
    productSubtotalCents,
    shippingChargeCents,
    discountCentsIfHundredPercentOnProducts: discountCents,
    revenueCentsAfterFullProductDiscount: revenueCents,
    estimatedMarginCents: marginCents,
    blockedByMarginGuard: blocked,
    expectedCheckoutCode: blocked ? "print_promotion_margin_blocked" : null,
  };
}

async function waitForPaidVerification(site, sessionId, timeoutMs = 120_000) {
  const started = Date.now();
  const attempts = [];
  let nextDelayMs = 2500;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${site}/api/stripe/verify?session_id=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      const body = await res.json();
      attempts.push({ at: new Date().toISOString(), status: res.status, body });
      if (res.ok && body?.paid) return { paid: true, attempts, body };
    } catch (err) {
      attempts.push({ at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) });
    }
    await new Promise((resolve) => setTimeout(resolve, nextDelayMs));
  }
  return { paid: false, attempts, body: null };
}

async function createOneTimePromo(stripe, percentOff = 100) {
  const suffix = Date.now().toString().slice(-7);
  const code = `QAPRINT${suffix}`.slice(0, 20);
  const coupon = await stripe.coupons.create({
    percent_off: percentOff,
    duration: "once",
    max_redemptions: 1,
    name: `QA print ${suffix}`,
  });
  const promotionCode = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code,
    max_redemptions: 1,
    active: true,
  });
  return { code, couponId: coupon.id, promotionCodeId: promotionCode.id, percentOff };
}

async function bootstrapPrintCheckoutSession(site, args, promo) {
  const mapRes = await fetch(`${site}/api/maps`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: 1,
      seed: "qa-live-print-conversion",
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
        starIntensity: "normal",
        starGlow: true,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "off",
        premiumPlanets: "off",
        planetEmphasis: "highlighted",
        showMoon: true,
        moonSize: "large",
        shapeMask: "rectangle",
        frameEnabled: true,
      },
    }),
    cache: "no-store",
  });
  const mapJson = await mapRes.json().catch(() => ({}));
  if (!mapRes.ok || typeof mapJson?.id !== "string") {
    throw new Error(`Map create failed (${mapRes.status}): ${JSON.stringify(mapJson)}`);
  }

  const assetRes = await fetch(`${site}/api/print/assets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mapId: mapJson.id,
      dataUrl: MINIMAL_PNG_DATA_URL,
      source: "editor",
    }),
    cache: "no-store",
  });
  const assetJson = await assetRes.json().catch(() => ({}));
  const printAssetId = typeof assetJson?.assetId === "string" ? assetJson.assetId : "";
  if (!assetRes.ok || !printAssetId) {
    throw new Error(`Print asset failed (${assetRes.status}): ${JSON.stringify(assetJson)}`);
  }

  const checkoutBody = {
    orderType: "print",
    printVariant: args.printVariant,
    includeDigitalAddOn: args.includeDigitalAddOn,
    mapId: mapJson.id,
    printAssetId,
    shippingCountry: args.shippingCountry,
  };
  if (promo?.code) checkoutBody.promoCode = promo.code;

  const checkoutRes = await fetch(`${site}/api/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(checkoutBody),
    cache: "no-store",
  });
  const checkoutJson = await checkoutRes.json().catch(() => ({}));
  if (!checkoutRes.ok || typeof checkoutJson?.url !== "string") {
    throw new Error(
      `Print checkout API failed (${checkoutRes.status}): ${checkoutJson?.code ?? ""} ${checkoutJson?.error ?? JSON.stringify(checkoutJson)}`,
    );
  }

  return {
    mapId: mapJson.id,
    printAssetId,
    checkoutUrl: checkoutJson.url,
    promoApplied: Boolean(checkoutJson.promoApplied),
    discountRejected: Boolean(checkoutJson.discountRejected),
  };
}

async function applyPromoCode(page, code) {
  const promoToggle = page.getByText(/Add promotion code/i).first();
  if (await promoToggle.isVisible({ timeout: 8000 }).catch(() => false)) {
    await promoToggle.click();
  }
  const promoInput = page.locator("input[name='promotionCode']").first();
  await promoInput.fill(code);
  const applyButton = page.locator("button[class*='PromotionCodeEntry-applyButton']").first();
  if (await applyButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await applyButton.click();
  } else {
    await promoInput.press("Enter");
  }
  await page.waitForTimeout(2500);
  const invalid = page.getByText(/code is invalid|invalid/i).first();
  if (await invalid.isVisible({ timeout: 1500 }).catch(() => false)) {
    return { ok: false, reason: "invalid_on_stripe" };
  }
  return { ok: true };
}

async function fillStripeShippingIfNeeded(page) {
  const line1 = page.locator("input[name='shippingAddressLine1'], input[name='line1']").first();
  if (!(await line1.isVisible({ timeout: 4000 }).catch(() => false))) return false;
  await line1.fill("123 QA Test St");
  const city = page.locator("input[name='shippingAddressCity'], input[name='city']").first();
  if (await city.isVisible({ timeout: 1500 }).catch(() => false)) await city.fill("Austin");
  const state = page.locator("input[name='shippingAddressState'], select[name='shippingAddressState']").first();
  if (await state.isVisible({ timeout: 1500 }).catch(() => false)) {
    if ((await state.evaluate((el) => el.tagName)).toLowerCase() === "select") {
      await state.selectOption({ label: "Texas" }).catch(() => state.selectOption("TX"));
    } else {
      await state.fill("TX");
    }
  }
  const zip = page.locator("input[name='shippingAddressZip'], input[name='postal_code']").first();
  if (await zip.isVisible({ timeout: 1500 }).catch(() => false)) await zip.fill("78701");
  return true;
}

async function ensureDirFor(filePath) {
  await fs.mkdir(path.dirname(path.resolve(process.cwd(), filePath)), { recursive: true });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const marginPreflight = await estimateMarginIfHundredPercentOff(args);
  if (args.preflightOnly) {
    console.log(JSON.stringify({ marginPreflight }, null, 2));
    process.exit(marginPreflight.blockedByMarginGuard ? 1 : 0);
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    throw new Error("STRIPE_SECRET_KEY is required");
  }
  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    site: args.site,
    orderType: "print",
    printVariant: args.printVariant,
    shippingCountry: args.shippingCountry,
    includeDigitalAddOn: args.includeDigitalAddOn,
    status: "failed",
    marginPreflight,
    steps: [],
    friction: [],
    artifacts: {},
    stripe: {},
  };

  if (marginPreflight.blockedByMarginGuard && args.createPromo && !args.promoCode) {
    report.friction.push(
      "100% product promo would fail production print margin guard (print_promotion_margin_blocked). Use a smaller QA promo or --no-promo (card required).",
    );
  }

  let promo = null;
  if (args.promoCode) {
    promo = { code: args.promoCode, source: "provided" };
    report.stripe.promoCode = promo.code;
  } else if (args.createPromo) {
    promo = { ...(await createOneTimePromo(stripe, 100)), source: "generated" };
    report.stripe.promoCode = promo.code;
    report.stripe.promotionCodeId = promo.promotionCodeId;
    report.steps.push("Created one-time Stripe promo for QA");
    await new Promise((resolve) => setTimeout(resolve, 12_000));
  } else {
    report.steps.push("Running without promo (full-price checkout)");
  }

  const editorUrl = new URL(`${args.site}/editor`);
  editorUrl.searchParams.set("force", "desktop");
  editorUrl.searchParams.set("mode", "quick");
  editorUrl.searchParams.set("source", "qa-live-print-conversion");
  editorUrl.searchParams.set("checkout", "print");
  editorUrl.searchParams.set("print_variant", args.printVariant);
  editorUrl.searchParams.set("shipping_country", args.shippingCountry);
  editorUrl.searchParams.set("date", "2024-06-01");
  editorUrl.searchParams.set("location", "Paris, France");

  const browser = await chromium.launch({ headless: args.headless });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const qaEmail = `qa+print+${Date.now()}@starmapco.com`;
  let sessionId = null;
  let marginBlockedInUi = false;
  let reachedStripe = false;
  let checkoutOnlyComplete = false;

  try {
    if (!args.uiFlow) {
      const boot = await bootstrapPrintCheckoutSession(args.site, args, promo);
      report.artifacts.bootstrap = boot;
      report.steps.push(`Created map ${boot.mapId} and print asset ${boot.printAssetId}`);
      report.steps.push("Created print checkout session via API");
      report.stripe.checkoutUrl = boot.checkoutUrl;
      report.stripe.promoApplied = boot.promoApplied;
      report.stripe.discountRejected = boot.discountRejected;
      if (boot.discountRejected && promo?.code) {
        report.friction.push(
          "Promo was not auto-applied; Stripe Checkout should still allow entering the code on the page.",
        );
      }
      if (args.checkoutOnly) {
        checkoutOnlyComplete = true;
        report.status = "passed";
        report.steps.push("Checkout-only mode: print session URL verified (no payment)");
      } else {
        await page.goto(boot.checkoutUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });
        reachedStripe = true;
      }
    } else {
    await page.goto(editorUrl.toString(), { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator('[data-testid="editor-shell"], main').first().waitFor({ timeout: 60_000 }).catch(() => {});
    report.steps.push("Opened print-intent editor URL (desktop)");
    await page.evaluate(() => {
      try {
        localStorage.setItem("analytics-consent", "true");
      } catch {
        // ignore
      }
    });
    if (promo?.code) {
      await page.evaluate((code) => {
        try {
          localStorage.setItem("star-map-promo-code", code);
        } catch {
          // ignore
        }
      }, promo.code);
      report.steps.push("Stored promo code in editor localStorage");
    }
    const acceptCookies = page.getByRole("button", { name: /accept/i }).first();
    if (await acceptCookies.isVisible({ timeout: 3000 }).catch(() => false)) {
      await acceptCookies.click();
    }

    const freeExport = page.getByLabel("Free export").first();
    if (!(await freeExport.isVisible({ timeout: 5000 }).catch(() => false))) {
      const generatePreview = page.getByRole("button", { name: /Generate preview/i }).first();
      const sampleBtn = page
        .getByRole("button", { name: /Try a sample moment|Try sample moment|Use sample moment/i })
        .first();
      if (await generatePreview.isVisible({ timeout: 5000 }).catch(() => false)) {
        await generatePreview.click({ force: true });
        report.steps.push("Clicked Generate preview");
      } else if (await sampleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await sampleBtn.click({ force: true });
        report.steps.push("Applied sample moment");
      } else {
        report.friction.push("Map preview not ready (no Generate preview or sample moment button)");
      }
    } else {
      report.steps.push("Preview already ready");
    }
    await page.waitForTimeout(4000);
    await freeExport.waitFor({ state: "visible", timeout: 90_000 });
    const hdExport = page.getByLabel("HD export").first();
    await hdExport.waitFor({ state: "visible", timeout: 90_000 });
    await page.waitForFunction(
      (label) => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const match = buttons.find((btn) => btn.getAttribute("aria-label") === label);
        return Boolean(match && !match.disabled);
      },
      "HD export",
      { timeout: 90_000 },
    );

    const paywallHeading = page.getByRole("heading", { name: /Printed gift|Buy this map|Unlock HD/i }).first();
    if (!(await paywallHeading.isVisible({ timeout: 5000 }).catch(() => false))) {
      const printAndFrame = page.getByRole("button", { name: /Print & frame/i }).first();
      if (await printAndFrame.isVisible({ timeout: 8000 }).catch(() => false)) {
        await printAndFrame.click();
        report.steps.push("Opened print paywall via Print & frame");
      }
    } else {
      report.steps.push("Print paywall visible");
    }

    const printCtaLabel = args.includeDigitalAddOn
      ? /Framed \+ HD( file)? \(recommended\)/i
      : /Framed print|Framed \(recommended\)/i;
    let checkoutButton = page.getByRole("button", { name: printCtaLabel }).first();
    if (!(await checkoutButton.isVisible({ timeout: 2000 }).catch(() => false))) {
      checkoutButton = page.locator("button").filter({ hasText: printCtaLabel }).first();
    }

    const paywallPrintedGift = page.getByRole("button", { name: /Printed gift/i }).first();
    if (await paywallPrintedGift.isVisible({ timeout: 5000 }).catch(() => false)) {
      await paywallPrintedGift.click().catch(() => {});
      report.steps.push("Opened Printed gift paywall tab");
    }

    if (!(await checkoutButton.isVisible({ timeout: 8000 }).catch(() => false))) {
      const printAndFrame = page.getByRole("button", { name: /Print & frame/i }).first();
      if (await printAndFrame.isVisible({ timeout: 5000 }).catch(() => false)) {
        await printAndFrame.click();
        report.steps.push("Opened print panel via Print & frame");
      }
      checkoutButton = page.getByRole("button", { name: printCtaLabel }).first();
    }

    if (!(await checkoutButton.isVisible({ timeout: 12_000 }).catch(() => false))) {
      const hdExport = page.getByLabel("HD export").first();
      if (await hdExport.isVisible({ timeout: 5000 }).catch(() => false)) {
        await hdExport.click();
        await page.waitForTimeout(1500);
        const printedGiftTab = page.getByRole("button", { name: /Printed gift/i }).first();
        if (await printedGiftTab.isVisible({ timeout: 5000 }).catch(() => false)) {
          await printedGiftTab.click();
        }
        checkoutButton = page.locator("button").filter({ hasText: printCtaLabel }).first();
      }
      if (!(await checkoutButton.isVisible({ timeout: 8000 }).catch(() => false))) {
        const visibleButtons = await page
          .locator("button")
          .evaluateAll((nodes) =>
            nodes
              .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
              .filter((text) => text.length > 0 && text.length < 120),
          );
        report.artifacts.visibleButtonsSample = visibleButtons.slice(0, 40);
        const printDisabledOnLive =
          visibleButtons.some((text) => /Buy this map in HD|Buy 3 HD exports/i.test(text)) &&
          !visibleButtons.some((text) => /Framed \+ HD|Printed gift|Print & frame/i.test(text));
        if (printDisabledOnLive) {
          report.friction.push(
            "Live editor paywall shows digital SKUs only (NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED likely false on deployed worker).",
          );
          throw new Error("Print checkout disabled on live site");
        }
        report.friction.push("Print checkout CTA not found after map was ready.");
        throw new Error("Print checkout CTA not visible");
      }
    }

    await checkoutButton.scrollIntoViewIfNeeded().catch(() => {});
    await checkoutButton.click({ force: true });
    report.steps.push("Clicked print checkout CTA");

    const marginError = page.getByText(/unprofitable|margin|does not apply to this print/i).first();
    reachedStripe = await page
      .waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 })
      .then(() => true)
      .catch(() => false);

    if (!reachedStripe) {
      if (await marginError.isVisible({ timeout: 3000 }).catch(() => false)) {
        marginBlockedInUi = true;
        report.stripe.checkoutBlocked = "print_promotion_margin_blocked";
        report.steps.push("Checkout blocked by print margin guard in UI");
        if (args.allowMarginBlock) {
          report.status = "passed";
          report.friction.push("Expected margin guard block (--allow-margin-block)");
        } else {
          throw new Error("Print checkout blocked by margin guard (promo too deep for production)");
        }
      } else {
        const checkoutError = await page
          .getByText(/checkout|promo|shipping|couldn't|failed/i)
          .first()
          .innerText()
          .catch(() => "");
        throw new Error(checkoutError || "Did not reach Stripe Checkout");
      }
    }
    }

    if (checkoutOnlyComplete) {
      // Verified API → Stripe URL only.
    } else if (reachedStripe) {
      report.steps.push("Reached Stripe Checkout for print order");
      const emailInput = page.locator("input[type='email'], input[name='email']").first();
      if (await emailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
        await emailInput.fill(qaEmail);
      }

      if (promo?.code) {
        const promoResult = await applyPromoCode(page, promo.code);
        report.stripe.promoApply = promoResult;
        if (!promoResult.ok) {
          report.friction.push("Promo code did not apply on Stripe Checkout page");
        }
      }

      await fillStripeShippingIfNeeded(page);

      const termsCheckbox = page.getByRole("checkbox", { name: /I agree to the Terms|terms to complete/i }).first();
      if (await termsCheckbox.isVisible({ timeout: 5000 }).catch(() => false)) {
        if (!(await termsCheckbox.isChecked().catch(() => false))) {
          await termsCheckbox.click({ force: true }).catch(() => termsCheckbox.check({ force: true }));
        }
        report.steps.push("Accepted checkout terms");
      }

      const submitCandidates = [
        page.getByTestId("hosted-payment-submit-button"),
        page.getByTestId("submit-button"),
        page.getByRole("button", { name: /complete order|place order|pay|complete/i }),
        page.locator("button[type='submit']").first(),
      ];
      let submitted = false;
      for (const locator of submitCandidates) {
        if (await locator.isVisible({ timeout: 3000 }).catch(() => false)) {
          if (await locator.isEnabled().catch(() => false)) {
            await locator.click();
            submitted = true;
            break;
          }
        }
      }
      if (!submitted) {
        throw new Error("Stripe submit button not available (likely non-zero balance without card)");
      }
      report.steps.push("Submitted Stripe checkout");

      await page.waitForURL(/\/success\?session_id=/, { timeout: 90_000 });
      sessionId = new URL(page.url()).searchParams.get("session_id");
      if (!sessionId) throw new Error("Missing session_id on success URL");
      report.stripe.sessionId = sessionId;
      report.steps.push("Reached print success page");

      const verifyResult = await waitForPaidVerification(args.site, sessionId);
      report.stripe.verifyApi = verifyResult;
      if (!verifyResult.paid) {
        report.friction.push("/api/stripe/verify did not confirm paid within timeout");
      }

      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      report.stripe.sessionStatus = {
        id: stripeSession.id,
        paymentStatus: stripeSession.payment_status,
        status: stripeSession.status,
        amountTotal: stripeSession.amount_total,
        customerEmail: stripeSession.customer_details?.email ?? null,
        metadata: stripeSession.metadata ?? {},
      };
      if (stripeSession.metadata?.order_type !== "print") {
        report.friction.push(`Expected metadata.order_type=print, got ${stripeSession.metadata?.order_type ?? "missing"}`);
      }

      const adminToken = process.env.PRINT_ADMIN_TOKEN?.trim();
      if (adminToken) {
        const opsRes = await fetch(
          `${args.site}/api/print/ops?session_id=${encodeURIComponent(sessionId)}`,
          { headers: { "x-admin-token": adminToken }, cache: "no-store" },
        ).catch(() => null);
        if (opsRes) {
          report.printOps = { status: opsRes.status, body: await opsRes.json().catch(() => null) };
        }
      }

      report.status = verifyResult.paid ? "passed" : "failed";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    report.status = marginBlockedInUi && args.allowMarginBlock ? "passed" : "failed";
    if (!marginBlockedInUi || !args.allowMarginBlock) {
      report.friction.push(message);
    }
    const failureShot = path.resolve(process.cwd(), "reports/qa-live-print-failure.png");
    await page.screenshot({ path: failureShot, fullPage: true }).catch(() => {});
    report.artifacts.failureScreenshot = failureShot;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (promo?.source === "generated" && promo.promotionCodeId) {
      await stripe.promotionCodes.update(promo.promotionCodeId, { active: false }).catch(() => {});
    }
    if (promo?.source === "generated" && promo.couponId) {
      await stripe.coupons.del(promo.couponId).catch(() => {});
    }
  }

  await ensureDirFor(args.out);
  await fs.writeFile(path.resolve(process.cwd(), args.out), JSON.stringify(report, null, 2), "utf8");

  if (report.status !== "passed") {
    console.error(`Live print conversion QA failed. Report: ${path.resolve(process.cwd(), args.out)}`);
    process.exit(1);
  }
  console.log(`Live print conversion QA passed. Report: ${path.resolve(process.cwd(), args.out)}`);
}

run().catch((err) => {
  console.error(`live-print-conversion-qa failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
