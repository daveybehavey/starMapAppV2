#!/usr/bin/env node
/**
 * Export Example Star Maps for Homepage
 *
 * Creates 6 stunning, varied example images showcasing the full range of styles.
 * Run with: node export-examples.mjs
 *
 * Prerequisites:
 * - Dev server running: npm run dev
 * - Playwright installed: npx playwright install
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const OUTPUT_DIR = path.join(process.cwd(), "public", "examples");
const DEV_PORT = process.env.STARMAP_DEV_PORT || "3000";
const BASE_URL = process.env.STARMAP_DEV_URL || `http://127.0.0.1:${DEV_PORT}`;

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * EXAMPLE CONFIGURATIONS
 *
 * Design principles for maximum visual impact:
 * 1. Use dramatic, recognizable locations with strong star fields
 * 2. Pick dates with interesting celestial features
 * 3. Vary styles, shapes, render modes for clear differentiation
 * 4. Use evocative, elegant text that tells a story
 */
const examples = [
  {
    // WEDDING - Romantic heart shape with dramatic gold accents
    filename: "example-wedding-cinematic-heart.webp",
    config: {
      dateTime: "2024-06-21T22:30:00",
      location: {
        name: "Santorini, Greece",
        latitude: 36.4618,
        longitude: 25.3896,
        timezone: "Europe/Athens",
      },
      selectedStyle: "navyGold",
      shape: "heart",
      aspectRatio: "4:5",
      renderOptions: {
        visualMode: "illustrated",
        starIntensity: "bold",
        starGlow: true,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "subtle",
        premiumPlanets: "realistic",
        planetEmphasis: "highlighted",
        showMoon: true,
        moonSize: "large",
        shapeMask: "heart",
        frameEnabled: true,
        backgroundColor: "#070b1b",
        constellationLineScale: 1.15,
      },
      textBoxes: [
        {
          id: "title",
          label: "Title",
          text: "The Night We Said Forever",
          fontFamily: "cinzel",
          color: "#d7b56c",
          size: 52,
          align: "center",
          textGlow: true,
          position: { x: 0.5, y: 0.1 },
        },
        {
          id: "subtitle",
          label: "Subtitle",
          text: "Santorini • June 21, 2024",
          fontFamily: "raleway",
          color: "#c8a85c",
          size: 28,
          align: "center",
          position: { x: 0.5, y: 0.165 },
        },
        {
          id: "dedication",
          label: "Dedication",
          text: "Two souls beneath the summer stars.",
          fontFamily: "parisienne",
          color: "#b89a4c",
          size: 32,
          align: "center",
          textGlow: true,
          position: { x: 0.5, y: 0.91 },
        },
      ],
    },
  },
  {
    // ANNIVERSARY - Warm parchment with elegant typography
    filename: "example-anniversary-luxe.webp",
    config: {
      dateTime: "2016-09-15T21:00:00",
      location: {
        name: "Paris, France",
        latitude: 48.8566,
        longitude: 2.3522,
        timezone: "Europe/Paris",
      },
      selectedStyle: "parchmentScroll",
      shape: "rectangle",
      aspectRatio: "4:5",
      renderOptions: {
        visualMode: "enhanced",
        starIntensity: "normal",
        starGlow: true,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "subtle",
        premiumPlanets: "realistic",
        planetEmphasis: "normal",
        showMoon: true,
        moonSize: "normal",
        shapeMask: "circle",
        frameEnabled: true,
        backgroundColor: "#f6f0e6",
        constellationColor: "#8b7355",
        constellationLineScale: 1.0,
      },
      textBoxes: [
        {
          id: "title",
          label: "Title",
          text: "Eight Years of Stars",
          fontFamily: "abrilFatface",
          color: "#5a4019",
          size: 56,
          align: "center",
          position: { x: 0.5, y: 0.11 },
        },
        {
          id: "subtitle",
          label: "Subtitle",
          text: "Paris • September 15, 2016",
          fontFamily: "cormorant",
          color: "#6d5124",
          size: 28,
          align: "center",
          position: { x: 0.5, y: 0.175 },
        },
        {
          id: "dedication",
          label: "Dedication",
          text: "Still counting constellations together.",
          fontFamily: "parisienne",
          color: "#5a4019",
          size: 30,
          align: "center",
          position: { x: 0.5, y: 0.905 },
        },
      ],
    },
  },
  {
    // BIRTHDAY - Clean minimal circle with cool tones
    filename: "example-birthday-classic.webp",
    config: {
      dateTime: "1995-07-07T23:00:00",
      location: {
        name: "Tokyo, Japan",
        latitude: 35.6762,
        longitude: 139.6503,
        timezone: "Asia/Tokyo",
      },
      selectedStyle: "midnightMinimal",
      shape: "circle",
      aspectRatio: "square",
      renderOptions: {
        visualMode: "astronomical",
        starIntensity: "bold",
        starGlow: false,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "realistic",
        premiumPlanets: "off",
        planetEmphasis: "normal",
        showMoon: false,
        moonSize: "normal",
        shapeMask: "circle",
        frameEnabled: true,
        backgroundColor: "#0a1228",
        constellationLineScale: 0.85,
      },
      textBoxes: [
        {
          id: "title",
          label: "Title",
          text: "Born Under These Stars",
          fontFamily: "bebasNeue",
          color: "#d7e6ff",
          size: 58,
          align: "center",
          position: { x: 0.5, y: 0.12 },
        },
        {
          id: "subtitle",
          label: "Subtitle",
          text: "Tokyo • July 7, 1995",
          fontFamily: "montserrat",
          color: "#b1c6e6",
          size: 24,
          align: "center",
          position: { x: 0.5, y: 0.185 },
        },
        {
          id: "dedication",
          label: "Dedication",
          text: "The night the universe welcomed you.",
          fontFamily: "lora",
          color: "#9ab2d6",
          size: 24,
          align: "center",
          position: { x: 0.5, y: 0.895 },
        },
      ],
    },
  },
  {
    // BIRTH - Soft warm cream with gentle feel
    filename: "example-birth-classic.webp",
    config: {
      dateTime: "2023-02-14T03:45:00",
      location: {
        name: "Toronto, Canada",
        latitude: 43.6532,
        longitude: -79.3832,
        timezone: "America/Toronto",
      },
      selectedStyle: "parchmentScroll",
      shape: "rectangle",
      aspectRatio: "4:5",
      renderOptions: {
        visualMode: "enhanced",
        starIntensity: "subtle",
        starGlow: true,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "subtle",
        premiumPlanets: "off",
        planetEmphasis: "normal",
        showMoon: true,
        moonSize: "normal",
        shapeMask: "circle",
        frameEnabled: true,
        backgroundColor: "#f3e3d7",
        constellationColor: "#b08b61",
        constellationLineScale: 0.95,
      },
      textBoxes: [
        {
          id: "title",
          label: "Title",
          text: "Welcome to the World",
          fontFamily: "playfair",
          color: "#6f4e2a",
          size: 50,
          align: "center",
          position: { x: 0.5, y: 0.11 },
        },
        {
          id: "subtitle",
          label: "Subtitle",
          text: "Lily Rose • February 14, 2023",
          fontFamily: "cormorant",
          color: "#7a5931",
          size: 28,
          align: "center",
          position: { x: 0.5, y: 0.17 },
        },
        {
          id: "dedication",
          label: "Dedication",
          text: "3:45 AM • 7 lbs 8 oz",
          fontFamily: "raleway",
          color: "#7f5f3a",
          size: 24,
          align: "center",
          position: { x: 0.5, y: 0.9 },
        },
      ],
    },
  },
  {
    // MEMORIAL - Dignified blueprint style with grid
    filename: "example-memorial-blueprint.webp",
    config: {
      dateTime: "2018-11-11T18:00:00",
      location: {
        name: "London, UK",
        latitude: 51.5074,
        longitude: -0.1278,
        timezone: "Europe/London",
      },
      selectedStyle: "vintageEngraving",
      shape: "rectangle",
      aspectRatio: "4:5",
      renderOptions: {
        visualMode: "astronomical",
        starIntensity: "normal",
        starGlow: false,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: true,
        showPlanets: true,
        premiumStars: "off",
        premiumPlanets: "off",
        planetEmphasis: "normal",
        showMoon: true,
        moonSize: "normal",
        shapeMask: "circle",
        frameEnabled: true,
        backgroundColor: "#0d2f3a",
        constellationColor: "#5fa3a6",
        constellationLineScale: 1.1,
      },
      textBoxes: [
        {
          id: "title",
          label: "Title",
          text: "In Loving Memory",
          fontFamily: "playfair",
          color: "#d2e6ef",
          size: 52,
          align: "center",
          position: { x: 0.5, y: 0.11 },
        },
        {
          id: "subtitle",
          label: "Subtitle",
          text: "London • November 11, 2018",
          fontFamily: "lora",
          color: "#a9d2e2",
          size: 24,
          align: "center",
          position: { x: 0.5, y: 0.17 },
        },
        {
          id: "dedication",
          label: "Dedication",
          text: "Forever among the stars.",
          fontFamily: "crimsonText",
          color: "#95c2d1",
          size: 26,
          align: "center",
          position: { x: 0.5, y: 0.9 },
        },
      ],
    },
  },
  {
    // GRADUATION - Prestigious diamond shape with purple/gold
    filename: "example-graduation-luxe.webp",
    config: {
      dateTime: "2024-05-25T20:30:00",
      location: {
        name: "Boston, USA",
        latitude: 42.3601,
        longitude: -71.0589,
        timezone: "America/New_York",
      },
      selectedStyle: "navyGold",
      shape: "rectangle",
      aspectRatio: "4:5",
      renderOptions: {
        visualMode: "illustrated",
        starIntensity: "bold",
        starGlow: true,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "subtle",
        premiumPlanets: "realistic",
        planetEmphasis: "highlighted",
        showMoon: false,
        moonSize: "normal",
        shapeMask: "diamond",
        frameEnabled: true,
        backgroundColor: "#2a0f3f",
        constellationLineScale: 1.0,
      },
      textBoxes: [
        {
          id: "title",
          label: "Title",
          text: "Ad Astra Per Aspera",
          fontFamily: "cinzel",
          color: "#d4af37",
          size: 50,
          align: "center",
          textGlow: true,
          position: { x: 0.5, y: 0.1 },
        },
        {
          id: "subtitle",
          label: "Subtitle",
          text: "Class of 2024 • Boston",
          fontFamily: "raleway",
          color: "#c9a530",
          size: 24,
          align: "center",
          position: { x: 0.5, y: 0.16 },
        },
        {
          id: "dedication",
          label: "Dedication",
          text: "Through hardship to the stars.",
          fontFamily: "script",
          color: "#b8982a",
          size: 28,
          align: "center",
          textGlow: true,
          position: { x: 0.5, y: 0.91 },
        },
      ],
    },
  },
];

