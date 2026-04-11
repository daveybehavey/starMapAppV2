#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const DEFAULT_SITE = "https://starmapco.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_REPORT_PATH = "reports/promo-link-readiness.json";
const PROMO_CODE_STORAGE_KEY = "star-map-promo-code";

const LIVE_PROMO_LINKS = [
  {
    label: "Reddit social offer",
    code: "REDDIT50",
    url: `${DEFAULT_SITE}/editor?mode=quick&code=REDDIT50&utm_source=reddit&utm_medium=organic_promo&utm_campaign=apr2026_digital_offer&utm_content=reddit_offer_01`,
  },
  {
    label: "TikTok social offer",
    code: "TIKTOK50",
    url: `${DEFAULT_SITE}/editor?mode=quick&code=TIKTOK50&utm_source=tiktok&utm_medium=organic_promo&utm_campaign=apr2026_digital_offer&utm_content=tiktok_offer_01`,
  },
];

function parseArgs(argv) {
  const args = {
    site: DEFAULT_SITE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    out: DEFAULT_REPORT_PATH,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--site" && next) {
      args.site = next.replace(/\/+$/, "");
      i += 1;
      continue;
    }
    if (token === "--timeout-ms" && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed) && parsed > 0) args.timeoutMs = parsed;
      i += 1;
      continue;
    }
    if (token === "--out" && next) {
      args.out = next;
      i += 1;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/promo-link-readiness.mjs [--site <url>] [--timeout-ms <n>] [--out <file>] [--json]

Checks that live social promo links:
  - load in the editor
  - persist the expected promo code in local storage
  - still produce a valid discounted digital checkout session
  - reject print-only promo codes on digital checkout`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  return args;
}

function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
    },
  };
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const { signal, cleanup } = createAbortSignal(timeoutMs);
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    cleanup();
  }
}

async function ensureDirFor(filePath) {
  await fs.mkdir(path.dirname(path.resolve(process.cwd(), filePath)), { recursive: true });
}

function runCheck(checks, name, passed, details) {
  checks.push({ name, passed, details });
  const prefix = passed ? "PASS" : "FAIL";
  console.log(`[${prefix}] ${name}${details ? ` — ${details}` : ""}`);
}

async function verifyPromoLinkInBrowser(browser, link, timeoutMs) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const checks = [];

  try {
    const response = await page.goto(link.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    runCheck(checks, `${link.label} loads`, response?.status() === 200, `status=${response?.status() ?? "n/a"}`);

    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(1200);

    await page
      .waitForFunction(
        ([storageKey, expectedCode]) => {
          try {
            return window.localStorage.getItem(storageKey) === expectedCode;
          } catch {
            return false;
          }
        },
        [PROMO_CODE_STORAGE_KEY, link.code],
        { timeout: Math.min(timeoutMs, 5_000) },
      )
      .catch(() => {});

    const storedPromoCode = await page.evaluate((storageKey) => {
      try {
        return window.localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    }, PROMO_CODE_STORAGE_KEY);

    runCheck(
      checks,
      `${link.label} stores promo code`,
      storedPromoCode === link.code,
      storedPromoCode || "missing",
    );

    const pageText = await page.locator("body").innerText().catch(() => "");
    runCheck(
      checks,
      `${link.label} surfaces saved offer messaging`,
      typeof pageText === "string" && pageText.includes(link.code),
      link.code,
    );
  } finally {
    await context.close();
  }

  return checks;
}

async function saveMap({ site, timeoutMs, userAgent }) {
  const headers = {
    "content-type": "application/json",
    "user-agent": userAgent,
  };
  const response = await fetchWithTimeout(
    `${site}/api/maps`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        version: 1,
        seed: "promo-link-readiness",
        datetimeISO: "2024-06-15T12:00:00.000Z",
        location: {
          name: "New York, NY, USA",
          latitude: 40.7128,
          longitude: -74.006,
          timezone: "America/New_York",
        },
        selectedStyle: "navyGold",
        aspectRatio: "square",
        shape: "rectangle",
        textBoxes: [
          {
            id: "title",
            label: "Title",
            text: "Promo QA Map",
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
    },
    timeoutMs,
  );

  const json = await response.json().catch(() => ({}));
  const mapId = typeof json?.id === "string" ? json.id.trim() : "";
  const mapSetCookieHeader = response.headers.get("set-cookie") || "";
  const checkoutIntentCookieMatch = /(?:^|,\s*)starmap_checkout_intent=([^;]+)/i.exec(mapSetCookieHeader);
  const checkoutIntentCookie = checkoutIntentCookieMatch
    ? `starmap_checkout_intent=${checkoutIntentCookieMatch[1]}`
    : "";

  if (response.status !== 200 || !mapId || !checkoutIntentCookie) {
    throw new Error(`map_save_failed status=${response.status} mapId=${mapId || "missing"} cookie=${checkoutIntentCookie ? "ok" : "missing"}`);
  }

  return { mapId, checkoutIntentCookie, headers };
}

async function createDigitalCheckout({ site, timeoutMs, mapId, checkoutIntentCookie, promoCode, userAgent }) {
  const response = await fetchWithTimeout(
    `${site}/api/checkout`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": userAgent,
        cookie: checkoutIntentCookie,
      },
      body: JSON.stringify({ plan: "single", mapId, promoCode }),
      cache: "no-store",
    },
    timeoutMs,
  );
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const site = args.site;
  const browser = await chromium.launch({ headless: true });
  const checks = [];

  try {
    const liveLinks = LIVE_PROMO_LINKS.map((entry) => ({
      ...entry,
      url: entry.url.replace(DEFAULT_SITE, site),
    }));

    for (const link of liveLinks) {
      const browserChecks = await verifyPromoLinkInBrowser(browser, link, args.timeoutMs);
      checks.push(...browserChecks);

      const { mapId, checkoutIntentCookie } = await saveMap({
        site,
        timeoutMs: args.timeoutMs,
        userAgent: `promo-link-readiness/${link.code.toLowerCase()}`,
      });
      const checkout = await createDigitalCheckout({
        site,
        timeoutMs: args.timeoutMs,
        mapId,
        checkoutIntentCookie,
        promoCode: link.code,
        userAgent: `promo-link-readiness/${link.code.toLowerCase()}`,
      });
      const checkoutUrl = typeof checkout.json?.url === "string" ? checkout.json.url : "";
      runCheck(
        checks,
        `${link.code} creates discounted digital checkout`,
        checkout.response.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(checkoutUrl),
        checkout.response.status === 200 ? "stripe url ok" : `status=${checkout.response.status} code=${String(checkout.json?.code || "missing")}`,
      );
    }

    const invalidPromoMap = await saveMap({
      site,
      timeoutMs: args.timeoutMs,
      userAgent: "promo-link-readiness/print10",
    });
    const invalidPromo = await createDigitalCheckout({
      site,
      timeoutMs: args.timeoutMs,
      mapId: invalidPromoMap.mapId,
      checkoutIntentCookie: invalidPromoMap.checkoutIntentCookie,
      promoCode: "PRINT10",
      userAgent: "promo-link-readiness/print10",
    });
    runCheck(
      checks,
      "PRINT10 is rejected on digital checkout",
      invalidPromo.response.status === 400 && invalidPromo.json?.code === "promotion_not_applicable",
      `status=${invalidPromo.response.status} code=${String(invalidPromo.json?.code || "missing")}`,
    );
  } finally {
    await browser.close();
  }

  const failed = checks.some((check) => !check.passed);
  const report = {
    site,
    checkedAt: new Date().toISOString(),
    checks,
    summary: failed ? "Promo link readiness failed." : "Promo links are ready to post.",
  };

  await ensureDirFor(args.out);
  await fs.writeFile(path.resolve(process.cwd(), args.out), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
