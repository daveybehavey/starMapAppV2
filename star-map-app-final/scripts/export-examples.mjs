import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const port = 3006;
const baseURL = `http://127.0.0.1:${port}/editor?force=desktop`;
const exportDir = join(process.cwd(), "exports");
const rawDir = join(exportDir, "raw");

mkdirSync(rawDir, { recursive: true });

const baseText = {
  fontFamily: "playfair",
  color: "#d9b56f",
  size: 52,
  align: "center",
  textShadow: false,
  textGlow: false,
};

const subtitleText = {
  fontFamily: "cinzel",
  color: "#c7a35a",
  size: 34,
  align: "center",
  textShadow: false,
  textGlow: false,
};

const footerText = {
  fontFamily: "script",
  color: "#b8893f",
  size: 32,
  align: "center",
  textShadow: false,
  textGlow: false,
};

const examples = [
  {
    key: "wedding-heart-cinematic",
    filename: "example-wedding-cinematic-heart.webp",
    aspectRatio: "square",
    shape: "heart",
    renderMode: "cinematic",
    intensity: 70,
    selectedStyle: "navyGold",
    extraRenderOptions: { backgroundColor: "#0b122b" },
    dateTime: "2024-06-01T20:45:00+03:00",
    location: {
      name: "Santorini, Greece",
      latitude: 36.3932,
      longitude: 25.4615,
      timezone: "Europe/Athens",
    },
    text: {
      title: "Under These Stars",
      subtitle: "We Said \"I Do\"",
      footer: "June 1, 2024 - Santorini",
    },
  },
  {
    key: "anniversary-luxe",
    filename: "example-anniversary-luxe.webp",
    aspectRatio: "square",
    shape: "circle",
    renderMode: "luxe",
    intensity: 65,
    selectedStyle: "parchmentScroll",
    extraRenderOptions: { backgroundColor: "#f5efe3" },
    dateTime: "2016-09-17T21:30:00+02:00",
    location: {
      name: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: "Europe/Paris",
    },
    text: {
      title: "Forever & Always",
      subtitle: "Our Anniversary",
      footer: "Paris - September 17, 2016",
    },
  },
  {
    key: "birthday-classic",
    filename: "example-birthday-luxe.webp",
    aspectRatio: "4:5",
    shape: "rectangle",
    renderMode: "classic",
    intensity: 55,
    selectedStyle: "midnightMinimal",
    extraRenderOptions: { backgroundColor: "#0e1628" },
    dateTime: "1995-07-09T22:10:00+09:00",
    location: {
      name: "Tokyo, Japan",
      latitude: 35.6762,
      longitude: 139.6503,
      timezone: "Asia/Tokyo",
    },
    text: {
      title: "The Stars on Your Birthday",
      subtitle: "July 9, 1995",
      footer: "Tokyo, Japan",
    },
  },
  {
    key: "birth-classic",
    filename: "example-birth-classic.webp",
    aspectRatio: "square",
    shape: "circle",
    renderMode: "classic",
    intensity: 55,
    selectedStyle: "parchmentScroll",
    extraRenderOptions: { backgroundColor: "#f2e4da" },
    dateTime: "2023-02-18T04:12:00-05:00",
    location: {
      name: "Toronto, Canada",
      latitude: 43.6532,
      longitude: -79.3832,
      timezone: "America/Toronto",
    },
    text: {
      title: "Welcome, Oliver",
      subtitle: "February 18, 2023",
      footer: "Toronto, Canada",
    },
  },
  {
    key: "memorial-blueprint",
    filename: "example-memorial-blueprint.webp",
    aspectRatio: "square",
    shape: "circle",
    renderMode: "blueprint",
    intensity: 50,
    selectedStyle: "vintageEngraving",
    extraRenderOptions: { backgroundColor: "#0d2a3a" },
    dateTime: "2018-11-02T19:20:00+00:00",
    location: {
      name: "London, UK",
      latitude: 51.5072,
      longitude: -0.1276,
      timezone: "Europe/London",
    },
    text: {
      title: "In Loving Memory",
      subtitle: "November 2, 2018",
      footer: "London, UK",
    },
  },
  {
    key: "graduation-luxe",
    filename: "example-graduation-classic.webp",
    aspectRatio: "4:5",
    shape: "rectangle",
    renderMode: "luxe",
    intensity: 65,
    selectedStyle: "navyGold",
    extraRenderOptions: { backgroundColor: "#231339" },
    dateTime: "2024-05-25T21:00:00-04:00",
    location: {
      name: "Boston, USA",
      latitude: 42.3601,
      longitude: -71.0589,
      timezone: "America/New_York",
    },
    text: {
      title: "Class of 2024",
      subtitle: "May 25, 2024",
      footer: "Boston, USA",
    },
  },
];

