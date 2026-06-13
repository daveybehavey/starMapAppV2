import { test, expect } from "@playwright/test";
import { dismissOverlays, primeLocalStorage } from "./test-helpers";

test.describe("Editor map_id hydration", () => {
  test("loads saved map from map_id query", async ({ page }) => {
    test.setTimeout(90_000);

    const payload = {
      version: 1,
      seed: "hub-hydration",
      datetimeISO: "2024-06-15T00:00:00.000Z",
      location: {
        name: "Paris, France",
        latitude: 48.8566,
        longitude: 2.3522,
        timezone: "Europe/Paris",
      },
      textBoxes: [{ text: "Our Paris Night" }, { text: "June 15, 2024" }, { text: "With love" }],
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

    await page.goto(`/editor?map_id=${id}&source=map-hub&mode=quick`, { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);

    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30000 });

    const storedMapId = await page.evaluate(() => localStorage.getItem("star-map-checkout-id"));
    expect(storedMapId).toBe(id);

    const draftRaw = await page.evaluate(() => localStorage.getItem("star-map-draft"));
    expect(draftRaw).toContain("Paris, France");
    expect(draftRaw).toContain("Our Paris Night");
  });
});
