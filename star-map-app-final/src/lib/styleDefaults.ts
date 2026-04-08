import { getRenderPresetOptions } from "@/lib/renderPresets";
import type { RenderOptions, StyleId, TextBox } from "@/lib/store";

type StyleDefaults = {
  renderOptions?: Partial<RenderOptions>;
  text?: { fontFamily: TextBox["fontFamily"]; color: string };
};

const STYLE_DEFAULTS: Partial<Record<StyleId, StyleDefaults>> = {
  navyGold: {
    renderOptions: getRenderPresetOptions("signature", "navyGold"),
    text: { fontFamily: "cinzel", color: "#d7b56c" },
  },
  vintageEngraving: {
    renderOptions: getRenderPresetOptions("signature", "vintageEngraving"),
    text: { fontFamily: "ebGaramond", color: "#d6d0c4" },
  },
  midnightMinimal: {
    renderOptions: getRenderPresetOptions("signature", "midnightMinimal"),
    text: { fontFamily: "montserrat", color: "#e0e0e0" },
  },
  parchmentScroll: {
    renderOptions: getRenderPresetOptions("signature", "parchmentScroll"),
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
