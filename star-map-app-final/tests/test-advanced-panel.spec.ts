import { test, expect, type Page } from '@playwright/test';
import { primeLocalStorage } from './test-helpers';

const enterCustomizationMode = async (page: Page) => {
  const makeItYoursButton = page.getByRole('button', {
    name: /start customizing your star map|make it yours/i,
  }).first();
  await expect(makeItYoursButton).toBeVisible({ timeout: 15000 });

  const dateInput = page.locator('input[type="date"]');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await makeItYoursButton.click({ force: true });
    if (await dateInput.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(400);
  }

  await expect(dateInput).toBeEnabled({ timeout: 20000 });
};

const openAdvancedPanel = async (page: Page) => {
  await enterCustomizationMode(page);
  const customizeMoreButton = page.getByRole('button', { name: /customize more|less options/i }).first();
  await customizeMoreButton.click();
  await expect(page.getByText('Sky Details')).toBeVisible({ timeout: 15000 });
};

test.describe('SimplifiedEditor Advanced Panel', () => {
  test.describe.configure({ timeout: 60000 });

  test.beforeEach(async ({ page }) => {
    await primeLocalStorage(page);
    await page.goto('/simple-test', { waitUntil: 'domcontentloaded' });
  });

  test('should expand advanced panel and show sections', async ({ page }) => {
    await openAdvancedPanel(page);

    // Verify Sky Details section is visible (default open)
    await expect(page.locator('text=Sky Details')).toBeVisible();
    await expect(page.locator('text=Visual Mode')).toBeVisible();

    // Verify collapsed sections exist
    await expect(page.locator('button:has-text("Constellations")')).toBeVisible();
    await expect(page.locator('button:has-text("Premium Effects")')).toBeVisible();
  });

  test('should update preview when changing visual mode', async ({ page }) => {
    await openAdvancedPanel(page);

    // Click Illustrated mode
    const illustratedBtn = page.locator('button:has-text("Illustrated")');
    await illustratedBtn.click();
    await page.waitForTimeout(1500);

    // Verify button is now selected (has amber styling)
    await expect(illustratedBtn).toHaveClass(/border-amber-300/);
  });

  test('should toggle moon on/off', async ({ page }) => {
    await openAdvancedPanel(page);

    // Find and click Moon toggle
    const moonToggle = page.getByRole('button', { name: /^Moon$/i });
    const initialPressed = await moonToggle.getAttribute('aria-pressed');
    expect(initialPressed).not.toBeNull();

    await moonToggle.click();

    // State should change
    await expect(moonToggle).toHaveAttribute(
      'aria-pressed',
      initialPressed === 'true' ? 'false' : 'true',
    );
  });

  test('should expand/collapse constellation section', async ({ page }) => {
    await openAdvancedPanel(page);

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
    await openAdvancedPanel(page);

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
    await openAdvancedPanel(page);

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
