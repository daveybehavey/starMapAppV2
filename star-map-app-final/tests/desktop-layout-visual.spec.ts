import { test } from "@playwright/test";

test.describe("Desktop 2-column layout visual verification", () => {
  test("capture desktop layout at 1920x1080", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/editor?force=desktop");

    // Wait for page to load
    await page.waitForTimeout(3000);

    // Click "Start from scratch" to reveal editor sections
    const startButton = page.locator('button:has-text("Start from scratch")');
    if (await startButton.isVisible({ timeout: 5000 })) {
      await startButton.click();
      await page.waitForTimeout(2000);
    }

    // Take full page screenshot
    await page.screenshot({
      path: 'test-results/desktop-layout-1920-full.png',
      fullPage: true
    });

    // Take viewport screenshot
    await page.screenshot({
      path: 'test-results/desktop-layout-1920-viewport.png'
    });
  });

  test("capture desktop layout at 1366x768", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/editor?force=desktop");
    await page.waitForTimeout(3000);

    const startButton = page.locator('button:has-text("Start from scratch")');
    if (await startButton.isVisible({ timeout: 5000 })) {
      await startButton.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({
      path: 'test-results/desktop-layout-1366-full.png',
      fullPage: true
    });
  });

  test("capture desktop layout at 1024x768", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/editor?force=desktop");
    await page.waitForTimeout(3000);

    const startButton = page.locator('button:has-text("Start from scratch")');
    if (await startButton.isVisible({ timeout: 5000 })) {
      await startButton.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({
      path: 'test-results/desktop-layout-1024-full.png',
      fullPage: true
    });
  });
});
