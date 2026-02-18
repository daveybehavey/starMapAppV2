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
    await gotoEditor(page, { path: "/editor", force: "desktop" });
    await applySampleMoment(page);
    await waitForPreview(page);

    const preview = page.getByLabel(/Star map preview/i).first();
    const before = await preview.screenshot();

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

    await page.waitForTimeout(800);

    const after = await preview.screenshot();
    expect(after.byteLength).toBeGreaterThan(5000);
    expect(after.equals(before)).toBeFalsy();
  });
});
