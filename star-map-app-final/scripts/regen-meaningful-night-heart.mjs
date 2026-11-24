/**
 * Local regen of public/campaign/meaningful-night/heart-preview.png
 *
 * Uses the app's free-preview export path (renderStarMap with fonts ready,
 * text included, watermark enabled) — NOT the first #editor display canvas,
 * which PreviewCanvas paints with includeText:false and watermark:false.
 *
 * Synthetic Santorini sample only. No paid APIs.
 *
 * Usage (dev server already on PORT, default 3017):
 *   node scripts/regen-meaningful-night-heart.mjs
 */
import { chromium } from "@playwright/test";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 3017);
// Prefer localhost over 127.0.0.1 so Next 16 Turbopack does not treat the
// origin as cross-host and block /_next hydration (editor stays on
// "Loading editor…").
const host = process.env.HOST || "localhost";
const baseURL = `http://${host}:${port}/editor?force=desktop&mode=quick`;
const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "../public/campaign/meaningful-night/heart-preview.png");

const draft = {
  version: 1,
  seed: "meaningful-night-heart-preview",
  datetimeISO: "2024-06-01T21:00:00+03:00",
  location: {
    name: "Santorini, Greece",
    latitude: 36.3932,
    longitude: 25.4615,
    timezone: "Europe/Athens",
  },
  textBoxes: [
    {
      id: "title",
      label: "Title",
      text: "The Night We Became One",
      fontFamily: "cinzel",
      color: "#d7b56c",
      size: 44,
      align: "center",
      textShadow: false,
      textGlow: false,
      position: { x: 0.5, y: 0.12 },
    },
    {
      id: "subtitle",
      label: "Subtitle",
      text: "Santorini, Greece",
      fontFamily: "raleway",
      color: "#c8a662",
      size: 26,
      align: "center",
      textShadow: false,
      textGlow: false,
      position: { x: 0.5, y: 0.18 },
    },
    {
      id: "dedication",
      label: "Dedication",
      // Campaign asset only — readable Cormorant date. Global classic
      // dedication defaults remain script / 26 in the store.
      text: "June 1, 2024",
      fontFamily: "cormorant",
      color: "#b98a3d",
      size: 40,
      align: "center",
      textShadow: false,
      textGlow: false,
      position: { x: 0.5, y: 0.9 },
    },
  ],
  selectedStyle: "navyGold",
  shape: "heart",
  aspectRatio: "square",
  renderOptions: {
    mapLookTier: "polished",
    backgroundColor: "#071128",
    constellationLineScale: 1.2,
    showMoon: true,
    starIntensity: "bold",
    starGlow: true,
    visualMode: "illustrated",
    constellationLines: "thin",
    planetEmphasis: "highlighted",
  },
};

async function dismissOverlays(page) {
  for (const label of ["Decline", "Reject", "Necessary only", "Close"]) {
    const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
    }
  }
}

async function main() {
  mkdirSync(dirname(outPath), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1800 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate((payload) => {
    localStorage.setItem("star-map-unlock", "true");
    localStorage.setItem("star-map-draft", JSON.stringify(payload));
    localStorage.setItem("star-map-revealed", "true");
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.removeItem("star-map-auto-export");
  }, draft);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Loading editor…").waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
  await dismissOverlays(page);

  const reveal = page.locator("#editor").getByRole("button", { name: "Generate preview" }).first();
  if (await reveal.isVisible().catch(() => false)) {
    if (await reveal.isEnabled().catch(() => false)) {
      await reveal.click();
    }
  }

  await page.locator("#editor canvas").first().waitFor({ state: "visible", timeout: 90000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#editor canvas");
    return canvas instanceof HTMLCanvasElement && canvas.width >= 800 && canvas.height >= 800;
  });
  // Wait for text overlay layer + fonts before free-preview export.
  await page.waitForFunction(() => document.querySelectorAll("#editor canvas").length >= 2, null, {
    timeout: 60000,
  });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(1500);
  await dismissOverlays(page);

  const freePreview = page
    .locator("#editor")
    .getByRole("button", { name: /Free preview|Free export/i })
    .first();
  await freePreview.waitFor({ state: "visible", timeout: 30000 });
  await freePreview.scrollIntoViewIfNeeded();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }),
    freePreview.click(),
  ]);
  const tempPath = await download.path();
  if (!tempPath) {
    // Some Playwright builds only stream; fall back to saveAs.
    await download.saveAs(outPath);
  } else {
    copyFileSync(tempPath, outPath);
  }
  console.log(`Wrote ${outPath} via free-preview export (${download.suggestedFilename()})`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
