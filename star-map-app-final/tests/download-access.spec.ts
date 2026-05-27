import { test, expect } from "@playwright/test";
import { primeLocalStorage } from "./test-helpers";

const TEST_MAP_ID = "11111111-1111-4111-8111-111111111111";

test.describe("Download access after checkout", () => {
  test("session_id on download URL polls verify and shows ready state when paid", async ({ page }) => {
    test.setTimeout(90_000);

    await page.route("**/api/stripe/verify**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          paid: true,
          mapId: TEST_MAP_ID,
          plan: "single",
          creditsRemaining: 1,
          orderType: "digital",
        }),
      });
    });

    await page.route(`**/api/maps?id=${TEST_MAP_ID}**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          datetimeISO: "2024-06-01T22:00:00.000Z",
          location: { name: "Paris, France", lat: 48.8566, lon: 2.3522 },
          textBoxes: [{ id: "t1", text: "Test", x: 0.5, y: 0.5 }],
          selectedStyle: "classic",
          aspectRatio: "square",
        }),
      });
    });

    await page.route("**/api/premium**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ paid: true, plan: "single", creditsRemaining: 1 }),
      });
    });

    await page.route("**/api/entitlements/link**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: `https://starmapco.com/download?token=test-claim-token&map_id=${TEST_MAP_ID}`,
        }),
      });
    });

    await primeLocalStorage(page);
    await page.goto(`/download?session_id=cs_test_session&map_id=${TEST_MAP_ID}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: /download ready/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/confirm access first/i)).not.toBeVisible({ timeout: 5_000 });
  });
});
