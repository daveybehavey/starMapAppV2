/**
 * Issue #188 discovery harness — capture post-preview CTA screenshots + inventory.
 * Not part of CI smoke. Run manually:
 *   PHASE=before npx playwright test tests/issue-188-cta-discovery.spec.ts --workers=1
 *   PHASE=after  npx playwright test tests/issue-188-cta-discovery.spec.ts --workers=1
 */
import { test, expect, type Page, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { applySampleMoment, gotoEditor, mockGeocode } from "./test-helpers";

const PHASE = process.env.PHASE === "after" ? "after" : "before";
const PRINT = ["1", "true", "yes"].includes(String(process.env.PRINT || "").toLowerCase());
const OUT_DIR = process.env.OUT_DIR || path.resolve(`/opt/cursor/artifacts/issue-188-cta-hierarchy/${PHASE}`);
const DOCS_DIR = path.resolve("docs/evidence/issue-188");

const WIDTHS = [
  { width: 320, height: 720, force: "mobile" as const, isMobile: true },
  { width: 375, height: 720, force: "mobile" as const, isMobile: true },
  { width: 430, height: 720, force: "mobile" as const, isMobile: true },
  { width: 768, height: 900, force: "mobile" as const, isMobile: true },
  { width: 1280, height: 900, force: "desktop" as const, isMobile: false },
  { width: 1440, height: 900, force: "desktop" as const, isMobile: false },
];

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });

function classifyTreatment(className: string) {
  const c = className || "";
  if (c.includes("from-amber-400") && (c.includes("via-amber-500") || c.includes("via-amber-300"))) {
    return "gold-gradient-primary";
  }
  if (/\bbg-amber-400\b/.test(c) && !c.includes("bg-amber-400/")) return "solid-amber-primary-like";
  if (c.includes("bg-amber-300/") || c.includes("bg-amber-200/") || c.includes("bg-amber-100/")) {
    return "soft-amber";
  }
  if (c.includes("bg-white/10") || c.includes("border-white/20")) return "neutral-secondary";
  if (c.includes("underline")) return "text-link";
  return "other";
}

async function dismissNextjsDevOverlay(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
  });
}

async function mockPremium(page: Page, paid: boolean) {
  await page.route("**/api/premium**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        paid ? { paid: true, creditsRemaining: 2, plan: "credits" } : { paid: false, creditsRemaining: 0 }
      ),
    });
  });
}

