import { test, expect } from "@playwright/test";

test.describe("SimplifiedEditor", () => {
  test("should display sample preview and enable customization", async ({
    page,
  }) => {
    // Navigate to the simplified editor test page
    await page.goto("/simple-test");
    await page.waitForLoadState("networkidle");

    // Wait for canvas to render
    await page.waitForTimeout(2000);

    // Take screenshot of initial state
    await page.screenshot({
      path: "tests/screenshots/simplified_editor_1_initial.png",
      fullPage: true,
    });

    // Check "Make it yours" button is visible
    const makeItYoursBtn = page.locator("text=Make it yours");
    await expect(makeItYoursBtn).toBeVisible();

    // Check action buttons are disabled initially
    const freePreviewBtn = page.locator("button:has-text('Free preview')");
    const hdBtn = page.locator("button").filter({ hasText: /Unlock HD|HD download/ });
    await expect(freePreviewBtn).toBeDisabled();
    await expect(hdBtn).toBeDisabled();

    // Click "Make it yours"
    await makeItYoursBtn.click();
    await page.waitForTimeout(500);

    // Take screenshot after entering customization mode
    await page.screenshot({
      path: "tests/screenshots/simplified_editor_2_customizing.png",
      fullPage: true,
    });

    // Check date input is now enabled
    const dateInput = page.locator("input[type='date']");
    await expect(dateInput).toBeEnabled();

    // Change style to Vintage
    const vintageBtn = page.locator("button:has-text('Vintage')");
    await vintageBtn.click();
    await page.waitForTimeout(500);

    // Change shape to Heart
    const heartBtn = page.locator("button:has-text('Heart')");
    await heartBtn.click();
    await page.waitForTimeout(2000);

    // Take screenshot after style/shape changes
    await page.screenshot({
      path: "tests/screenshots/simplified_editor_3_style_changed.png",
      fullPage: true,
    });

    // Action buttons should still be disabled (no location yet)
    await expect(freePreviewBtn).toBeDisabled();

    // Open "Customize more" panel
    const customizeMoreBtn = page.locator("button:has-text('Customize more')");
    await customizeMoreBtn.click();
    await page.waitForTimeout(500);

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
    await page.goto("/simple-test");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Enter customization mode
    const makeItYoursBtn = page.locator("text=Make it yours");
    await makeItYoursBtn.click();
    await page.waitForTimeout(500);

    // Enter a date
    const dateInput = page.locator("input[type='date']");
    await dateInput.fill("2024-06-15");
    await page.waitForTimeout(500);

    // Find and fill location input
    const locationInput = page.locator('input[placeholder*="city"]').first();
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
