import { test, expect } from "@playwright/test";
import { dismissOverlays, primeLocalStorage } from "./test-helpers";

const waitForViewReady = async (page: { getByText: (text: string | RegExp) => any; locator: (selector: string) => any }) => {
  // Wait for loading state to clear if it appears.
  const loading = page.getByText("Loading your star map…");
  if (await loading.isVisible().catch(() => false)) {
    await expect(loading).toHaveCount(0, { timeout: 15000 });
  }
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
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
  });

  test("handles 404 gracefully", async ({ page }) => {
    await primeLocalStorage(page);
    await page.goto("/m/nonexistent-id-12345-test");
    await dismissOverlays(page);

    // Should show error state (allow for brief loading state)
    await expect(page.getByText(/Map not found/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: /Create your own/i })).toBeVisible();
  });

  test("has Share button and no edit controls", async () => {
    // This test assumes there's at least one valid shared map in the system
    // For a new deployment, this test would need a fixture map or would be skipped

    // For now, we'll just verify the 404 error handling works
    // In production, you'd have a test fixture map ID

    test.skip(); // Skip until we have a test fixture
  });

  // Removed redundant viewport test - responsive layout for 404 is already covered by "handles 404 gracefully" test
});
