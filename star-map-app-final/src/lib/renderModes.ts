export type RenderModeId = "classic" | "cinematic" | "blueprint" | "luxe";

export type RenderModeConfig = {
  contrast: number;
  glow: number;
  starBrightness: number;
};

export const renderModes: Record<RenderModeId, RenderModeConfig> = {
  classic: {
    contrast: 1,
    glow: 0.08,
    starBrightness: 1,
  },
  cinematic: {
    contrast: 1.25,
    glow: 0.5,
    starBrightness: 1.25,
  },
  blueprint: {
    contrast: 1.05,
    glow: 0.03,
    starBrightness: 0.9,
  },
  luxe: {
    contrast: 1.15,
    glow: 0.35,
    starBrightness: 1.1,
  },
};
