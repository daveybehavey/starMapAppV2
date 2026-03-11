import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const port = 3006;
const baseURL = `http://127.0.0.1:${port}/editor?force=desktop`;
const exportDir = join(process.cwd(), "exports");
const rawDir = join(exportDir, "raw");

mkdirSync(rawDir, { recursive: true });

const textThemes = {
  aurora: {
    title: { fontFamily: "cinzel", color: "#d7b56c", size: 48, align: "center", textShadow: false, textGlow: false },
    subtitle: { fontFamily: "raleway", color: "#c8a662", size: 24, align: "center", textShadow: false, textGlow: false },
    footer: { fontFamily: "script", color: "#b98a3d", size: 24, align: "center", textShadow: false, textGlow: false },
  },
  heirloom: {
    title: { fontFamily: "abrilFatface", color: "#7b5c24", size: 44, align: "center", textShadow: false, textGlow: false },
    subtitle: { fontFamily: "cormorant", color: "#8c6b31", size: 24, align: "center", textShadow: false, textGlow: false },
    footer: { fontFamily: "parisienne", color: "#7b5c24", size: 24, align: "center", textShadow: false, textGlow: false },
  },
  noir: {
    title: { fontFamily: "bebasNeue", color: "#e5eefb", size: 54, align: "center", textShadow: false, textGlow: false },
    subtitle: { fontFamily: "montserrat", color: "#b6c7e6", size: 20, align: "center", textShadow: false, textGlow: false },
    footer: { fontFamily: "crimsonText", color: "#94a8c7", size: 22, align: "center", textShadow: false, textGlow: false },
  },
  starlace: {
    title: { fontFamily: "playfair", color: "#d9d2c3", size: 42, align: "center", textShadow: false, textGlow: false },
    subtitle: { fontFamily: "lora", color: "#c3b8a6", size: 20, align: "center", textShadow: false, textGlow: false },
    footer: { fontFamily: "crimsonText", color: "#b6ab98", size: 20, align: "center", textShadow: false, textGlow: false },
  },
};

