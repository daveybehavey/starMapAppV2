import { test } from "@playwright/test";

test.describe("Final 2-column grid verification", () => {
  test("capture editor with 2-column grid at 1920x1080", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Navigate and wait for load
    await page.goto("/editor?force=desktop");
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Close popup by clicking the X button or close button
    try {
      // Try multiple selectors for the close button
      const closeSelectors = [
        'button:has-text("×")',
        'button[aria-label*="Close"]',
        'button:has-text("Maybe later")',
        '[class*="close"]',
      ];

      for (const selector of closeSelectors) {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 1000 })) {
          await button.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    } catch (e) {
      console.log('No popup to close or close failed');
    }

    // Click "Start from scratch"
    const startButton = page.locator('button:has-text("Start from scratch")');
    await startButton.waitFor({ state: 'visible', timeout: 10000 });
    await startButton.click();
    await page.waitForTimeout(2000);

    // Click "Expand all"
    const expandAll = page.locator('button:has-text("Expand all")');
    await expandAll.waitFor({ state: 'visible', timeout: 10000 });
    await expandAll.click();
    await page.waitForTimeout(1500);

    // Take screenshot of just the left editor column area
    const leftColumn = page.locator('div.w-full.space-y-2').first();
    if (await leftColumn.isVisible({ timeout: 5000 })) {
      await leftColumn.screenshot({
        path: 'test-results/editor-column-1920.png'
      });
      console.log('✓ Captured left editor column');
    }

    // Take full page screenshot
    await page.screenshot({
      path: 'test-results/full-editor-1920.png',
      fullPage: true
    });
    console.log('✓ Captured full page');

    // Also capture just the viewport
    await page.screenshot({
      path: 'test-results/viewport-editor-1920.png'
    });
    console.log('✓ Captured viewport');
  });

  test("capture at 1366x768", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/editor?force=desktop");
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    try {
      const closeBtn = page.locator('button:has-text("×")').first();
      if (await closeBtn.isVisible({ timeout: 1000 })) {
        await closeBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}

    const startButton = page.locator('button:has-text("Start from scratch")');
    await startButton.waitFor({ state: 'visible', timeout: 10000 });
    await startButton.click();
    await page.waitForTimeout(2000);

    const expandAll = page.locator('button:has-text("Expand all")');
    await expandAll.waitFor({ state: 'visible', timeout: 10000 });
    await expandAll.click();
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: 'test-results/full-editor-1366.png',
      fullPage: true
    });
    console.log('✓ Captured 1366 layout');
  });

  test("capture at 1024x768 (minimum lg breakpoint)", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/editor?force=desktop");
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    try {
      const closeBtn = page.locator('button:has-text("×")').first();
      if (await closeBtn.isVisible({ timeout: 1000 })) {
        await closeBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}

    const startButton = page.locator('button:has-text("Start from scratch")');
    await startButton.waitFor({ state: 'visible', timeout: 10000 });
    await startButton.click();
    await page.waitForTimeout(2000);

    const expandAll = page.locator('button:has-text("Expand all")');
    await expandAll.waitFor({ state: 'visible', timeout: 10000 });
    await expandAll.click();
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: 'test-results/full-editor-1024.png',
      fullPage: true
    });
    console.log('✓ Captured 1024 layout (2-column should be visible)');
  });
});
