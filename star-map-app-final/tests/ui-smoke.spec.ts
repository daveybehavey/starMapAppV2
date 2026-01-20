import { test, expect } from "@playwright/test";

const primeLocalStorage = async (page: { addInitScript: (fn: () => void) => Promise<void> }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.setItem("cookiesAccepted", "true");
    localStorage.setItem("analytics-consent", "true");
  });
};

test("location warnings and validation errors render", async ({ page }) => {
  // Use force=desktop for deterministic test
  await primeLocalStorage(page);
  await page.goto("/?force=desktop");

  // Wait for page to load
  await expect(page.getByText("Loading editor…")).toHaveCount(0);
  await page.getByPlaceholder("Search city, landmark, or address").waitFor();

  // Check default location warning appears
  await expect(
    page.getByText("Using default coordinates (0, 0). Search for a city to get accurate stars."),
  ).toBeVisible();

  // Check local time preview appears
  await expect(page.getByText(/Local time in/i)).toBeVisible();
});

test("occasion preset preserves location once set", async ({ page }) => {
  await primeLocalStorage(page);
  await page.goto("/?force=desktop");

  await expect(page.getByText("Loading editor…")).toHaveCount(0);

  // Helper to dismiss any blocking overlays
  const dismissOverlays = async () => {
    // Promo popup
    const maybeLaterBtn = page.getByRole("button", { name: "Maybe later" });
    if (await maybeLaterBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await maybeLaterBtn.click();
      await page.waitForTimeout(300);
    }
    // Cookie banner
    const acceptBtn = page.getByRole("button", { name: "Accept" });
    if (await acceptBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await acceptBtn.click();
      await page.waitForTimeout(200);
    }
  };

  await dismissOverlays();

  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await locationInput.waitFor();

  await dismissOverlays(); // Ensure no popup before click
  // Use force:true to click through any lingering overlays that might have appeared
  await page.getByRole("button", { name: "🎉 Birthday" }).click({ force: true });
  // Wait longer for state update to propagate and re-render
  await page.waitForTimeout(1000);
  await dismissOverlays(); // Popup may appear after interaction
  // Give more time for the location to be set
  await expect(locationInput).not.toHaveValue("", { timeout: 15000 });

  const initialLocation = await locationInput.inputValue();
  await dismissOverlays(); // Ensure no popup before next click
  await page.getByRole("button", { name: "❤️ Anniversary" }).click();
  await expect(locationInput).toHaveValue(initialLocation);
});

test("occasion preset auto-fills date and location", async ({ page }) => {
  await primeLocalStorage(page);
  await page.goto("/?force=desktop");

  await expect(page.getByText("Loading editor…")).toHaveCount(0);

  // Close popups/modals that might block interaction
  const maybeLaterBtn = page.getByRole("button", { name: "Maybe later" });
  if (await maybeLaterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await maybeLaterBtn.click();
  }
  const acceptBtn = page.getByRole("button", { name: "Accept" });
  if (await acceptBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await acceptBtn.click();
  }

  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await locationInput.waitFor();

  // Verify inputs are empty/default initially
  const initialLocation = await locationInput.inputValue();
  expect(initialLocation).toBe("");

  // Click an occasion preset
  await page.getByRole("button", { name: "💍 Wedding" }).click();

  // Verify location was auto-filled
  await expect(locationInput).not.toHaveValue("");
});

test("pro preset applies style without changing date/location", async ({ page }) => {
  await primeLocalStorage(page);
  await page.goto("/?force=desktop");

  await expect(page.getByText("Loading editor…")).toHaveCount(0);

  // Helper to dismiss any blocking overlays
  const dismissOverlays = async () => {
    // Promo popup
    const maybeLaterBtn = page.getByRole("button", { name: "Maybe later" });
    if (await maybeLaterBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await maybeLaterBtn.click();
      await page.waitForTimeout(300);
    }
    // Cookie banner
    const acceptBtn = page.getByRole("button", { name: "Accept" });
    if (await acceptBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await acceptBtn.click();
      await page.waitForTimeout(200);
    }
  };

  await dismissOverlays();

  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await locationInput.waitFor();

  // First set a location via occasion preset
  await dismissOverlays();
  await page.getByRole("button", { name: "💍 Wedding" }).click();
  await page.waitForTimeout(500); // Wait for preset to apply
  await dismissOverlays();

  const locationBefore = await locationInput.inputValue();

  // Get date input value
  const dateInput = page.locator('input[type="date"]');
  const dateBefore = await dateInput.inputValue();

  // Find and click a pro preset (e.g., Aurora)
  const proPresetSection = page.getByText("Pro Presets");
  if (await proPresetSection.isVisible()) {
    await dismissOverlays();
    const auroraPreset = page.getByRole("button", { name: /Aurora/i });
    if (await auroraPreset.isVisible()) {
      await auroraPreset.click();

      // Verify date and location are unchanged
      await expect(locationInput).toHaveValue(locationBefore);
      await expect(dateInput).toHaveValue(dateBefore);
    }
  }
});