async function inventoryActions(page: Page, scopeSelector?: string) {
  return page.evaluate((scopeSel) => {
    const root = scopeSel ? document.querySelector(scopeSel) : document;
    if (!root) return [];
    return [...root.querySelectorAll("button, a[href]")]
      .filter((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          ariaLabel: el.getAttribute("aria-label"),
          testId: el.getAttribute("data-testid"),
          href: el.getAttribute("href"),
          className: el.className?.toString?.() || "",
          ctaPriority: el.getAttribute("data-cta-priority"),
          inDialog: Boolean(el.closest('[role="dialog"]')),
          y: Math.round(rect.y),
          x: Math.round(rect.x),
        };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }, scopeSelector);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test(`issue #188 CTA discovery (${PHASE}${PRINT ? ", print" : ""})`, async ({ browser }) => {
  const inventory: {
    phase: string;
    printEnabled: boolean;
    capturedAt: string;
    states: Array<Record<string, unknown>>;
  } = {
    phase: PHASE,
    printEnabled: PRINT,
    capturedAt: new Date().toISOString(),
    states: [],
  };

  for (const cfg of WIDTHS) {
    for (const paid of [false, true]) {
      if (paid && ![375, 768, 1280].includes(cfg.width)) continue;

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
      await mockGeocode(page);
      await mockPremium(page, paid);
      await gotoEditor(page, { force: cfg.force });
      await applySampleMoment(page);

      // Desktop sample fills fields but does not always auto-reveal.
      if (cfg.force === "desktop") {
        const free = page.getByLabel("Free export").first();
        if (!(await free.isVisible({ timeout: 2000 }).catch(() => false))) {
          const generate = page.getByRole("button", { name: /Generate preview/i }).first();
          if (await generate.isVisible({ timeout: 3000 }).catch(() => false)) {
            await generate.click();
            await expect(free).toBeVisible({ timeout: 30_000 });
          }
        }
      }

      await dismissNextjsDevOverlay(page);
      await page.getByLabel("Free export").first().scrollIntoViewIfNeeded();

      const slug = `${cfg.width}px-${paid ? "paid" : "unpaid"}${PRINT ? "-print" : ""}`;
      const shotPath = path.join(OUT_DIR, `${slug}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      const all = await inventoryActions(page);
      const postPreview = all
        .filter((b) =>
          /Free preview|Unlock HD|HD download|Customize more|Less options|Share|Save & Remix|Print|Compare formats|Shipping/i.test(
            `${b.text} ${b.ariaLabel || ""}`
          )
        )
        .map((b) => ({
          ...b,
          treatment: classifyTreatment(b.className),
          sticky: Boolean(b.testId?.includes("sticky")),
        }));

      let customizeOpen: Record<string, unknown> | null = null;
      if (cfg.force === "mobile") {
        const customize = page.getByTestId("mobile-customize-more");
        await expect(customize).toBeVisible();
        await customize.click();
        await dismissNextjsDevOverlay(page);
        // EditorDrawer uses `md:hidden` (Tailwind md = 768px), so sticky dialog
        // only exists below the md breakpoint.
        const stickyDialogExpected = cfg.width < 768;
        if (stickyDialogExpected) {
          const drawer = page.getByRole("dialog", { name: /Date and details editor/i });
          await expect(drawer).toBeVisible({ timeout: 10_000 });
          const customizeShot = path.join(OUT_DIR, `${slug}-customize-open.png`);
          await page.screenshot({ path: customizeShot, fullPage: false });
          const dialogButtons = (await inventoryActions(page, '[role="dialog"]'))
            .filter((b) => /Unlock HD|HD download|Less options/i.test(`${b.text} ${b.ariaLabel || ""}`))
            .map((b) => ({
              ...b,
              treatment: classifyTreatment(b.className),
              sticky: true,
            }));
          customizeOpen = { screenshot: customizeShot, dialogButtons };
        } else {
          await expect(page.getByRole("button", { name: /Less options/i }).first()).toBeVisible();
          const customizeShot = path.join(OUT_DIR, `${slug}-customize-open.png`);
          await page.screenshot({ path: customizeShot, fullPage: false });
          customizeOpen = {
            screenshot: customizeShot,
            dialogButtons: [],
            note: "md+ hides sticky EditorDrawer",
          };
        }
      }

      inventory.states.push({
        viewport: cfg.width,
        force: cfg.force,
        paid,
        printEnabled: PRINT,
        screenshot: shotPath,
        postPreviewActions: postPreview,
        customizeOpen,
      });

      await context.close();
    }
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
    const actions = (
      state.postPreviewActions as Array<{ text: string; ariaLabel?: string; treatment: string }>
    )
      .map((a) => `\`${a.text || a.ariaLabel}\` → **${a.treatment}**`)
      .join("<br>");
    const sticky =
      (
        (
          state.customizeOpen as {
            dialogButtons?: Array<{ text: string; ariaLabel?: string; treatment: string }>;
          }
        )?.dialogButtons || []
      )
        .map((a) => `\`${a.text || a.ariaLabel}\` → **${a.treatment}**`)
        .join("<br>") || "—";
    mdLines.push(`| ${state.viewport} | ${state.paid} | ${actions || "—"} | ${sticky} |`);
  }
  mdLines.push("");
  mdLines.push("## Competing primary-like controls");
  mdLines.push("");
  for (const state of inventory.states) {
    const competitors = (state.postPreviewActions as Array<{ text: string; treatment: string }>).filter((a) =>
      ["gold-gradient-primary", "solid-amber-primary-like"].includes(a.treatment)
    );
    if (competitors.length > 1) {
      mdLines.push(
        `- **${state.viewport}px / paid=${state.paid}**: ${competitors
          .map((c) => `${c.text} (${c.treatment})`)
          .join(", ")}`
      );
    }
  }
  const mdPath = path.join(DOCS_DIR, `inventory-${PHASE}${PRINT ? "-print" : ""}.md`);
  fs.writeFileSync(mdPath, mdLines.join("\n"));
  expect(inventory.states.length).toBeGreaterThan(0);
});

// Silence unused Browser import lint in some configs
void (null as unknown as Browser);
