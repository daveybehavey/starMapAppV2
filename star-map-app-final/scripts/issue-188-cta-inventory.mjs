/**
 * Issue #188 discovery: inventory post-preview editor CTAs and capture screenshots.
 *
 * Usage (from star-map-app-final):
 *   PHASE=before node scripts/issue-188-cta-inventory.mjs
 *   PHASE=after  node scripts/issue-188-cta-inventory.mjs
 *
 * Optional:
 *   PRINT=1  — start with print checkout enabled
 *   OUT_DIR=… — override output directory
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const PHASE = process.env.PHASE === "after" ? "after" : "before";
const PRINT = ["1", "true", "yes"].includes(String(process.env.PRINT || "").toLowerCase());
const PORT = Number(process.env.PORT || 3014);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR =
  process.env.OUT_DIR ||
  path.resolve(`/opt/cursor/artifacts/issue-188-cta-hierarchy/${PHASE}`);
const DOCS_DIR = path.resolve("docs/evidence/issue-188");

/** Tailwind `md` breakpoint (px). EditorDrawer is wrapped in `md:hidden`. */
export const EDITOR_DRAWER_MD_BREAKPOINT_PX = 768;

export const WIDTHS = [
  { width: 320, height: 720, force: "mobile", isMobile: true },
  { width: 375, height: 720, force: "mobile", isMobile: true },
  { width: 430, height: 720, force: "mobile", isMobile: true },
  { width: 768, height: 900, force: "mobile", isMobile: true },
  { width: 1280, height: 900, force: "desktop", isMobile: false },
  { width: 1440, height: 900, force: "desktop", isMobile: false },
];

/** Sticky EditorDrawer is only mounted below Tailwind `md` (768px). */
export function stickyDialogExpected(width) {
  return Number(width) < EDITOR_DRAWER_MD_BREAKPOINT_PX;
}

/**
 * Whether the inventory helper should wait for / inventory the sticky drawer.
 * Matches Playwright discovery: force=mobile alone is not enough at exactly 768.
 */
export function shouldAttemptStickyDrawer(cfg) {
  return cfg?.force === "mobile" && stickyDialogExpected(cfg.width);
}

export function expectedInventoryCaseCount(widths = WIDTHS) {
  let count = 0;
  for (const cfg of widths) {
    for (const paid of [false, true]) {
      if (paid && ![375, 768, 1280].includes(cfg.width)) continue;
      count += 1;
    }
  }
  return count;
}

export function assertInventoryComplete(states, expectedCount = expectedInventoryCaseCount()) {
  const actual = Array.isArray(states) ? states.length : 0;
  if (actual !== expectedCount) {
    throw new Error(
      `Issue #188 inventory incomplete: expected ${expectedCount} viewport/paid cases, got ${actual}`,
    );
  }
}

function writeFileAtomic(filePath, contents) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(tmpPath, contents);
  fs.renameSync(tmpPath, filePath);
}

/**
 * Fail-closed evidence writer: refuses to overwrite canonical JSON/Markdown unless
 * the inventory is marked complete and has the required case count.
 */
export function writeInventoryEvidence({
  inventory,
  outDir,
  docsDir,
  phase,
  printEnabled,
  complete,
}) {
  if (!complete) {
    throw new Error(
      "Refusing to write Issue #188 inventory evidence: capture sequence incomplete",
    );
  }
  assertInventoryComplete(inventory?.states);

  const suffix = printEnabled ? "-print" : "";
  const jsonName = `inventory-${phase}${suffix}.json`;
  const mdName = `inventory-${phase}${suffix}.md`;
  const jsonBody = `${JSON.stringify(inventory, null, 2)}\n`;

  const mdLines = [
    `# Issue #188 CTA inventory (${phase}${printEnabled ? ", print enabled" : ", print disabled"})`,
    "",
    `Captured: ${inventory.capturedAt}`,
    "",
    "| Viewport | Paid | Actions (label → treatment) | Sticky when customize open |",
    "| --- | --- | --- | --- |",
  ];
  for (const state of inventory.states) {
    const actions = state.postPreviewActions
      .map((a) => `\`${a.text || a.ariaLabel}\` → **${a.treatment}**`)
      .join("<br>");
    const sticky =
      state.customizeOpen?.dialogButtons
        ?.map((a) => `\`${a.text || a.ariaLabel}\` → **${a.treatment}**`)
        .join("<br>") || "—";
    mdLines.push(`| ${state.viewport} | ${state.paid} | ${actions || "—"} | ${sticky} |`);
  }
  mdLines.push("");
  mdLines.push("## Competing primary-like controls");
  mdLines.push("");
  for (const state of inventory.states) {
    const competitors = state.postPreviewActions.filter((a) =>
      ["gold-gradient-primary", "solid-amber-primary-like"].includes(a.treatment),
    );
    if (competitors.length > 1) {
      mdLines.push(
        `- **${state.viewport}px / paid=${state.paid}**: ${competitors
          .map((c) => `${c.text} (${c.treatment})`)
          .join(", ")}`,
      );
    }
  }
  const mdBody = `${mdLines.join("\n")}\n`;

  const artifactJson = path.join(outDir, jsonName);
  const docsJson = path.join(docsDir, jsonName);
  const docsMd = path.join(docsDir, mdName);
  writeFileAtomic(artifactJson, jsonBody);
  writeFileAtomic(docsJson, jsonBody);
  writeFileAtomic(docsMd, mdBody);
  return { artifactJson, docsJson, docsMd };
}

