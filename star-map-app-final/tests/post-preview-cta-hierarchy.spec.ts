import { test, expect, type Page, type Locator, type Browser } from "@playwright/test";
import { applySampleMoment, gotoEditor, mockGeocode } from "./test-helpers";

/**
 * Issue #188: Post-preview CTA hierarchy — one dominant digital purchase treatment,
 * demoted secondary actions, sticky/in-flow exclusivity, real outcomes.
 */
const WIDTHS = [320, 375, 430, 768, 1280, 1440] as const;
const PAYWALL_HEADING_PATTERN =
  /Buy this map in HD or print|Buy this map in HD|Download your print-ready star map|Unlock HD exports in seconds/i;
const PRINT_ENABLED = /^(1|true|yes)$/i.test(
  String(process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim()
);

const GOLD_PRIMARY_CLASS_FRAGMENT = "from-amber-400";

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

async function revealPreview(page: Page, force: "mobile" | "desktop") {
  await applySampleMoment(page);
  if (force === "desktop") {
    const free = page.getByLabel("Free export").first();
    if (!(await free.isVisible({ timeout: 2000 }).catch(() => false))) {
      const generate = page.getByRole("button", { name: /Generate preview/i }).first();
      if (await generate.isVisible({ timeout: 3000 }).catch(() => false)) {
        await generate.click();
      }
    }
  }
  await expect(page.getByLabel("Free export").first()).toBeVisible({ timeout: 30_000 });
  await dismissNextjsDevOverlay(page);
}

function forceForWidth(width: number): "mobile" | "desktop" {
  return width < 1280 ? "mobile" : "desktop";
}

function stickyDialogExpected(width: number) {
  // EditorDrawer is `md:hidden` (Tailwind md = 768px).
  return width < 768;
}

async function expectActionable(locator: Locator) {
  await locator.click({ trial: true });
}

async function countVisiblePrimaryDigitalCtas(page: Page, scope?: Locator) {
  const root = scope ?? page.locator("body");
  return root.locator('[data-cta-priority="primary"]').evaluateAll(
    (nodes) =>
      nodes.filter((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0 &&
          el.className.toString().includes("from-amber-400")
        );
      }).length
  );
}

async function openEditorContext(browser: Browser, width: number, paid: boolean) {
  const force = forceForWidth(width);
  const isMobile = force === "mobile";
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 720 : 900 },
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 2 : 1,
    userAgent: isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  const page = await context.newPage();
  await mockGeocode(page);
  await mockPremium(page, paid);
  await gotoEditor(page, { force });
  await revealPreview(page, force);
  return { context, page, force };
}

