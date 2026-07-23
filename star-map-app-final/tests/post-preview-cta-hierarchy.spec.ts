import { test, expect, type Page, type Locator, type Browser } from "@playwright/test";
import { applySampleMoment, gotoEditor, mockGeocode } from "./test-helpers";

/**
 * Issue #188: Post-preview CTA hierarchy — one dominant digital purchase treatment,
 * demoted secondary actions, sticky/in-flow exclusivity, real outcomes.
 *
 * Dominance is proven by inspecting visible button treatment/text, not only by
 * trusting `data-cta-priority` markers.
 */
const WIDTHS = [320, 375, 430, 768, 1280, 1440] as const;
const PAYWALL_HEADING_PATTERN =
  /Buy this map in HD or print|Buy this map in HD|Download your print-ready star map|Unlock HD exports in seconds/i;
const PRINT_ENABLED = /^(1|true|yes)$/i.test(
  String(process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim()
);

const GOLD_PRIMARY_CLASS_FRAGMENT = "from-amber-400";

type PrimaryLikePurchaseControl = {
  text: string;
  ariaLabel: string | null;
  testId: string | null;
  className: string;
  ctaPriority: string | null;
  inDialog: boolean;
  treatment: "gold-gradient" | "solid-amber-primary-like";
};

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

/**
 * Inventory visible interactive controls that use primary-like chrome first
 * (gold gradient or solid `bg-amber-400`), then keep purchase-looking ones
 * (digital HD + print purchase actions). Markers are validated afterwards —
 * they are not the discovery mechanism.
 */
async function inventoryPrimaryLikePurchaseControls(
  page: Page,
  scopeSelector?: string
): Promise<PrimaryLikePurchaseControl[]> {
  return page.evaluate((scopeSel) => {
    const root = scopeSel ? document.querySelector(scopeSel) : document;
    if (!root) return [];

    const isVisible = (el: Element) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const classifyTreatment = (className: string): "gold-gradient" | "solid-amber-primary-like" | null => {
      if (className.includes("from-amber-400") && className.includes("via-amber-500")) {
        return "gold-gradient";
      }
      // Solid amber primary-like (not translucent /15 /20 /25 /35 tokens).
      if (/\bbg-amber-400\b/.test(className) && !className.includes("bg-amber-400/")) {
        return "solid-amber-primary-like";
      }
      return null;
    };

    const isPurchaseLooking = (el: Element) => {
      const label = `${el.getAttribute("aria-label") || ""} ${(el.textContent || "").replace(/\s+/g, " ")}`;
      // Digital purchase CTAs
      if (/Unlock HD|HD download|HD export/i.test(label)) return true;
      // Print purchase CTAs (chip, free-export print nudge, and SKU checkout rows)
      if (
        /Print\s*&\s*frame|Get it framed|framed|unframed|poster|physical gift|Opening secure checkout/i.test(
          label
        )
      ) {
        return true;
      }
      return false;
    };

    // 1) Primary-like interactive treatment first (independent of purchase labels / markers).
    const primaryLikeInteractive = [...root.querySelectorAll("button, a[href], [role='button']")].filter(
      (el) => {
        if (!isVisible(el) || (el as HTMLButtonElement).disabled) return false;
        return Boolean(classifyTreatment(el.className?.toString?.() || ""));
      }
    );

    // 2) Keep purchase-looking subset so print CTAs promoted to gold/primary also fail.
    return primaryLikeInteractive
      .filter((el) => isPurchaseLooking(el))
      .map((el) => {
        const className = el.className?.toString?.() || "";
        const treatment = classifyTreatment(className)!;
        return {
          text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          ariaLabel: el.getAttribute("aria-label"),
          testId: el.getAttribute("data-testid"),
          className,
          ctaPriority: el.getAttribute("data-cta-priority"),
          inDialog: Boolean(el.closest('[role="dialog"]')),
          treatment,
        };
      });
  }, scopeSelector);
}

function isPermittedDominantDigitalPurchase(control: PrimaryLikePurchaseControl) {
  const label = `${control.text} ${control.ariaLabel || ""}`;
  return /Unlock HD|HD download|HD export/i.test(label);
}

async function expectSoleDominantDigitalPurchaseCta(
  page: Page,
  options: {
    scopeSelector?: string;
    expectedTestId?: string | RegExp;
    expectedText?: RegExp;
  } = {}
) {
  const controls = await inventoryPrimaryLikePurchaseControls(page, options.scopeSelector);
  expect(
    controls,
    `expected exactly one primary-like purchase control (digital or print), found ${JSON.stringify(controls, null, 2)}`
  ).toHaveLength(1);

  const sole = controls[0]!;
  expect(
    isPermittedDominantDigitalPurchase(sole),
    `sole primary-like purchase control must be Unlock HD / HD download, got ${JSON.stringify(sole)}`
  ).toBe(true);
  expect(sole.ctaPriority, "dominant purchase control must declare data-cta-priority=primary").toBe(
    "primary"
  );
  expect(sole.treatment).toBe("gold-gradient");
  if (options.expectedText) {
    expect(`${sole.text} ${sole.ariaLabel || ""}`).toMatch(options.expectedText);
  }
  if (options.expectedTestId) {
    if (typeof options.expectedTestId === "string") {
      expect(sole.testId).toBe(options.expectedTestId);
    } else {
      expect(sole.testId || "").toMatch(options.expectedTestId);
    }
  }

  // Negative control: no other visible purchase-looking control may use primary chrome
  // without the primary marker (already implied by length===1 + marker check).
  const unmarkedPrimaryLike = controls.filter((c) => c.ctaPriority !== "primary");
  expect(unmarkedPrimaryLike).toEqual([]);

  return sole;
}

/** Negative control helper: assert a visible control is purchase-looking but not primary-like. */
async function expectPurchaseControlRemainsSecondary(
  locator: Locator,
  options: { nameHint: string; requireSecondaryMarker?: boolean } = { nameHint: "purchase control" }
) {
  await expect(locator, options.nameHint).toBeVisible();
  const className = (await locator.getAttribute("class")) || "";
  expect(className, `${options.nameHint} must not use gold gradient primary`).not.toContain("from-amber-400");
  expect(className, `${options.nameHint} must not use solid amber primary-like`).not.toMatch(
    /\bbg-amber-400\b(?!\/)/
  );
  if (options.requireSecondaryMarker !== false) {
    await expect(locator).toHaveAttribute("data-cta-priority", "secondary");
  }
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

      await expectSoleDominantDigitalPurchaseCta(page, {
        expectedTestId: force === "mobile" ? "mobile-unlock-hd" : "desktop-unlock-hd",
        expectedText: /Unlock HD|HD export/i,
      });

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
      await expectSoleDominantDigitalPurchaseCta(page, {
        expectedTestId: force === "mobile" ? "mobile-unlock-hd" : "desktop-unlock-hd",
        expectedText: /HD download|HD export/i,
      });
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

      // Exactly one primary-like purchase treatment inside the active dialog context.
      await expectSoleDominantDigitalPurchaseCta(page, {
        scopeSelector: '[role="dialog"][aria-label="Date and details editor"]',
        expectedTestId: "mobile-sticky-unlock-hd",
        expectedText: /Unlock HD/i,
      });

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

  test("advanced-panel Unlock HD upsells stay secondary beside sole primary (768)", async ({ browser }) => {
    // At 768px EditorDrawer is `md:hidden`, so Customize more exposes the in-flow
    // advanced Render Style panel (the Codex-identified upsell surface) without a sticky dialog.
    const { context, page } = await openEditorContext(browser, 768, false);
    await page.getByTestId("mobile-customize-more").click();
    await dismissNextjsDevOverlay(page);
    await expect(page.getByRole("button", { name: /Less options/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Render Style/i })).toBeVisible();

    await expectSoleDominantDigitalPurchaseCta(page, {
      expectedTestId: "mobile-unlock-hd",
      expectedText: /Unlock HD|HD export/i,
    });

    // Trigger intensity lock banner (unpaid) which previously used solid amber Unlock HD.
    const intensity = page.getByLabel("Star intensity");
    await intensity.scrollIntoViewIfNeeded();
    await intensity.evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "80");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.getByText(/Intensity locked/i)).toBeVisible({ timeout: 5_000 });

    const intensityUpsell = page.getByRole("button", { name: /^Unlock HD$/i });
    await expect(intensityUpsell).toBeVisible();
    await expect(intensityUpsell).toHaveAttribute("data-cta-priority", "secondary");
    const upsellClass = await intensityUpsell.getAttribute("class");
    expect(upsellClass || "").not.toMatch(/\bbg-amber-400\b/);
    expect(upsellClass || "").not.toContain("from-amber-400");

    // Trigger render-mode premium upsell.
    await page.getByRole("button", { name: /Enhanced/i }).click();
    await expect(page.getByText(/This render mode requires HD access/i)).toBeVisible({
      timeout: 5_000,
    });
    const renderUpsell = page.getByRole("button", { name: /Unlock HD →/i }).first();
    await expect(renderUpsell).toBeVisible();
    await expect(renderUpsell).toHaveAttribute("data-cta-priority", "secondary");
    const renderClass = await renderUpsell.getAttribute("class");
    expect(renderClass || "").not.toMatch(/\bbg-amber-400\b/);

    // Visible purchase-like inventory still finds exactly one primary-like control.
    await expectSoleDominantDigitalPurchaseCta(page, {
      expectedTestId: "mobile-unlock-hd",
    });

    // Upsell still opens the real unpaid HD purchase path.
    await intensityUpsell.click();
    await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
      timeout: 8_000,
    });

    await context.close();
  });

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

  test("desktop free-export upsell stays secondary after Free preview download", async ({ browser }) => {
    // Codex P2: unpaid desktop Free preview shows showFreeExportUpsell; hierarchy must
    // be re-checked so a restored gold/primary Unlock HD upsell fails hosted smoke.
    const { context, page } = await openEditorContext(browser, 1280, false);

    await expectSoleDominantDigitalPurchaseCta(page, {
      expectedTestId: "desktop-unlock-hd",
      expectedText: /Unlock HD|HD export/i,
    });

    const downloadPromise = page.waitForEvent("download");
    await page.getByLabel("Free export").first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/i);

    await expect(page.getByText(/watermarked preview/i)).toBeVisible({ timeout: 8_000 });
    const freeExportHdUpsell = page.getByTestId("desktop-free-export-hd-upsell");
    await expectPurchaseControlRemainsSecondary(freeExportHdUpsell, {
      nameHint: "free-export Unlock HD upsell",
    });

    // Negative control: inventory after free export still finds exactly one primary-like
    // purchase control (in-flow Unlock HD), not the upsell.
    await expectSoleDominantDigitalPurchaseCta(page, {
      expectedTestId: "desktop-unlock-hd",
      expectedText: /Unlock HD|HD export/i,
    });
    const afterControls = await inventoryPrimaryLikePurchaseControls(page);
    expect(afterControls.every((c) => c.testId !== "desktop-free-export-hd-upsell")).toBe(true);

    // Upsell still opens the unpaid HD purchase path.
    await freeExportHdUpsell.click();
    await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
      timeout: 8_000,
    });

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
    const printChip = page.getByTestId("desktop-print-frame");
    await expect(printChip).toBeVisible();

    // Print chip must remain non-primary; inventory includes print purchase labels so a
    // promoted gold Print & frame would fail the sole-dominant assertion below.
    await expectPurchaseControlRemainsSecondary(printChip, {
      nameHint: "Print & frame chip",
      requireSecondaryMarker: true,
    });
    await expectSoleDominantDigitalPurchaseCta(page, {
      expectedTestId: "desktop-unlock-hd",
    });

    // Print panel SKU rows (framed / unframed purchase buttons) must not use primary chrome.
    const printSkuButtons = page.locator(
      "button:has-text('Framed'), button:has-text('Unframed'), button:has-text('poster'), button:has-text('HD')"
    );
    const skuCount = await printSkuButtons.count();
    // Panel may render several SKU rows; assert each visible enabled SKU lacks primary treatment.
    for (let i = 0; i < skuCount; i += 1) {
      const sku = printSkuButtons.nth(i);
      if (!(await sku.isVisible().catch(() => false))) continue;
      const className = (await sku.getAttribute("class")) || "";
      const label = ((await sku.textContent()) || "").replace(/\s+/g, " ");
      if (!/framed|unframed|poster|physical|checkout|HD/i.test(label)) continue;
      if (/Unlock HD|HD download|HD export/i.test(label) && className.includes("from-amber-400")) {
        // The permitted digital primary may also match the broad locator; skip it.
        continue;
      }
      expect(className, `print SKU "${label}" must not use gold gradient`).not.toContain("from-amber-400");
      expect(className, `print SKU "${label}" must not use solid amber primary-like`).not.toMatch(
        /\bbg-amber-400\b(?!\/)/
      );
    }

    // Negative control: no print purchase control appears in the primary-like inventory.
    const inventory = await inventoryPrimaryLikePurchaseControls(page);
    expect(inventory.filter((c) => /Print\s*&\s*frame|Get it framed|framed|unframed/i.test(c.text))).toEqual(
      []
    );

    await printChip.click();
    await expect(page.getByRole("heading", { name: PAYWALL_HEADING_PATTERN }).first()).toBeVisible({
      timeout: 8_000,
    });
    // Print intent should surface print-oriented paywall copy without promoting a second gold digital CTA.
    await expectSoleDominantDigitalPurchaseCta(page, {
      expectedTestId: "desktop-unlock-hd",
    });

    await context.close();
  });
});
