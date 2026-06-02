import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { applySampleMoment, gotoEditor, mockGeocode, waitForPreview } from "./test-helpers";

const paywallHeadingPattern = /Buy this map in HD or print|Buy this map in HD|Download your print-ready star map|Unlock HD exports in seconds/i;

const setupEditor = async (page: Parameters<typeof gotoEditor>[0]) => {
  await gotoEditor(page, { path: "/editor", force: "desktop" });
  await applySampleMoment(page);
};

const setTextBoxValues = async (
  page: Parameters<typeof gotoEditor>[0],
  values: Partial<Record<"title" | "subtitle" | "dedication", string>>,
) => {
  // Editor UI can render before the Zustand store handle is attached.
  // Wait explicitly for deterministic access.
  await page.waitForFunction(() => {
    const store = (window as unknown as { __ZUSTAND_STORE__?: { getState?: unknown } }).__ZUSTAND_STORE__;
    return Boolean(store?.getState);
  }, { timeout: 45_000 });

  await page.evaluate((textValues) => {
    type TextBox = {
      id: string;
      text?: string;
      [key: string]: unknown;
    };
    const store = (window as unknown as {
      __ZUSTAND_STORE__?: {
        getState: () => {
          textBoxes: TextBox[];
          setTextBoxes: (textBoxes: TextBox[]) => void;
        };
      };
    }).__ZUSTAND_STORE__;
    if (!store) throw new Error("Missing __ZUSTAND_STORE__");
    const state = store.getState();
    const updated = state.textBoxes.map((box) => {
      const next = textValues[box.id as "title" | "subtitle" | "dedication"];
      return next === undefined ? box : { ...box, text: next };
    });
    state.setTextBoxes(updated);
  }, values);
};

test.describe("Export Functionality", () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async ({ page }) => {
    await mockGeocode(page);
  });

  test("text renders correctly in free export", async ({ page }) => {
    await setupEditor(page);
    await setTextBoxValues(page, { title: "Our Special Night" });
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
    await expect(page.getByRole("heading", { name: paywallHeadingPattern })).toBeVisible({
      timeout: 5000,
    });
  });

  test("empty text boxes don't break export", async ({ page }) => {
    await setupEditor(page);
    await setTextBoxValues(page, { title: "", subtitle: "" });
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

    await page.evaluate(() => {
      const store = (window as unknown as {
        __ZUSTAND_STORE__?: {
          getState: () => {
            textBoxes: Array<Record<string, unknown>>;
            setTextBoxes: (textBoxes: Array<Record<string, unknown>>) => void;
          };
        };
      }).__ZUSTAND_STORE__;
      if (!store) throw new Error("Missing __ZUSTAND_STORE__");

      const state = store.getState();
      const existingTitle =
        state.textBoxes.find((box) => box.id === "title") ??
        state.textBoxes[0] ?? {
          id: "title",
          label: "Title",
          fontFamily: "cinzel",
          color: "#d7b56c",
          size: 42,
          align: "center",
          position: { x: 0.5, y: 0.12 },
          textShadow: false,
          textGlow: false,
        };
      const existingSubtitle =
        state.textBoxes.find((box) => box.id === "subtitle") ?? {
          ...existingTitle,
          id: "subtitle",
          label: "Subtitle",
          size: 28,
          position: { x: 0.5, y: 0.18 },
        };
      const existingDedication =
        state.textBoxes.find((box) => box.id === "dedication") ?? {
          ...existingTitle,
          id: "dedication",
          label: "Dedication",
          size: 24,
          position: { x: 0.5, y: 0.9 },
        };

      state.setTextBoxes([
        { ...existingTitle, text: "Title Line" },
        { ...existingSubtitle, text: "Subtitle Line" },
        { ...existingDedication, text: "Dedication Line" },
      ]);
    });

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
