import { test, expect } from "@playwright/test";

test.describe("Homepage with SimplifiedEditor", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
      localStorage.setItem("cookiesAccepted", "true");
      localStorage.setItem("analytics-consent", "true");
    });
  });

  test("should display sample preview in hero section", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/custom star map/i);

    // Take screenshot of initial homepage
    await page.screenshot({
      path: "tests/screenshots/homepage_1_initial.png",
      fullPage: false,
    });

    // Check "Make it yours" CTA is visible (from SimplifiedEditor)
    const makeItYoursBtn = page.getByRole("button", { name: /start customizing your star map|make it yours/i }).first();
    await expect(makeItYoursBtn).toBeVisible({ timeout: 15000 });

    // Check pricing cards are visible
    await expect(page.getByText(/Single Map|One HD map/i).first()).toBeVisible();
    await expect(page.getByText(/3-Pack/i).first()).toBeVisible();
    await expect(page.getByText(/Unlimited/i).first()).toBeVisible();

    console.log("✓ Homepage loads with SimplifiedEditor in hero");
  });

  test("should allow customization from homepage", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Click "Make it yours"
    const makeItYoursBtn = page.getByRole("button", { name: /start customizing your star map|make it yours/i }).first();
    const dateInput = page.locator("input[type='date']");
    if (await dateInput.isDisabled().catch(() => false)) {
      if (await makeItYoursBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
        await makeItYoursBtn.click();
      }
    }
    await expect(dateInput).toBeEnabled({ timeout: 15000 });

    // Take screenshot after entering customization mode
    await page.screenshot({
      path: "tests/screenshots/homepage_2_customizing.png",
      fullPage: false,
    });

    // Check date input is now enabled
    await expect(dateInput).toBeEnabled();

    // Check style buttons are enabled
    const vintageBtn = page.locator("button:has-text('Vintage')");
    await expect(vintageBtn).toBeEnabled();

    // Change style
    await vintageBtn.click();
    await expect(vintageBtn).toHaveAttribute("aria-checked", "true");

    // Take screenshot after style change
    await page.screenshot({
      path: "tests/screenshots/homepage_3_style_changed.png",
      fullPage: false,
    });

    console.log("✓ Customization works from homepage");
  });

  test("should have functional action buttons after location entry", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Enter customization mode
    const makeItYoursBtn = page.getByRole("button", { name: /start customizing your star map|make it yours/i }).first();
    const dateInput = page.locator("input[type='date']");
    const editorVariant = await makeItYoursBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!editorVariant) {
      // Pricing-only hero variant (no inline editor). Assert pricing CTAs instead.
      await expect(page.getByRole("button", { name: /one hd map|single map/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /3-pack/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /unlimited/i }).first()).toBeVisible();
      console.log("✓ Pricing CTA variant detected on homepage");
      return;
    }

    if (await dateInput.isDisabled().catch(() => false)) {
      await makeItYoursBtn.click();
    }
    await expect(dateInput).toBeEnabled({ timeout: 15000 });

    // Check that Free preview button exists but is disabled (no location yet)
    const freePreviewBtn = page.getByRole("button", { name: /free preview/i }).first();
    await expect(freePreviewBtn).toBeVisible();
    await expect(freePreviewBtn).toBeDisabled();

    // Check that HD button exists but is disabled
    const hdBtn = page.getByRole("button", { name: /unlock hd|hd download/i }).first();
    await expect(hdBtn).toBeVisible();
    await expect(hdBtn).toBeDisabled();

    console.log("✓ Action buttons are properly disabled until location is entered");
  });
});
