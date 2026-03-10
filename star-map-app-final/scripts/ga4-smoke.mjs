#!/usr/bin/env node

import { chromium } from "playwright";

const site = process.env.GA4_SMOKE_SITE || "https://starmapco.com";
const consentKey = "analytics-consent";

function fail(message, payload) {
  console.error(`GA4 smoke failed: ${message}`);
  if (payload) {
    console.error(JSON.stringify(payload, null, 2));
  }
  process.exit(1);
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(site, { waitUntil: "domcontentloaded" });
  await page.evaluate((key) => localStorage.setItem(key, "true"), consentKey);
  await page.reload({ waitUntil: "domcontentloaded" });

  await page.waitForTimeout(1000);
  try {
    await page.waitForFunction(() => {
      const dataLayer = window.dataLayer || [];
      return (
        typeof window.gtag === "function" &&
        Array.isArray(dataLayer) &&
        dataLayer.some((entry) => {
          if (Array.isArray(entry)) return entry[0] === "config";
          return Boolean(entry && typeof entry === "object" && entry[0] === "config");
        })
      );
    }, { timeout: 10000 });
  } catch {
    // Fall through to diagnostics below.
  }

  try {
    await page.waitForFunction(() => {
      const dataLayer = window.dataLayer || [];
      return (
        Array.isArray(dataLayer) &&
        dataLayer.some((entry) => {
          if (Array.isArray(entry)) return entry[0] === "event" && entry[1] === "page_view";
          if (entry && typeof entry === "object") {
            if (entry[0] === "event" && entry[1] === "page_view") return true;
            return entry.event === "page_view";
          }
          return false;
        })
      );
    }, { timeout: 10000 });
  } catch {
    // Fall through to diagnostics below.
  }

  const result = await page.evaluate(() => {
    const dataLayer = window.dataLayer || [];
    const gtagReady = typeof window.gtag === "function";
    const entryTypes = dataLayer.map((entry) => (Array.isArray(entry) ? "array" : typeof entry));
    return {
      gtagReady,
      dataLayerCount: dataLayer.length,
      dataLayerHead: dataLayer.slice(0, 5),
      dataLayerTail: dataLayer.slice(-10),
      dataLayerAll: dataLayer,
      dataLayerEntryTypes: entryTypes,
    };
  });

  if (!result.gtagReady) fail("gtag not initialized after consent", result);
  if (result.dataLayerCount === 0) fail("dataLayer empty after consent", result);

  const hasConfig = result.dataLayerAll.some((entry) => {
    if (Array.isArray(entry)) return entry[0] === "config";
    if (entry && typeof entry === "object") return entry[0] === "config";
    return false;
  });
  const hasPageView = result.dataLayerAll.some((entry) => {
    if (Array.isArray(entry)) return entry[0] === "event" && entry[1] === "page_view";
    if (entry && typeof entry === "object") {
      if (entry[0] === "event" && entry[1] === "page_view") return true;
      return entry.event === "page_view";
    }
    return false;
  });

  if (!hasConfig) fail("no GA4 config event in dataLayer", result);
  if (!hasPageView) fail("no page_view event in dataLayer", result);

  console.log("GA4 smoke: OK", JSON.stringify({
    gtagReady: result.gtagReady,
    dataLayerCount: result.dataLayerCount,
    dataLayerTail: result.dataLayerTail,
  }, null, 2));

  await browser.close();
}

run().catch((err) => fail(err instanceof Error ? err.message : String(err)));
