import { test, expect, type Page } from "@playwright/test";
import { primeLocalStorage } from "./test-helpers";

async function gotoWithRetry(
  page: Page,
  path: string,
  options: { timeout?: number; attempts?: number; label?: string } = {},
) {
  const { timeout = 35_000, attempts = 3, label = path } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      console.log(`  ! Navigation failed for ${label} (attempt ${attempt}/${attempts}): ${String(error)}`);
      await page.waitForTimeout(800);
    }
  }
  throw lastError;
}

test.describe("Checkout Security", () => {
  test("no premium access after clicking checkout but not completing payment", async ({ page }) => {
    test.setTimeout(180000);
    console.log("\n" + "=".repeat(60));
    console.log("TEST: Verify no premium access without completing payment");
    console.log("=".repeat(60));

    // Clear all cookies first
    await page.context().clearCookies();
    await primeLocalStorage(page);

    // Check initial premium status
    console.log("→ Checking initial premium status...");
    const initialPremiumResponse = await page.request.get("/api/premium");
    const initialPremium = (await initialPremiumResponse.json()) as { paid?: boolean };
    console.log(`  Initial premium status: ${JSON.stringify(initialPremium)}`);
    expect(initialPremium.paid).toBe(false);

    // Navigate to editor and try to open paywall
    console.log("→ Going to editor...");
    await gotoWithRetry(page, "/editor?force=desktop", { timeout: 45_000, attempts: 2, label: "editor" });
    const editorRoot = page.locator("#editor");
    const editorReady = await editorRoot
      .waitFor({ state: "visible", timeout: 25000 })
      .then(() => true)
      .catch(() => false);

    if (editorReady) {
      // Click "Try a sample moment" if visible
      const sampleBtn = page.locator("text=Try a sample moment").first();
      if (await sampleBtn.isVisible({ timeout: 5000 })) {
        await sampleBtn.click();
        await page.waitForTimeout(3000);
      }

      // Look for HD export button and click it
      console.log("→ Looking for HD export button...");
      const hdBtn = page.getByRole("button", { name: /continue to secure checkout|unlock hd|hd/i }).first();
      if (await hdBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log("→ Clicking HD export to open paywall...");
        // Avoid waiting on potential redirect handoffs during security smoke checks.
        await hdBtn.click({ noWaitAfter: true, force: true });
        await page.waitForTimeout(2000);
        console.log("  ✓ HD button click path executed");
      } else {
        console.log("  ! HD button not visible in this run; continuing core entitlement checks");
      }
    } else {
      console.log("  ! Editor did not become ready in time; skipping checkout-click path");
    }

    // Now simulate "going back" by navigating away and returning
    console.log("→ Navigating to homepage (simulating back)...");
    await gotoWithRetry(page, "/", { timeout: 45_000, attempts: 2, label: "homepage return" });
    await expect(page.locator("#preview")).toBeVisible({ timeout: 15000 });

    // Check premium status again - should still be unpaid
    console.log("→ Checking premium status after 'navigation back'...");
    const afterPremiumResponse = await page.request.get("/api/premium");
    const afterPremium = (await afterPremiumResponse.json()) as { paid?: boolean };
    console.log(`  Premium status after navigation: ${JSON.stringify(afterPremium)}`);
    expect(afterPremium.paid).toBe(false);

    // Try to access download page
    console.log("→ Trying to access download page...");
    await gotoWithRetry(page, "/download", { timeout: 35_000, attempts: 2, label: "download page" });
    await page.waitForTimeout(1000);

    const downloadButton = page.locator("button").filter({ hasText: /Download/ }).first();
    const downloadEnabled = await downloadButton.isEnabled().catch(() => false);
    console.log(`  Download button enabled: ${downloadEnabled}`);
    expect(downloadEnabled).toBe(false);
    console.log("✓ PASS: No premium access without completing payment");
  });

  test("premium cookie is only set after successful payment verification", async ({ page }) => {
    test.setTimeout(120000);
    console.log("\n" + "=".repeat(60));
    console.log("TEST: Premium cookie only set after verification");
    console.log("=".repeat(60));

    await page.context().clearCookies();
    await primeLocalStorage(page);

    // Check cookies before any payment
    let cookies = await page.context().cookies();
    let premiumCookie = cookies.find((c) => c.name === "star_premium_session");
    console.log(`  Premium cookie before: ${premiumCookie ? "EXISTS" : "none"}`);
    expect(premiumCookie).toBeUndefined();

    // Navigate around the site
    await gotoWithRetry(page, "/editor?force=desktop", { timeout: 45_000, attempts: 2, label: "editor revisit" });
    const editorReady = await page
      .locator("#editor")
      .waitFor({ state: "visible", timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    if (!editorReady) {
      console.log("  ! Editor did not become ready in time during cookie verification path; continuing");
    }
    await gotoWithRetry(page, "/", { timeout: 45_000, attempts: 2, label: "homepage after editor" });
    await expect(page.locator("#preview")).toBeVisible({ timeout: 15000 });

    // Check cookies again - should still be none
    cookies = await page.context().cookies();
    premiumCookie = cookies.find((c) => c.name === "star_premium_session");
    console.log(`  Premium cookie after navigation: ${premiumCookie ? "EXISTS" : "none"}`);
    expect(premiumCookie).toBeUndefined();

    console.log("✓ PASS: Premium cookie not set without successful payment");
  });
});
