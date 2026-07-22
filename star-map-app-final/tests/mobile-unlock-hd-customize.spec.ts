import { test, expect, type Page, type Locator } from "@playwright/test";
import { applySampleMoment, gotoEditor, mockGeocode } from "./test-helpers";

/**
 * Issue #180: After preview, opening Customize more must not make Unlock HD unreachable.
 * Covers 320 / 375 / 430 mobile widths.
 */
const WIDTHS = [320, 375, 430] as const;
const HEIGHT = 720;

test.describe("mobile Unlock HD remains reachable after Customize more", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  for (const width of WIDTHS) {
    test(`Unlock HD sticky purchase action at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: HEIGHT },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1",
      });
      const page = await context.newPage();

      await mockGeocode(page);
      await gotoEditor(page, { force: "mobile" });
      await applySampleMoment(page);
      await dismissNextjsDevOverlay(page);

      await page.locator("#mobile-preview").scrollIntoViewIfNeeded();
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });

      const inlineUnlock = page.getByTestId("mobile-unlock-hd");
      await expect(inlineUnlock).toBeVisible();
      await inlineUnlock.scrollIntoViewIfNeeded();
      await expect(inlineUnlock).toBeInViewport();
      await expectActionable(inlineUnlock);

      const customize = page.getByTestId("mobile-customize-more");
      await expect(customize).toBeVisible();
      await customize.click();
      await dismissNextjsDevOverlay(page);

      const drawer = page.getByRole("dialog", { name: /Date and details editor/i });
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveAttribute("aria-modal", "true");

      const purchaseBar = page.getByTestId("mobile-purchase-action-bar");
      const stickyUnlock = page.getByTestId("mobile-sticky-unlock-hd");
      const stickyLess = page.getByTestId("mobile-sticky-less-options");

      await expect(purchaseBar).toBeVisible();
      await expect(stickyUnlock).toBeVisible();
      await expect(stickyLess).toBeVisible();
      await expect(stickyUnlock).toBeInViewport();
      await expect(stickyLess).toBeInViewport();
      await expectActionable(stickyUnlock);
      await expectActionable(stickyLess);
      await expectClickableAtCenter(page, stickyUnlock);
      await expectClickableAtCenter(page, stickyLess);

      // Drawer must sit above the sticky purchase bar (no overlap of Unlock HD).
      const drawerBox = await drawer.boundingBox();
      const barBox = await purchaseBar.boundingBox();
      expect(drawerBox).toBeTruthy();
      expect(barBox).toBeTruthy();
      expect(drawerBox!.y + drawerBox!.height).toBeLessThanOrEqual(barBox!.y + 1);

      // One-interaction return to the purchase action.
      await stickyLess.click();
      await expect(purchaseBar).toHaveCount(0);
      await expect(page.getByTestId("mobile-customize-more")).toBeVisible();
      await expect(inlineUnlock).toBeVisible();
      await expect(inlineUnlock).toBeInViewport({ timeout: 5_000 });
      await expect(inlineUnlock).toBeFocused({ timeout: 5_000 });

      await context.close();
    });
  }
});

async function dismissNextjsDevOverlay(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
  });
}

async function expectActionable(locator: Locator) {
  await locator.click({ trial: true });
}

async function expectClickableAtCenter(page: Page, locator: Locator) {
  const handle = await locator.elementHandle();
  expect(handle).toBeTruthy();
  const result = await page.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 1), window.innerWidth - 1);
    const y = Math.min(Math.max(rect.top + rect.height / 2, 1), window.innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    return {
      clickable: Boolean(top && (top === el || el.contains(top))),
      topText: (top?.textContent || "").slice(0, 60),
      topTag: top?.tagName || null,
    };
  }, handle!);
  expect(
    result.clickable,
    `center hit target was <${result.topTag}> "${result.topText}"`,
  ).toBe(true);
}
