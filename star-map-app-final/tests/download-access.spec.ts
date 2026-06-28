import { test, expect } from "@playwright/test";
import { primeLocalStorage } from "./test-helpers";

const TEST_MAP_ID = "11111111-1111-4111-8111-111111111111";
const TEST_SESSION_ID = "cs_test_session";

test.describe("Download access after checkout", () => {
  test("session_id on download URL re-verifies Stripe and shows ready state when paid", async ({ page }) => {
    test.setTimeout(90_000);

    let verifyCalls = 0;
    await page.route("**/api/stripe/verify**", async (route) => {
      verifyCalls += 1;
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
          location: {
            name: "Paris, France",
            latitude: 48.8566,
            longitude: 2.3522,
            timezone: "Europe/Paris",
          },
          textBoxes: [{ id: "t1", text: "Test", fontFamily: "playfair", size: 28, align: "center" }],
          selectedStyle: "navyGold",
          aspectRatio: "square",
          seed: "test-seed",
          version: 1,
        }),
      });
    });

    await page.route("**/api/premium**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ paid: false }),
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
    await page.goto(`/download?session_id=${TEST_SESSION_ID}&map_id=${TEST_MAP_ID}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: /your hd star map is ready/i })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByRole("button", { name: /download hd file/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/confirm access first/i)).not.toBeVisible({ timeout: 5_000 });
    expect(verifyCalls).toBeGreaterThan(0);
  });
});
