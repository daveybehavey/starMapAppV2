import { test, expect } from "@playwright/test";

test.describe("SimplifiedEditor draft autosave", () => {
  test("restores draft on reload", async ({ page }) => {
    test.setTimeout(60_000);
    await page.route("**/api/geocode**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "Paris, France", latitude: 48.8566, longitude: 2.3522 },
        ]),
      });
    });

    await page.goto("/simple-test");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /start customizing your star map|make it yours/i }).click();
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

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /your moment/i })).toBeVisible({ timeout: 15000 });

    const restoredDateInput = page.locator("input[type='date']");
    await expect(restoredDateInput).toBeEnabled();
    await expect(restoredDateInput).toHaveValue("2024-06-15");

    const restoredTitleInput = page.locator("input[placeholder='Our Night Sky']");
    await expect(restoredTitleInput).toBeEnabled();
    await expect(restoredTitleInput).toHaveValue("Our Paris Night");

    const restoredLocationInput = page.getByRole("combobox", { name: /Location search/i });
    await expect(restoredLocationInput).toHaveValue(/Paris, France/i);
  });
});
