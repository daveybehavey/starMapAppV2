import { test, expect } from "@playwright/test";
import { applySampleMoment, gotoEditor } from "./test-helpers";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

test("location warnings and validation errors render", async ({ page }) => {
  // Use force=desktop for deterministic test
  await gotoEditor(page, { force: "desktop" });
  await expect(page.getByPlaceholder("Search city, landmark, or address")).toBeVisible();

  // Check default location warning appears
  await expect(
    page.getByText("Using default coordinates (0, 0). Search for a city to get accurate stars."),
  ).toBeVisible();

  // Check timezone preview appears
  await expect(page.getByText(/Timezone:/i)).toBeVisible();
});

test("occasion preset preserves location once set", async ({ page }) => {
  await gotoEditor(page, { force: "desktop" });
  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await expect(locationInput).toBeVisible();

  await applySampleMoment(page);
  await expect(locationInput).toHaveValue(/.+/, { timeout: 15000 });

  const initialLocation = await locationInput.inputValue();
  const initialDate = await page.getByLabel("Date").inputValue();
  await page.getByRole("button", { name: /Anniversary/i }).click();
  await expect(locationInput).toHaveValue(initialLocation);
  await expect(page.getByLabel("Date")).toHaveValue(initialDate);
});

test("occasion preset auto-fills date and location", async ({ page }) => {
  await gotoEditor(page, { force: "desktop" });
  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await expect(locationInput).toBeVisible();

  // Verify inputs are empty/default initially
  await expect(locationInput).toHaveValue("");

  // Click an occasion preset
  await page.getByRole("button", { name: /Wedding/i }).click();

  // Verify location was auto-filled
  await expect(locationInput).not.toHaveValue("");
  await expect(page.getByLabel("Date")).not.toHaveValue("");
});

test("pro preset updates the message styling", async ({ page }) => {
  await gotoEditor(page, { force: "desktop" });
  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await expect(locationInput).toBeVisible();
  await applySampleMoment(page);

  // Find and click a pro preset (e.g., Aurora)
  await expect(page.getByText("Pro Presets")).toBeVisible();
  const auroraPreset = page.getByRole("button", { name: /Aurora Night/i });
  await expect(auroraPreset).toBeVisible();
  await auroraPreset.click();

  // Verify the text boxes update to the preset copy
  await expect(page.getByPlaceholder("Enter title...")).toHaveValue(/Aurora Sky/i);
});