const examples = [
  {
    key: "wedding-aurora-heart",
    filename: "example-wedding-aurora-heart.webp",
    aspectRatio: "square",
    shape: "heart",
    renderMode: "cinematic",
    intensity: 84,
    selectedStyle: "navyGold",
    textTheme: "aurora",
    extraRenderOptions: { backgroundColor: "#071128", constellationLineScale: 1.2, showMoon: true },
    dateTime: "2024-06-01T20:45:00+03:00",
    location: {
      name: "Santorini, Greece",
      latitude: 36.3932,
      longitude: 25.4615,
      timezone: "Europe/Athens",
    },
    text: {
      title: "The Night We Became One",
      subtitle: "Santorini, Greece",
      footer: "June 1, 2024",
    },
  },
  {
    key: "anniversary-heirloom",
    filename: "example-anniversary-heirloom.webp",
    aspectRatio: "square",
    shape: "rectangle",
    renderMode: "luxe",
    intensity: 72,
    selectedStyle: "parchmentScroll",
    textTheme: "heirloom",
    extraRenderOptions: { backgroundColor: "#f2e7d2", constellationLineScale: 1.08, showMoon: true },
    dateTime: "2016-09-17T21:30:00+02:00",
    location: {
      name: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: "Europe/Paris",
    },
    text: {
      title: "Forever, Framed in Stars",
      subtitle: "Paris, France",
      footer: "September 17, 2016",
    },
  },
  {
    key: "birthday-noir",
    filename: "example-birthday-noir.webp",
    aspectRatio: "square",
    shape: "rectangle",
    renderMode: "classic",
    intensity: 48,
    selectedStyle: "midnightMinimal",
    textTheme: "noir",
    extraRenderOptions: { backgroundColor: "#0b1020", constellationLineScale: 0.95, showMoon: false },
    dateTime: "1995-07-09T22:10:00+09:00",
    location: {
      name: "Tokyo, Japan",
      latitude: 35.6762,
      longitude: 139.6503,
      timezone: "Asia/Tokyo",
    },
    text: {
      title: "Born Under This Sky",
      subtitle: "Tokyo, Japan",
      footer: "July 9, 1995",
    },
  },
  {
    key: "new-baby-heirloom",
    filename: "example-new-baby-heirloom.webp",
    aspectRatio: "square",
    shape: "rectangle",
    renderMode: "luxe",
    intensity: 64,
    selectedStyle: "parchmentScroll",
    textTheme: "heirloom",
    extraRenderOptions: { backgroundColor: "#efe1ca", constellationLineScale: 1.02, showMoon: true },
    dateTime: "2023-02-18T04:12:00-05:00",
    location: {
      name: "Toronto, Canada",
      latitude: 43.6532,
      longitude: -79.3832,
      timezone: "America/Toronto",
    },
    text: {
      title: "Welcome, Oliver",
      subtitle: "Toronto, Canada",
      footer: "February 18, 2023",
    },
  },
  {
    key: "memorial-starlace",
    filename: "example-memorial-starlace.webp",
    aspectRatio: "square",
    shape: "circle",
    renderMode: "blueprint",
    intensity: 62,
    selectedStyle: "vintageEngraving",
    textTheme: "starlace",
    extraRenderOptions: { backgroundColor: "#1d1d1d", constellationLineScale: 1.35, showMoon: true },
    dateTime: "2018-11-02T19:20:00+00:00",
    location: {
      name: "London, UK",
      latitude: 51.5072,
      longitude: -0.1276,
      timezone: "Europe/London",
    },
    text: {
      title: "In Loving Memory",
      subtitle: "London, UK",
      footer: "November 2, 2018",
    },
  },
  {
    key: "graduation-aurora",
    filename: "example-graduation-aurora.webp",
    aspectRatio: "square",
    shape: "diamond",
    renderMode: "cinematic",
    intensity: 76,
    selectedStyle: "navyGold",
    textTheme: "aurora",
    extraRenderOptions: { backgroundColor: "#111b37", constellationLineScale: 1.18, showMoon: true },
    dateTime: "2024-05-25T21:00:00-04:00",
    location: {
      name: "Boston, USA",
      latitude: 42.3601,
      longitude: -71.0589,
      timezone: "America/New_York",
    },
    text: {
      title: "Class of 2024",
      subtitle: "Boston, USA",
      footer: "May 25, 2024",
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

function buildTextBoxes(text, themeKey) {
  const theme = textThemes[themeKey];
  return [
    { id: "title", label: "Title", text: text.title, ...theme.title, position: { x: 0.5, y: 0.12 } },
    { id: "subtitle", label: "Subtitle", text: text.subtitle, ...theme.subtitle, position: { x: 0.5, y: 0.18 } },
    { id: "dedication", label: "Dedication", text: text.footer, ...theme.footer, position: { x: 0.5, y: 0.9 } },
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
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-export-examples",
    },
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    const browser = await chromium.launch();
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1800, height: 2200 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    for (const example of examples) {
      const draft = {
        version: 1,
        seed: example.key,
        datetimeISO: example.dateTime,
        location: example.location,
        textBoxes: buildTextBoxes(example.text, example.textTheme),
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
      await page.waitForFunction(() => {
        const canvas = document.querySelector("#editor canvas");
        return canvas instanceof HTMLCanvasElement && canvas.width >= 1000 && canvas.height >= 1000;
      });
      await wait(750);

      const rawPath = join(rawDir, `${example.key}.png`);
      const dataUrl = await page.locator("#editor canvas").first().evaluate((canvas) =>
        canvas instanceof HTMLCanvasElement ? canvas.toDataURL("image/png") : null,
      );
      if (!dataUrl) {
        throw new Error(`Could not capture canvas for ${example.key}`);
      }

      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      writeFileSync(rawPath, Buffer.from(base64, "base64"));

      const outputPath = join(process.cwd(), "public", "examples", example.filename);
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn(
          "ffmpeg",
          ["-y", "-i", rawPath, "-vf", "scale=1200:1200", "-c:v", "libwebp", "-quality", "84", outputPath],
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
