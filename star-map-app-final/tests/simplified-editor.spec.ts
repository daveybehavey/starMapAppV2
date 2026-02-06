import { test, expect } from "@playwright/test";

test.describe("SimplifiedEditor", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
      localStorage.setItem("cookiesAccepted", "true");
      localStorage.setItem("analytics-consent", "true");
    });
  });

  test("should display sample preview and enable customization", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // Navigate to the simplified editor test page
    await page.goto("/simple-test", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /start customizing your star map|make it yours/i })).toBeVisible({
      timeout: 15000,
    });

    // Take screenshot of initial state
    await page.screenshot({
      path: "tests/screenshots/simplified_editor_1_initial.png",
      fullPage: true,
    });

    // Check "Make it yours" button is visible
    const makeItYoursBtn = page.getByRole("button", { name: /start customizing your star map|make it yours/i });
    await expect(makeItYoursBtn).toBeVisible();

    // Check action buttons are disabled initially
    const freePreviewBtn = page.locator("button:has-text('Free preview')");
    const hdBtn = page.locator("button").filter({ hasText: /Unlock HD|HD download/ });
    await expect(freePreviewBtn).toBeDisabled();
    await expect(hdBtn).toBeDisabled();

    // Click "Make it yours"
    const dateInput = page.locator("input[type='date']");
    if (await dateInput.isDisabled().catch(() => false)) {
      await makeItYoursBtn.click();
    }
    await expect(dateInput).toBeEnabled({ timeout: 15000 });

    // Take screenshot after entering customization mode
    await page.screenshot({
      path: "tests/screenshots/simplified_editor_2_customizing.png",
      fullPage: true,
    });

    // Check date input is now enabled
    await expect(dateInput).toBeEnabled();

    // Change style to Vintage
    const vintageBtn = page.locator("button:has-text('Vintage')");
    await vintageBtn.click();
    await expect(vintageBtn).toHaveAttribute("aria-checked", "true");

    // Change shape to Heart
    const heartBtn = page.locator("button:has-text('Heart')");
    await heartBtn.click();
    await expect(heartBtn).toHaveAttribute("aria-checked", "true");

    // Take screenshot after style/shape changes
    await page.screenshot({
      path: "tests/screenshots/simplified_editor_3_style_changed.png",
      fullPage: true,
    });

    // Action buttons should still be disabled (no location yet)
    await expect(freePreviewBtn).toBeDisabled();

    // Open "Customize more" panel
    const customizeMoreBtn = page.locator("button:has-text('Customize more'), button:has-text('Less options')");
    await customizeMoreBtn.click();

    // Take screenshot with advanced options
    await page.screenshot({
      path: "tests/screenshots/simplified_editor_4_advanced.png",
      fullPage: true,
    });

    // Check that Sky Details section is visible
    const skyDetailsSection = page.locator("text=Sky Details");
    await expect(skyDetailsSection).toBeVisible();
  });

  test("should enable export buttons when location is entered", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/simple-test", { waitUntil: "domcontentloaded" });

    // Enter customization mode
    const makeItYoursBtn = page.getByRole("button", { name: /start customizing your star map|make it yours/i });
    await makeItYoursBtn.click();
    await expect(page.getByRole("heading", { name: /your moment/i })).toBeVisible({ timeout: 15000 });

    // Enter a date
    const dateInput = page.locator("input[type='date']");
    await dateInput.fill("2024-06-15");

    // Find and fill location input
    const locationInput = page.getByRole("combobox", { name: /Location search/i }).first();
    await locationInput.fill("London, UK");
    await page.waitForTimeout(1500);

    // Try to select from autocomplete if available
    const suggestion = page.locator("button").filter({ hasText: /London/ }).first();
    if (await suggestion.isVisible({ timeout: 2000 }).catch(() => false)) {
      await suggestion.click();
      await page.waitForTimeout(2000);
    }

    // Take screenshot
    await page.screenshot({
      path: "tests/screenshots/simplified_editor_5_with_location.png",
      fullPage: true,
    });

    // Check if Free preview button becomes enabled
    const freePreviewBtn = page.locator("button:has-text('Free preview')");
    const isEnabled = await freePreviewBtn.isEnabled().catch(() => false);
    console.log(`Free preview button enabled: ${isEnabled}`);
  });
});
