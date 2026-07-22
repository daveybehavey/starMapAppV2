import { test, expect, type Page, type Locator } from "@playwright/test";
import { applySampleMoment, gotoEditor, mockGeocode } from "./test-helpers";
import fs from "node:fs";
import path from "node:path";

/**
 * Issue #188: Post-preview CTA hierarchy — one dominant digital purchase treatment,
 * secondary actions demoted but actionable, sticky/in-flow no duplicate active primary.
 */
const WIDTHS = [320, 375, 430, 768, 1280, 1440] as const;
const HEIGHT = 900;
const AFTER_DIR = "/opt/cursor/artifacts/issue-188-after";
const PAYWALL_HEADING_PATTERN =
  /Buy this map in HD or print|Buy this map in HD|Download your print-ready star map|Unlock HD exports in seconds/i;

fs.mkdirSync(AFTER_DIR, { recursive: true });

function forceForWidth(width: number): "mobile" | "desktop" {
  return width < 1024 ? "mobile" : "desktop";
}

async function dismissNextjsDevOverlay(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
  });
}

async function expectActionable(locator: Locator) {
  await locator.click({ trial: true });
}

async function countActivePrimaryDigital(page: Page) {
  return page.locator('[data-cta-priority="primary"][data-cta-kind="digital-purchase"]').count();
}

async function primaryDigitalButtons(page: Page) {
  return page.locator('[data-cta-priority="primary"][data-cta-kind="digital-purchase"]');
}

