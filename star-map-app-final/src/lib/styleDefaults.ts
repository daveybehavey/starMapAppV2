import type { RenderOptions, StyleId, TextBox } from "@/lib/store";

type StyleDefaults = {
  renderOptions?: Partial<RenderOptions>;
  text?: { fontFamily: TextBox["fontFamily"]; color: string };
};

const STYLE_DEFAULTS: Partial<Record<StyleId, StyleDefaults>> = {
  navyGold: {
    renderOptions: {
      visualMode: "illustrated",
      starIntensity: "bold",
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

export function applyStyleDefaults(styleId: StyleId, textBoxes: TextBox[]) {
  const defaults = STYLE_DEFAULTS[styleId];
  if (!defaults) {
    return { renderOptions: {}, textBoxes };
  }

  const nextTextBoxes = defaults.text
    ? textBoxes.map((box) => ({
        ...box,
        fontFamily: defaults.text?.fontFamily ?? box.fontFamily,
        color: defaults.text?.color ?? box.color,
      }))
    : textBoxes;

  return { renderOptions: defaults.renderOptions ?? {}, textBoxes: nextTextBoxes };
}
