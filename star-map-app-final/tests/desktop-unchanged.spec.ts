import { test, expect } from "@playwright/test";
import { gotoEditor } from "./test-helpers";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

test("desktop layout unchanged", async ({ page }) => {
  await gotoEditor(page, { force: "desktop" });

  const editor = page.locator("section#editor");

  // Debug: Check data attributes
  const forceAttr = await editor.getAttribute("data-force");
  const isDesktopAttr = await editor.getAttribute("data-is-desktop");
  console.log(`Force attribute: ${forceAttr}, isDesktop attribute: ${isDesktopAttr}`);

  // Check if desktop component is present
  const desktopComponent = page.locator('[data-component="desktop"]');
  const desktopCount = await desktopComponent.count();
  console.log(`Desktop component count: ${desktopCount}`);

  // Verify mobile-specific text is NOT present
  await expect(page.getByText("Date & Details")).toHaveCount(0);

  const editorSection = page.locator("#editor");

  // Verify desktop layout elements ARE present.
  await expect(page.getByRole("heading", { name: /Preview/i }).first()).toBeVisible();
  await expect(editorSection.getByRole("button", { name: /Try a sample moment|Generate preview/i }).first()).toBeVisible();
  await expect(editorSection.getByText(/Date \+ place|Date & Location/i).first()).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});
