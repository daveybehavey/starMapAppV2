import type { RenderOptions, StyleId } from "@/lib/store";

export type RenderPresetId = "signature" | "clean";

type PresetOptions = {
  visualMode: RenderOptions["visualMode"];
  starIntensity: RenderOptions["starIntensity"];
  starGlow: RenderOptions["starGlow"];
  constellationLines: RenderOptions["constellationLines"];
  constellationLabels: RenderOptions["constellationLabels"];
  showGrid: RenderOptions["showGrid"];
  showPlanets: RenderOptions["showPlanets"];
  premiumStars: RenderOptions["premiumStars"];
  premiumPlanets: RenderOptions["premiumPlanets"];
  planetEmphasis: RenderOptions["planetEmphasis"];
  showMoon: RenderOptions["showMoon"];
  moonSize: RenderOptions["moonSize"];
  frameEnabled: RenderOptions["frameEnabled"];
  backgroundColor: string;
  constellationColor: string;
  constellationLineScale: number;
};

type RenderPreset = {
  id: RenderPresetId;
  label: string;
  description: string;
  optionsByStyle: Record<StyleId, PresetOptions>;
};

const PRESET_MATCH_KEYS = [
  "visualMode",
  "starIntensity",
  "starGlow",
  "constellationLines",
  "constellationLabels",
  "showGrid",
  "showPlanets",
  "premiumStars",
  "premiumPlanets",
  "showMoon",
  "planetEmphasis",
  "moonSize",
  "frameEnabled",
  "backgroundColor",
  "constellationColor",
  "constellationLineScale",
] as const;

const RENDER_PRESET_MAP: Record<RenderPresetId, RenderPreset> = {
  signature: {
    id: "signature",
    label: "Signature",
    description: "Cinematic depth with balanced detail",
    optionsByStyle: {
      navyGold: {
        visualMode: "illustrated",
        starIntensity: "bold",
        starGlow: true,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "off",
        premiumPlanets: "off",
        showMoon: true,
        planetEmphasis: "highlighted",
        moonSize: "large",
        frameEnabled: true,
        backgroundColor: "",
        constellationColor: "",
        constellationLineScale: 1.1,
      },
      vintageEngraving: {
        visualMode: "illustrated",
        starIntensity: "bold",
        starGlow: false,
        constellationLines: "thick",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "off",
        premiumPlanets: "off",
        showMoon: true,
        planetEmphasis: "highlighted",
        moonSize: "normal",
        frameEnabled: true,
        backgroundColor: "",
        constellationColor: "#d8cfbd",
        constellationLineScale: 1.15,
      },
      parchmentScroll: {
        visualMode: "illustrated",
        starIntensity: "bold",
        starGlow: false,
        constellationLines: "thick",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "off",
        premiumPlanets: "off",
        showMoon: false,
        planetEmphasis: "highlighted",
        moonSize: "normal",
        frameEnabled: true,
        constellationLineScale: 1.35,
        backgroundColor: "#ead8b3",
        constellationColor: "#5f4428",
      },
      midnightMinimal: {
        visualMode: "enhanced",
        starIntensity: "normal",
        starGlow: false,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "off",
        premiumPlanets: "off",
        showMoon: false,
        planetEmphasis: "highlighted",
        moonSize: "normal",
        frameEnabled: true,
        backgroundColor: "",
        constellationColor: "#9fb3d2",
        constellationLineScale: 0.9,
      },
    },
  },
  clean: {
    id: "clean",
    label: "Clean",
    description: "Minimal sky with no visual clutter",
    optionsByStyle: {
      navyGold: {
        visualMode: "enhanced",
        starIntensity: "normal",
        starGlow: false,
        constellationLines: "off",
        constellationLabels: false,
        showGrid: false,
        showPlanets: false,
        premiumStars: "off",
        premiumPlanets: "off",
        showMoon: false,
        planetEmphasis: "normal",
        moonSize: "normal",
        frameEnabled: true,
        backgroundColor: "#0a1330",
        constellationColor: "",
        constellationLineScale: 1,
      },
      vintageEngraving: {
        visualMode: "enhanced",
        starIntensity: "subtle",
        starGlow: false,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: false,
        showPlanets: false,
        premiumStars: "off",
        premiumPlanets: "off",
        showMoon: false,
        planetEmphasis: "normal",
        moonSize: "normal",
        frameEnabled: true,
        backgroundColor: "#151515",
        constellationColor: "#a49b8d",
        constellationLineScale: 0.85,
      },
      parchmentScroll: {
        visualMode: "enhanced",
        starIntensity: "subtle",
        starGlow: false,
        constellationLines: "off",
        constellationLabels: false,
        showGrid: false,
        showPlanets: false,
        premiumStars: "off",
        premiumPlanets: "off",
        showMoon: false,
        planetEmphasis: "normal",
        moonSize: "normal",
        frameEnabled: false,
        constellationLineScale: 0.9,
        backgroundColor: "#efe0bf",
        constellationColor: "#5a3f25",
      },
      midnightMinimal: {
        visualMode: "enhanced",
        starIntensity: "subtle",
        starGlow: false,
        constellationLines: "off",
        constellationLabels: false,
        showGrid: false,
        showPlanets: false,
        premiumStars: "off",
        premiumPlanets: "off",
        showMoon: false,
        planetEmphasis: "normal",
        moonSize: "normal",
        frameEnabled: false,
        backgroundColor: "#02040b",
        constellationColor: "",
        constellationLineScale: 1,
      },
    },
  },
};

export const renderPresets: Array<Pick<RenderPreset, "id" | "label" | "description">> = [
  {
    id: RENDER_PRESET_MAP.signature.id,
    label: RENDER_PRESET_MAP.signature.label,
    description: RENDER_PRESET_MAP.signature.description,
  },
  {
    id: RENDER_PRESET_MAP.clean.id,
    label: RENDER_PRESET_MAP.clean.label,
    description: RENDER_PRESET_MAP.clean.description,
  },
];

export function getRenderPresetOptions(id: RenderPresetId, styleId: StyleId): PresetOptions {
  return { ...RENDER_PRESET_MAP[id].optionsByStyle[styleId] };
}

export function resolveRenderPreset(renderOptions: RenderOptions, styleId: StyleId): RenderPresetId | null {
  for (const presetId of Object.keys(RENDER_PRESET_MAP) as RenderPresetId[]) {
    const preset = RENDER_PRESET_MAP[presetId];
    const options = preset.optionsByStyle[styleId];
    const matches = PRESET_MATCH_KEYS.every((key) => renderOptions[key] === options[key]);
    if (matches) return presetId;
  }
  return null;
}
