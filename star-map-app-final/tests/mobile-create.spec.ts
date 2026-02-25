import { test, expect, devices } from "@playwright/test";
import { applySampleMoment, gotoEditor, mockGeocode } from "./test-helpers";

test.use({ ...devices["iPhone 12"], browserName: "chromium" });
test.setTimeout(60_000);

test("mobile create flow and reveal gating", async ({ page }) => {
  await mockGeocode(page);
  await gotoEditor(page, { force: "mobile" });

  await expect(page.getByText(/Design your sky in seconds/i)).toBeVisible();
  const editorSection = page.locator("#editor");
  await expect(editorSection.getByRole("button", { name: /Try a sample moment/i })).toBeVisible();

  await applySampleMoment(page);

  // Wait for canvas and export buttons to be visible
  await page.locator("#mobile-preview").scrollIntoViewIfNeeded();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel("Free export").first()).toBeVisible();
  await expect(page.getByLabel("HD export").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Share/i })).toBeVisible();
  const customizeButton = page.getByRole("button", { name: /Customize more/i });
  await expect(customizeButton).toBeVisible();
  await customizeButton.click();

  await expect(page.getByRole("button", { name: /Less options/i })).toBeVisible();
  await expect(page.getByText(/Text Styling/i)).toBeVisible();
});
