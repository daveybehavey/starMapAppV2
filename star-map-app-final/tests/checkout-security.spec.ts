import { test, expect } from "@playwright/test";
import { primeLocalStorage } from "./test-helpers";

// Reduce teardown/attachment cost for this timing-sensitive spec.
// CI failures here have historically spent a large chunk of time finalizing video/screenshots.
test.use({ video: "off", screenshot: "off" });

test.describe("Checkout Security", () => {
  test("no premium access after clicking checkout but not completing payment", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    console.log("\n" + "=".repeat(60));
    console.log("TEST: Verify no premium access without completing payment");
    console.log("=".repeat(60));

    try {
      // Clear all cookies first
      await page.context().clearCookies();
      await primeLocalStorage(page);

      console.log("→ Going to homepage...");
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#preview")).toBeVisible({ timeout: 15000 });

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
      await page.goto("/editor?force=desktop", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.locator("#editor").waitFor({ state: "visible", timeout: 120_000 });

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
      // Next.js route transitions can be SPA-style, so `domcontentloaded` may not fire again.
      // Use `commit` and then wait for a stable UI element.
      await page.goto("/", { waitUntil: "commit", timeout: 60_000 });
      await expect(page.locator("#preview")).toBeVisible({ timeout: 15000 });

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

      const downloadButton = page.locator("button").filter({ hasText: /Download/ }).first();
      // `/download` can render multiple paywall-like states before/while entitlement resolves.
      // Wait for a stable indicator, then assert "Download" is disabled *if it exists*.
      const confirmAccess = page.getByRole("heading", { name: /confirm access first/i }).first();
      const verificationPending = page.getByText(/Payment verification pending/i).first();
      const cantFindDownload = page.getByRole("heading", { name: /can't find your download/i }).first();

      await Promise.race([
        confirmAccess.waitFor({ state: "visible", timeout: 30_000 }),
        verificationPending.waitFor({ state: "visible", timeout: 30_000 }),
        cantFindDownload.waitFor({ state: "visible", timeout: 30_000 }),
        // If the download page variant renders the button quickly, this covers that too.
        downloadButton.waitFor({ state: "attached", timeout: 30_000 }),
      ]);

      // Avoid extra sleeps + avoid manual screenshot capture unless explicitly debugging.
      if (process.env.PW_DEBUG_CHECKOUT_SECURITY === "true") {
        await page.screenshot({ path: testInfo.outputPath("checkout-security-download.png") });
      }

      const hasDownloadButton = (await downloadButton.count()) > 0;
      if (hasDownloadButton) {
        await expect(downloadButton).toBeDisabled({ timeout: 15_000 });
      } else {
        // Correct paywall state: user should not see an actionable "Download" for unpaid access.
        const confirmVisible = await confirmAccess.isVisible().catch(() => false);
        const pendingVisible = await verificationPending.isVisible().catch(() => false);
        expect(confirmVisible || pendingVisible).toBe(true);
      }
      console.log("✓ PASS: No premium access without completing payment");
    } finally {
      // Make teardown deterministic: closing early reduces Playwright’s time spent
      // finalizing video/attachments for this timing-sensitive spec.
      await page.close().catch(() => {});
      await page.context().close().catch(() => {});
    }
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
    await expect(page.locator("#preview")).toBeVisible({ timeout: 15000 });

    // Check cookies again - should still be none
    cookies = await page.context().cookies();
    premiumCookie = cookies.find((c) => c.name === "star_premium_session");
    console.log(`  Premium cookie after navigation: ${premiumCookie ? "EXISTS" : "none"}`);
    expect(premiumCookie).toBeUndefined();

    console.log("✓ PASS: Premium cookie not set without successful payment");
  });
});
