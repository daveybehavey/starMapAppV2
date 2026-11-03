import { expect, test } from "@playwright/test";
import { PRINT_CATALOG } from "../src/lib/printCatalog";
import { formatPrice } from "../src/lib/pricing";

for (const width of [390, 1280]) {
  test(`Black Friday catalogue and campaign disclosures at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    // A public campaign-clock override must not advance the landing page's offer.
    await page.goto("/black-friday?christmas_now=2026-11-27");
    const main = page.getByRole("main");
    await expect(page.locator("[data-site-chrome-banner]")).toHaveCount(0);
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(main.getByTestId("upcoming-offer")).toHaveText(
      "BLACKFRIDAY25 (25%) activates Nov 27, 2026."
    );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (today >= "2026-11-01" && today < "2026-11-27") {
      await expect(main.getByTestId("current-offer")).toHaveText(
        "Available now: 15% off prints with code XMAS15."
      );
    } else {
      await expect(main.getByTestId("current-offer")).toHaveCount(0);
    }
    await expect(page.locator("body")).not.toContainText(/instant/i);
    await expect(main).toContainText("Free shipping on print orders over $89.");
    await expect(main.locator("[data-print-variant]")).toHaveCount(PRINT_CATALOG.length);
    for (const product of PRINT_CATALOG) {
      const card = main.locator(`[data-print-variant="${product.id}"]`);
      await expect(card.getByRole("heading")).toHaveText(product.labelFallback);
      await expect(card).toContainText(formatPrice(product.priceFallbackCents, "USD"));
      await expect(card).toContainText(formatPrice(product.priceCadFallbackCents, "CAD"));
      const href = await card.getByRole("link").getAttribute("href");
      expect(new URL(href!, "http://localhost").searchParams.get("print_variant")).toBe(product.id);
      await card.scrollIntoViewIfNeeded();
      await expect
        .poll(() => card.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
    }
    const table = main.getByRole("table");
    for (const [label, date] of [
      ["Framed print · Canada", "Dec 3"],
      ["Framed print · US", "Dec 8"],
      ["Posters", "Dec 10"],
    ]) {
      await expect(table.getByRole("row", { name: `${label} ${date}` })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/black-friday$/);
  });
}
