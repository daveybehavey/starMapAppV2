import { getRenderPresetOptions, resolveRenderPreset, type RenderPresetId } from "@/lib/renderPresets";
import type { RenderOptions, StyleId } from "@/lib/store";

export type MapLookTier = "minimal" | "polished" | "custom";

export const mapLookTiers: {
  id: MapLookTier;
  label: string;
  description: string;
}[] = [
  {
    id: "minimal",
    label: "Minimal",
    description: "Flat background, clean stars, no frame clutter",
  },
  {
    id: "polished",
    label: "Polished",
    description: "Competitor-grade depth, glow, and framing",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Tune every control yourself",
  },
];

const TIER_TO_PRESET: Record<Exclude<MapLookTier, "custom">, RenderPresetId> = {
  minimal: "clean",
  polished: "signature",
};

export function applyMapLookTier(tier: MapLookTier, styleId: StyleId): Partial<RenderOptions> {
  if (tier === "custom") {
    return { mapLookTier: "custom" };
  }
  return {
    mapLookTier: tier,
    ...getRenderPresetOptions(TIER_TO_PRESET[tier], styleId),
  };
}

/** Infer tier from current render options (for legacy saves without mapLookTier). */
export function resolveMapLookTier(
  renderOptions: Partial<RenderOptions> | undefined,
  styleId: StyleId,
): MapLookTier {
  if (renderOptions?.mapLookTier) {
    return renderOptions.mapLookTier;
  }
  if (!renderOptions) return "polished";
  const preset = resolveRenderPreset(renderOptions as RenderOptions, styleId);
  if (preset === "clean") return "minimal";
  if (preset === "signature") return "polished";
  return "custom";
}

export function shouldUseFlatSkyBackground(
  renderOptions: Partial<RenderOptions> | undefined,
  styleId: StyleId,
): boolean {
  const tier = resolveMapLookTier(renderOptions, styleId);
  if (tier === "minimal") return true;
  if (renderOptions?.visualMode === "astronomical") return true;
  return styleId === "midnightMinimal" || styleId === "parchmentScroll";
}

export function shouldApplyPolishFinish(
  renderOptions: Partial<RenderOptions> | undefined,
  styleId: StyleId,
): boolean {
  const tier = resolveMapLookTier(renderOptions, styleId);
  if (tier === "minimal") return false;
  if (tier === "polished") return true;
  return renderOptions?.visualMode === "illustrated";
}
