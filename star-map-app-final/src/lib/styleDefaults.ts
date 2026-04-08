import { getRenderPresetOptions } from "@/lib/renderPresets";
import type { RenderOptions, StyleId, TextBox } from "@/lib/store";
import type { AspectRatio, Shape } from "@/lib/types";

type StyleDefaults = {
  renderOptions?: Partial<RenderOptions>;
  text?: {
    fallback?: Partial<Pick<TextBox, "fontFamily" | "color">>;
    byId?: Partial<Record<string, Partial<Pick<TextBox, "fontFamily" | "color" | "size" | "position">>>>;
  };
};

const STYLE_DEFAULTS: Partial<Record<StyleId, StyleDefaults>> = {
  navyGold: {
    renderOptions: getRenderPresetOptions("signature", "navyGold"),
    text: {
      fallback: { color: "#d7b56c" },
      byId: {
        title: { fontFamily: "cinzel", color: "#d7b56c", size: 48, position: { x: 0.5, y: 0.12 } },
        subtitle: { fontFamily: "raleway", color: "#c8a662", size: 28, position: { x: 0.5, y: 0.18 } },
        dedication: { fontFamily: "script", color: "#b98a3d", size: 26, position: { x: 0.5, y: 0.9 } },
      },
    },
  },
  vintageEngraving: {
    renderOptions: getRenderPresetOptions("signature", "vintageEngraving"),
    text: {
      fallback: { color: "#d6d0c4" },
      byId: {
        title: { fontFamily: "ebGaramond", color: "#e4dbcd", size: 46, position: { x: 0.5, y: 0.125 } },
        subtitle: { fontFamily: "lora", color: "#c8bda9", size: 24, position: { x: 0.5, y: 0.19 } },
        dedication: { fontFamily: "crimsonText", color: "#b7ab97", size: 22, position: { x: 0.5, y: 0.89 } },
      },
    },
  },
  midnightMinimal: {
    renderOptions: getRenderPresetOptions("signature", "midnightMinimal"),
    text: {
      fallback: { color: "#d7e4ff" },
      byId: {
        title: { fontFamily: "bebasNeue", color: "#eef4ff", size: 54, position: { x: 0.5, y: 0.14 } },
        subtitle: { fontFamily: "montserrat", color: "#b6c7e6", size: 20, position: { x: 0.5, y: 0.2 } },
        dedication: { fontFamily: "crimsonText", color: "#94a8c7", size: 22, position: { x: 0.5, y: 0.89 } },
      },
    },
  },
  parchmentScroll: {
    renderOptions: getRenderPresetOptions("signature", "parchmentScroll"),
    text: {
      fallback: { color: "#5a4024" },
      byId: {
        title: { fontFamily: "libreBaskerville", color: "#5c4124", size: 44, position: { x: 0.5, y: 0.13 } },
        subtitle: { fontFamily: "cormorant", color: "#6e5435", size: 24, position: { x: 0.5, y: 0.19 } },
        dedication: { fontFamily: "parisienne", color: "#7b5c24", size: 28, position: { x: 0.5, y: 0.88 } },
      },
    },
  },
};

type ApplyStyleDefaultsOptions = {
  shape?: Shape;
  aspectRatio?: AspectRatio;
};

function getShapeYAdjustment(shape: Shape | undefined, boxId: string) {
  if (!shape || shape === "rectangle") return 0;
  if (shape === "circle") {
    if (boxId === "title") return 0.02;
    if (boxId === "subtitle") return 0.02;
    if (boxId === "dedication") return -0.025;
    return 0;
  }
  if (shape === "heart") {
    if (boxId === "title") return 0.03;
    if (boxId === "subtitle") return 0.03;
    if (boxId === "dedication") return -0.05;
    return 0;
  }
  if (shape === "diamond") {
    if (boxId === "title") return 0.045;
    if (boxId === "subtitle") return 0.035;
    if (boxId === "dedication") return -0.045;
    return 0;
  }
  if (shape === "star") {
    if (boxId === "title") return 0.04;
    if (boxId === "subtitle") return 0.03;
    if (boxId === "dedication") return -0.04;
    return 0;
  }
  return 0;
}

function getAspectAdjustments(aspectRatio: AspectRatio | undefined, boxId: string) {
  switch (aspectRatio) {
    case "2:3":
      return {
        sizeMultiplier: boxId === "title" ? 0.9 : boxId === "subtitle" ? 0.92 : 0.95,
        yDelta: boxId === "dedication" ? -0.04 : 0.025,
      };
    case "3:4":
      return {
        sizeMultiplier: boxId === "title" ? 0.94 : 0.96,
        yDelta: boxId === "dedication" ? -0.025 : 0.015,
      };
    case "4:5":
      return {
        sizeMultiplier: boxId === "title" ? 0.97 : 0.98,
        yDelta: boxId === "dedication" ? -0.015 : 0.01,
      };
    default:
      return { sizeMultiplier: 1, yDelta: 0 };
  }
}

export function applyStyleDefaults(styleId: StyleId, textBoxes: TextBox[], options: ApplyStyleDefaultsOptions = {}) {
  const defaults = STYLE_DEFAULTS[styleId];
  if (!defaults) {
    return { renderOptions: {}, textBoxes };
  }

  const nextTextBoxes = defaults.text
    ? textBoxes.map((box) => {
        const byId = defaults.text?.byId?.[box.id];
        const targetPosition = byId?.position ?? box.position;
        const { sizeMultiplier, yDelta } = getAspectAdjustments(options.aspectRatio, box.id);
        const shapeYDelta = getShapeYAdjustment(options.shape, box.id);
        return {
          ...box,
          fontFamily: byId?.fontFamily ?? defaults.text?.fallback?.fontFamily ?? box.fontFamily,
          color: byId?.color ?? defaults.text?.fallback?.color ?? box.color,
          size: byId?.size ? Math.round(byId.size * sizeMultiplier) : box.size,
          position: targetPosition
            ? {
                x: targetPosition.x,
                y: Math.min(0.92, Math.max(0.08, targetPosition.y + yDelta + shapeYDelta)),
              }
            : box.position,
        };
      })
    : textBoxes;

  return { renderOptions: defaults.renderOptions ?? {}, textBoxes: nextTextBoxes };
}
