import { test, expect } from "@playwright/test";

test.describe("Refine Surface (/refine)", () => {
  test("has all advanced controls visible", async ({ page }) => {
    await page.goto("/refine");

    // Check for render mode controls
    await expect(page.getByText("Render & Intensity")).toBeVisible();
    await expect(page.getByText("Classic")).toBeVisible();
    await expect(page.getByText("Cinematic")).toBeVisible();

    // Check for intensity slider
    await expect(page.locator('input[type="range"]').first()).toBeVisible();

    // Check for date & location
    await expect(page.getByText("Date & Location")).toBeVisible();

    // Check for text customization
    await expect(page.getByText("Text Customization")).toBeVisible();

    // Check for style & shape
    await expect(page.getByText("Style & Shape")).toBeVisible();

    // Check for advanced options accordion
    await expect(page.getByRole("button", { name: /Advanced Constellations/i })).toBeVisible();
  });

  test("has live preview visible immediately", async ({ page }) => {
    await page.goto("/refine");

    // Preview should be visible without needing to click reveal
    await expect(page.getByText("Live Preview")).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible({ timeout: 10000 });
  });

  test("text box controls work correctly", async ({ page }) => {
    await page.goto("/refine");

    // Open text customization accordion if not open
    const textAccordion = page.getByRole("button", { name: /Text Customization/i });
    await textAccordion.click();

    // Wait for text boxes to appear
    await page.waitForTimeout(500);

    // Check for text input
    const textInputs = page.locator('input[type="text"]');
    await expect(textInputs.first()).toBeVisible();

    // Check for font selector
    const selects = page.locator("select");
    await expect(selects.first()).toBeVisible();

    // Check for color picker
    const colorInputs = page.locator('input[type="color"]');
    await expect(colorInputs.first()).toBeVisible();

    // Check for size input
    const numberInputs = page.locator('input[type="number"]');
    await expect(numberInputs.first()).toBeVisible();

    // Check for add text box button
    await expect(page.getByRole("button", { name: /Add Text Line/i })).toBeVisible();
  });

  test("style and shape controls work", async ({ page }) => {
    await page.goto("/refine");

    // Open style & shape accordion
    const styleAccordion = page.getByRole("button", { name: /Style & Shape/i });
    await styleAccordion.click();

    await page.waitForTimeout(500);

    // Check for style buttons
    await expect(page.getByText("Navy & Gold")).toBeVisible();
    await expect(page.getByText("Vintage Engraving")).toBeVisible();

    // Check for shape buttons
    await expect(page.getByText("Rectangle")).toBeVisible();
    await expect(page.getByText("Heart")).toBeVisible();
    await expect(page.getByText("Circle")).toBeVisible();
  });

  test("constellation controls work", async ({ page }) => {
    await page.goto("/refine");

    // Open advanced accordion
    const advancedAccordion = page.getByRole("button", { name: /Advanced/i });
    await advancedAccordion.click();

    await page.waitForTimeout(500);

    // Check for constellation lines
    await expect(page.getByText("Constellation Lines")).toBeVisible();
    await expect(page.getByRole("button", { name: "off", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "thin", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "thick", exact: true })).toBeVisible();

    // Check for constellation labels toggle
    await expect(page.getByText("Constellation Labels")).toBeVisible();

    // Check for visual mode
    await expect(page.getByText("Visual Mode")).toBeVisible();
    await expect(page.getByText("astronomical")).toBeVisible();
    await expect(page.getByText("enhanced")).toBeVisible();
    await expect(page.getByText("illustrated")).toBeVisible();
  });

  test("has back to create link", async ({ page }) => {
    await page.goto("/refine");

    // Check for back link
    await expect(page.getByRole("link", { name: /Back to Create/i })).toBeVisible();
  });

  test("works on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/refine");

    // Check 2-column layout exists
    await expect(page.getByText("Render & Intensity")).toBeVisible();
    await expect(page.getByText("Live Preview")).toBeVisible();
  });
});
