#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import Stripe from "stripe";
import { chromium } from "playwright";
import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

const DEFAULT_SITE = "https://starmapco.com";
const PAYWALL_HEADING = /Buy this map in HD or print|Buy this map in HD|Unlock HD exports in seconds|Download your print-ready star map/i;
const SINGLE_CTA = /Continue with single|Get 1 HD map|Get 1 HD file|Buy single|Buy this map in HD/i;

function parseArgs(argv) {
  const args = {
    site: DEFAULT_SITE,
    headless: true,
    out: "reports/live-conversion-qa.json",
    createPromo: true,
    forcePromoField: false,
    checkoutOnly: false,
    promoCode: (process.env.QA_PROMO_CODE || "").trim(),
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
    if (token === "--checkout-only") {
      args.checkoutOnly = true;
      continue;
    }
    if (token === "--promo-field") {
      args.forcePromoField = true;
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
  node scripts/live-conversion-qa.mjs [--site https://starmapco.com] [--out reports/live-conversion-qa.json] [--headed] [--no-promo] [--promo-code CODE] [--promo-field] [--checkout-only]

Notes:
  - By default, promo QA uses a pre-discounted Checkout Session for stability.
  - Use --promo-field to force testing Stripe's promo input field directly.
  - --promo-code uses an existing Stripe promo code (recommended for stable live QA)
  - QA_PROMO_CODE env var can provide a default promo code
`;
}

async function waitForPaidVerification(site, sessionId, timeoutMs = 90_000) {
  const started = Date.now();
  const attempts = [];
  let nextDelayMs = 2500;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${site}/api/stripe/verify?session_id=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      const body = await res.json();
      const retryAfterRaw = res.headers.get("retry-after");
      const retryAfterSeconds = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : NaN;
      attempts.push({
        at: new Date().toISOString(),
        status: res.status,
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
        body,
      });
      if (res.ok && body?.paid) return { paid: true, attempts };
      if (res.status === 429) {
        nextDelayMs = Number.isFinite(retryAfterSeconds)
          ? Math.max(3000, retryAfterSeconds * 1000 + 250)
          : 12_500;
      } else {
        nextDelayMs = 2500;
      }
    } catch (err) {
      attempts.push({ at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) });
      nextDelayMs = 3000;
    }
    await new Promise((resolve) => setTimeout(resolve, nextDelayMs));
  }
  return { paid: false, attempts };
}

async function createOneTimePromo(stripe) {
  const suffix = Date.now().toString().slice(-7);
  const code = `QA${suffix}`;
  const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: "once",
    max_redemptions: 1,
    name: `QA one-time ${suffix}`,
  });
  const promotionCode = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code,
    max_redemptions: 1,
    active: true,
  });
  return { code, couponId: coupon.id, promotionCodeId: promotionCode.id };
}

async function createDiscountedCheckoutSession(stripe, site, promotionCodeId) {
  const singlePriceId = (process.env.STRIPE_PRICE_ID_SINGLE || "").trim();
  const paymentMethodConfigurationId = (process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID || "").trim();
  if (!singlePriceId) {
    throw new Error("STRIPE_PRICE_ID_SINGLE is required for discounted checkout fallback");
  }
  const normalizedSite = site.replace(/\/+$/, "");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${normalizedSite}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${normalizedSite}/`,
    client_reference_id: "qa-live-conversion",
    line_items: [{ price: singlePriceId, quantity: 1 }],
    discounts: [{ promotion_code: promotionCodeId }],
    billing_address_collection: "auto",
    ...(paymentMethodConfigurationId
      ? { payment_method_configuration: paymentMethodConfigurationId }
      : {}),
    metadata: {
      plan: "single",
      order_type: "digital",
      qa_run: "true",
      qa_source: "live_conversion_qa",
    },
  });
  if (!session.url) {
    throw new Error("Discounted checkout fallback session missing URL");
  }
  return session;
}

async function applyPromoCode(page, code) {
  const readTotalDue = async () => {
    const text = await page.locator("body").innerText();
    const match = text.match(/Total due\s*\$([0-9]+\.[0-9]{2})/i);
    if (!match) return null;
    const amount = Number.parseFloat(match[1]);
    return Number.isFinite(amount) ? amount : null;
  };

  const promoToggle = page.getByText(/Add promotion code/i).first();
  if (await promoToggle.isVisible({ timeout: 8000 }).catch(() => false)) {
    await promoToggle.click();
  }

  const baselineTotal = await readTotalDue();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const promoInput = page.locator("input[name='promotionCode']").first();
    await promoInput.fill(code);
    const applyButton = page.locator("button[class*='PromotionCodeEntry-applyButton']").first();
    const applyVisible = await applyButton.isVisible({ timeout: 1200 }).catch(() => false);
    const applyEnabled = applyVisible
      ? await applyButton.isEnabled().catch(() => false)
      : false;
    if (applyVisible && applyEnabled) {
      await applyButton.click();
    } else {
      const fallbackApply = page.getByRole("button", { name: /^(Apply|Redeem|Use)$/i }).first();
      const fallbackVisible = await fallbackApply.isVisible({ timeout: 1200 }).catch(() => false);
      const fallbackEnabled = fallbackVisible
        ? await fallbackApply.isEnabled().catch(() => false)
        : false;
      if (fallbackVisible && fallbackEnabled) {
        await fallbackApply.click();
      } else {
        await promoInput.press("Enter");
      }
    }
    await page.waitForTimeout(2500);

    const invalid = page.getByText(/code is invalid|invalid/i).first();
    if (await invalid.isVisible({ timeout: 1200 }).catch(() => false)) {
      await page.waitForTimeout(4000);
      continue;
    }

    const totalAfterAttempt = await readTotalDue();
    if (
      baselineTotal !== null &&
      totalAfterAttempt !== null &&
      Math.abs(totalAfterAttempt - baselineTotal) > 0.0001
    ) {
      return { ok: true, attempts: attempt };
    }

    // If total parsing fails, fall back to code text appearing in summary.
    const codeVisible = await page
      .locator(`text=${code}`)
      .first()
      .isVisible({ timeout: 1200 })
      .catch(() => false);
    if (codeVisible) {
      return { ok: true, attempts: attempt };
    }

    await page.waitForTimeout(4000);
  }

  return { ok: false, attempts: 3 };
}

