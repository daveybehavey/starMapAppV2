import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { applySampleMoment, gotoEditor, mockGeocode, waitForPreview } from "./test-helpers";

const setupEditor = async (page: Parameters<typeof gotoEditor>[0]) => {
  await gotoEditor(page, { path: "/editor", force: "desktop" });
  await applySampleMoment(page);
};

test.describe("Export Functionality", () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async ({ page }) => {
    await mockGeocode(page);
  });

  test("text renders correctly in free export", async ({ page }) => {
    await setupEditor(page);

    const titleInput = page.getByPlaceholder("Enter title...");
    await expect(titleInput).toBeVisible();
    await titleInput.fill("Our Special Night");
    await waitForPreview(page);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click Free Download button
    const freeDownloadButton = page.getByLabel("Free export").first();
    await expect(freeDownloadButton).toBeVisible({ timeout: 10000 });
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
    await setupEditor(page);

    // Click HD Export button (should trigger paywall)
    const hdExportButton = page.getByLabel("HD export").first();
    await expect(hdExportButton).toBeVisible();
    await hdExportButton.click();

    // Verify paywall modal appears
    await expect(page.getByRole("heading", { name: /Download your print-ready star map/i })).toBeVisible({
      timeout: 5000,
    });
  });

  test("empty text boxes don't break export", async ({ page }) => {
    await setupEditor(page);

    // Expand collapsed textboxes (subtitle and dedication are collapsed by default)
    // Click only "Show" buttons that are collapsed (aria-expanded=false)
    const showButtons = page.locator('button:has-text("Show")[aria-expanded="false"]');
    const buttonCount = await showButtons.count();
    for (let i = 0; i < buttonCount; i++) {
      // Re-query each time as the button state changes after clicking
      const collapsedButtons = page.locator('button:has-text("Show")[aria-expanded="false"]');
      const count = await collapsedButtons.count();
      if (count > 0) {
        await collapsedButtons.first().click();
        await page.waitForTimeout(100); // Brief wait for state update
      }
    }

    await page.getByPlaceholder("Enter title...").fill("");
    await page.getByPlaceholder("Enter subtitle...").fill("");
    await page.getByPlaceholder("Enter dedication...").fill("");
    await waitForPreview(page);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click Free Download button
    const freeDownloadButton = page.getByLabel("Free export").first();
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
    await setupEditor(page);

    // Expand collapsed textboxes (subtitle and dedication are collapsed by default)
    // Click only "Show" buttons that are collapsed (aria-expanded=false)
    const showButtons = page.locator('button:has-text("Show")[aria-expanded="false"]');
    const buttonCount = await showButtons.count();
    for (let i = 0; i < buttonCount; i++) {
      // Re-query each time as the button state changes after clicking
      const collapsedButtons = page.locator('button:has-text("Show")[aria-expanded="false"]');
      const count = await collapsedButtons.count();
      if (count > 0) {
        await collapsedButtons.first().click();
        await page.waitForTimeout(100); // Brief wait for state update
      }
    }

    // Fill all 3 default text boxes
    await page.getByPlaceholder("Enter title...").fill("Title Line");
    await page.getByPlaceholder("Enter subtitle...").fill("Subtitle Line");
    await page.getByPlaceholder("Enter dedication...").fill("Dedication Line");

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click Free Download button
    const freeDownloadButton = page.getByLabel("Free export").first();
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