async function exportExample(browser, example, index) {
  console.log(`\n[${index + 1}/${examples.length}] Generating: ${example.filename}`);

  const context = await browser.newContext({
    viewport: { width: 1400, height: 1800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    // Prime localStorage to skip popups
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
      localStorage.setItem("cookiesAccepted", "true");
      localStorage.setItem("analytics-consent", "true");
    });

    // Navigate to editor page
  await page.goto(`${BASE_URL}/editor?force=desktop`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });

    // Wait for editor to be ready (not showing loading message)
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading editor"),
      { timeout: 30000 }
    );
    console.log("   ✓ Editor loaded");
    await page.waitForFunction(() => Boolean(window.__ZUSTAND_STORE__), {
      timeout: 20000,
    });

    // Apply configuration via the exposed store AND trigger reveal
    const applied = await page.evaluate((config) => {
      const store = window.__ZUSTAND_STORE__;
      if (!store) {
        return { error: "Store not found on window" };
      }
      const state = store.getState();

      // Set all the values first
      state.setDateTime(new Date(config.dateTime).toISOString());
      state.setLocation(config.location);
      state.setStyle(config.selectedStyle);
      state.setShape(config.shape);
      state.setAspectRatio(config.aspectRatio);
      state.setRenderOptions(config.renderOptions);
      state.setTextBoxes(config.textBoxes);
      state.setPaid(true);
      // Set revealed to show the canvas
      state.setRevealed(true);

      return { success: true };
    }, example.config);

    if (applied.error) {
      throw new Error(applied.error);
    }
    console.log("   ✓ Configuration applied, revealing canvas...");

    // Wait for the canvas to appear (now that revealed=true)
    await page.waitForSelector("canvas", { timeout: 15000 });
    console.log("   ✓ Canvas appeared");

    // Wait for the canvas to finish rendering
    await page.waitForTimeout(3000);

    // Get canvas data with high quality
    const dataUrl = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return null;

      // Get current canvas content
      return canvas.toDataURL("image/webp", 0.92);
    });

    if (dataUrl) {
      const base64Data = dataUrl.replace(/^data:image\/webp;base64,/, "");
      const outputPath = path.join(OUTPUT_DIR, example.filename);
      writeFileSync(outputPath, Buffer.from(base64Data, "base64"));
      console.log(`   ✓ Saved: ${example.filename}`);
    } else {
      // Fallback: screenshot the canvas element
      const canvas = await page.$("canvas");
      if (canvas) {
        const outputPath = path.join(OUTPUT_DIR, example.filename.replace(".webp", ".png"));
        await canvas.screenshot({ path: outputPath, type: "png" });
        console.log(`   ✓ Saved (fallback PNG): ${example.filename}`);
      }
    }

  } catch (error) {
    console.error(`   ✗ Error: ${error.message}`);
  } finally {
    await context.close();
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("    STAR MAP EXAMPLE GENERATOR");
  console.log("    Creating stunning preview images for the homepage");
  console.log("═══════════════════════════════════════════════════════════════");

  console.log("\n📁 Output directory:", OUTPUT_DIR);
  console.log("📊 Examples to generate:", examples.length);
  console.log("\n⚠️  Make sure dev server is running: npm run dev\n");

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    for (let i = 0; i < examples.length; i++) {
      await exportExample(browser, examples[i], i);
    }

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("    ✅ COMPLETE!");
    console.log("═══════════════════════════════════════════════════════════════\n");

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