async function inspectWebhookHealth(stripe, sessionId) {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 25 });
  const endpoint = endpoints.data.find((item) =>
    item.url.includes("starmapco.com/api/stripe/webhook"),
  );

  const events = await stripe.events.list({
    type: "checkout.session.completed",
    limit: 25,
  });
  const matched = events.data.find((event) => event.data.object?.id === sessionId);

  return {
    endpoint: endpoint
      ? {
          id: endpoint.id,
          url: endpoint.url,
          status: endpoint.status,
          enabledEventsCount: endpoint.enabled_events.length,
        }
      : null,
    checkoutSessionCompletedEvent: matched
      ? {
          id: matched.id,
          created: matched.created,
          pendingWebhooks: matched.pending_webhooks,
        }
      : null,
    recentEvents: events.data.slice(0, 5).map((event) => ({
      id: event.id,
      created: event.created,
      pendingWebhooks: event.pending_webhooks,
      sessionId: event.data.object?.id ?? null,
    })),
  };
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
    status: "failed",
    steps: [],
    friction: [],
    artifacts: {},
    stripe: {},
  };

  let promo = null;
  if (args.promoCode) {
    promo = { code: args.promoCode, source: "provided" };
    report.steps.push(`Using existing promo code for QA run (${args.promoCode})`);
    report.stripe.promoCode = promo.code;
    try {
      const existing = await stripe.promotionCodes.list({
        code: promo.code,
        active: true,
        limit: 1,
      });
      const matched = existing.data[0];
      if (matched) {
        promo.promotionCodeId = matched.id;
        promo.couponId = typeof matched.coupon === "string" ? matched.coupon : matched.coupon.id;
        report.stripe.promotionCodeId = matched.id;
        report.stripe.couponId = promo.couponId;
      } else {
        report.friction.push("Provided promo code was not found in active Stripe promotion codes");
      }
    } catch (err) {
      report.friction.push(
        `Could not validate provided promo code in Stripe: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  } else if (args.createPromo) {
    promo = { ...(await createOneTimePromo(stripe)), source: "generated" };
    report.steps.push("Created one-time 100% promo code for QA run");
    report.stripe.promoCode = promo.code;
    report.stripe.promotionCodeId = promo.promotionCodeId;
    report.stripe.couponId = promo.couponId;
    await new Promise((resolve) => setTimeout(resolve, 12_000));
  } else {
    report.steps.push("Running without temporary promo code");
  }

  const browser = await chromium.launch({ headless: args.headless });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const screenshots = [];
  const qaEmail = `qa+${Date.now()}@starmapco.com`;
  let sessionId = null;
  let checkoutOnlyComplete = false;
  const captureScreenshot = async (pathOnDisk, label) => {
    screenshots.push(pathOnDisk);
    await page.screenshot({ path: pathOnDisk, fullPage: true, timeout: 15_000 }).catch((error) => {
      report.friction.push(
        `${label} screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  };

  try {
    await page.goto(`${args.site}/`, { waitUntil: "networkidle", timeout: 60_000 });
    report.steps.push("Homepage loaded");
    await captureScreenshot("/tmp/qa-live-01-home.png", "home");

    const dateInput = page.locator("input[name='date']").first();
    const locationInput = page.locator("input[name='location']").first();
    await dateInput.fill("2024-06-01");
    await locationInput.fill("Paris, France");
    await page.getByRole("button", { name: /Preview your map/i }).first().click();
    await page.waitForURL(/\/editor/, { timeout: 30_000 });
    report.steps.push("Reached editor from homepage form");

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2500);
    await captureScreenshot("/tmp/qa-live-02-editor.png", "editor");

    const sampleBtn = page.getByRole("button", { name: /Try a sample moment/i }).first();
    if (await sampleBtn.isVisible().catch(() => false)) {
      await sampleBtn.click();
      await page.waitForTimeout(2500);
      report.steps.push("Applied sample moment in editor");
    }

    const hdButton = page.locator("button[aria-label*='HD']").first();
    if (!(await hdButton.isVisible().catch(() => false))) {
      throw new Error("HD export button not visible");
    }
    await hdButton.click();
    await page.waitForTimeout(1200);

    const paywallHeading = page.getByRole("heading", { name: PAYWALL_HEADING }).first();
    if (!(await paywallHeading.isVisible({ timeout: 15_000 }).catch(() => false))) {
      throw new Error("Paywall did not appear");
    }
    report.steps.push("Paywall appeared");

    const singleCta = page.getByRole("button", { name: SINGLE_CTA }).first();
    await singleCta.click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 40_000 });
    report.steps.push("Redirected to Stripe Checkout");
    await captureScreenshot("/tmp/qa-live-03-stripe.png", "stripe");

    if (args.checkoutOnly) {
      const webhookHealth = await inspectWebhookHealth(stripe, null);
      report.stripe.webhook = webhookHealth;
      if (!webhookHealth.endpoint) {
        report.friction.push("Stripe webhook endpoint for production URL not found");
      }
      const latestSessionId = webhookHealth.recentEvents?.[0]?.sessionId;
      if (latestSessionId) {
        const probe = await fetch(
          `${args.site}/api/stripe/verify?session_id=${encodeURIComponent(latestSessionId)}`,
          { cache: "no-store" },
        ).then(async (res) => ({ status: res.status, body: await res.json() }));
        report.stripe.recentVerifyProbe = {
          sessionId: latestSessionId,
          status: probe.status,
          body: probe.body,
        };
        if (!probe.body?.paid) {
          report.friction.push("Latest completed session did not verify as paid via `/api/stripe/verify`");
        }
      }
      report.steps.push("Captured webhook health snapshot");
      report.status = "passed";
      checkoutOnlyComplete = true;
    }

    if (!checkoutOnlyComplete) {
      const emailInput = page.locator("input[type='email'], input[name='email']").first();
      if (await emailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
        await emailInput.fill(qaEmail);
        report.steps.push("Entered checkout email");
      }

      if (promo?.code) {
        if (promo.promotionCodeId && !args.forcePromoField) {
          const discountedSession = await createDiscountedCheckoutSession(
            stripe,
            args.site,
            promo.promotionCodeId,
          );
          report.steps.push("Opened pre-discounted checkout session");
          report.stripe.discountedCheckoutSessionId = discountedSession.id;
          await page.goto(discountedSession.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
          const discountedEmailInput = page.locator("input[type='email'], input[name='email']").first();
          if (await discountedEmailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
            await discountedEmailInput.fill(qaEmail);
          }
        } else {
          const promoResult = await applyPromoCode(page, promo.code);
          report.stripe.promoApply = promoResult;
          if (!promoResult.ok) {
            if (!promo.promotionCodeId) {
              throw new Error("Promo code remained invalid on Stripe Checkout");
            }
            const fallbackSession = await createDiscountedCheckoutSession(
              stripe,
              args.site,
              promo.promotionCodeId,
            );
            report.steps.push("Promo field failed; switched to discounted fallback checkout session");
            report.stripe.fallbackCheckoutSessionId = fallbackSession.id;
            await page.goto(fallbackSession.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
            await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
            const fallbackEmailInput = page.locator("input[type='email'], input[name='email']").first();
            if (await fallbackEmailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
              await fallbackEmailInput.fill(qaEmail);
            }
          } else {
            report.steps.push("Applied promo code");
          }
        }
      }

      const termsCheckbox = page.getByRole("checkbox", { name: /I agree to the Terms|terms to complete/i }).first();
      if (await termsCheckbox.isVisible({ timeout: 5000 }).catch(() => false)) {
        const checked = await termsCheckbox.isChecked();
        if (!checked) await termsCheckbox.check();
        report.steps.push("Accepted checkout terms");
      }

      const submitCandidates = [
        "button[data-testid='hosted-payment-submit-button']",
        "button[data-testid='submit-button']",
        "button[type='submit']",
        "button:has-text('Pay')",
        "button:has-text('Pay now')",
        "button:has-text('Complete')",
        "button:has-text('Place order')",
        "button:has-text('Subscribe')",
        "button[aria-label*='Pay' i]",
      ];

      let submitted = false;
      for (const selector of submitCandidates) {
        const btn = page.locator(selector).first();
        try {
          // Stripe Checkout can take a bit to finish rendering the hosted payment button.
          await btn.waitFor({ state: "visible", timeout: 12_000 });
          const isEnabled = await btn.isEnabled().catch(() => false);
          if (isEnabled) {
            await btn.click();
            submitted = true;
            break;
          }
        } catch {
          // Try next selector.
        }
      }
      if (!submitted) {
        throw new Error("Could not find Stripe submit button");
      }
      report.steps.push("Submitted Stripe checkout");

      await page.waitForURL(/\/success\?session_id=/, { timeout: 70_000 });
      const successUrl = new URL(page.url());
      sessionId = successUrl.searchParams.get("session_id");
      if (!sessionId) throw new Error("Missing session_id after successful checkout redirect");
      report.steps.push("Reached success page");
      report.stripe.sessionId = sessionId;
      await captureScreenshot("/tmp/qa-live-04-success.png", "success");

      await page.waitForURL(/\/download/, { timeout: 90_000 });
      report.steps.push("Auto-redirected to download page");
      await captureScreenshot("/tmp/qa-live-05-download.png", "download");

      const verifyResult = await waitForPaidVerification(args.site, sessionId);
      report.stripe.verifyApi = verifyResult;
      if (!verifyResult.paid) {
        report.friction.push("`/api/stripe/verify` did not confirm paid status inside timeout");
      }

      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      report.stripe.sessionStatus = {
        id: stripeSession.id,
        mode: stripeSession.mode,
        paymentStatus: stripeSession.payment_status,
        status: stripeSession.status,
        customerEmail: stripeSession.customer_details?.email ?? null,
      };

      const webhookHealth = await inspectWebhookHealth(stripe, sessionId);
      report.stripe.webhook = webhookHealth;
      if (!webhookHealth.endpoint) {
        report.friction.push("Stripe webhook endpoint for production URL not found");
      }
      if (webhookHealth.checkoutSessionCompletedEvent && webhookHealth.checkoutSessionCompletedEvent.pendingWebhooks > 0) {
        report.friction.push("`checkout.session.completed` still has pending webhooks");
      }

      report.status = "passed";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    report.status = "failed";
    report.friction.push(message);
    screenshots.push("/tmp/qa-live-failure.png");
    await page.screenshot({ path: screenshots[screenshots.length - 1], fullPage: true }).catch(() => {});
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});

    if (promo?.source === "generated" && promo?.promotionCodeId) {
      await stripe.promotionCodes.update(promo.promotionCodeId, { active: false }).catch(() => {});
    }
    if (promo?.source === "generated" && promo?.couponId) {
      await stripe.coupons.del(promo.couponId).catch(() => {});
    }
  }

  report.artifacts.screenshots = screenshots;
  await ensureDirFor(args.out);
  await fs.writeFile(path.resolve(process.cwd(), args.out), JSON.stringify(report, null, 2), "utf8");

  if (report.status !== "passed") {
    console.error(`Live conversion QA failed. Report: ${path.resolve(process.cwd(), args.out)}`);
    process.exit(1);
  }
  console.log(`Live conversion QA passed. Report: ${path.resolve(process.cwd(), args.out)}`);
}

run().catch((err) => {
  console.error(`live-conversion-qa failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
