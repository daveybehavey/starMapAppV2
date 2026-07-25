import { test, expect, type Page } from "@playwright/test";
import { applySampleMoment, gotoEditor, mockGeocode } from "./test-helpers";

const paywallHeadingPattern =
  /Buy this map in HD or print|Buy this map in HD|Download your print-ready star map|Unlock HD exports in seconds/i;

const hdExportButton = (page: Page) => page.getByLabel("HD export").first();
const paywallDialog = (page: Page) => page.getByRole("dialog");
const closePaywallButton = (page: Page) =>
  page.getByRole("button", { name: "Close purchase options" });

type PaidEditorCounters = {
  consumeCalls: number;
  downloadCount: number;
};

const setupUnpaidEditor = async (page: Page) => {
  await mockGeocode(page);
  await page.route("**/api/premium**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ paid: false, creditsRemaining: 0, plan: null }),
    });
  });
  await gotoEditor(page, { path: "/editor", force: "desktop" });
  await applySampleMoment(page);
};

const setupPaidEditor = async (page: Page): Promise<PaidEditorCounters> => {
  const counters: PaidEditorCounters = { consumeCalls: 0, downloadCount: 0 };

  page.on("download", () => {
    counters.downloadCount += 1;
  });

  await mockGeocode(page);
  await page.route("**/api/premium**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ paid: true, creditsRemaining: 1, plan: "single" }),
    });
  });
  await page.route("**/api/entitlements/consume", async (route) => {
    counters.consumeCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, creditsRemaining: 0, plan: "single" }),
    });
  });
  await gotoEditor(page, { path: "/editor", force: "desktop" });
  await applySampleMoment(page);
  return counters;
};

/**
 * Native disabled buttons do not invoke React onClick. Briefly clear disabled so a
 * second click reaches handleExport / hdExportInFlightRef, then restore the prior
 * disabled flag so UI assertions still observe the in-flight control state.
 */
const triggerHandlerCapableHdExport = async (page: Page) => {
  await hdExportButton(page).evaluate((node) => {
    const button = node as HTMLButtonElement;
    const wasDisabled = button.disabled;
    button.disabled = false;
    button.click();
    button.disabled = wasDisabled;
  });
};

test.describe("HD export in-flight guard lifecycle", () => {
  test.describe.configure({ timeout: 120_000 });

  test("unpaid Unlock HD opens paywall, dismissal restores action, and repeat click reopens paywall", async ({
    page,
  }) => {
    await setupUnpaidEditor(page);
    const hdButton = hdExportButton(page);
    await expect(hdButton).toBeEnabled();
    await expect(hdButton).toHaveText(/Unlock HD/i);

    await hdButton.click();
    await expect(paywallDialog(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: paywallHeadingPattern })).toBeVisible();

    await closePaywallButton(page).click();
    await expect(paywallDialog(page)).toHaveCount(0);
    await expect(hdButton).toBeEnabled();
    await expect(hdButton).toHaveText(/Unlock HD/i);
    await expect(hdButton).not.toBeDisabled();

    if (process.env.HD_EXPORT_GUARD_LIFECYCLE_NEGATIVE_CONTROL === "omit-repeat-paywall") {
      return;
    }

    await hdButton.click();
    await expect(paywallDialog(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: paywallHeadingPattern })).toBeVisible();
  });

  test("paid HD export blocks genuine concurrent duplicate exports", async ({ page }) => {
    const counters = await setupPaidEditor(page);
    await page.evaluate(() => {
      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        window.setTimeout(() => {
          originalToBlob.call(this, callback, type, quality);
        }, 2_500);
      };
    });

    const hdButton = hdExportButton(page);
    await expect(hdButton).toHaveText(/HD download/i);

    const downloadPromise = page.waitForEvent("download");
    await hdButton.click();
    await expect(hdButton).toBeDisabled();
    await expect(hdButton).toHaveText(/Preparing/i);

    // Second attempt must reach handleExport / hdExportInFlightRef (not a no-op on disabled).
    await triggerHandlerCapableHdExport(page);
    await expect(hdButton).toBeDisabled();
    await expect(hdButton).toHaveText(/Preparing/i);

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/i);
    await expect(hdButton).toBeEnabled({ timeout: 20_000 });
    await expect(hdButton).toHaveText(/HD download/i);

    expect(counters.downloadCount).toBe(1);
    expect(counters.consumeCalls).toBe(1);
  });

  test("paid HD export failure clears the in-flight guard for retry", async ({ page }) => {
    const counters = await setupPaidEditor(page);

    if (process.env.HD_EXPORT_GUARD_LIFECYCLE_NEGATIVE_CONTROL !== "omit-render-failure") {
      await page.evaluate(() => {
        const originalToBlob = HTMLCanvasElement.prototype.toBlob;
        let failNextHdExport = true;
        HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
          if (failNextHdExport) {
            failNextHdExport = false;
            callback(null);
            return;
          }
          originalToBlob.call(this, callback, type, quality);
        };
      });
    }

    const hdButton = hdExportButton(page);
    await hdButton.click();

    await expect(hdButton).toBeEnabled({ timeout: 20_000 });
    await expect(hdButton).toHaveText(/HD download/i);
    await expect(hdButton).not.toHaveText(/Preparing/i);

    // First-failure proof: no download and no credit consume on the failed attempt.
    // Negative control omit-render-failure makes this fail (first click succeeds).
    expect(counters.downloadCount).toBe(0);
    expect(counters.consumeCalls).toBe(0);

    const downloadPromise = page.waitForEvent("download");
    await hdButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/i);

    expect(counters.downloadCount).toBe(1);
    expect(counters.consumeCalls).toBe(1);
  });
});
