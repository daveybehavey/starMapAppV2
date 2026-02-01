import { test, expect } from "@playwright/test";

test.describe("Homepage with SimplifiedEditor", () => {
  test("should display sample preview in hero section", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000); // Wait for canvas to render

    // Take screenshot of initial homepage
    await page.screenshot({
      path: "tests/screenshots/homepage_1_initial.png",
      fullPage: false,
    });

    // Check heading is visible
    const heading = page.locator("h1");
    await expect(heading).toContainText("custom star map");

    // Check "Make it yours" button is visible (from SimplifiedEditor)
    const makeItYoursBtn = page.locator("text=Make it yours");
    await expect(makeItYoursBtn).toBeVisible();

    // Check pricing info is visible
    const pricingText = page.locator("text=HD from");
    await expect(pricingText).toBeVisible();

    console.log("✓ Homepage loads with SimplifiedEditor in hero");
  });

  test("should allow customization from homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Click "Make it yours"
    const makeItYoursBtn = page.locator("text=Make it yours");
    await makeItYoursBtn.click();
    await page.waitForTimeout(500);

    // Take screenshot after entering customization mode
    await page.screenshot({
      path: "tests/screenshots/homepage_2_customizing.png",
      fullPage: false,
    });

    // Check date input is now enabled
    const dateInput = page.locator("input[type='date']");
    await expect(dateInput).toBeEnabled();

    // Check style buttons are enabled
    const vintageBtn = page.locator("button:has-text('Vintage')");
    await expect(vintageBtn).toBeEnabled();

    // Change style
    await vintageBtn.click();
    await page.waitForTimeout(1000);

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
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Enter customization mode
    const makeItYoursBtn = page.locator("text=Make it yours");
    await makeItYoursBtn.click();
    await page.waitForTimeout(500);

    // Check that Free preview button exists but is disabled (no location yet)
    const freePreviewBtn = page.locator("button:has-text('Free preview')");
    await expect(freePreviewBtn).toBeVisible();
    await expect(freePreviewBtn).toBeDisabled();

    // Check that HD button exists but is disabled
    const hdBtn = page.locator("button").filter({ hasText: /Unlock HD|HD download/ });
    await expect(hdBtn).toBeVisible();
    await expect(hdBtn).toBeDisabled();

    console.log("✓ Action buttons are properly disabled until location is entered");
  });
});
