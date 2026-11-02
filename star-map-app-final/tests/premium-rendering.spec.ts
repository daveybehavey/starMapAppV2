import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { applySampleMoment, gotoEditor, waitForMapCanvasReady } from "./test-helpers";

const setupWithSampleMoment = async (page: Page) => {
  await gotoEditor(page, { path: "/editor", force: "desktop" });
  await applySampleMoment(page);
};

const openAdvancedPanel = async (page: Page) => {
  const customizeMoreButton = page.getByRole("button", { name: /Customize more/i }).first();
  if (await customizeMoreButton.isVisible().catch(() => false)) {
    await customizeMoreButton.click();
  }

  const advancedToggle = page.getByRole("button", { name: /^Advanced(?:\s|$)/ }).first();
  await expect(advancedToggle).toBeVisible({ timeout: 15_000 });
  if ((await advancedToggle.getAttribute("aria-expanded")) !== "true") {
    await advancedToggle.click();
  }

  const advancedLabel = page.getByText("Advanced controls", { exact: true });
  await expect(advancedLabel).toBeVisible({ timeout: 15_000 });
  return advancedToggle.locator("..");
};

const readCanvasSignature = (canvas: Locator) =>
  canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d");
    if (!context || element.width === 0 || element.height === 0) {
      return "not-rendered";
    }

    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let hash = 2166136261;
    for (let index = 0; index < pixels.length; index += 1) {
      hash ^= pixels[index] ?? 0;
      hash = Math.imul(hash, 16777619);
    }
    return `${element.width}x${element.height}:${hash >>> 0}`;
  });

const waitForStableCanvasSignature = async (canvas: Locator, previousSignature?: string) => {
  let lastSignature = "";
  let stableReadCount = 0;
  let stableSignature: string | null = null;

  await expect
    .poll(
      async () => {
        const currentSignature = await readCanvasSignature(canvas);
        if (currentSignature === "not-rendered" || currentSignature === previousSignature) {
          lastSignature = currentSignature;
          stableReadCount = 0;
          return null;
        }

        if (currentSignature === lastSignature) {
          stableReadCount += 1;
        } else {
          lastSignature = currentSignature;
          stableReadCount = 1;
        }

        if (stableReadCount >= 3) {
          stableSignature = currentSignature;
        }
        return stableSignature;
      },
      {
        timeout: 20_000,
        intervals: [100, 150, 250, 400],
        message: "canvas should settle on a new deterministic pixel signature",
      },
    )
    .not.toBeNull();

  if (!stableSignature) {
    throw new Error("Canvas did not produce a stable signature");
  }
  return stableSignature;
};

const attachCanvas = async (testInfo: TestInfo, name: string, canvas: Locator) => {
  await testInfo.attach(name, {
    body: await canvas.screenshot(),
    contentType: "image/png",
  });
};

test.describe("Premium Rendering Features", () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 1440, height: 900 } });

  test("star map renders with all visual elements", async ({ page }) => {
    await setupWithSampleMoment(page);

    // Find the star map preview area
    const previewArea = page.getByLabel(/Star map preview/i).first();

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

  test("constellation lines render correctly", async ({ page }, testInfo) => {
    await setupWithSampleMoment(page);
    const preview = await waitForMapCanvasReady(page);
    const canvas = preview.locator("canvas").first();
    const advancedPanel = await openAdvancedPanel(page);
    const constellationControls = advancedPanel.getByText("Constellations", { exact: true }).locator("..").locator("..");
    const lineOptions = ["Off", "Thin", "Bold"] as const;
    const signatures: string[] = [];
    let previousSignature: string | undefined;

    for (const option of lineOptions) {
      const button = constellationControls.getByRole("button", { name: option, exact: true });
      await expect(button).toBeVisible();
      await button.click();
      const signature = await waitForStableCanvasSignature(canvas, previousSignature);
      signatures.push(signature);
      previousSignature = signature;
      await attachCanvas(testInfo, `constellation-lines-${option.toLowerCase()}`, canvas);
    }

    expect(new Set(signatures).size).toBe(lineOptions.length);
  });

  test("visual mode selector affects rendering", async ({ page }, testInfo) => {
    await setupWithSampleMoment(page);
    const preview = await waitForMapCanvasReady(page);
    const canvas = preview.locator("canvas").first();
    const advancedPanel = await openAdvancedPanel(page);
    const visualModeControls = advancedPanel.getByText("Visual Mode", { exact: true }).locator("..");
    const visualModes = ["Astronomical", "Enhanced", "Illustrated"] as const;
    const signatures: string[] = [];
    let previousSignature: string | undefined;

    for (const mode of visualModes) {
      const button = visualModeControls.getByRole("button", { name: mode, exact: true });
      await expect(button).toBeVisible();
      await button.click();
      const signature = await waitForStableCanvasSignature(canvas, previousSignature);
      signatures.push(signature);
      previousSignature = signature;
      await attachCanvas(testInfo, `visual-mode-${mode.toLowerCase()}`, canvas);
    }

    expect(new Set(signatures).size).toBe(visualModes.length);
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

test("Bortle slider changes sky darkness and returns exactly to the default", async ({ page }, testInfo) => {
  await gotoEditor(page, { path: "/editor", force: "desktop" });
  await applySampleMoment(page);
  const preview = await waitForMapCanvasReady(page);
  const customize = page.getByRole("button", { name: /Customize more/i }).first();
  if (await customize.isVisible()) await customize.click();
  const advanced = page.getByRole("button", { name: /^Advanced(?:\s|$)/ }).first();
  if ((await advanced.getAttribute("aria-expanded")) !== "true") await advanced.click();
  const slider = page.getByRole("slider", { name: /Sky darkness \(Bortle class\)/ }).first();
  await expect(slider).toHaveValue("4.5");
  const canvas = preview.locator("canvas").first();
  const pixels = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext("2d")!.getImageData(0, 0, element.width, element.height).data;
    let sum = 0;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) {
      hash = Math.imul(hash ^ data[i], 16777619);
      if (i % 4 !== 3) sum += data[i];
    }
    return { hash: hash >>> 0, brightness: sum / (data.length * 0.75) };
  });
  // The renderer is deterministic; wait until each update has settled.
  const settle = async () => {
    let previous = -1;
    let matches = 0;
    await expect.poll(async () => {
      const { hash } = await pixels();
      matches = hash === previous ? matches + 1 : 0;
      previous = hash;
      return matches;
    }, { intervals: [250], timeout: 15000 }).toBeGreaterThanOrEqual(3);
    return pixels();
  };
  const baseline = await settle();
  await testInfo.attach("bortle-4.5", { body: await canvas.screenshot(), contentType: "image/png" });
  for (const value of [1, 9, 4.5]) {
    await slider.focus();
    await slider.press("Home");
    for (let step = 0; step < (value - 1) * 2; step++) await slider.press("ArrowRight");
    await expect(slider).toHaveValue(String(value));
    if (value !== 4.5) await expect.poll(async () => (await pixels()).hash).not.toBe(baseline.hash);
    else await expect.poll(async () => (await pixels()).hash).toBe(baseline.hash);
    const current = await settle();
    if (value === 1) expect(current.brightness).toBeLessThan(baseline.brightness - 1);
    if (value === 9) expect(current.brightness).toBeGreaterThan(baseline.brightness + 10);
    await testInfo.attach(`bortle-${value}`, { body: await canvas.screenshot(), contentType: "image/png" });
  }
});
