import { test, expect, type Page } from "@playwright/test";
import { primeLocalStorage } from "./test-helpers";

async function enterCustomizationMode(page: Page) {
  const dateInput = page.locator("input[type='date']");
  if (await dateInput.isEnabled().catch(() => false)) return;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await dateInput.isEnabled().catch(() => false)) break;
    const makeItYoursButton = page
      .getByRole("button", { name: /start customizing your star map|make it yours/i })
      .first();
    const canClick = await makeItYoursButton.isVisible({ timeout: 1500 }).catch(() => false);
    if (!canClick) {
      await page.waitForTimeout(250);
      continue;
    }
    try {
      await makeItYoursButton.click({ timeout: 3000 });
    } catch {
      await makeItYoursButton.click({ force: true, timeout: 3000 }).catch(() => undefined);
    }
    await page.waitForTimeout(350);
  }
  await expect(dateInput).toBeEnabled({ timeout: 20000 });
}

test.describe("SimplifiedEditor draft autosave", () => {
  test("restores draft on reload", async ({ page }) => {
    test.setTimeout(60_000);
    await primeLocalStorage(page);

    await page.route("**/api/geocode**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "Paris, France", latitude: 48.8566, longitude: 2.3522 },
        ]),
      });
    });

    await page.goto("/simple-test", { waitUntil: "domcontentloaded" });
    await enterCustomizationMode(page);
    await expect(page.getByRole("heading", { name: /your moment/i })).toBeVisible({ timeout: 15000 });

    const dateInput = page.locator("input[type='date']");
    await dateInput.fill("2024-06-15");

    const titleInput = page.locator("input[placeholder='Our Night Sky']");
    await titleInput.fill("Our Paris Night");

    const locationInput = page.getByRole("combobox", { name: /Location search/i });
    await locationInput.fill("Paris");
    await page.waitForTimeout(500);
    await page.getByRole("option").first().click();

    await page.waitForTimeout(900);

    await page.reload({ waitUntil: "domcontentloaded" });
    const restoredDateInput = page.locator("input[type='date']");
    const dateReady = await restoredDateInput.isEnabled().catch(() => false);
    if (!dateReady) {
      const unlockedWithoutClick = await restoredDateInput
        .waitFor({ state: "visible", timeout: 10000 })
        .then(async () => restoredDateInput.isEnabled().catch(() => false))
        .catch(() => false);
      if (!unlockedWithoutClick) {
        const makeItYoursButton = page
          .getByRole("button", { name: /start customizing your star map|make it yours/i })
          .first();
        if (await makeItYoursButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await enterCustomizationMode(page);
        }
      }
    }
    await expect(page.getByRole("heading", { name: /your moment|customize your moment/i })).toBeVisible({
      timeout: 15000,
    });

    await expect(restoredDateInput).toBeEnabled({ timeout: 20000 });
    await expect(restoredDateInput).toHaveValue("2024-06-15");

    const restoredTitleInput = page.locator("input[placeholder='Our Night Sky']");
    await expect(restoredTitleInput).toBeEnabled();
    await expect(restoredTitleInput).toHaveValue("Our Paris Night");

    const restoredLocationInput = page.getByRole("combobox", { name: /Location search/i });
    await expect(restoredLocationInput).toHaveValue(/Paris, France/i);
  });
});
