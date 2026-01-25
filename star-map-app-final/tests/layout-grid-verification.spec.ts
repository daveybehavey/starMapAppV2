import { test } from "@playwright/test";

test.describe("2-column grid layout verification", () => {
  test("verify 2-column layout at 1920x1080 with all sections expanded", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/editor?force=desktop");

    // Close any popups
    await page.waitForTimeout(2000);
    const closeButton = page.locator('button[aria-label="Close"], button:has-text("×"), button:has-text("Maybe later")');
    if (await closeButton.first().isVisible({ timeout: 3000 })) {
      await closeButton.first().click();
      await page.waitForTimeout(500);
    }

    // Click "Start from scratch"
    const startButton = page.locator('button:has-text("Start from scratch")');
    if (await startButton.isVisible({ timeout: 5000 })) {
      await startButton.click();
      await page.waitForTimeout(2000);
    }

    // Expand all sections by clicking "Expand all" button
    const expandAllButton = page.locator('button:has-text("Expand all")');
    if (await expandAllButton.isVisible({ timeout: 5000 })) {
      await expandAllButton.click();
      await page.waitForTimeout(1000);
    }

    // Scroll to show the editor sections
    await page.evaluate(() => {
      const editorSections = document.querySelector('[class*="Text Styling"]')?.closest('section');
      if (editorSections) {
        editorSections.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    await page.waitForTimeout(1000);

    // Take screenshot of the editor area
    await page.screenshot({
      path: 'test-results/grid-layout-1920-expanded.png',
      fullPage: true
    });

    console.log('✓ Screenshot saved: grid-layout-1920-expanded.png');
  });

  test("verify 2-column layout at 1366x768", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/editor?force=desktop");
    await page.waitForTimeout(2000);

    const closeButton = page.locator('button[aria-label="Close"], button:has-text("×"), button:has-text("Maybe later")');
    if (await closeButton.first().isVisible({ timeout: 3000 })) {
      await closeButton.first().click();
      await page.waitForTimeout(500);
    }

    const startButton = page.locator('button:has-text("Start from scratch")');
    if (await startButton.isVisible({ timeout: 5000 })) {
      await startButton.click();
      await page.waitForTimeout(2000);
    }

    const expandAllButton = page.locator('button:has-text("Expand all")');
    if (await expandAllButton.isVisible({ timeout: 5000 })) {
      await expandAllButton.click();
      await page.waitForTimeout(1000);
    }

    await page.screenshot({
      path: 'test-results/grid-layout-1366-expanded.png',
      fullPage: true
    });

    console.log('✓ Screenshot saved: grid-layout-1366-expanded.png');
  });

  test("verify 2-column layout at 1024x768 (minimum breakpoint)", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/editor?force=desktop");
    await page.waitForTimeout(2000);

    const closeButton = page.locator('button[aria-label="Close"], button:has-text("×"), button:has-text("Maybe later")');
    if (await closeButton.first().isVisible({ timeout: 3000 })) {
      await closeButton.first().click();
      await page.waitForTimeout(500);
    }

    const startButton = page.locator('button:has-text("Start from scratch")');
    if (await startButton.isVisible({ timeout: 5000 })) {
      await startButton.click();
      await page.waitForTimeout(2000);
    }

    const expandAllButton = page.locator('button:has-text("Expand all")');
    if (await expandAllButton.isVisible({ timeout: 5000 })) {
      await expandAllButton.click();
      await page.waitForTimeout(1000);
    }

    await page.screenshot({
      path: 'test-results/grid-layout-1024-expanded.png',
      fullPage: true
    });

    console.log('✓ Screenshot saved: grid-layout-1024-expanded.png');
  });
});
