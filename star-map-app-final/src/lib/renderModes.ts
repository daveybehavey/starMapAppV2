export type RenderModeId = "classic" | "cinematic" | "blueprint" | "luxe";

export type RenderModeConfig = {
  contrast: number;
  glow: number;
  starBrightness: number;
};

export const renderModes: Record<RenderModeId, RenderModeConfig> = {
  classic: {
    contrast: 1,
    glow: 0.1,
    starBrightness: 1,
  },
  cinematic: {
    contrast: 1.2,
    glow: 0.35,
    starBrightness: 1.2,
  },
  blueprint: {
    contrast: 1.1,
    glow: 0.05,
    starBrightness: 0.9,
  },
  luxe: {
    contrast: 1.15,
    glow: 0.4,
    starBrightness: 1.1,
  },
};
