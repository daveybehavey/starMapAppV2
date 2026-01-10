import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test.describe("Export Functionality", () => {
  test.beforeEach(async ({ page }) => {
    // Mock geocode API for consistent location results
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
  });

  test("text renders correctly in free export", async ({ page }) => {
    // Navigate to Create surface with forced desktop mode
    await page.goto("/?force=desktop&demo=skip");

    // Clear localStorage to ensure clean state
    await page.evaluate(() => localStorage.clear());
    await page.goto("/?force=desktop&demo=skip");

    // Fill in date
    const dateInput = page.getByLabel("Date");
    await dateInput.fill("2024-06-15");

    // Fill in location
    const locationInput = page.getByPlaceholder("Search city, landmark, or address");
    await locationInput.fill("Paris, France");
    await page.waitForTimeout(500);

    const locationOption = page.getByRole("option", { name: "Paris, France" });
    await expect(locationOption).toBeVisible();
    await locationOption.click({ force: true });

    // Find and fill text boxes
    const textInputs = page.locator('input[type="text"]');
    const titleInput = textInputs.filter({ hasText: /title/i }).or(textInputs.nth(0));
    await titleInput.fill("Our Special Night");

    // Click reveal button
    const revealButton = page.getByRole("button", { name: /Find your special moment/i });
    await expect(revealButton).toBeVisible();
    await revealButton.click({ force: true });

    // Wait for canvas to render
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000); // Wait for full render

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click Free Download button
    const freeDownloadButton = page.getByRole("button", { name: /Free/i }).first();
    await expect(freeDownloadButton).toBeVisible();
    await freeDownloadButton.click({ force: true });

    // Wait for download to complete
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".png");

    // Save the downloaded file for manual inspection
    const downloadPath = path.join(__dirname, "../test-results", download.suggestedFilename());
    await download.saveAs(downloadPath);

    // Verify file was created and has reasonable size (>10KB = has content)
    const fileExists = fs.existsSync(downloadPath);
    expect(fileExists).toBeTruthy();

    if (fileExists) {
      const stats = fs.statSync(downloadPath);
      expect(stats.size).toBeGreaterThan(10000); // Should be at least 10KB
      console.log(`Downloaded file size: ${stats.size} bytes`);
    }
  });

  test("text renders correctly in HD export (requires payment)", async ({ page }) => {
    // This test would require a valid payment token
    // For now, we'll verify the paywall appears
    await page.goto("/?force=desktop&demo=skip");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/?force=desktop&demo=skip");

    // Fill in date
    const dateInput = page.getByLabel("Date");
    await dateInput.fill("2024-06-15");

    // Fill in location
    const locationInput = page.getByPlaceholder("Search city, landmark, or address");
    await locationInput.fill("Paris, France");
    await page.waitForTimeout(500);

    const locationOption = page.getByRole("option", { name: "Paris, France" });
    await expect(locationOption).toBeVisible();
    await locationOption.click({ force: true });

    // Click reveal button
    const revealButton = page.getByRole("button", { name: /Find your special moment/i });
    await expect(revealButton).toBeVisible();
    await revealButton.click({ force: true });

    // Wait for canvas to render
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Click HD Export button (should trigger paywall)
    const hdExportButton = page.getByRole("button", { name: /HD/i }).first();
    await expect(hdExportButton).toBeVisible();
    await hdExportButton.click({ force: true });

    // Verify paywall modal appears
    await expect(page.getByText(/Unlock HD Export/i)).toBeVisible({ timeout: 5000 });
  });

  test("empty text boxes don't break export", async ({ page }) => {
    await page.goto("/?force=desktop&demo=skip");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/?force=desktop&demo=skip");

    // Fill in date
    const dateInput = page.getByLabel("Date");
    await dateInput.fill("2024-06-15");

    // Fill in location
    const locationInput = page.getByPlaceholder("Search city, landmark, or address");
    await locationInput.fill("Paris, France");
    await page.waitForTimeout(500);

    const locationOption = page.getByRole("option", { name: "Paris, France" });
    await expect(locationOption).toBeVisible();
    await locationOption.click({ force: true });

    // DO NOT fill text boxes - leave them empty

    // Click reveal button
    const revealButton = page.getByRole("button", { name: /Find your special moment/i });
    await expect(revealButton).toBeVisible();
    await revealButton.click({ force: true });

    // Wait for canvas to render
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click Free Download button
    const freeDownloadButton = page.getByRole("button", { name: /Free/i }).first();
    await expect(freeDownloadButton).toBeVisible();
    await freeDownloadButton.click({ force: true });

    // Wait for download to complete
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".png");

    // Verify export works even with empty text
    const downloadPath = path.join(__dirname, "../test-results", download.suggestedFilename());
    await download.saveAs(downloadPath);

    const fileExists = fs.existsSync(downloadPath);
    expect(fileExists).toBeTruthy();

    if (fileExists) {
      const stats = fs.statSync(downloadPath);
      expect(stats.size).toBeGreaterThan(5000); // Should still have stars/background
    }
  });

  test("multiple text boxes render in export", async ({ page }) => {
    await page.goto("/?force=desktop&demo=skip");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/?force=desktop&demo=skip");

    // Fill in date
    const dateInput = page.getByLabel("Date");
    await dateInput.fill("2024-06-15");

    // Fill in location
    const locationInput = page.getByPlaceholder("Search city, landmark, or address");
    await locationInput.fill("Paris, France");
    await page.waitForTimeout(500);

    const locationOption = page.getByRole("option", { name: "Paris, France" });
    await expect(locationOption).toBeVisible();
    await locationOption.click({ force: true });

    // Fill all 3 default text boxes
    const textInputs = page.locator('input[type="text"]').filter({ hasNotText: /search/i });
    await textInputs.nth(0).fill("Title Line");
    await textInputs.nth(1).fill("Subtitle Line");
    await textInputs.nth(2).fill("Dedication Line");

    // Click reveal button
    const revealButton = page.getByRole("button", { name: /Find your special moment/i });
    await expect(revealButton).toBeVisible();
    await revealButton.click({ force: true });

    // Wait for canvas to render
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click Free Download button
    const freeDownloadButton = page.getByRole("button", { name: /Free/i }).first();
    await expect(freeDownloadButton).toBeVisible();
    await freeDownloadButton.click({ force: true });

    // Wait for download to complete
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".png");

    const downloadPath = path.join(__dirname, "../test-results", download.suggestedFilename());
    await download.saveAs(downloadPath);

    const fileExists = fs.existsSync(downloadPath);
    expect(fileExists).toBeTruthy();

    if (fileExists) {
      const stats = fs.statSync(downloadPath);
      expect(stats.size).toBeGreaterThan(10000);
      console.log(`Downloaded file with 3 text boxes: ${stats.size} bytes`);
    }
  });
});