async function openRevealedEditor(page: Page, force: "mobile" | "desktop") {
  await mockGeocode(page);
  await gotoEditor(page, { force });
  await applySampleMoment(page);
  await dismissNextjsDevOverlay(page);
  await expect(page.getByLabel("Free export").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("post-preview CTA hierarchy (#188)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  for (const width of WIDTHS) {
    test(`unpaid hierarchy + outcomes at ${width}px`, async ({ browser }) => {
      const force = forceForWidth(width);
      const context = await browser.newContext({
        viewport: { width, height: HEIGHT },
        isMobile: width <= 430,
        hasTouch: width <= 430,
        deviceScaleFactor: width <= 430 ? 2 : 1,
        ...(width <= 430
          ? {
              userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1",
            }
          : {}),
      });
      const page = await context.newPage();
      await openRevealedEditor(page, force);

      // Exactly one dominant digital purchase CTA while customize is closed.
      await expect(await primaryDigitalButtons(page)).toHaveCount(1);
      const primary = (await primaryDigitalButtons(page)).first();
      await expect(primary).toBeVisible();
      await expect(primary).toHaveAccessibleName(/Unlock HD|HD export|HD download/i);
      await expect(primary).toHaveClass(/from-amber-400/);

      const freePreview = page.getByLabel("Free export").first();
      const customize = page.getByRole("button", { name: /Customize more/i }).first();
      const share = page.getByRole("button", { name: /Share/i }).first();

      await expect(freePreview).toBeVisible();
      await expect(customize).toBeVisible();
      await expect(share).toBeVisible();
      await expect(freePreview).toHaveAttribute("data-cta-priority", "secondary");
      await expect(customize).toHaveAttribute("data-cta-priority", "secondary");
      await expect(customize).not.toHaveClass(/bg-amber-400/);
      await expect(customize).toHaveClass(/bg-white\/10/);

      // Print (when enabled) must not use the digital primary gold gradient.
      const printCta = page.getByRole("button", { name: /Print & frame/i }).first();
      const printVisible = await printCta.isVisible().catch(() => false);
      if (printVisible) {
        await expect(printCta).toHaveAttribute("data-cta-priority", "secondary");
        await expect(printCta).not.toHaveClass(/from-amber-400/);
      }

      await page.screenshot({
        path: path.join(AFTER_DIR, `after-post-preview-${width}.png`),
        fullPage: false,
      });

      // Keyboard order: Free preview before Unlock HD before Customize more (desktop/mobile in-flow).
      await freePreview.focus();
      await expect(freePreview).toBeFocused();
      await page.keyboard.press("Tab");
      // Skip over hidden/disabled controls; land on primary digital purchase.
      let guarded = 0;
      while (guarded < 8) {
        const focusedIsPrimary = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return el?.getAttribute("data-cta-kind") === "digital-purchase";
        });
        if (focusedIsPrimary) break;
        await page.keyboard.press("Tab");
        guarded += 1;
      }
      await expect(primary).toBeFocused();

      // Real unpaid HD outcome.
      await primary.click();
      await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
        timeout: 8_000,
      });
      await page.getByRole("button", { name: /Close purchase options/i }).click();
      await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN })).toHaveCount(0);

      // Free preview remains actionable (opens download/upsell path without throwing).
      await freePreview.click();
      await page.waitForTimeout(400);
      await expect(freePreview).toBeVisible();

      // Share remains actionable.
      await expectActionable(share);
      await share.click();
      await page.waitForTimeout(300);

      // Customize more opens advanced options; sticky primary replaces in-flow primary on narrow mobile.
      await customize.click();
      await dismissNextjsDevOverlay(page);

      const drawer = page.getByRole("dialog", { name: /Date and details editor/i });
      const drawerVisible = await drawer.isVisible().catch(() => false);

      if (force === "mobile" && drawerVisible) {
        await expect(drawer).toBeVisible();
        const stickyUnlock = drawer.getByTestId("mobile-sticky-unlock-hd");
        const stickyLess = drawer.getByTestId("mobile-sticky-less-options");
        await expect(stickyUnlock).toBeVisible();
        await expect(stickyLess).toBeVisible();
        await expect(stickyUnlock).toHaveAttribute("data-cta-priority", "primary");
        await expect(stickyLess).toHaveAttribute("data-cta-priority", "secondary");

        // Only one active primary digital purchase marker in the page.
        expect(await countActivePrimaryDigital(page)).toBe(1);
        await expect(page.getByTestId("mobile-unlock-hd")).not.toHaveAttribute("data-cta-priority", "primary");

        // Accessible names + Less → Unlock order preserved (#180).
        await expect(stickyLess).toHaveAccessibleName(/Less options/i);
        await expect(stickyUnlock).toHaveAccessibleName(/Unlock HD/i);
        const lessBeforeUnlock = await stickyLess.evaluate((less) => {
          const unlock = less.parentElement?.querySelector('[data-testid="mobile-sticky-unlock-hd"]');
          if (!unlock || !less.parentElement) return false;
          const children = Array.from(less.parentElement.children);
          return children.indexOf(less) < children.indexOf(unlock as Element);
        });
        expect(lessBeforeUnlock).toBe(true);

        await page.screenshot({
          path: path.join(AFTER_DIR, `after-customize-open-${width}.png`),
          fullPage: false,
        });

        // Sticky Unlock HD still opens paywall.
        await stickyUnlock.click();
        await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
          timeout: 8_000,
        });
        await page.getByRole("button", { name: /Close purchase options/i }).click();

        await stickyLess.click();
        await expect(page.getByTestId("mobile-purchase-action-bar")).toHaveCount(0);
        await expect(page.getByTestId("mobile-customize-more")).toBeVisible();
        await expect(page.getByTestId("mobile-unlock-hd")).toHaveAttribute("data-cta-priority", "primary");
        expect(await countActivePrimaryDigital(page)).toBe(1);
      } else {
        // Desktop / tablet: customize reveals Save & Remix (or Less options); still a single primary Unlock HD.
        expect(await countActivePrimaryDigital(page)).toBe(1);
        const saveRemix = page.getByRole("button", { name: /Save & Remix/i }).first();
        const lessOptions = page.getByRole("button", { name: /Less options/i }).first();
        if (await saveRemix.isVisible().catch(() => false)) {
          await expect(saveRemix).toHaveAttribute("data-cta-priority", "secondary");
          await expectActionable(saveRemix);
        }
        if (await lessOptions.isVisible().catch(() => false)) {
          await expect(lessOptions).toHaveAttribute("data-cta-priority", "secondary");
        }
        await page.screenshot({
          path: path.join(AFTER_DIR, `after-customize-open-${width}.png`),
          fullPage: false,
        });
      }

      await context.close();
    });
  }

  test("paid/credited state uses HD download primary treatment", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.route("**/api/premium**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          paid: true,
          creditsRemaining: 2,
          plan: "pack3",
        }),
      });
    });
    await openRevealedEditor(page, "desktop");
    const primary = page.getByTestId("desktop-unlock-hd");
    await expect(primary).toBeVisible();
    await expect(primary).toHaveAttribute("data-cta-priority", "primary");
    await expect(primary).toContainText(/HD download/i);
    expect(await countActivePrimaryDigital(page)).toBe(1);
    await expect(page.getByTestId("desktop-customize-more")).toHaveAttribute("data-cta-priority", "secondary");
    await context.close();
  });

  test("print-enabled presentation stays secondary to digital primary", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await openRevealedEditor(page, "desktop");
    const printCta = page.getByTestId("desktop-print-frame");
    const printVisible = await printCta.isVisible().catch(() => false);
    test.skip(!printVisible, "NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED not set in this environment");
    await expect(page.getByTestId("desktop-unlock-hd")).toHaveAttribute("data-cta-priority", "primary");
    await expect(printCta).toHaveAttribute("data-cta-priority", "secondary");
    await expect(printCta).toHaveAttribute("data-cta-kind", "print-purchase");
    await expect(printCta).not.toHaveClass(/from-amber-400/);
    // Print still opens paywall/print intent without becoming the digital primary.
    await printCta.click();
    await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
      timeout: 8_000,
    });
    expect(await countActivePrimaryDigital(page)).toBe(1);
    await context.close();
  });
});
