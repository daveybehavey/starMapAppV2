import { test, expect, type Page } from "@playwright/test";
import { primeLocalStorage } from "./test-helpers";

const localLocation = {
  id: 1,
  name: "London, UK",
  latitude: 51.5074,
  longitude: -0.1278,
  timezone: "Europe/London",
};

const freePreviewButton = (page: Page) => page.getByRole("button", { name: /Free preview/i });
const hdDownloadButton = (page: Page) => page.getByRole("button", { name: /Unlock HD/i });

const openReadyEditor = async (page: Page) => {
  await primeLocalStorage(page);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:3004(?:\/|$)|localhost:3004(?:\/|$))/, (route) =>
    route.abort()
  );
  await page.route("**/api/geocode**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([localLocation]),
    });
  });

  await page.goto("/simple-test", { waitUntil: "domcontentloaded" });
  const makeItYoursButton = page.getByRole("button", {
    name: /Start customizing your star map|Make it yours/i,
  });
  await expect(makeItYoursButton).toBeVisible({ timeout: 15_000 });

  const dateInput = page.locator("input[type='date']");
  await expect(async () => {
    await makeItYoursButton.click();
    await expect(dateInput).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await dateInput.fill("2024-06-15");
  await page.locator('input[placeholder*="Night Sky"]').fill("Test Map");

  const geocodeResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/geocode" && url.searchParams.get("q") === "London";
  });
  await page.locator('input[placeholder*="city"]').fill("London");
  await geocodeResponse;

  const suggestion = page.getByRole("option", { name: /London, UK/i });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await expect(freePreviewButton(page)).toBeEnabled();
  await expect(hdDownloadButton(page)).toBeEnabled();
};

test.describe("Error Handling", () => {
  test("should handle font load failure gracefully", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "fonts", {
        value: {
          ready: Promise.reject(new Error("Font loading failed")),
        },
        writable: false,
      });
    });

    await openReadyEditor(page);
    await freePreviewButton(page).click();

    const errorAlert = page
      .getByRole("alert")
      .filter({ hasText: "Failed to generate preview. Please try again." });
    await expect(errorAlert).toContainText("Failed to generate preview. Please try again.");
    await expect(errorAlert).toHaveAttribute("aria-live", "polite");
    await expect(freePreviewButton(page)).toBeEnabled();
  });

  test("should announce, dismiss, and recover from a render failure", async ({ page }) => {
    await openReadyEditor(page);

    if (process.env.ERROR_HANDLING_NEGATIVE_CONTROL !== "omit-render-failure") {
      await page.evaluate(() => {
        const originalToBlob = HTMLCanvasElement.prototype.toBlob;
        let failNextExport = true;
        HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
          if (failNextExport) {
            failNextExport = false;
            callback(null);
            return;
          }
          originalToBlob.call(this, callback, type, quality);
        };
      });
    }

    await freePreviewButton(page).click();

    const errorAlert = page
      .getByRole("alert")
      .filter({ hasText: "Failed to generate preview. Please try again." });
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Failed to generate preview. Please try again.");
    await expect(errorAlert).toHaveAttribute("aria-live", "polite");

    await errorAlert.getByRole("button", { name: "Dismiss error" }).click();
    await expect(errorAlert).toHaveCount(0);
    await expect(freePreviewButton(page)).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await freePreviewButton(page).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^starmap-.*-preview\.png$/);
    await expect(errorAlert).toHaveCount(0);
  });

  test("should announce checkout failure and allow a safe retry", async ({ page }) => {
    await openReadyEditor(page);
    let mapRequests = 0;
    let checkoutRequests = 0;

    await page.route("**/api/maps", async (route) => {
      mapRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: `test-map-${mapRequests}` }),
      });
    });
    await page.route("**/api/checkout", async (route) => {
      checkoutRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "checkout_unavailable",
          error: "Checkout unavailable",
        }),
      });
    });

    const hdButton = hdDownloadButton(page);
    await hdButton.click();

    const errorAlert = page
      .getByRole("alert")
      .filter({ hasText: "Unable to start checkout. Please try again." });
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Unable to start checkout. Please try again.");
    await expect(errorAlert).toHaveAttribute("aria-live", "polite");
    await expect.poll(() => mapRequests).toBe(1);
    await expect.poll(() => checkoutRequests).toBe(1);

    await errorAlert.getByRole("button", { name: "Dismiss error" }).click();
    await expect(errorAlert).toHaveCount(0);
    await expect(hdButton).toBeEnabled();
    await expect(hdButton).toHaveAttribute("aria-busy", "false");

    await hdButton.click();
    await expect.poll(() => mapRequests).toBe(2);
    await expect.poll(() => checkoutRequests).toBe(2);
    await expect(errorAlert).toContainText("Unable to start checkout. Please try again.");
    await expect(hdButton).toBeEnabled();
  });

  test("buttons should have proper ARIA attributes", async ({ page }) => {
    await openReadyEditor(page);
    await expect(freePreviewButton(page)).toHaveAttribute("aria-describedby", /.+-preview-hint/);
    await expect(hdDownloadButton(page)).toHaveAttribute("aria-describedby", /.+-hd-hint/);

    const styleGroup = page.locator('[role="radiogroup"][aria-label="Map style"]');
    await expect(styleGroup).toBeVisible();

    const shapeGroup = page.locator('[role="radiogroup"][aria-label="Map shape"]');
    await expect(shapeGroup).toBeVisible();

    const customizeButton = page.getByRole("button", { name: "Customize more" });
    await expect(customizeButton).toHaveAttribute("aria-expanded", "false");
    await customizeButton.click();

    const lessOptionsButton = page.getByRole("button", { name: "Less options" });
    await expect(lessOptionsButton).toHaveAttribute("aria-expanded", "true");
  });

  test("focus management should work correctly", async ({ page }) => {
    await openReadyEditor(page);
    const dateInput = page.locator("input[type='date']");
    const locationInput = page.locator('input[placeholder*="city"]');
    const titleInput = page.locator('input[placeholder*="Night Sky"]');

    await dateInput.focus();
    await expect(dateInput).toBeFocused();

    await locationInput.focus();
    await expect(locationInput).toBeFocused();

    await titleInput.focus();
    await expect(titleInput).toBeFocused();

    const styleButton = page.locator('[role="radio"]').first();
    await styleButton.focus();
    await expect(styleButton).toBeFocused();
  });

  test("loading states should show aria-busy", async ({ page }) => {
    await openReadyEditor(page);
    await expect(freePreviewButton(page)).toHaveAttribute("aria-busy", "false");
  });
});

test.describe("Screen Reader Announcements", () => {
  test("should have live region for status updates", async ({ page }) => {
    await openReadyEditor(page);
    await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  });
});
