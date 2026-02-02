import { test, expect } from "@playwright/test";
import { dismissOverlays, mockGeocode, primeLocalStorage } from "./test-helpers";

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
        body: JSON.stringify({ checkoutUrl: "https://example.com/mock-checkout" }),
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissOverlays(page);

    const makeItYoursBtn = page.getByRole("button", { name: /make it yours/i }).first();
    const startCustomizingBtn = page.getByRole("button", { name: /start customizing your star map/i }).first();
    const customizeBtn = startCustomizingBtn.or(makeItYoursBtn);
    const dateInput = page.locator("input[type='date']").first();
    if (await dateInput.isDisabled().catch(() => false)) {
      if (await customizeBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
        await customizeBtn.click();
      }
    }
    await expect(dateInput).toBeEnabled({ timeout: 15000 });

    const locationInput = page
      .getByRole("combobox", { name: /Location search/i })
      .or(page.getByPlaceholder(/Search/i))
      .first();
    await expect(locationInput).toBeVisible({ timeout: 15000 });
    await locationInput.fill("Paris");

    const firstOption = page.getByRole("option").first();
    await expect(firstOption).toBeVisible({ timeout: 15000 });
    await firstOption.click();

    const freePreviewBtn = page.getByRole("button", { name: /Free preview/i }).first();
    await expect(freePreviewBtn).toBeEnabled({ timeout: 15000 });
    await freePreviewBtn.click();

    await expect(page.getByRole("img", { name: /star map preview/i }).first()).toBeVisible({ timeout: 20000 });

    const downloadGroup = page.getByRole("group", { name: /download options/i }).first();
    const hdBtn = downloadGroup.getByRole("button", { name: /hd/i }).first();
    await expect(hdBtn).toBeVisible({ timeout: 15000 });
    await expect(hdBtn).toBeEnabled({ timeout: 15000 });
    await hdBtn.click();
    const paywallHeading = page.getByText(/Download your print-ready star map/i).first();
    const checkoutRequestSeen = await page
      .waitForRequest("**/api/checkout", { timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    const paywallVisible = await paywallHeading.isVisible({ timeout: 12000 }).catch(() => false);
    expect(checkoutRequestSeen || paywallVisible || checkoutRequestCount > 0).toBeTruthy();
  });
});