function startServer() {
  const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "-H", "127.0.0.1", "-p", String(PORT)], {
    env: {
      ...process.env,
      STRIPE_SECRET_KEY: "sk_test_playwright_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_playwright_dummy",
      NEXT_PUBLIC_DISABLE_PROMO_POPUP: "true",
      NEXT_DIST_DIR: `.next-issue-188-${PHASE}${PRINT ? "-print" : ""}`,
      NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED: PRINT ? "true" : "false",
      PRINT_CHECKOUT_ENABLED: PRINT ? "true" : "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => {
    log += d.toString();
  });
  child.stderr.on("data", (d) => {
    log += d.toString();
  });
  return { child, getLog: () => log };
}

async function waitForServer(timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE);
      if (res.ok || res.status >= 400) return;
    } catch {
      // retry
    }
    await delay(500);
  }
  throw new Error(`Server did not become ready at ${BASE}`);
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((n) => n.remove());
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.setItem("cookiesAccepted", "true");
    localStorage.setItem("analytics-consent", "true");
  });
  for (const name of ["Close", "Accept", "Maybe later"]) {
    const btn = page.getByRole("button", { name: new RegExp(`^${name}$`, "i") }).first();
    if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
      await btn.click({ timeout: 1000 }).catch(() => undefined);
    }
  }
}

async function applySample(page) {
  await dismissOverlays(page);
  const free = page.getByLabel("Free export").first();
  if (await free.isVisible({ timeout: 2500 }).catch(() => false)) return;
  const sample = page
    .getByRole("button", { name: /Try a sample moment|Try sample moment|Use sample moment/i })
    .first();
  if (await sample.isVisible({ timeout: 6000 }).catch(() => false)) {
    await sample.click({ timeout: 5000 }).catch(async () => sample.click({ force: true }));
  } else {
    const generate = page.getByRole("button", { name: /Generate preview|Preview your map/i }).first();
    if (await generate.isVisible({ timeout: 4000 }).catch(() => false)) {
      await generate.click().catch(() => undefined);
    }
  }
  await page.getByLabel("Free export").first().waitFor({ state: "visible", timeout: 30_000 });
}

function classifyTreatment(className) {
  const c = className || "";
  if (c.includes("from-amber-400") && c.includes("via-amber-500")) return "gold-gradient-primary";
  if (c.includes("bg-amber-400") && !c.includes("bg-amber-400/")) return "solid-amber-primary-like";
  if (c.includes("bg-amber-300/") || c.includes("bg-amber-200/") || c.includes("bg-amber-100/"))
    return "soft-amber";
  if (c.includes("bg-white/10") || c.includes("border-white/20")) return "neutral-secondary";
  if (c.includes("underline")) return "text-link";
  return "other";
}

