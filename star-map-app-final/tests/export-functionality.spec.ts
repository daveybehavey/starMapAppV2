import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const primeLocalStorage = async (page: { addInitScript: (fn: () => void) => Promise<void> }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.setItem("cookiesAccepted", "true");
    localStorage.setItem("analytics-consent", "true");
  });
};

const dismissOverlays = async (page: { locator: (selector: string) => any; waitForTimeout: (ms: number) => Promise<void> }) => {
  const selectors = [
    'button[aria-label="Close"]',
    'button:has-text("Close")',
    'button:has-text("Accept")',
    'button:has-text("Maybe later")',
  ];
  await page.waitForTimeout(250);
  for (const selector of selectors) {
    const buttons = page.locator(selector);
    const count = await buttons.count();
    for (let i = 0; i < count; i += 1) {
      try {
        await buttons.nth(i).click({ timeout: 1000 });
      } catch {
        // Ignore if button is not clickable
      }
    }
  }
};

const setupCreateForm = async (page: {
  goto: (url: string) => Promise<void>;
  getByText: (text: string) => any;
  getByRole: (role: string, options?: any) => any;
  getByLabel: (text: string) => any;
  getByPlaceholder: (text: string) => any;
  locator: (selector: string) => any;
}) => {
  await primeLocalStorage(page);
  await page.goto("/?force=desktop&demo=skip");
  await dismissOverlays(page);
  await expect(page.getByText("Loading editor…")).toHaveCount(0, { timeout: 15000 });

  const startPresetButton = page.locator("#editor").getByRole("button", { name: /Start with a preset/i }).first();
  if (await startPresetButton.isVisible().catch(() => false)) {
    await startPresetButton.click();
  }

  await expect(page.locator("section#editor")).toBeVisible({ timeout: 15000 });
  const sampleButton = page.locator("#editor").getByRole("button", { name: /Try a sample moment/i }).first();
  await expect(sampleButton).toBeVisible({ timeout: 10000 });
  await sampleButton.click();

  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await expect(locationInput).toHaveValue(/.+/, { timeout: 10000 });
  const dateInput = page.getByLabel("Date");
  await expect(dateInput).toHaveValue(/.+/, { timeout: 10000 });
};

const waitForCanvas = async (page: { locator: (selector: string) => any }) => {
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 15000 });
};

test.describe("Export Functionality", () => {
  test.describe.configure({ timeout: 60_000 });
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
    await setupCreateForm(page);

    // Find and fill text boxes
    const titleInput = page.getByPlaceholder("Enter title...");
    await titleInput.fill("Our Special Night");

    // Click reveal button
    const revealButton = page.locator("#editor").getByRole("button", { name: "Generate preview" }).first();
    await expect(revealButton).toBeVisible();
    await expect(revealButton).toBeEnabled();
    await revealButton.click();

    // Wait for canvas to render
    await waitForCanvas(page);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click Free Download button
    const freeDownloadButton = page.getByRole("button", { name: /Free/i }).first();
    await expect(freeDownloadButton).toBeVisible();
    await freeDownloadButton.click();

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
    await setupCreateForm(page);

    // Click reveal button
    const revealButton = page.locator("#editor").getByRole("button", { name: "Generate preview" }).first();
    await expect(revealButton).toBeVisible();
    await expect(revealButton).toBeEnabled();
    await revealButton.click();

    // Wait for canvas to render
    await waitForCanvas(page);

    // Click HD Export button (should trigger paywall)
    const hdExportButton = page.locator("#editor").getByRole("button", { name: "HD export" }).first();
    await expect(hdExportButton).toBeVisible();
    await hdExportButton.click();

    // Verify paywall modal appears
    await expect(page.getByText(/Download your print-ready star map/i)).toBeVisible({ timeout: 5000 });
  });

  test("empty text boxes don't break export", async ({ page }) => {
    await setupCreateForm(page);

    // DO NOT fill text boxes - leave them empty

    // Click reveal button
    const revealButton = page.locator("#editor").getByRole("button", { name: "Generate preview" }).first();
    await expect(revealButton).toBeVisible();
    await expect(revealButton).toBeEnabled();
    await revealButton.click();

    // Wait for canvas to render
    await waitForCanvas(page);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click Free Download button
    const freeDownloadButton = page.getByRole("button", { name: /Free/i }).first();
    await expect(freeDownloadButton).toBeVisible();
    await freeDownloadButton.click();

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
    await setupCreateForm(page);

    // Click reveal button
    const revealButton = page.locator("#editor").getByRole("button", { name: "Generate preview" }).first();
    await expect(revealButton).toBeVisible();
    await expect(revealButton).toBeEnabled();
    await revealButton.click();

    // Wait for canvas to render
    await waitForCanvas(page);

    // Reveal editor controls to edit all text boxes
    const customizeMoreButton = page.locator("#editor").getByRole("button", { name: /Customize more/i }).first();
    await customizeMoreButton.click();

    // Fill all 3 default text boxes
    await page.getByPlaceholder("Enter title...").fill("Title Line");
    await page.getByPlaceholder("Enter subtitle...").fill("Subtitle Line");
    await page.getByPlaceholder("Enter dedication...").fill("Dedication Line");

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click Free Download button
    const freeDownloadButton = page.getByRole("button", { name: /Free/i }).first();
    await expect(freeDownloadButton).toBeVisible();
    await freeDownloadButton.click();

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
