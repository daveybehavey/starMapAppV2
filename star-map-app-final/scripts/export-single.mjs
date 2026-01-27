import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const port = 3010;
const baseURL = `http://127.0.0.1:${port}/editor?force=desktop`;
const exportDir = join(process.cwd(), "exports", "custom");
const rawDir = join(exportDir, "raw");

mkdirSync(rawDir, { recursive: true });

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

    const draft = {
      version: 1,
      seed: "celestial-smiley",
      datetimeISO: "2026-01-23T12:40:00Z",
      location: {
        name: "Caracas, Venezuela",
        latitude: 10.4806,
        longitude: -66.9036,
        timezone: "America/Caracas",
      },
      textBoxes: [],
      selectedStyle: "navyGold",
      shape: "circle",
      aspectRatio: "square",
      renderOptions: buildRenderOptions("cinematic", 72, { backgroundColor: "#0b122b" }),
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

    const rawPath = join(rawDir, "celestial-smiley-2026-01-23.png");
    await download.saveAs(rawPath);

    const outputPath = join(exportDir, "celestial-smiley-2026-01-23.webp");
    const filters = "scale=2000:2000,crop=1600:2000";

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn(
        "ffmpeg",
        ["-y", "-i", rawPath, "-vf", filters, "-q:v", "85", outputPath],
        { stdio: "inherit" },
      );
      ffmpeg.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error("ffmpeg failed for export"));
      });
    });

    await browser.close();
  } finally {
    server.kill("SIGTERM");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
