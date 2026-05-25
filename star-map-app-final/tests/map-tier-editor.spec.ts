import { expect, test } from "@playwright/test";
import {
  applyMapLookSnapshotState,
  applySampleMoment,
  gotoEditor,
  mockGeocode,
  waitForMapCanvasReady,
} from "./test-helpers";

async function openStylePanel(page: Parameters<typeof gotoEditor>[0]) {
  const customizeMore = page.getByRole("button", { name: /Customize more/i }).first();
  if (await customizeMore.isVisible().catch(() => false)) {
    await customizeMore.click();
  }

  const styleToggle = page.getByRole("button", { name: /Style/i }).first();
  await expect(styleToggle).toBeVisible({ timeout: 15_000 });
  if ((await styleToggle.getAttribute("aria-expanded")) === "false") {
    await styleToggle.click();
  }
}

test.describe("map look tier editor", () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await mockGeocode(page);
  });

  test("tier switcher is accessible and updates preview without layout jump", async ({ page }) => {
    await gotoEditor(page, { path: "/editor", force: "desktop" });
    await applyMapLookSnapshotState(page, "minimal", "navyGold");
    const preview = await waitForMapCanvasReady(page);
    await openStylePanel(page);

    const tierGroup = page.getByRole("radiogroup", { name: /Map look/i });
    await expect(tierGroup).toBeVisible({ timeout: 15_000 });

    const minimal = page.getByRole("radio", { name: /Minimal:/i });
    const polished = page.getByRole("radio", { name: /Polished:/i });
    await expect(minimal).toBeVisible();
    await expect(polished).toBeVisible();

    const boxBefore = await preview.boundingBox();
    expect(boxBefore?.height).toBeGreaterThan(200);

    await minimal.click();
    await waitForMapCanvasReady(page);
    await expect(minimal).toHaveAttribute("aria-checked", "true");

    const boxAfterMinimal = await preview.boundingBox();
    expect(Math.abs((boxAfterMinimal?.height ?? 0) - (boxBefore?.height ?? 0))).toBeLessThan(8);

    await polished.click();
    await waitForMapCanvasReady(page);
    await expect(polished).toHaveAttribute("aria-checked", "true");

    await minimal.click();
    await waitForMapCanvasReady(page);
    const screenshotMinimal = await preview.screenshot();
    await minimal.click();
    await waitForMapCanvasReady(page);
    const screenshotMinimalAgain = await preview.screenshot();
    expect(screenshotMinimal.byteLength).toBeGreaterThan(5000);
    expect(Math.abs(screenshotMinimal.byteLength - screenshotMinimalAgain.byteLength)).toBeLessThan(
      screenshotMinimal.byteLength * 0.05,
    );
  });

  test("reset typography button appears for preset tiers", async ({ page }) => {
    await gotoEditor(page, { path: "/editor", force: "desktop" });
    await applySampleMoment(page);
    await openStylePanel(page);

    await page.getByRole("radio", { name: /Polished:/i }).click();
    await expect(page.getByRole("button", { name: /Reset typography/i })).toBeVisible();
  });

  test("store-driven tier changes keep preview stable", async ({ page }) => {
    await gotoEditor(page, { path: "/editor", force: "desktop" });
    await applyMapLookSnapshotState(page, "minimal", "navyGold");
    const preview = await waitForMapCanvasReady(page);
    const minimalShot = await preview.screenshot();

    await applyMapLookSnapshotState(page, "polished", "navyGold");
    await waitForMapCanvasReady(page);
    const polishedShot = await preview.screenshot();

    expect(minimalShot.byteLength).toBeGreaterThan(5000);
    expect(polishedShot.byteLength).toBeGreaterThan(5000);
    expect(Math.abs(minimalShot.byteLength - polishedShot.byteLength)).toBeGreaterThan(1000);
  });
});
