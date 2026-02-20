import { expect, test } from "@playwright/test";
import { applySampleMoment, gotoEditor, waitForPreview } from "./test-helpers";

type StoreApi = {
  getState: () => {
    setRenderOptions: (options: {
      constellationLines?: "off" | "thin" | "thick";
      constellationLabels?: boolean;
      constellationColor?: string;
      starGlow?: boolean;
    }) => void;
  };
};

test.describe("Constellation RGB color regression", () => {
  test("preview still renders when constellationColor uses rgb()", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoEditor(page, { path: "/editor", force: "desktop" });
    await applySampleMoment(page);
    await waitForPreview(page);

    const previewCanvas = page.locator('[aria-label*="Star map preview"] canvas').first();
    await expect(previewCanvas).toBeVisible({ timeout: 10000 });
    const before = await previewCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));

    await page.evaluate(() => {
      const store = (window as typeof window & { __ZUSTAND_STORE__?: StoreApi }).__ZUSTAND_STORE__;
      if (!store) throw new Error("Missing __ZUSTAND_STORE__");

      store.getState().setRenderOptions({
        constellationLines: "thick",
        constellationLabels: true,
        constellationColor: "rgb(255, 80, 80)",
        starGlow: true,
      });
    });

    await page.waitForTimeout(600);
    const after = await previewCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
    expect(after).toMatch(/^data:image\/png;base64,/);
    expect(after.length).toBeGreaterThan(1000);
    expect(before.length).toBeGreaterThan(1000);
  });
});
