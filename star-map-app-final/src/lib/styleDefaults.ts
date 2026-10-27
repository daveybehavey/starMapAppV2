import type { RenderOptions, StyleId, TextBox } from "@/lib/store";
import { normalizeTextStyleBinding } from "@/lib/textStyleBinding";

type StyleDefaults = {
  renderOptions?: Partial<RenderOptions>;
  text?: { fontFamily: TextBox["fontFamily"]; color: string };
};

const STYLE_DEFAULTS: Partial<Record<StyleId, StyleDefaults>> = {
  navyGold: {
    renderOptions: {
      mapLookTier: "polished",
      visualMode: "enhanced",
      starIntensity: "normal",
      starGlow: true,
      constellationLines: "thin",
      constellationLabels: false,
      showGrid: false,
      showPlanets: true,
      premiumStars: "off",
      premiumPlanets: "off",
      planetEmphasis: "highlighted",
      showMoon: true,
      moonSize: "large",
      frameEnabled: true,
      backgroundColor: "",
      constellationColor: "",
      constellationLineScale: 1.1,
    },
    text: { fontFamily: "cinzel", color: "#d7b56c" },
  },
  vintageEngraving: {
    renderOptions: {
      visualMode: "enhanced",
      starIntensity: "normal",
      starGlow: false,
      constellationLines: "thin",
      constellationLabels: false,
      showGrid: false,
      showPlanets: true,
      premiumStars: "off",
      premiumPlanets: "off",
      planetEmphasis: "normal",
      showMoon: true,
      moonSize: "normal",
      frameEnabled: true,
      backgroundColor: "",
      constellationColor: "",
      constellationLineScale: 1,
    },
    text: { fontFamily: "ebGaramond", color: "#d6d0c4" },
  },
  midnightMinimal: {
    renderOptions: {
      mapLookTier: "minimal",
      visualMode: "enhanced",
      starIntensity: "bold",
      starGlow: false,
      constellationLines: "off",
      constellationLabels: false,
      showGrid: false,
      showPlanets: false,
      premiumStars: "off",
      premiumPlanets: "off",
      planetEmphasis: "normal",
      showMoon: false,
      moonSize: "normal",
      frameEnabled: false,
      backgroundColor: "",
      constellationColor: "",
      constellationLineScale: 1,
    },
    text: { fontFamily: "montserrat", color: "#e0e0e0" },
  },
  parchmentScroll: {
    renderOptions: {
      visualMode: "enhanced",
      starIntensity: "normal",
      starGlow: false,
      constellationLines: "thin",
      constellationLabels: false,
      showGrid: false,
      showPlanets: true,
      premiumStars: "off",
      premiumPlanets: "off",
      planetEmphasis: "normal",
      showMoon: false,
      moonSize: "normal",
      frameEnabled: true,
      backgroundColor: "#e9d3a5",
      constellationColor: "#5a3f25",
      constellationLineScale: 1.2,
    },
    text: { fontFamily: "libreBaskerville", color: "#3f2f1f" },
  },
};

/**
 * The template's designed text defaults as a fresh object. Falls back to
 * the legacy playfair/#0c1021 pair when a style carries no text defaults.
 */
export function getStyleTextDefaults(
  styleId: StyleId,
): { fontFamily: TextBox["fontFamily"]; color: string } {
  const text = STYLE_DEFAULTS[styleId]?.text;
  return text ? { ...text } : { fontFamily: "playfair", color: "#0c1021" };
}

export function applyStyleDefaults(styleId: StyleId, textBoxes: TextBox[]) {
  const defaults = STYLE_DEFAULTS[styleId];
  if (!defaults) {
    return { renderOptions: {}, textBoxes };
  }

  // Ownership-aware (#408): only automatic properties follow the template.
  // Explicit (user-/preset-authored) colour/font survive a style change,
  // and boxes with no binding resolve explicit — legacy designs are never
  // silently recoloured.
  const nextTextBoxes = defaults.text
    ? textBoxes.map((box) => {
        const binding = normalizeTextStyleBinding(box.textStyleBinding);
        return {
          ...box,
          fontFamily:
            binding.fontFamily === "automatic"
              ? (defaults.text?.fontFamily ?? box.fontFamily)
              : box.fontFamily,
          color: binding.color === "automatic" ? (defaults.text?.color ?? box.color) : box.color,
        };
      })
    : textBoxes;

  return { renderOptions: defaults.renderOptions ?? {}, textBoxes: nextTextBoxes };
}
