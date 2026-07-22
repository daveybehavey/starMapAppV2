import { test, expect, type Page, type Locator } from "@playwright/test";
import { applySampleMoment, gotoEditor, mockGeocode } from "./test-helpers";

/**
 * Issue #180: After preview, opening Customize more must not make Unlock HD unreachable.
 * Covers 320 / 375 / 430 mobile widths.
 */
const WIDTHS = [320, 375, 430] as const;
const HEIGHT = 720;
const PAYWALL_HEADING_PATTERN =
  /Buy this map in HD or print|Buy this map in HD|Download your print-ready star map|Unlock HD exports in seconds/i;

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

      // Opening customization places focus on the dialog handle.
      await expect(page.getByRole("button", { name: /Collapse date and details panel/i })).toBeFocused({
        timeout: 5_000,
      });

      const purchaseBar = drawer.getByTestId("mobile-purchase-action-bar");
      const stickyUnlock = drawer.getByTestId("mobile-sticky-unlock-hd");
      const stickyLess = drawer.getByTestId("mobile-sticky-less-options");

      // Purchase actions live inside the modal dialog subtree (a11y-correct).
      await expect(purchaseBar).toBeVisible();
      await expect(stickyUnlock).toBeVisible();
      await expect(stickyLess).toBeVisible();
      expect(await stickyUnlock.evaluate((el) => Boolean(el.closest('[role="dialog"]')))).toBe(true);
      expect(await stickyLess.evaluate((el) => Boolean(el.closest('[role="dialog"]')))).toBe(true);

      // Meaningful accessible names + logical LTR order (Less options, then Unlock HD).
      await expect(stickyLess).toHaveAccessibleName(/Less options/i);
      await expect(stickyUnlock).toHaveAccessibleName(/Unlock HD/i);
      const lessBox = await stickyLess.boundingBox();
      const unlockBox = await stickyUnlock.boundingBox();
      expect(lessBox).toBeTruthy();
      expect(unlockBox).toBeTruthy();
      expect(lessBox!.x).toBeLessThan(unlockBox!.x);
      const lessBeforeUnlock = await stickyLess.evaluate((less, unlockTestId) => {
        const unlock = less.parentElement?.querySelector(`[data-testid="${unlockTestId}"]`);
        if (!unlock || !less.parentElement) return false;
        const children = [...less.parentElement.children];
        return children.indexOf(less) < children.indexOf(unlock);
      }, "mobile-sticky-unlock-hd");
      expect(lessBeforeUnlock).toBe(true);

      await expect(stickyUnlock).toBeInViewport();
      await expect(stickyLess).toBeInViewport();
      await expectActionable(stickyUnlock);
      await expectActionable(stickyLess);
      await expectClickableAtCenter(page, stickyUnlock);
      await expectClickableAtCenter(page, stickyLess);

      // Details content must not overlap the purchase footer.
      const noContentOverlap = await drawer.evaluate((dialog) => {
        const bar = dialog.querySelector('[data-testid="mobile-purchase-action-bar"]');
        if (!bar) return false;
        const content = bar.previousElementSibling as HTMLElement | null;
        if (!content || content.hasAttribute("hidden")) return true;
        const contentBottom = content.getBoundingClientRect().bottom;
        const barTop = bar.getBoundingClientRect().top;
        return contentBottom <= barTop + 1;
      });
      expect(noContentOverlap).toBe(true);

      // Real unpaid HD purchase path from the sticky CTA.
      await stickyUnlock.click();
      await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
        timeout: 8_000,
      });
      await page.getByRole("button", { name: /Close purchase options/i }).click();
      await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN })).toHaveCount(0);

      // One-interaction return to the in-flow purchase action with focus restore.
      await expect(purchaseBar).toBeVisible();
      await stickyLess.click();
      await expect(page.getByTestId("mobile-purchase-action-bar")).toHaveCount(0);
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
  expect(result.clickable, `center hit target was <${result.topTag}> "${result.topText}"`).toBe(true);
}
