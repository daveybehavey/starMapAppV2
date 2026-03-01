import { test, expect } from "@playwright/test";

test.describe("Homepage with SimplifiedEditor", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
      localStorage.setItem("cookiesAccepted", "true");
      localStorage.setItem("analytics-consent", "true");
    });
  });

  test("should display sample preview in hero section", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/night sky exactly/i);

    // Take screenshot of initial homepage
    await page.screenshot({
      path: "tests/screenshots/homepage_1_initial.png",
      fullPage: false,
    });

    // Hero quick-start form is rendered on homepage.
    await expect(page.locator("#preview")).toBeVisible();
    await expect(page.locator("#hero-date")).toBeVisible();
    await expect(page.locator("#hero-location")).toBeVisible();
    await expect(page.getByRole("button", { name: /Preview your map/i })).toBeVisible();

    // Delivery and plan CTAs are visible and route into quick editor checkout flow.
    await expect(page.locator('a[href="/editor?mode=quick&source=home-delivery-digital"]')).toBeVisible();
    await expect(page.locator('a[href="/editor?mode=quick&source=home-delivery-print-unframed"]')).toBeVisible();
    await expect(page.locator('a[href="/editor?mode=quick&source=home-delivery-print-framed"]')).toBeVisible();
    await expect(page.locator('a[href="/editor?mode=quick&source=home-plan-single"]')).toBeVisible();
    await expect(page.locator('a[href="/editor?mode=quick&source=home-plan-pack3"]')).toBeVisible();
    await expect(page.locator('a[href="/editor?mode=quick&source=home-plan-subscription"]')).toBeVisible();

    console.log("✓ Homepage loads with quick-start hero and pricing CTAs");
  });

  test("should allow customization from homepage", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.locator("#hero-date").fill("2024-06-01");
    await page.locator("#hero-location").fill("Paris, France");
    await page.getByRole("button", { name: /Preview your map/i }).click();
    await page.waitForURL("**/editor**", { timeout: 20000 });
    await expect(page.locator("#editor")).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/mode=quick/);

    // Take screenshot after navigation to editor
    await page.screenshot({
      path: "tests/screenshots/homepage_2_customizing.png",
      fullPage: false,
    });

    // Take screenshot once editor is loaded
    await page.screenshot({
      path: "tests/screenshots/homepage_3_style_changed.png",
      fullPage: false,
    });

    console.log("✓ Homepage quick-start opens editor");
  });

  test("should show delivery and plan CTA links", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const singleLink = page.locator('a[href="/editor?mode=quick&source=home-plan-single"]');
    const packLink = page.locator('a[href="/editor?mode=quick&source=home-plan-pack3"]');
    const subscriptionLink = page.locator('a[href="/editor?mode=quick&source=home-plan-subscription"]');

    await expect(singleLink).toBeVisible();
    await expect(packLink).toBeVisible();
    await expect(subscriptionLink).toBeVisible();

    await expect(page.locator('a[href="/editor?mode=quick&source=home-delivery-print-framed"]')).toBeVisible();
    await expect(page.locator("#delivery-options")).toBeVisible();

    await expect(singleLink).toHaveText(/single hd/i);
    await expect(packLink).toHaveText(/3-pack/i);
    await expect(subscriptionLink).toHaveText(/unlimited/i);

    console.log("✓ Homepage delivery and plan links are visible and correctly targeted");
  });
});
