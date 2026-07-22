import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { primeLocalStorage } from "./test-helpers";

type PremiumRequestObservation = {
  method: string;
  pathname: string;
  responseStatus: number;
  responseBody: { paid: false };
};

async function attachCheckoutSecurityEvidence(
  page: Page,
  testInfo: TestInfo,
  premiumRequests: PremiumRequestObservation[],
) {
  const pageState = page.isClosed()
    ? { closed: true }
    : await page
        .evaluate(() => ({
          closed: false,
          url: window.location.href,
          title: document.title,
          headings: Array.from(document.querySelectorAll("h1, h2, h3")).map((heading) =>
            heading.textContent?.trim(),
          ),
          buttons: Array.from(document.querySelectorAll("button")).map((button) => ({
            text: button.textContent?.trim(),
            disabled: button.disabled,
          })),
        }))
        .catch((error: unknown) => ({
          closed: false,
          captureError: error instanceof Error ? error.message : String(error),
        }));
  const cookieNames = await page
    .context()
    .cookies()
    .then((cookies) => cookies.map((cookie) => cookie.name).sort())
    .catch(() => []);
  const evidence = {
    regressionProbeEnabled: process.env.PW_CHECKOUT_SECURITY_REGRESSION_PROBE === "true",
    premiumRequests,
    pageState,
    cookieNames,
  };

  console.log(`CHECKOUT_SECURITY_EVIDENCE ${JSON.stringify(evidence)}`);
  await testInfo.attach("checkout-security-state.json", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
}

test.describe("Checkout Security", () => {
  test("no premium access after clicking checkout but not completing payment", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const premiumRequests: PremiumRequestObservation[] = [];
    console.log("\n" + "=".repeat(60));
    console.log("TEST: Verify no premium access without completing payment");
    console.log("=".repeat(60));

    try {
      await page.context().clearCookies();
      await primeLocalStorage(page);
      await page.route("**/api/premium**", async (route) => {
        const requestUrl = new URL(route.request().url());
        const responseBody = { paid: false } as const;
        premiumRequests.push({
          method: route.request().method(),
          pathname: requestUrl.pathname,
          responseStatus: 200,
          responseBody,
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(responseBody),
        });
      });

      console.log("→ Going to editor...");
      await page.goto("/editor?force=desktop", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.locator("#editor").waitFor({ state: "visible", timeout: 120_000 });

      console.log("→ Looking for HD export button...");
      const hdBtn = page.getByRole("button", { name: /unlock hd|hd/i }).first();
      await expect(hdBtn).toBeVisible({ timeout: 15_000 });
      console.log("→ Clicking HD export to open paywall without choosing a plan...");
      await hdBtn.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });

      console.log("→ Trying to access download page...");
      const premiumRequestsBeforeDownload = premiumRequests.length;
      await page.goto("/download", { waitUntil: "domcontentloaded" });
      await expect.poll(() => premiumRequests.length).toBeGreaterThan(premiumRequestsBeforeDownload);

      // Authoritative readiness contract: the mocked unpaid entitlement resolves to the
      // stable locked state before the security assertion inspects available actions.
      await expect(page.getByRole("heading", { name: /^Confirm your access$/ })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("NOT VERIFIED", { exact: true })).toBeVisible();

      if (process.env.PW_CHECKOUT_SECURITY_REGRESSION_PROBE === "true") {
        await page.evaluate(() => {
          const unauthorizedDownload = document.createElement("button");
          unauthorizedDownload.type = "button";
          unauthorizedDownload.textContent = "Download HD file";
          unauthorizedDownload.dataset.checkoutSecurityRegressionProbe = "true";
          document.body.append(unauthorizedDownload);
        });
      }

      const actionableDownload = page
        .locator("button:not(:disabled), a[href]")
        .filter({ hasText: /^Download HD file/ });
      await expect(
        actionableDownload,
        "unpaid visitors must not receive an actionable HD download control",
      ).toHaveCount(0);

      const premiumCookie = (await page.context().cookies()).find((cookie) => cookie.name === "star_premium_session");
      expect(premiumCookie).toBeUndefined();
      console.log("✓ PASS: No premium access without completing payment");
    } finally {
      await attachCheckoutSecurityEvidence(page, testInfo, premiumRequests);
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
