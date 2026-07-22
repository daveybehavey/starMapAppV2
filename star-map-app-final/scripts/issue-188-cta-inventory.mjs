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

const PHASE = process.env.PHASE === "after" ? "after" : "before";
const PRINT = ["1", "true", "yes"].includes(String(process.env.PRINT || "").toLowerCase());
const PORT = Number(process.env.PORT || 3014);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR =
  process.env.OUT_DIR ||
  path.resolve(`/opt/cursor/artifacts/issue-188-cta-hierarchy/${PHASE}`);
const DOCS_DIR = path.resolve("docs/evidence/issue-188");

const WIDTHS = [
  { width: 320, height: 720, force: "mobile", isMobile: true },
  { width: 375, height: 720, force: "mobile", isMobile: true },
  { width: 430, height: 720, force: "mobile", isMobile: true },
  { width: 768, height: 900, force: "mobile", isMobile: true },
  { width: 1280, height: 900, force: "desktop", isMobile: false },
  { width: 1440, height: 900, force: "desktop", isMobile: false },
];

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });

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
  if (cfg.force === "mobile") {
    const customize = page.getByTestId("mobile-customize-more");
    if (await customize.isVisible().catch(() => false)) {
      await customize.click();
      await page.getByRole("dialog", { name: /Date and details editor/i }).waitFor({
        state: "visible",
        timeout: 10_000,
      });
      const customizeShot = path.join(OUT_DIR, `${slug}-customize-open.png`);
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

const { child, getLog } = startServer();
const inventory = {
  phase: PHASE,
  printEnabled: PRINT,
  baseCommitHint: "issue-188 discovery",
  capturedAt: new Date().toISOString(),
  states: [],
};

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  for (const cfg of WIDTHS) {
    for (const paid of [false, true]) {
      // Paid matrix only at representative widths to keep discovery bounded.
      if (paid && ![375, 768, 1280].includes(cfg.width)) continue;
      console.log(`Capturing ${cfg.width} paid=${paid} print=${PRINT}`);
      inventory.states.push(await captureState(browser, cfg, paid, ""));
    }
  }
  await browser.close();
} catch (error) {
  console.error(error);
  console.error(getLog().slice(-4000));
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
}

const jsonPath = path.join(OUT_DIR, `inventory-${PHASE}${PRINT ? "-print" : ""}.json`);
const docsJson = path.join(DOCS_DIR, `inventory-${PHASE}${PRINT ? "-print" : ""}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(inventory, null, 2));
fs.writeFileSync(docsJson, JSON.stringify(inventory, null, 2));

const mdLines = [
  `# Issue #188 CTA inventory (${PHASE}${PRINT ? ", print enabled" : ", print disabled"})`,
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
  const sticky = state.customizeOpen?.dialogButtons
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
      `- **${state.viewport}px / paid=${state.paid}**: ${competitors.map((c) => `${c.text} (${c.treatment})`).join(", ")}`,
    );
  }
}
const mdPath = path.join(DOCS_DIR, `inventory-${PHASE}${PRINT ? "-print" : ""}.md`);
fs.writeFileSync(mdPath, mdLines.join("\n"));
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);
