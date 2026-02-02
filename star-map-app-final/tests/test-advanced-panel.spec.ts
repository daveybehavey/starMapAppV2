import { test, expect } from '@playwright/test';

test.describe('SimplifiedEditor Advanced Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/simple-test');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('should expand advanced panel and show sections', async ({ page }) => {
    // Click "Make it yours" to enable form
    await page.locator('text=Make it yours').click();
    await page.waitForTimeout(500);

    // Click "Customize more" to expand advanced panel
    await page.locator('text=Customize more').click();
    await page.waitForTimeout(500);

    // Verify Sky Details section is visible (default open)
    await expect(page.locator('text=Sky Details')).toBeVisible();
    await expect(page.locator('text=Visual Mode')).toBeVisible();

    // Verify collapsed sections exist
    await expect(page.locator('button:has-text("Constellations")')).toBeVisible();
    await expect(page.locator('button:has-text("Premium Effects")')).toBeVisible();
  });

  test('should update preview when changing visual mode', async ({ page }) => {
    // Enable form and expand advanced
    await page.locator('text=Make it yours').click();
    await page.locator('text=Customize more').click();
    await page.waitForTimeout(500);

    // Click Illustrated mode
    const illustratedBtn = page.locator('button:has-text("Illustrated")');
    await illustratedBtn.click();
    await page.waitForTimeout(1500);

    // Verify button is now selected (has amber styling)
    await expect(illustratedBtn).toHaveClass(/border-amber-300/);
  });

  test('should toggle moon on/off', async ({ page }) => {
    await page.locator('text=Make it yours').click();
    await page.locator('text=Customize more').click();
    await page.waitForTimeout(500);

    // Find and click Moon toggle
    const moonToggle = page.locator('button:has-text("Moon")');
    const initialState = await moonToggle.textContent();

    await moonToggle.click();
    await page.waitForTimeout(500);

    // State should change
    const newState = await moonToggle.textContent();
    expect(newState).not.toBe(initialState);
  });

  test('should expand/collapse constellation section', async ({ page }) => {
    await page.locator('text=Make it yours').click();
    await page.locator('text=Customize more').click();
    await page.waitForTimeout(500);

    // Constellations section header
    const constellationsHeader = page.locator('button:has-text("Constellations")');
    await expect(constellationsHeader).toBeVisible();

    // Click to expand
    await constellationsHeader.click();
    await page.waitForTimeout(300);

    // Should now see Lines options
    await expect(page.locator('button:has-text("Thin")')).toBeVisible();
    await expect(page.locator('button:has-text("Bold")')).toBeVisible();
  });

  test('sections should toggle via keyboard', async ({ page }) => {
    await page.locator('text=Make it yours').click();
    await page.locator('text=Customize more').click();
    await page.waitForTimeout(500);

    const constellationsHeader = page.locator('button:has-text("Constellations")');
    await constellationsHeader.focus();
    await constellationsHeader.press('Enter');
    await page.waitForTimeout(300);
    await expect(page.locator('button:has-text("Thin")')).toBeVisible();

    await constellationsHeader.press('Space');
    await page.waitForTimeout(300);
    await expect(page.locator('button:has-text("Thin")')).not.toBeVisible();
  });

  test('should show premium lock icons for unpaid users', async ({ page }) => {
    await page.locator('text=Make it yours').click();
    await page.locator('text=Customize more').click();
    await page.waitForTimeout(500);

    // Expand Premium Effects section
    await page.locator('button:has-text("Premium Effects")').click();
    await page.waitForTimeout(300);

    // Should see lock icons on premium options
    const subtleBtn = page.locator('button:has-text("Subtle")');
    await expect(subtleBtn).toBeVisible();
    // Lock icon should be present (emoji)
    await expect(subtleBtn).toContainText('🔒');
  });
});
