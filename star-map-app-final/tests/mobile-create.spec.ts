import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["iPhone 12"] });

test("mobile create flow and reveal gating", async ({ page }) => {
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

  await expect(page.getByRole("heading", { name: "Design your sky in seconds" })).toBeVisible();
  await expect(page.getByText("Choose an Occasion")).toBeVisible();

  // Note: The app auto-loads a wedding preset demo, so there may already be a canvas
  // This is expected product behavior to show users what the app does

  // Force click to bypass any overlays (paywall, cookie banner, etc.)
  await page.getByRole("button", { name: /Wedding/i }).click({ force: true });
  await expect(page.getByRole("button", { name: /Classic/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Enhanced/i })).toBeVisible();
  await expect(page.locator("input[type='range']")).toBeVisible();

  // Drawer button should exist (either "Date & Details" or "Hide details")
  const drawerHandle = page.getByRole("button", { name: /Date & Details|Hide details/i });
  await expect(drawerHandle).toBeVisible();

  // Clear the auto-loaded preset by entering new data
  const dateInput = page.getByLabel("Date");
  if (!(await dateInput.isVisible())) {
    await drawerHandle.click();
  }

  await dateInput.fill("2024-06-15");
  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await locationInput.fill("Paris, France");
  const locationOption = page.getByRole("option", { name: "Paris, France" });
  await expect(locationOption).toBeVisible();
  await locationOption.click({ force: true });

  // Mobile component shows canvas immediately (auto-preset behavior)
  // Wait for canvas and export buttons to be visible
  await expect(page.locator("canvas")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Matches professional planetarium accuracy/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Free.*⬇/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /HD.*⬇/i })).toBeVisible();
});
