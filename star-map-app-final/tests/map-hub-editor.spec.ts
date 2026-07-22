import { test, expect } from "@playwright/test";
import { dismissOverlays, mockGeocode, primeLocalStorage } from "./test-helpers";

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

test.describe("Editor keyboard accessibility", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("operates the primary editor controls with visible keyboard focus", async ({ page }) => {
    test.setTimeout(90_000);

    await primeLocalStorage(page);
    await mockGeocode(page);
    await page.goto("/editor?force=desktop", { waitUntil: "domcontentloaded" });

    const editor = page.locator("#editor");
    const dateLocationToggle = editor.getByRole("button", { name: /Date & Location\s*Hide/i });
    const locationInput = editor.getByRole("combobox", {
      name: "Search city, landmark, or address",
      exact: true,
    });
    const exactLocationButton = editor.getByRole("button", { name: "Exact location", exact: true });
    const dateInput = editor.getByLabel("Date", { exact: true });
    const titleInput = editor.getByRole("textbox", { name: "Enter title...", exact: true });

    await expect(dateLocationToggle).toBeVisible({ timeout: 30_000 });
    await expect(locationInput).toBeVisible();
    await expect(dateInput).toBeVisible();
    await expect(titleInput).toBeVisible();

    const locationUnfocusedShadow = await locationInput.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    );

    let reachedDateLocation = false;
    for (let tabIndex = 0; tabIndex < 6; tabIndex += 1) {
      await page.keyboard.press("Tab");
      reachedDateLocation = await dateLocationToggle.evaluate(
        (element) => document.activeElement === element,
      );
      if (reachedDateLocation) break;
    }
    expect(reachedDateLocation).toBe(true);
    await expect(dateLocationToggle).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(locationInput).toBeFocused();
    const locationFocusedShadow = await locationInput.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    );
    expect(locationFocusedShadow).not.toBe(locationUnfocusedShadow);
    expect(locationFocusedShadow).not.toBe("none");

    await page.keyboard.type("Paris");
    await expect(editor.getByRole("option", { name: /Paris, France/i })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(locationInput).toHaveValue("Paris, France");

    await page.keyboard.press("Tab");
    await expect(exactLocationButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dateInput).toBeFocused();

    let reachedTitle = false;
    for (let tabIndex = 0; tabIndex < 10; tabIndex += 1) {
      await page.keyboard.press("Tab");
      reachedTitle = await titleInput.evaluate((element) => document.activeElement === element);
      if (reachedTitle) break;
    }
    expect(reachedTitle).toBe(true);
    await expect(titleInput).toBeFocused();

    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Keyboard Night Sky");

    const generatePreviewButton = editor
      .getByRole("button", {
        name: "Generate preview",
        exact: true,
      })
      .first();
    const generateUnfocusedShadow = await generatePreviewButton.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    );

    await page.keyboard.press("Tab");
    await expect(generatePreviewButton).toBeFocused();
    const generateFocusedShadow = await generatePreviewButton.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    );
    expect(generateFocusedShadow).not.toBe(generateUnfocusedShadow);
    expect(generateFocusedShadow).not.toBe("none");

    await page.keyboard.press("Enter");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  });
});
