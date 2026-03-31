import { test, expect, type Page } from "@playwright/test";
import { primeLocalStorage } from "./test-helpers";

async function enterCustomizationMode(page: Page) {
  const makeItYoursButton = page
    .getByRole("button", { name: /start customizing your star map|make it yours/i })
    .first();
  await expect(makeItYoursButton).toBeVisible({ timeout: 20000 });

  const dateInput = page.locator("input[type='date']");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await makeItYoursButton.click({ force: true });
    if (await dateInput.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(400);
  }
  await expect(dateInput).toBeEnabled({ timeout: 20000 });
}

test.describe("LocationInput Keyboard & Search Behavior", () => {
  test.beforeEach(async ({ page }) => {
    await primeLocalStorage(page);
    await page.goto("/simple-test", { waitUntil: "domcontentloaded" });
    await enterCustomizationMode(page);
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
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 10000 });

    await locationInput.press("ArrowDown");
    await expect(locationInput).toHaveAttribute("aria-activedescendant", /-option-0$/);

    await locationInput.press("Enter");
    await expect(locationInput).toHaveValue(/Paris, France/i);
  });

  test("debounce limits requests during rapid typing", async ({ page }) => {
    test.setTimeout(60_000);
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
    const finalRequest = page.waitForRequest(
      (request) => {
        const url = new URL(request.url());
        return url.pathname === "/api/geocode" && (url.searchParams.get("q") ?? "").toLowerCase() === "paris";
      },
      { timeout: 10000 },
    );

    await locationInput.click();
    await locationInput.fill("");
    await locationInput.fill("P");
    await page.waitForTimeout(50);
    await locationInput.fill("Pa");
    await page.waitForTimeout(50);
    await locationInput.fill("Par");
    await page.waitForTimeout(50);
    await locationInput.fill("Pari");
    await page.waitForTimeout(50);
    await locationInput.fill("Paris");

    await finalRequest;
    await expect.poll(() => requestCount, { timeout: 10000 }).toBeGreaterThan(0);
    await expect.poll(() => lastQuery, { timeout: 10000 }).toBe("Paris");
    expect(requestCount).toBeLessThanOrEqual(4);
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
