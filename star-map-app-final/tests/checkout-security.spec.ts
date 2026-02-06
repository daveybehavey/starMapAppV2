import { test, expect } from "@playwright/test";
import { primeLocalStorage } from "./test-helpers";

test.describe("Checkout Security", () => {
  test("no premium access after clicking checkout but not completing payment", async ({ page }) => {
    test.setTimeout(90000);
    console.log("\n" + "=".repeat(60));
    console.log("TEST: Verify no premium access without completing payment");
    console.log("=".repeat(60));

    // Clear all cookies first
    await page.context().clearCookies();
    await primeLocalStorage(page);

    console.log("→ Going to homepage...");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /custom star map/i }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Check initial premium status
    console.log("→ Checking initial premium status...");
    const initialPremium = await page.evaluate(async () => {
      const res = await fetch("/api/premium");
      return res.json();
    });
    console.log(`  Initial premium status: ${JSON.stringify(initialPremium)}`);
    expect(initialPremium.paid).toBe(false);

    // Navigate to editor and try to open paywall
    console.log("→ Going to editor...");
    await page.goto("/editor?force=desktop", { waitUntil: "domcontentloaded" });
    await page.locator("#editor").waitFor({ state: "visible", timeout: 60000 });

    // Click "Try a sample moment" if visible
    const sampleBtn = page.locator("text=Try a sample moment").first();
    if (await sampleBtn.isVisible({ timeout: 5000 })) {
      await sampleBtn.click();
      await page.waitForTimeout(3000);
    }

    // Look for HD export button and click it
    console.log("→ Looking for HD export button...");
    const hdBtn = page.getByRole("button", { name: /unlock hd|hd/i }).first();
    if (await hdBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("→ Clicking HD export to open paywall...");
      await hdBtn.click();
      await page.waitForTimeout(2000);
      console.log("  ✓ HD button click path executed");
    } else {
      console.log("  ! HD button not visible in this run; continuing core entitlement checks");
    }

    // Now simulate "going back" by navigating away and returning
    console.log("→ Navigating to homepage (simulating back)...");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /custom star map/i }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Check premium status again - should still be unpaid
    console.log("→ Checking premium status after 'navigation back'...");
    const afterPremium = await page.evaluate(async () => {
      const res = await fetch("/api/premium");
      return res.json();
    });
    console.log(`  Premium status after navigation: ${JSON.stringify(afterPremium)}`);
    expect(afterPremium.paid).toBe(false);

    // Try to access download page
    console.log("→ Trying to access download page...");
    await page.goto("/download", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "/tmp/checkout-security-test.png" });

    const downloadButton = page.locator("button").filter({ hasText: /Download/ }).first();
    const downloadEnabled = await downloadButton.isEnabled().catch(() => false);
    console.log(`  Download button enabled: ${downloadEnabled}`);
    expect(downloadEnabled).toBe(false);
    console.log("✓ PASS: No premium access without completing payment");
  });

  test("premium cookie is only set after successful payment verification", async ({ page }) => {
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
    await page.goto("/editor?force=desktop", { waitUntil: "domcontentloaded" });
    await page.locator("#editor").waitFor({ state: "visible", timeout: 60000 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: /start customizing your star map|make it yours/i }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Check cookies again - should still be none
    cookies = await page.context().cookies();
    premiumCookie = cookies.find((c) => c.name === "star_premium_session");
    console.log(`  Premium cookie after navigation: ${premiumCookie ? "EXISTS" : "none"}`);
    expect(premiumCookie).toBeUndefined();

    console.log("✓ PASS: Premium cookie not set without successful payment");
  });
});