test.describe("post-preview CTA hierarchy (#188)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  for (const width of WIDTHS) {
    test(`exactly one dominant digital purchase CTA at ${width}px (unpaid)`, async ({ browser }) => {
      const { context, page, force } = await openEditorContext(browser, width, false);
      const primary =
        force === "mobile" ? page.getByTestId("mobile-unlock-hd") : page.getByTestId("desktop-unlock-hd");
      await expect(primary).toBeVisible();
      await expect(primary).toHaveText(/Unlock HD/i);

      const primaryCount = await countVisiblePrimaryDigitalCtas(page);
      expect(primaryCount).toBe(1);

      await expect(primary).toHaveAttribute("data-cta-priority", "primary");
      await expect(primary).toHaveClass(new RegExp(GOLD_PRIMARY_CLASS_FRAGMENT));
      await expect(primary).toHaveAccessibleName(/Unlock HD|HD export|HD download/i);

      // Customize more must not use primary-like solid amber treatment.
      const customize =
        force === "mobile"
          ? page.getByTestId("mobile-customize-more")
          : page.getByTestId("desktop-customize-more");
      await expect(customize).toBeVisible();
      await expect(customize).toHaveAttribute("data-cta-priority", "secondary");
      const customizeClass = await customize.getAttribute("class");
      expect(customizeClass || "").not.toMatch(/\bbg-amber-400\b/);
      expect(customizeClass || "").not.toContain("from-amber-400");

      // Secondary actions remain visible.
      await expect(page.getByLabel("Free export").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Share/i }).first()).toBeVisible();
      await expect(customize).toBeVisible();

      await context.close();
    });
  }

  for (const width of [375, 1280] as const) {
    test(`paid state shows HD download as sole primary at ${width}px`, async ({ browser }) => {
      const { context, page, force } = await openEditorContext(browser, width, true);
      const primary =
        force === "mobile" ? page.getByTestId("mobile-unlock-hd") : page.getByTestId("desktop-unlock-hd");
      await expect(primary).toBeVisible();
      await expect(primary).toHaveText(/HD download/i);
      expect(await countVisiblePrimaryDigitalCtas(page)).toBe(1);
      await expect(primary).toHaveAttribute("data-cta-priority", "primary");
      await expect(primary).toHaveAccessibleName(/HD download|HD export/i);
      await context.close();
    });
  }

  for (const width of [320, 375, 430] as const) {
    test(`sticky customize context has one active primary at ${width}px`, async ({ browser }) => {
      const { context, page } = await openEditorContext(browser, width, false);
      expect(stickyDialogExpected(width)).toBe(true);

      const inlineUnlock = page.getByTestId("mobile-unlock-hd");
      await expect(inlineUnlock).toBeVisible();
      await expect(inlineUnlock).toHaveAttribute("data-cta-priority", "primary");

      await page.getByTestId("mobile-customize-more").click();
      await dismissNextjsDevOverlay(page);
      const drawer = page.getByRole("dialog", { name: /Date and details editor/i });
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveAttribute("aria-modal", "true");

      const stickyUnlock = drawer.getByTestId("mobile-sticky-unlock-hd");
      const stickyLess = drawer.getByTestId("mobile-sticky-less-options");
      await expect(stickyUnlock).toBeVisible();
      await expect(stickyLess).toBeVisible();
      await expect(stickyUnlock).toHaveAttribute("data-cta-priority", "primary");
      await expect(stickyLess).toHaveAttribute("data-cta-priority", "secondary");
      await expect(stickyUnlock).toHaveAccessibleName(/Unlock HD/i);
      await expect(stickyLess).toHaveAccessibleName(/Less options/i);

      // Exactly one primary inside the active dialog interaction context.
      expect(await countVisiblePrimaryDigitalCtas(page, drawer)).toBe(1);

      // Logical LTR order: Less options then Unlock HD.
      const lessBox = await stickyLess.boundingBox();
      const unlockBox = await stickyUnlock.boundingBox();
      expect(lessBox!.x).toBeLessThan(unlockBox!.x);

      // Secondary Share / Save & Remix remain available while customize is open.
      await expect(page.getByRole("button", { name: /Share star map/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Save and remix/i }).first()).toBeVisible();

      await context.close();
    });
  }

  test("representative actions produce established outcomes (375 mobile unpaid)", async ({ browser }) => {
    const { context, page } = await openEditorContext(browser, 375, false);

    // Free preview → real download.
    const downloadPromise = page.waitForEvent("download");
    await page.getByLabel("Free export").first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/i);

    // In-flow Unlock HD → unpaid paywall.
    await dismissNextjsDevOverlay(page);
    await page.getByTestId("mobile-unlock-hd").click();
    await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
      timeout: 8_000,
    });
    await page.getByRole("button", { name: /Close purchase options/i }).click();
    await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN })).toHaveCount(0);

    // Customize more opens dialog; Less options restores in-flow purchase CTA.
    await dismissNextjsDevOverlay(page);
    await page.getByTestId("mobile-customize-more").click();
    const drawer = page.getByRole("dialog", { name: /Date and details editor/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("mobile-sticky-unlock-hd")).toBeVisible();
    await drawer.getByTestId("mobile-sticky-less-options").click();
    await expect(page.getByTestId("mobile-purchase-action-bar")).toHaveCount(0);
    await expect(page.getByTestId("mobile-unlock-hd")).toBeVisible();

    // Share remains actionable.
    await expectActionable(page.getByRole("button", { name: /Share star map/i }).first());

    await context.close();
  });

  test("sticky Unlock HD still opens unpaid paywall (375)", async ({ browser }) => {
    const { context, page } = await openEditorContext(browser, 375, false);
    await page.getByTestId("mobile-customize-more").click();
    await dismissNextjsDevOverlay(page);
    const drawer = page.getByRole("dialog", { name: /Date and details editor/i });
    await expect(drawer).toBeVisible();
    await drawer.getByTestId("mobile-sticky-unlock-hd").click();
    await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
      timeout: 8_000,
    });
    await context.close();
  });

  test("desktop keyboard order keeps Unlock HD before demoted Customize more", async ({ browser }) => {
    const { context, page } = await openEditorContext(browser, 1280, false);
    const free = page.getByLabel("Free export").first();
    const unlock = page.getByTestId("desktop-unlock-hd");
    const customize = page.getByTestId("desktop-customize-more");
    const share = page.getByRole("button", { name: /Share/i }).first();

    await expect(free).toBeVisible();
    await expect(unlock).toBeVisible();
    await expect(customize).toBeVisible();
    await expect(share).toBeVisible();

    await expect(unlock).toHaveAccessibleName(/HD export|Unlock HD/i);
    await expect(customize).toHaveAccessibleName(/Customize more/i);

    const order = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button")].filter((btn) => {
        const name = (btn.getAttribute("aria-label") || btn.textContent || "").trim();
        return /Free export|HD export|Customize more|Share/i.test(name);
      });
      return buttons.map((btn) => (btn.getAttribute("aria-label") || btn.textContent || "").trim());
    });
    const freeIdx = order.findIndex((n) => /Free export|Free preview/i.test(n));
    const unlockIdx = order.findIndex((n) => /HD export|Unlock HD/i.test(n));
    const customizeIdx = order.findIndex((n) => /Customize more/i.test(n));
    const shareIdx = order.findIndex((n) => /Share/i.test(n));
    expect(freeIdx).toBeGreaterThanOrEqual(0);
    expect(unlockIdx).toBeGreaterThan(freeIdx);
    expect(customizeIdx).toBeGreaterThan(unlockIdx);
    expect(shareIdx).toBeGreaterThan(customizeIdx);

    // Tab order sample: focus free then tab to unlock.
    await free.focus();
    await expect(free).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(unlock).toBeFocused();

    // Unlock HD outcome still opens paywall.
    await unlock.click();
    await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
      timeout: 8_000,
    });

    await context.close();
  });

  test("print-enabled presentation stays secondary to digital primary", async ({ browser }) => {
    test.skip(
      !PRINT_ENABLED,
      "Set NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=true (and restart Playwright webServer) for print coverage"
    );

    const { context, page } = await openEditorContext(browser, 1280, false);
    await expect(page.getByTestId("desktop-unlock-hd")).toBeVisible();
    await expect(page.getByTestId("desktop-print-frame")).toBeVisible();
    expect(await countVisiblePrimaryDigitalCtas(page)).toBe(1);

    const printClass = await page.getByTestId("desktop-print-frame").getAttribute("class");
    expect(printClass || "").not.toContain("from-amber-400");
    expect(printClass || "").toMatch(/bg-amber-300\//);

    await page.getByTestId("desktop-print-frame").click();
    await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
      timeout: 8_000,
    });
    // Print intent should surface print-oriented paywall copy without promoting a second gold digital CTA.
    await expect(page.locator('[data-cta-priority="primary"]')).toHaveCount(1);

    await context.close();
  });
});
