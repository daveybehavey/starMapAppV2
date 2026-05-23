import { expect, test } from "@playwright/test";
import {
  applyMapLookTier,
  resolveMapLookTier,
  shouldApplyPolishFinish,
  shouldUseFlatSkyBackground,
} from "../src/lib/mapLookTiers";
import { getRenderPresetOptions } from "../src/lib/renderPresets";
import type { RenderOptions } from "../src/lib/store";

test.describe("map look tiers", () => {
  test("minimal tier maps to clean preset options", () => {
    const minimal = applyMapLookTier("minimal", "navyGold");
    const clean = getRenderPresetOptions("clean", "navyGold");
    expect(minimal.mapLookTier).toBe("minimal");
    expect(minimal.constellationLines).toBe(clean.constellationLines);
    expect(minimal.starGlow).toBe(clean.starGlow);
    expect(minimal.visualMode).toBe(clean.visualMode);
  });

  test("polished tier maps to signature preset options", () => {
    const polished = applyMapLookTier("polished", "navyGold");
    const signature = getRenderPresetOptions("signature", "navyGold");
    expect(polished.mapLookTier).toBe("polished");
    expect(polished.visualMode).toBe(signature.visualMode);
    expect(polished.starGlow).toBe(signature.starGlow);
  });

  test("resolveMapLookTier infers from legacy render options", () => {
    const clean = getRenderPresetOptions("clean", "midnightMinimal") as RenderOptions;
    expect(resolveMapLookTier(clean, "midnightMinimal")).toBe("minimal");

    const signature = getRenderPresetOptions("signature", "navyGold") as RenderOptions;
    expect(resolveMapLookTier(signature, "navyGold")).toBe("polished");
  });

  test("flat sky background applies for minimal tier", () => {
    expect(
      shouldUseFlatSkyBackground({ mapLookTier: "minimal", visualMode: "illustrated" }, "navyGold"),
    ).toBe(true);
    expect(
      shouldUseFlatSkyBackground({ mapLookTier: "polished", visualMode: "illustrated" }, "navyGold"),
    ).toBe(false);
  });

  test("polish finish applies for polished tier without paid flag", () => {
    expect(
      shouldApplyPolishFinish({ mapLookTier: "polished", visualMode: "enhanced" }, "navyGold"),
    ).toBe(true);
    expect(
      shouldApplyPolishFinish({ mapLookTier: "minimal", visualMode: "illustrated" }, "navyGold"),
    ).toBe(false);
  });
});
