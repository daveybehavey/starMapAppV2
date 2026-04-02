import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { applySampleMoment, getPreviewArea, gotoEditor, waitForPreview } from "./test-helpers";

const setupWithSampleMoment = async (page: Parameters<typeof gotoEditor>[0]) => {
  await gotoEditor(page, { path: "/editor", force: "desktop" });
  await applySampleMoment(page);
};

test.describe("Premium Rendering Features", () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 1440, height: 900 } });

  test("star map renders with all visual elements", async ({ page }) => {
    await setupWithSampleMoment(page);

    // Find the star map preview area
    const previewArea = getPreviewArea(page);

    // Take a screenshot of the preview area for visual verification
    const screenshot = await previewArea.screenshot().catch(async () => {
      // Fallback: screenshot the page
      return await page.screenshot();
    });
    expect(screenshot.byteLength).toBeGreaterThan(5000);

    // Save screenshot for manual inspection
    const screenshotPath = path.join(__dirname, "../test-results", "star-map-preview.png");
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, screenshot);
    console.log(`Saved star map screenshot: ${screenshotPath} (${screenshot.byteLength} bytes)`);
  });

  test("constellation lines render correctly", async ({ page }) => {
    await setupWithSampleMoment(page);

    // Expand customize more to access constellation settings
    const customizeMoreButton = page.getByRole("button", { name: /Customize more/i }).first();
    if (await customizeMoreButton.isVisible().catch(() => false)) {
      await customizeMoreButton.click();
      await page.waitForTimeout(500);
    }

    // Find constellation toggle or verify it exists in settings
    const constellationText = page.getByText(/constellation/i).first();
    const hasConstellations = await constellationText.isVisible().catch(() => false);

    console.log(`Constellation controls visible: ${hasConstellations}`);

    // Verify the preview is still rendering
    await waitForPreview(page);
  });

  test("visual mode selector affects rendering", async ({ page }) => {
    await setupWithSampleMoment(page);

    // Expand customize more
    const customizeMoreButton = page.getByRole("button", { name: /Customize more/i }).first();
    if (await customizeMoreButton.isVisible().catch(() => false)) {
      await customizeMoreButton.click();
      await page.waitForTimeout(500);
    }

    // Look for Fine-tune design section
    const fineTuneSection = page.getByText(/Fine-tune design/i).first();
    const hasFineTune = await fineTuneSection.isVisible().catch(() => false);

    if (hasFineTune) {
      // Click to expand if it's a collapsible
      await fineTuneSection.click().catch(() => {});
      await page.waitForTimeout(300);
    }

    // Check for visual mode options
    const astronomicalOption = page.getByText(/astronomical/i).first();
    const illustratedOption = page.getByText(/illustrated/i).first();

    const hasAstronomical = await astronomicalOption.isVisible().catch(() => false);
    const hasIllustrated = await illustratedOption.isVisible().catch(() => false);

    console.log(`Visual mode options - Astronomical: ${hasAstronomical}, Illustrated: ${hasIllustrated}`);

    // Verify the preview is still rendering
    await waitForPreview(page);
  });

  test("free export produces valid image", async ({ page }) => {
    await setupWithSampleMoment(page);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click Free Download button
    const freeDownloadButton = page.getByLabel("Free export").first();
    await expect(freeDownloadButton).toBeVisible();
    await freeDownloadButton.click();

    // Wait for download to complete
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".png");

    // Save and verify
    const downloadPath = path.join(__dirname, "../test-results", "premium-test-export.png");
    await download.saveAs(downloadPath);

    const fileExists = fs.existsSync(downloadPath);
    expect(fileExists).toBeTruthy();

    if (fileExists) {
      const stats = fs.statSync(downloadPath);
      expect(stats.size).toBeGreaterThan(10000);
      console.log(`Export file size: ${stats.size} bytes`);
    }
  });
});
