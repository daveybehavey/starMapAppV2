import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("desktop layout unchanged", async ({ page }) => {
  // Use test-only force flag to deterministically render desktop
  await page.goto("/?force=desktop");

  // Wait for editor section
  const editor = page.locator('section#editor');
  await editor.waitFor({ timeout: 10000 });

  // Debug: Check data attributes
  const forceAttr = await editor.getAttribute('data-force');
  const isDesktopAttr = await editor.getAttribute('data-is-desktop');
  console.log(`Force attribute: ${forceAttr}, isDesktop attribute: ${isDesktopAttr}`);

  // Check if desktop component is present
  const desktopComponent = page.locator('[data-component="desktop"]');
  const desktopCount = await desktopComponent.count();
  console.log(`Desktop component count: ${desktopCount}`);

  // Verify mobile-specific text is NOT present
  await expect(page.getByText("Date & Details")).toHaveCount(0);
  await expect(page.getByText("Choose an Occasion")).toHaveCount(0);

  // Verify desktop layout elements ARE present
  await expect(page.getByText("Create your star map")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByText("Date & Location")).toBeVisible();
});
