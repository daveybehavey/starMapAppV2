import { test, expect } from "@playwright/test";
import {
  applySampleMoment,
  dismissOverlays,
  mockGeocode,
  primeLocalStorage,
  waitForEditor,
  waitForPreview,
} from "./test-helpers";

const paywallHeadingPattern = /Download your print-ready star map|Unlock HD exports in seconds/i;

test.describe("Manual Flow Check", () => {
  test("homepage → customize → preview → checkout", async ({ page }) => {
    test.setTimeout(90_000);
    await primeLocalStorage(page);
    await mockGeocode(page);
    let checkoutRequestCount = 0;
    await page.route("**/api/checkout", async (route) => {
      checkoutRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://example.com/mock-checkout" }),
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissOverlays(page);

    const heroForm = page.locator("form[action='/editor']").first();
    const heroDate = heroForm.locator("input[name='date']").first();
    const heroLocation = heroForm.locator("input[name='location']").first();
    await expect(heroDate).toBeVisible({ timeout: 15000 });
    await expect(heroLocation).toBeVisible({ timeout: 15000 });
    await heroDate.fill("2024-06-01");
    await heroLocation.fill("Paris, France");
    await heroForm.getByRole("button", { name: /Preview your map/i }).first().click();
    const reachedEditor = await page.waitForURL("**/editor**", { timeout: 30000 }).then(() => true).catch(() => false);
    if (!reachedEditor) {
      await heroLocation.press("Enter").catch(() => undefined);
      await page.waitForURL("**/editor**", { timeout: 15000 });
    }
    await waitForEditor(page);
    await dismissOverlays(page);
    await applySampleMoment(page);

    const locationInput = page
      .getByRole("combobox", { name: /Location search/i })
      .or(page.getByPlaceholder(/Search city|Search/i))
      .first();
    const hasInlineLocationInput = await locationInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasInlineLocationInput) {
      await locationInput.fill("Paris");
      const firstOption = page.getByRole("option").first();
      await expect(firstOption).toBeVisible({ timeout: 15000 });
      await firstOption.click();
    } else {
      const customizeMore = page.getByRole("button", { name: /Customize more/i }).first();
      if (await customizeMore.isVisible({ timeout: 3000 }).catch(() => false)) {
        await customizeMore.click();
        await dismissOverlays(page);
      }
    }

    const freePreviewBtn = page.getByLabel("Free export").first();
    await expect(freePreviewBtn).toBeEnabled({ timeout: 15000 });
    await freePreviewBtn.click();

    await waitForPreview(page);

    const hdBtn = page.getByLabel("HD export").first();
    await expect(hdBtn).toBeVisible({ timeout: 15000 });
    await expect(hdBtn).toBeEnabled({ timeout: 15000 });
    await hdBtn.click();
    const paywallHeading = page.getByRole("heading", { name: paywallHeadingPattern }).first();
    const checkoutRequestSeen = await page
      .waitForRequest("**/api/checkout", { timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    const paywallVisible = await paywallHeading.isVisible({ timeout: 12000 }).catch(() => false);
    expect(checkoutRequestSeen || paywallVisible || checkoutRequestCount > 0).toBeTruthy();
  });
});
