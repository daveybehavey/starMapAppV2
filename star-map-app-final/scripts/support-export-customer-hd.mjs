#!/usr/bin/env node
/**
 * One-off support export: render 6000px HD PNG from a saved map recipe JSON.
 * Usage:
 *   node scripts/support-export-customer-hd.mjs --recipe "C:\Users\...\map-recipe.json" --out "C:\Users\...\file.png"
 */
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const args = { recipe: "", out: "", port: 3017 };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--recipe") args.recipe = argv[++i] ?? "";
    else if (token === "--out") args.out = argv[++i] ?? "";
    else if (token === "--port") args.port = Number(argv[++i] ?? args.port);
  }
  return args;
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitForServer(url, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      // retry
    }
    await wait(1000);
  }
  throw new Error(`Dev server did not start: ${url}`);
}

const args = parseArgs(process.argv.slice(2));
if (!args.recipe || !args.out) {
  console.error("Usage: node scripts/support-export-customer-hd.mjs --recipe <path.json> --out <path.png>");
  process.exit(1);
}

const recipePath = resolve(args.recipe);
const outPath = resolve(args.out);
mkdirSync(dirname(outPath), { recursive: true });
const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
const baseURL = `http://127.0.0.1:${args.port}/editor?force=desktop`;

const server = spawn("npm", ["run", "dev", "--", "-H", "127.0.0.1", "-p", String(args.port)], {
  stdio: "inherit",
  shell: true,
});

try {
  await waitForServer(`http://127.0.0.1:${args.port}/`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await page.route("**/api/premium**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paid: true,
        plan: "single",
        creditsRemaining: 1,
        subscriptionActive: false,
      }),
    });
  });

  await page.route("**/api/entitlements/consume**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        paid: true,
        plan: "single",
        creditsRemaining: 0,
        consumeToken: "support-export-no-op",
      }),
    });
  });

  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate((payload) => {
    localStorage.setItem("star-map-unlock", "true");
    localStorage.setItem("star-map-draft", JSON.stringify(payload));
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.removeItem("star-map-auto-export");
    localStorage.removeItem("star-map-revealed");
  }, recipe);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Loading editor…").waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});

  const revealButton = page.locator("#editor").getByRole("button", { name: "Generate preview" }).first();
  if (await revealButton.isVisible().catch(() => false)) {
    if (await revealButton.isEnabled().catch(() => false)) {
      await revealButton.click();
    }
  }

  await page.locator("#editor canvas").first().waitFor({ state: "visible", timeout: 120_000 });

  const hdButton = page.locator("#editor").getByRole("button", { name: "HD export" }).first();
  await hdButton.waitFor({ state: "visible", timeout: 120_000 });
  const downloadPromise = page.waitForEvent("download", { timeout: 180_000 });
  await hdButton.click();
  const download = await downloadPromise;
  await download.saveAs(outPath);

  await browser.close();
  console.log(`Saved HD export: ${outPath}`);
} finally {
  server.kill("SIGTERM");
}