async function inventoryVisibleButtons(page, scope = null) {
  return page.evaluate((scopeSel) => {
    const root = scopeSel ? document.querySelector(scopeSel) : document;
    if (!root) return [];
    const nodes = [...root.querySelectorAll("button, a[href]")];
    return nodes
      .filter((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        return {
          index,
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          ariaLabel: el.getAttribute("aria-label"),
          testId: el.getAttribute("data-testid"),
          href: el.getAttribute("href"),
          className: el.className?.toString?.() || "",
          inDialog: Boolean(el.closest('[role="dialog"]')),
          y: Math.round(rect.y),
          x: Math.round(rect.x),
        };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }, scope);
}

async function captureState(browser, cfg, paid, labelSuffix) {
  const context = await browser.newContext({
    viewport: { width: cfg.width, height: cfg.height },
    isMobile: cfg.isMobile,
    hasTouch: cfg.isMobile,
    deviceScaleFactor: cfg.isMobile ? 2 : 1,
    userAgent: cfg.isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  const page = await context.newPage();
  await page.route("**/api/geocode**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 1,
          name: "Paris, France",
          latitude: 48.8566,
          longitude: 2.3522,
          timezone: "Europe/Paris",
        },
      ]),
    });
  });
  await page.route("**/api/premium**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        paid
          ? { paid: true, creditsRemaining: 2, plan: "credits" }
          : { paid: false, creditsRemaining: 0 },
      ),
    });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.setItem("cookiesAccepted", "true");
    localStorage.setItem("analytics-consent", "true");
  });

  await page.goto(`${BASE}/editor?force=${cfg.force}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.locator("#editor").waitFor({ state: "visible", timeout: 90_000 });
  await applySample(page);
  await dismissOverlays(page);

  const slug = `${cfg.width}px-${paid ? "paid" : "unpaid"}${PRINT ? "-print" : ""}${labelSuffix}`;
  const shotPath = path.join(OUT_DIR, `${slug}.png`);
  await page.screenshot({ path: shotPath, fullPage: false });

  const buttons = await inventoryVisibleButtons(page);
  const postPreview = buttons
    .filter((b) =>
      /Free preview|Unlock HD|HD download|Customize more|Less options|Share|Save & Remix|Print|Compare formats|Shipping/i.test(
        `${b.text} ${b.ariaLabel || ""}`,
      ),
    )
    .map((b) => ({
      ...b,
      treatment: classifyTreatment(b.className),
      sticky: Boolean(b.testId?.includes("sticky") || (b.inDialog && /Unlock HD|Less options|HD download/i.test(b.text))),
    }));

  let customizeState = null;
  // force=mobile at exactly 768 still uses mobile chrome, but EditorDrawer is
  // `md:hidden` — only wait for the sticky dialog below the md breakpoint.
  if (cfg.force === "mobile") {
    const customize = page.getByTestId("mobile-customize-more");
    if (await customize.isVisible().catch(() => false)) {
      await customize.click();
      const customizeShot = path.join(OUT_DIR, `${slug}-customize-open.png`);
      if (shouldAttemptStickyDrawer(cfg)) {
        await page.getByRole("dialog", { name: /Date and details editor/i }).waitFor({
          state: "visible",
          timeout: 10_000,
        });
        await page.screenshot({ path: customizeShot, fullPage: false });
        const stickyButtons = await inventoryVisibleButtons(page, '[role="dialog"]');
        customizeState = {
          screenshot: customizeShot,
          dialogButtons: stickyButtons
            .filter((b) => /Unlock HD|HD download|Less options/i.test(`${b.text} ${b.ariaLabel || ""}`))
            .map((b) => ({
              ...b,
              treatment: classifyTreatment(b.className),
              sticky: true,
            })),
        };
      } else {
        await page.screenshot({ path: customizeShot, fullPage: false });
        customizeState = {
          screenshot: customizeShot,
          dialogButtons: [],
          note: "md+ hides sticky EditorDrawer",
        };
      }
    }
  }

  await context.close();
  return {
    viewport: cfg.width,
    force: cfg.force,
    paid,
    printEnabled: PRINT,
    screenshot: shotPath,
    postPreviewActions: postPreview,
    customizeOpen: customizeState,
  };
}

export async function runInventoryCapture({
  widths = WIDTHS,
  outDir = OUT_DIR,
  docsDir = DOCS_DIR,
  phase = PHASE,
  printEnabled = PRINT,
  launchBrowser = () => chromium.launch({ headless: true }),
  capture = captureState,
  startDevServer = startServer,
  waitReady = waitForServer,
} = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const inventory = {
    phase,
    printEnabled,
    baseCommitHint: "issue-188 discovery",
    capturedAt: new Date().toISOString(),
    states: [],
  };

  const { child, getLog } = startDevServer();
  let complete = false;
  let written = null;

  try {
    await waitReady();
    const browser = await launchBrowser();
    try {
      for (const cfg of widths) {
        for (const paid of [false, true]) {
          if (paid && ![375, 768, 1280].includes(cfg.width)) continue;
          console.log(`Capturing ${cfg.width} paid=${paid} print=${printEnabled}`);
          inventory.states.push(await capture(browser, cfg, paid, ""));
        }
      }
    } finally {
      await browser.close().catch(() => undefined);
    }

    assertInventoryComplete(inventory.states, expectedInventoryCaseCount(widths));
    complete = true;
    written = writeInventoryEvidence({
      inventory,
      outDir,
      docsDir,
      phase,
      printEnabled,
      complete,
    });
    console.log(`Wrote ${written.artifactJson}`);
    console.log(`Wrote ${written.docsMd}`);
    return { inventory, written, complete: true };
  } catch (error) {
    console.error(error);
    console.error(getLog().slice(-4000));
    throw error;
  } finally {
    child.kill("SIGTERM");
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    await runInventoryCapture();
  } catch {
    process.exitCode = 1;
  }
}
