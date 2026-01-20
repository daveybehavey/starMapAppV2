import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["iPhone 12"], browserName: "chromium" });
test.setTimeout(60_000);

test("mobile create flow and reveal gating", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.setItem("cookiesAccepted", "true");
    localStorage.setItem("analytics-consent", "true");
  });

  await page.route("**/api/geocode**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const query = requestUrl.searchParams.get("q")?.toLowerCase() ?? "";
    if (query.includes("paris")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            name: "Paris, France",
            latitude: 48.8566,
            longitude: 2.3522,
            timezone: "Europe/Paris",
          },
        ]),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  // Clear localStorage to ensure clean state and prevent auto-preset
  await page.goto("/?force=mobile&demo=skip");
  await expect(page.getByText("Loading editor…")).toHaveCount(0);
  await page.evaluate(() => localStorage.clear());
  await page.goto("/?force=mobile&demo=skip");

  // Dismiss any modals/banners that might appear
  await page.waitForTimeout(500);
  const closeButtons = page.locator('[aria-label="Close"], button:has-text("Accept"), button:has-text("×")');
  const count = await closeButtons.count();
  for (let i = 0; i < count; i++) {
    try {
      await closeButtons.nth(i).click({ timeout: 1000 });
    } catch {
      // Ignore if button is not clickable
    }
  }

  await expect(page.getByText(/See the exact night sky/i)).toBeVisible();
  const editorSection = page.locator("#editor");
  const startPresetButton = editorSection.getByRole("button", { name: /Start with a preset/i });
  await expect(editorSection.getByRole("button", { name: /Try a sample moment/i })).toBeVisible();
  await expect(startPresetButton).toBeVisible();
  await startPresetButton.click();
  await expect(page.getByText("Choose an Occasion")).toBeVisible();
  await expect(editorSection.getByRole("button", { name: "Generate preview" }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: /Date & Details|Hide details/i })).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);

  // Apply a sample moment to populate date + location
  const sampleMomentButton = editorSection.getByRole("button", { name: /Try a sample moment/i });
  await sampleMomentButton.click();

  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await expect(locationInput).toHaveValue(/.+/, { timeout: 10000 });
  const dateInput = page.getByLabel("Date");
  await expect(dateInput).toHaveValue(/.+/, { timeout: 10000 });

  const primaryGenerateButton = editorSection.getByRole("button", { name: "Generate preview" }).first();
  await primaryGenerateButton.scrollIntoViewIfNeeded();
  await primaryGenerateButton.click({ force: true });

  // Wait for canvas and export buttons to be visible
  await page.locator("#mobile-preview").scrollIntoViewIfNeeded();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: /Free/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "HD export" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Share/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Customize more/i })).toBeVisible();
});
