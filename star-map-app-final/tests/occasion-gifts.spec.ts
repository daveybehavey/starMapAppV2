import { expect, test } from "@playwright/test";
import { PRINT_CATALOG } from "../src/lib/printCatalog";
import { formatPrice } from "../src/lib/pricing";

const gifts = [
  ["wedding-star-map", "A wedding star map for the day they said yes"],
  ["anniversary-star-map", "An anniversary star map of a night you share"],
  ["new-baby-star-map", "A new baby star map for their first chapter"],
] as const;

for (const width of [390, 1280]) {
  for (const [slug, heading] of gifts) {
    test(`${slug} renders and opens the editor at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(`/gifts/${slug}?christmas_now=2026-11-27`);
      expect(response?.status()).toBe(200);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://starmapco.com/gifts/${slug}`
      );
      await expect(main).not.toContainText(/instant|\b(?:reviews|ratings)\b/i);
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      if (today >= "2026-11-01" && today < "2026-11-27") {
        await expect(main.getByTestId("current-offer")).toHaveText(
          "XMAS15 is live now: 15% off prints. Enter your code at checkout. HD digital is excluded."
        );
      } else {
        await expect(main.getByTestId("current-offer")).toHaveCount(0);
      }
      for (const product of PRINT_CATALOG.filter((item) => item.id.startsWith("poster_"))) {
        const card = main.locator(`[data-print-variant="${product.id}"]`);
        await expect(card.getByRole("heading")).toHaveText(product.labelFallback);
        await expect(card).toContainText(formatPrice(product.priceFallbackCents, "USD"));
        await expect(card).toContainText(formatPrice(product.priceCadFallbackCents, "CAD"));
      }
      for (const row of ["Framed print · Canada Dec 3", "Framed print · US Dec 8", "Posters Dec 10"]) {
        await expect(main.getByRole("row", { name: row })).toBeVisible();
      }
      await expect(main).toContainText("Buffered estimates for standard shipping, not guarantees.");
      for (const image of await main.locator("img").all()) {
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
          .toBeGreaterThan(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const links = main.locator('a[href^="/editor"]');
      await expect(links).toHaveCount(5);
      await links.first().click();
      await expect(page).toHaveURL(new RegExp(`/editor\\?mode=quick&source=${slug}`));
      await expect(page.getByRole("main")).toBeVisible();
    });
  }
}

test("occasion gift routes appear exactly once in the sitemap", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const xml = await response.text();
  for (const [slug] of gifts) {
    expect(xml.split(`<loc>https://starmapco.com/gifts/${slug}</loc>`)).toHaveLength(2);
  }
});