const renderModes = {
  classic: { contrast: 0.95, glow: 0.06 },
  cinematic: { contrast: 1.35, glow: 0.65 },
  blueprint: { contrast: 1.02, glow: 0.02 },
  luxe: { contrast: 1.12, glow: 0.32 },
};

function buildRenderOptions(mode, level, extra = {}) {
  const cfg = renderModes[mode];
  const normalized = Math.min(Math.max(level / 100, 0), 1);
  const starIntensity = normalized < 0.3 ? "subtle" : normalized < 0.7 ? "normal" : "bold";
  const starGlow = cfg.glow + normalized * 0.2 > 0.3;
  const visualMode = mode === "blueprint" ? "astronomical" : mode === "cinematic" ? "illustrated" : "enhanced";
  const constellationLines = mode === "blueprint" ? "thick" : "thin";
  const planetEmphasis = cfg.contrast > 1.15 ? "highlighted" : "normal";
  return { starIntensity, starGlow, visualMode, constellationLines, planetEmphasis, ...extra };
}

function buildTextBoxes(text) {
  return [
    { id: "title", label: "Title", text: text.title, ...baseText, position: { x: 0.5, y: 0.12 } },
    { id: "subtitle", label: "Subtitle", text: text.subtitle, ...subtitleText, position: { x: 0.5, y: 0.18 } },
    { id: "dedication", label: "Dedication", text: text.footer, ...footerText, position: { x: 0.5, y: 0.9 } },
  ];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      // ignore
    }
    await wait(1000);
  }
  throw new Error("Dev server did not start in time.");
}

async function run() {
  const server = spawn("npm", ["run", "dev", "--", "-H", "127.0.0.1", "-p", String(port)], {
    stdio: "inherit",
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    const browser = await chromium.launch();
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    for (const example of examples) {
      const draft = {
        version: 1,
        seed: "example",
        datetimeISO: example.dateTime,
        location: example.location,
        textBoxes: buildTextBoxes(example.text),
        selectedStyle: example.selectedStyle,
        shape: example.shape,
        aspectRatio: example.aspectRatio,
        renderOptions: buildRenderOptions(example.renderMode, example.intensity, example.extraRenderOptions),
      };

      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await page.evaluate((payload) => {
        localStorage.setItem("star-map-unlock", "true");
        localStorage.setItem("star-map-draft", JSON.stringify(payload));
        localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
        localStorage.removeItem("star-map-auto-export");
        localStorage.removeItem("star-map-revealed");
      }, draft);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByText("Loading editor…").waitFor({ state: "detached" });
      const revealButton = page.locator("#editor").getByRole("button", { name: "Generate preview" }).first();
      if (await revealButton.isVisible()) {
        if (await revealButton.isEnabled()) {
          await revealButton.click();
        }
      }
      await page.locator("#editor canvas").first().waitFor({ state: "visible", timeout: 60000 });

      const hdButton = page.locator("#editor").getByRole("button", { name: "HD export" }).first();
      await hdButton.waitFor({ state: "visible", timeout: 60000 });
      const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
      await hdButton.click();
      const download = await downloadPromise;

      const rawPath = join(rawDir, `${example.key}.png`);
      await download.saveAs(rawPath);

      const isSquare = example.aspectRatio === "square";
      const outputPath = join(process.cwd(), "public", "examples", example.filename);
      const filters = isSquare ? "scale=2000:2000,crop=1600:2000" : "scale=1600:2000";

      await new Promise((resolve, reject) => {
        const ffmpeg = spawn(
          "ffmpeg",
          ["-y", "-i", rawPath, "-vf", filters, "-q:v", "85", outputPath],
          { stdio: "inherit" },
        );
        ffmpeg.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg failed for ${example.key}`));
        });
      });
    }

    await browser.close();
  } finally {
    server.kill("SIGTERM");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
