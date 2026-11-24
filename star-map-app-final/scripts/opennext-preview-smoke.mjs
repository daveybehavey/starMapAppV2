/**
 * Local OpenNext/Wrangler preview smoke (synthetic only).
 * Usage: node scripts/opennext-preview-smoke.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "");
const outDir = join(dirname(fileURLToPath(import.meta.url)), "../../docs/proofs/663-opennext-preview");
const report = {
  base,
  startedAt: new Date().toISOString(),
  pages: {},
  mapHydration: null,
  consoleErrors: [],
  pageErrors: [],
};

async function checkPage(page, path) {
  const url = `${base}${path}`;
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const title = await page.title();
  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 500);
  const canvasCount = await page.locator("canvas").count();
  return {
    url,
    status: response?.status() ?? null,
    ok: response?.ok() ?? false,
    title,
    canvasCount,
    bodySnippet: bodyText.replace(/\s+/g, " ").trim().slice(0, 240),
  };
}

async function main() {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      report.consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });
  page.on("pageerror", (err) => {
    report.pageErrors.push(String(err?.message || err));
  });

  for (const path of ["/", "/about", "/editor", "/editor?force=desktop"]) {
    try {
      report.pages[path] = await checkPage(page, path);
      await page.screenshot({
        path: join(outDir, `${path.replace(/[/?=&]/g, "_") || "home"}.png`),
        fullPage: false,
      });
    } catch (err) {
      report.pages[path] = { error: String(err?.message || err) };
    }
  }

  // Saved-map loading (same shape as commerce map-hub-editor smoke)
  try {
    await page.goto(`${base}/editor`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.removeItem("star-map-draft");
      localStorage.removeItem("star-map-revealed");
      localStorage.removeItem("star-map-checkout-id");
      localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    });

    const payload = {
      version: 1,
      seed: "opennext-preview-smoke",
      datetimeISO: "2024-06-15T00:00:00.000Z",
      location: {
        name: "Paris, France",
        latitude: 48.8566,
        longitude: 2.3522,
        timezone: "Europe/Paris",
      },
      textBoxes: [{ text: "Our Paris Night" }, { text: "June 15, 2024" }, { text: "With love" }],
      selectedStyle: "navyGold",
      aspectRatio: "square",
      shape: "rectangle",
      renderOptions: { constellationLines: "thin" },
    };

    const create = await page.request.post(`${base}/api/maps`, { data: payload });
    const createStatus = create.status();
    const createBody = await create.json().catch(() => ({}));
    const id = createBody?.id;

    if (!create.ok() || !id) {
      report.mapHydration = {
        createStatus,
        createBody,
        error: "POST /api/maps did not return an id",
      };
    } else {
      await page.goto(`${base}/editor?map_id=${id}&source=map-hub&mode=quick`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      // Dismiss overlays if present
      for (const label of ["Decline", "Reject", "Necessary only", "Close"]) {
        const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 2000 }).catch(() => {});
        }
      }

      let canvasVisible = false;
      let canvasWaitError = null;
      try {
        await page.locator("canvas").first().waitFor({ state: "visible", timeout: 45000 });
        canvasVisible = true;
      } catch (err) {
        canvasWaitError = String(err?.message || err);
      }

      const storedMapId = await page.evaluate(() => localStorage.getItem("star-map-checkout-id"));
      const draftRaw = await page.evaluate(() => localStorage.getItem("star-map-draft"));
      const bodyHasParis = /Paris/i.test(await page.locator("body").innerText().catch(() => ""));

      await page.screenshot({
        path: join(outDir, "editor-map-id-hydration.png"),
        fullPage: false,
      });

      report.mapHydration = {
        createStatus,
        mapId: id,
        canvasVisible,
        canvasWaitError,
        storedMapId,
        draftHasParis: Boolean(draftRaw && /Paris/i.test(draftRaw)),
        draftHasTitle: Boolean(draftRaw && /Our Paris Night/i.test(draftRaw)),
        bodyHasParis,
        editorUrl: page.url(),
      };
    }
  } catch (err) {
    report.mapHydration = { error: String(err?.message || err) };
  }

  report.finishedAt = new Date().toISOString();
  report.consoleErrors = report.consoleErrors.slice(0, 40);
  report.pageErrors = report.pageErrors.slice(0, 40);

  const reportPath = join(outDir, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Report: ${reportPath}`);
  await browser.close();

  const failedPage = Object.values(report.pages).some((p) => p.error || p.ok === false);
  const hydrationOk =
    report.mapHydration &&
    report.mapHydration.canvasVisible &&
    report.mapHydration.storedMapId === report.mapHydration.mapId &&
    report.mapHydration.draftHasParis;
  if (failedPage || !hydrationOk) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
