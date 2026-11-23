/**
 * One-off local regen of public/campaign/meaningful-night/heart-preview.png
 * Uses the live editor canvas (synthetic Santorini sample). No paid APIs.
 *
 * Usage (dev server already on 3017):
 *   node scripts/regen-meaningful-night-heart.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 3017);
const baseURL = `http://127.0.0.1:${port}/editor?force=desktop&mode=quick`;
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

async function main() {
  mkdirSync(dirname(outPath), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1800 },
    deviceScaleFactor: 2,
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
  await page.waitForTimeout(1000);

  const dataUrl = await page.locator("#editor canvas").first().evaluate((canvas) =>
    canvas instanceof HTMLCanvasElement ? canvas.toDataURL("image/png") : null,
  );
  if (!dataUrl) throw new Error("Could not capture canvas");
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  writeFileSync(outPath, Buffer.from(base64, "base64"));
  console.log(`Wrote ${outPath}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
