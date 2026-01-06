export type RenderModeId = "classic" | "cinematic" | "blueprint" | "luxe";

export type RenderModeConfig = {
  contrast: number;
  glow: number;
  starBrightness: number;
  warmth?: number;
  starSize?: number;
  vignette?: number;
};

export const renderModes: Record<RenderModeId, RenderModeConfig> = {
  classic: {
    contrast: 0.95,
    glow: 0.06,
    starBrightness: 0.95,
    starSize: 0.9,
  },
  cinematic: {
    contrast: 1.28,
    glow: 0.55,
    starBrightness: 1.35,
    starSize: 1.2,
    vignette: 0.12,
  },
  blueprint: {
    contrast: 1.02,
    glow: 0.02,
    starBrightness: 0.85,
    starSize: 0.85,
  },
  luxe: {
    contrast: 1.12,
    glow: 0.32,
    starBrightness: 1.15,
    warmth: 0.08,
    starSize: 1.05,
    vignette: 0.08,
  },
};
