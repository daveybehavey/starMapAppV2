import { expect, test } from "@playwright/test";
import {
  applyMapLookTier,
  applyTierTypography,
  getStarDensityTuning,
  resolveMapLookTier,
  shouldApplyPolishFinish,
  shouldUseFlatSkyBackground,
} from "../src/lib/mapLookTiers";
import { getRenderPresetOptions } from "../src/lib/renderPresets";
import type { RenderOptions, TextBox } from "../src/lib/store";

const sampleTextBoxes: TextBox[] = [
  {
    id: "title",
    label: "Title",
    text: "Our Night Sky",
    fontFamily: "cinzel",
    color: "#d7b56c",
    size: 48,
    align: "center",
  },
  {
    id: "subtitle",
    label: "Subtitle",
    text: "Under the stars",
    fontFamily: "raleway",
    color: "#c8a662",
    size: 28,
    align: "center",
  },
];

test.describe("map look tiers", () => {
  test("minimal tier maps to clean preset options", () => {
    const minimal = applyMapLookTier("minimal", "navyGold");
    const clean = getRenderPresetOptions("clean", "navyGold");
    expect(minimal.mapLookTier).toBe("minimal");
    expect(minimal.constellationLines).toBe(clean.constellationLines);
    expect(minimal.starGlow).toBe(clean.starGlow);
    expect(minimal.visualMode).toBe(clean.visualMode);
  });

  test("minimal tier enables transparent mat and disables frame", () => {
    const minimal = applyMapLookTier("minimal", "navyGold");
    expect(minimal.transparentBackground).toBe(true);
    expect(minimal.frameEnabled).toBe(false);
    expect(minimal.showTechnicalRing).toBe(false);
  });

  test("polished tier maps to signature preset options", () => {
    const polished = applyMapLookTier("polished", "navyGold");
    const signature = getRenderPresetOptions("signature", "navyGold");
    expect(polished.mapLookTier).toBe("polished");
    expect(polished.visualMode).toBe(signature.visualMode);
    expect(polished.starGlow).toBe(signature.starGlow);
  });

  test("polished tier enables technical ring for navy gold", () => {
    const polished = applyMapLookTier("polished", "navyGold");
    expect(polished.transparentBackground).toBe(false);
    expect(polished.showTechnicalRing).toBe(true);
  });

  test("applyTierTypography adjusts title for minimal vs polished", () => {
    const minimal = applyTierTypography("minimal", "navyGold", sampleTextBoxes);
    const polished = applyTierTypography("polished", "navyGold", sampleTextBoxes);
    expect(minimal[0]?.fontFamily).toBe("bebasNeue");
    expect(polished[0]?.fontFamily).toBe("cinzel");
    expect(minimal[0]?.size).toBeGreaterThan(polished[0]?.size ?? 0);
    expect(polished[0]?.textGlow).toBe(true);
  });

  test("star density tuning differs by tier", () => {
    const minimal = getStarDensityTuning("minimal");
    const polished = getStarDensityTuning("polished");
    expect(minimal.minimalDropScale).toBeLessThan(polished.minimalDropScale);
    expect(minimal.brightSizeBoost).toBeGreaterThan(polished.brightSizeBoost);
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
