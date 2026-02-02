import { test, expect } from "@playwright/test";

test.describe("LocationInput Keyboard & Search Behavior", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/simple-test");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.locator("text=Make it yours").click();
    await page.waitForTimeout(300);
  });

  test("arrow keys highlight options and Enter selects", async ({ page }) => {
    await page.route("**/api/geocode**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "Paris, France", latitude: 48.8566, longitude: 2.3522 },
          { id: 2, name: "Parish, NY", latitude: 43.4067, longitude: -76.1277 },
        ]),
      });
    });

    const locationInput = page.getByRole("combobox", { name: /Location search/i });
    await locationInput.fill("Par");
    await page.waitForTimeout(500);

    await locationInput.press("ArrowDown");
    await expect(locationInput).toHaveAttribute("aria-activedescendant", /-option-0$/);

    await locationInput.press("Enter");
    await expect(locationInput).toHaveValue(/Paris, France/i);
  });

  test("debounce limits requests during rapid typing", async ({ page }) => {
    let requestCount = 0;
    let lastQuery = "";

    await page.route("**/api/geocode**", async (route) => {
      requestCount += 1;
      const url = new URL(route.request().url());
      lastQuery = url.searchParams.get("q") ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "Paris, France", latitude: 48.8566, longitude: 2.3522 },
        ]),
      });
    });

    const locationInput = page.getByRole("combobox", { name: /Location search/i });
    await locationInput.fill("P");
    await page.waitForTimeout(50);
    await locationInput.fill("Pa");
    await page.waitForTimeout(50);
    await locationInput.fill("Par");
    await page.waitForTimeout(50);
    await locationInput.fill("Pari");
    await page.waitForTimeout(50);
    await locationInput.fill("Paris");

    await page.waitForTimeout(600);
    expect(requestCount).toBeLessThanOrEqual(2);
    expect(lastQuery).toBe("Paris");
  });

  test("invalid timezone lookup falls back without crashing", async ({ page }) => {
    await page.route("**/api/geocode**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "Nowhere", latitude: 999, longitude: 999 },
        ]),
      });
    });

    const locationInput = page.getByRole("combobox", { name: /Location search/i });
    await locationInput.fill("Now");
    await page.waitForTimeout(500);
    await page.getByRole("option").first().click();

    const timezone = await page.evaluate(() => {
      const store = (window as unknown as { __ZUSTAND_STORE__?: { getState: () => { location: { timezone: string } } } })
        .__ZUSTAND_STORE__;
      return store?.getState().location.timezone;
    });

    expect(timezone).toBe("UTC");
  });
});
