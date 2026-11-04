import { expect, test } from "@playwright/test";

for (const path of ["/", "/shop", "/star-map-gift", "/birthday", "/anniversary", "/wedding", "/star-map-poster", "/star-map-keepsake-card", "/products/star-map/framed-14x14/usd", "/black-friday"]) {
  test(`${path} exposes a main landmark and coherent headings`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/not on this map/i);
    const levels = await page.locator("h1,h2,h3,h4,h5,h6").evaluateAll((nodes) => nodes.map((node) => Number(node.tagName[1])));
    for (let index = 1; index < levels.length; index++) {
      expect(levels[index]).toBeLessThanOrEqual(levels[index - 1] + 1);
    }
    await expect(page.locator("img:not([alt])")).toHaveCount(0);
  });
}

test("location suggestions expose only mounted ARIA targets and support keyboard selection", async ({ page }) => {
  await page.route("**/api/geocode**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "Broken") {
      await route.fulfill({ status: 500, json: { error: "unavailable" } });
      return;
    }
    await route.fulfill({ json: query === "Nowhere" ? [] : [
      { id: 1, name: "Paris, France", latitude: 48.8566, longitude: 2.3522 },
      { id: 2, name: "Parish, NY", latitude: 43.4067, longitude: -76.1277 },
    ] });
  });
  await page.goto("/shop");
  const location = page.getByRole("combobox", { name: "Location", exact: true });
  await location.fill("Pa");
  await expect(location).toHaveAttribute("aria-expanded", "false");
  await expect(location).not.toHaveAttribute("aria-controls");
  await location.fill("Paris");
  await expect(page.getByRole("listbox", { name: "Location suggestions" })).toBeVisible();
  const listId = await location.getAttribute("aria-controls");
  expect(await page.locator(`[id=${JSON.stringify(listId)}]`).count()).toBe(1);
  await location.press("Escape");
  await expect(location).toHaveAttribute("aria-expanded", "false");
  await expect(location).not.toHaveAttribute("aria-controls");
  await location.blur();
  await location.focus();
  await expect(location).toHaveAttribute("aria-expanded", "true");
  await location.press("ArrowDown");
  const optionId = await location.getAttribute("aria-activedescendant");
  await expect(page.locator(`[id=${JSON.stringify(optionId)}]`)).toHaveRole("option");
  await location.press("Enter");
  await expect(location).toHaveValue("Paris, France");
  await expect(location).toHaveAttribute("aria-expanded", "false");
  await expect(location).not.toHaveAttribute("aria-activedescendant");
  await location.fill("Nowhere");
  await expect(page.getByRole("status").filter({ hasText: "No matches found" })).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(location).toHaveAttribute("aria-expanded", "false");
  await expect(location).not.toHaveAttribute("aria-controls");
  await location.fill("Broken");
  await expect(page.getByRole("status").filter({ hasText: /try|unavailable|failed/i })).toBeVisible();
  await expect(location).toHaveAttribute("aria-expanded", "false");
  await expect(location).not.toHaveAttribute("aria-controls");
});

test("Black Friday product links show a contrasting keyboard focus outline", async ({ page }) => {
  await page.goto("/black-friday");
  const link = page.getByRole("link", { name: /Customize Framed print/ });
  await link.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(link).toBeFocused();
  const outline = await link.evaluate((node) => {
    const style = getComputedStyle(node);
    return { width: style.outlineWidth, color: style.outlineColor, style: style.outlineStyle };
  });
  expect(outline.width).toBe("2px");
  expect(outline.style).not.toBe("none");
  expect(outline.color).toBe("rgb(12, 16, 33)");
});
