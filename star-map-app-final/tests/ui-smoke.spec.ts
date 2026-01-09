import { test, expect } from "@playwright/test";

test("location warnings and validation errors render", async ({ page }) => {
  // Use force=desktop for deterministic test
  await page.goto("/?force=desktop");

  // Wait for page to load
  await page.getByPlaceholder("Search city, landmark, or address").waitFor();

  // Check default location warning appears
  await expect(
    page.getByText("Using default coordinates (0, 0). Search for a city to get accurate stars."),
  ).toBeVisible();

  // Check local time preview appears
  await expect(page.getByText(/Local time in/i)).toBeVisible();
});
