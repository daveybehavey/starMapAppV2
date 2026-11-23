/**
 * Local synthetic verification for luxury campaign handoffs.
 * Captures date-first, place-first, and Customize-more time proofs.
 * Requires next dev on PORT (default 3017). No paid APIs.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 3017);
const base = `http://127.0.0.1:${port}`;
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../../docs/proofs/661-luxury-campaign");
const stamp = "2026-11-23";

mkdirSync(outDir, { recursive: true });

async function dismissOverlays(page) {
  for (const label of ["Decline", "Reject", "Necessary only", "Close"]) {
    const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
    }
  }
}

async function pickSantorini(page) {
  const loc = page.getByRole("combobox").first();
  await loc.click();
  await loc.fill("");
  await loc.pressSequentially("Santorini, Greece", { delay: 50 });
  // Wait for geocode suggestions; prefer an English-labelled option.
  await page.waitForSelector('[role="option"], [data-testid="location-suggestion"]', {
    timeout: 15000,
  });
  const english = page.locator('[role="option"]').filter({ hasText: /Santorini/i }).first();
  if (await english.isVisible().catch(() => false)) {
    await english.click();
  } else {
    await page.getByRole("option").first().click();
  }
  // Confirmed pick should populate hidden lat/lon before submit.
  await page.waitForFunction(() => {
    const lat = document.querySelector('input[name="lat"]');
    const lon = document.querySelector('input[name="lon"]');
    return Boolean(lat?.value && lon?.value && Number(lat.value) !== 0);
  }, { timeout: 10000 });
  await page.waitForTimeout(300);
}

async function fillDate(page, value = "2024-06-01") {
  const date = page.locator('input[type="date"], input[name="date"], #date').first();
  await date.fill(value);
}

async function submitLanding(page) {
  await page.getByRole("button", { name: /See my night sky/i }).click();
  await page.waitForURL(/\/editor/, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await dismissOverlays(page);
}

async function openCustomizeMore(page) {
  // Wait for preview chrome; scroll CTA row into view if needed.
  await page.locator("#editor canvas, canvas").first().waitFor({ state: "visible", timeout: 60000 });
  const btn = page.locator('[data-testid="desktop-customize-more"], button:has-text("Customize more")').first();
  await btn.waitFor({ state: "visible", timeout: 60000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.locator("#star-time, input[type=time]").first().waitFor({ state: "visible", timeout: 30000 });
}

async function capture(page, name, fullPage = false) {
  const path = join(outDir, `${name}-${stamp}.png`);
  await page.screenshot({ path, fullPage });
  return path;
}

async function readEditorState(page) {
  return page.evaluate(() => {
    const params = new URLSearchParams(location.search);
    const time = document.querySelector("#star-time, input[type=time]");
    const date = document.querySelector("#star-date, input[type=date]");
    const hint = document.querySelector("[data-testid=default-title-hint]");
    const canvasText = Array.from(document.querySelectorAll("canvas")).length;
    return {
      href: location.href,
      dateParam: params.get("date"),
      locationParam: params.get("location"),
      lat: params.get("lat"),
      lon: params.get("lon"),
      tz: params.get("tz"),
      source: params.get("source"),
      timeValue: time?.value ?? null,
      dateValue: date?.value ?? null,
      defaultTitleHint: hint?.textContent?.trim() ?? null,
      canvasCount: canvasText,
      bodyHasJune: document.body.innerText.includes("June") || document.body.innerText.includes("2024"),
      bodyHasSantorini:
        /Santorini|Σαντορίνη/i.test(document.body.innerText) ||
        /Santorini|Σαντορίνη/i.test(params.get("location") || ""),
    };
  });
}

async function clearEditorStorage(page) {
  await page.goto(`${base}/editor`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("star-map-draft");
    localStorage.removeItem("star-map-revealed");
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
  });
}

async function main() {
  const browser = await chromium.launch();
  const results = {};

  // Canonical URL handoff (same params landing form builds) — verifies
  // place/date sync + default title hint + Customize more time field.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    await clearEditorStorage(page);
    const handoff =
      `${base}/editor?mode=quick&source=meaningful-night` +
      `&date=2024-06-01` +
      `&location=${encodeURIComponent("Santorini, Greece")}` +
      `&lat=36.3932&lon=25.4615&tz=${encodeURIComponent("Europe/Athens")}`;
    await page.goto(handoff, { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    await page.waitForTimeout(1500);
    results.urlHandoff = await readEditorState(page);
    results.urlHandoff.proof = await capture(page, "editor-url-handoff");
    await openCustomizeMore(page);
    results.urlHandoffTime = await readEditorState(page);
    results.urlHandoffTime.proof = await capture(page, "editor-url-handoff-time");
    await context.close();
  }

  // --- Place-first via landing form ---
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    await clearEditorStorage(page);
    await page.goto(`${base}/a/meaningful-night`, { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    await pickSantorini(page);
    await fillDate(page);
    await submitLanding(page);
    results.placeFirst = await readEditorState(page);
    results.placeFirst.proof = await capture(page, "editor-place-first");
    await openCustomizeMore(page);
    results.placeFirstAfterCustomize = await readEditorState(page);
    results.placeFirstAfterCustomize.proof = await capture(page, "editor-place-first-time");
    await context.close();
  }

  // --- Date-first via landing form ---
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    await clearEditorStorage(page);
    await page.goto(`${base}/a/meaningful-night`, { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    await fillDate(page);
    await pickSantorini(page);
    await submitLanding(page);
    results.dateFirst = await readEditorState(page);
    results.dateFirst.proof = await capture(page, "editor-date-first");
    await openCustomizeMore(page);
    results.dateFirstAfterCustomize = await readEditorState(page);
    results.dateFirstAfterCustomize.proof = await capture(page, "editor-date-first-time");
    await context.close();
  }

  // --- Landing desktop + mobile screenshots ---
  {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await desktop.newPage();
    await page.goto(`${base}/a/meaningful-night`, { waitUntil: "networkidle" });
    await dismissOverlays(page);
    results.desktopViewport = await capture(page, "desktop-viewport");
    results.desktopFullpage = await capture(page, "desktop-fullpage", true);
    await desktop.close();
  }
  {
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await mobile.newPage();
    await page.goto(`${base}/a/meaningful-night`, { waitUntil: "networkidle" });
    await dismissOverlays(page);
    results.mobileViewport = await capture(page, "mobile-viewport");
    results.mobileFullpage = await capture(page, "mobile-fullpage", true);
    await mobile.close();
  }

  await browser.close();
  const reportPath = join(outDir, `handoff-verification-${stamp}.json`);
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
