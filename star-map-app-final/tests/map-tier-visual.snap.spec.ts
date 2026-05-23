import { expect, test } from "@playwright/test";
import {
  applyMapLookSnapshotState,
  gotoEditor,
  mockGeocode,
  waitForMapCanvasReady,
} from "./test-helpers";

const tierStyleMatrix = [
  { tier: "minimal" as const, style: "navyGold" as const, name: "navyGold-minimal" },
  { tier: "polished" as const, style: "navyGold" as const, name: "navyGold-polished" },
  { tier: "minimal" as const, style: "midnightMinimal" as const, name: "midnightMinimal-minimal" },
];

test.describe.configure({ mode: "serial", timeout: 120_000 });
test.use({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});

test.describe("map look tier visual snapshots", () => {

  test.beforeEach(async ({ page }) => {
    await mockGeocode(page);
  });

  for (const combo of tierStyleMatrix) {
    test(`snapshot ${combo.name}`, async ({ page }) => {
      await gotoEditor(page, { path: "/editor", force: "desktop" });
      await applyMapLookSnapshotState(page, combo.tier, combo.style);
      const preview = await waitForMapCanvasReady(page);
      await expect(preview).toHaveScreenshot(`${combo.name}.png`, {
        maxDiffPixelRatio: 0.03,
        animations: "disabled",
      });
    });
  }
});
