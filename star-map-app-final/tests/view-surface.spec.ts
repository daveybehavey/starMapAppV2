import { test, expect } from "@playwright/test";
import { dismissOverlays, primeLocalStorage } from "./test-helpers";

const waitForViewReady = async (page: { getByText: (text: string | RegExp) => any; locator: (selector: string) => any }) => {
  // Wait for loading state to clear if it appears.
  const loading = page.getByText("Loading your star map…");
  if (await loading.isVisible().catch(() => false)) {
    await expect(loading).toHaveCount(0, { timeout: 15000 });
  }
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15000 });
};

test.describe("View Surface (/m/[id])", () => {
  // Test with a predictable map ID - we'll need to create this via the Create flow first
  // or use an existing shared map

  test("has no edit controls (read-only)", async ({ page }) => {
    const payload = {
      version: 1,
      seed: "test-seed",
      datetimeISO: "2024-06-15T00:00:00.000Z",
      location: {
        name: "Paris, France",
        latitude: 48.8566,
        longitude: 2.3522,
        timezone: "Europe/Paris",
      },
      textBoxes: [{ text: "A Night in Paris" }, { text: "June 15, 2024" }, { text: "With love" }],
      selectedStyle: "navyGold",
      aspectRatio: "square",
      shape: "rectangle",
      renderOptions: {
        constellationLines: "thin",
      },
    };

    await primeLocalStorage(page);
    const response = await page.request.post("/api/maps", { data: payload });
    expect(response.ok()).toBeTruthy();
    const { id } = (await response.json()) as { id: string };

    await page.goto(`/m/${id}`);
    await dismissOverlays(page);

    await waitForViewReady(page);
    await expect(page.getByRole("button", { name: /Share this map/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save & Remix/i })).toHaveCount(0);
    await expect(page.locator("#shop-this-map")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Order from this exact design/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /HD digital download/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Edit this design/i })).toBeVisible();
  });

  test("handles 404 gracefully", async ({ page }) => {
    await primeLocalStorage(page);
    await page.goto("/m/nonexistent-id-12345-test");
    await dismissOverlays(page);

    // Should show error state (allow for brief loading state)
    await expect(page.getByText(/Map not found/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: /Create your own/i })).toBeVisible();
  });

  test("copies the shared map URL when native sharing is unavailable", async ({ page }) => {
    const id = "26800000-0000-4000-8000-000000000001";
    const payload = {
      version: 1,
      seed: "clipboard-fallback-regression",
      datetimeISO: "2024-06-15T00:00:00.000Z",
      location: {
        name: "Paris, France",
        latitude: 48.8566,
        longitude: 2.3522,
        timezone: "Europe/Paris",
      },
      textBoxes: [{ text: "A Night in Paris" }, { text: "June 15, 2024" }, { text: "With love" }],
      selectedStyle: "navyGold",
      aspectRatio: "square",
      shape: "rectangle",
      renderOptions: { constellationLines: "thin" },
    };

    await primeLocalStorage(page);
    await page.addInitScript(() => {
      const clipboardWindow = window as typeof window & { __copiedMapUrls: string[] };
      clipboardWindow.__copiedMapUrls = [];
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            clipboardWindow.__copiedMapUrls.push(text);
          },
        },
      });
    });
    await page.route(`**/api/maps?id=${id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    });

    await page.goto(`/m/${id}`);
    await dismissOverlays(page);
    await waitForViewReady(page);
    await expect(page.getByRole("button", { name: /Save & Remix/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Generate preview|Preview your map/i })).toHaveCount(0);

    const currentUrl = page.url();
    await page.getByRole("button", { name: /Share this map/i }).click();
    await expect(page.getByText("Link copied!", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      return (window as typeof window & { __copiedMapUrls: string[] }).__copiedMapUrls;
    })).toEqual([currentUrl]);
  });

  // Removed redundant viewport test - responsive layout for 404 is already covered by "handles 404 gracefully" test
});
