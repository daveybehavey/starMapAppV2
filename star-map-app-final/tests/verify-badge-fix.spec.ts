import { test, expect } from "@playwright/test";

test.describe("Verification Badge Fix", () => {
  test("client treats creditsRemaining > 0 as paid even if API returns paid=false", async ({ page }) => {
    console.log("\n" + "=".repeat(60));
    console.log("TEST: Client-side defense for verification badge");
    console.log("=".repeat(60));

    // Intercept /api/premium and return paid=false but creditsRemaining=3
    // This simulates the bug scenario
    await page.route("**/api/premium", async (route) => {
      console.log("→ Intercepting /api/premium with mocked response");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          paid: false, // API says not paid (the bug)
          creditsRemaining: 3, // But has credits!
          plan: "pack3",
        }),
      });
    });

    // Also mock /api/entitlements/link to avoid errors
    await page.route("**/api/entitlements/link", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://example.com/test-link" }),
      });
    });

    console.log("→ Loading /download page...");
    await page.goto("/download", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "/tmp/badge-fix-test.png" });

    const content = await page.content();

    // The key assertion: with the fix, "NOT VERIFIED" should NOT appear
    // because the client-side code now checks creditsRemaining > 0
    const hasNotVerified = content.toUpperCase().includes("NOT VERIFIED");
    const hasCreditsDisplay = content.includes("3 HD download");

    console.log(`→ "NOT VERIFIED" present: ${hasNotVerified}`);
    console.log(`→ Credits displayed: ${hasCreditsDisplay}`);

    if (hasNotVerified) {
      console.log("✗ FAIL: 'NOT VERIFIED' still shows despite having credits!");
      console.log("  The client-side fix may not be working correctly.");
    } else {
      console.log("✓ PASS: 'NOT VERIFIED' does not appear when credits > 0");
    }

    // With the fix, even though API returned paid=false, the client should
    // derive paid=true from creditsRemaining > 0
    expect(hasNotVerified).toBe(false);
  });

  test("shows NOT VERIFIED when no credits and no session", async ({ page }) => {
    console.log("\n" + "=".repeat(60));
    console.log("TEST: Shows NOT VERIFIED when truly not paid");
    console.log("=".repeat(60));

    // Mock API to return no credits and not paid
    await page.route("**/api/premium", async (route) => {
      console.log("→ Intercepting /api/premium with no-credits response");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          paid: false,
          creditsRemaining: 0,
          plan: null,
        }),
      });
    });

    console.log("→ Loading /download page...");
    await page.goto("/download", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "/tmp/badge-fix-no-credits.png" });

    const content = await page.content();
    const hasNotVerified = content.toUpperCase().includes("NOT VERIFIED");

    console.log(`→ "NOT VERIFIED" present: ${hasNotVerified}`);

    // Should show NOT VERIFIED when truly no credits
    expect(hasNotVerified).toBe(true);
    console.log("✓ PASS: Correctly shows 'NOT VERIFIED' when no credits");
  });
});
