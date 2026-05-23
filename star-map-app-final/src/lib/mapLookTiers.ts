import { getRenderPresetOptions, resolveRenderPreset, type RenderPresetId } from "@/lib/renderPresets";
import type { RenderOptions, StyleId, TextBox } from "@/lib/store";

export type MapLookTier = "minimal" | "polished" | "custom";

/** Preview/PNG respect recipe mat; print always uses a filled mat. */
export type ExportMatPurpose = "preview" | "print";

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

type KnownTextBoxId = "title" | "subtitle" | "dedication";

/** Bundled title/subtitle/date typography per tier and style. */
const TIER_TYPOGRAPHY: Record<
  Exclude<MapLookTier, "custom">,
  Partial<Record<StyleId, Partial<Record<KnownTextBoxId, Partial<TextBox>>>>>
> = {
  minimal: {
    navyGold: {
      title: {
        fontFamily: "bebasNeue",
        size: 54,
        fontWeight: 400,
        position: { x: 0.5, y: 0.105 },
        textGlow: false,
        textShadow: false,
        color: "#e4dcc8",
      },
      subtitle: {
        fontFamily: "montserrat",
        size: 18,
        fontWeight: 500,
        position: { x: 0.5, y: 0.158 },
        textGlow: false,
        color: "#a89878",
      },
      dedication: {
        fontFamily: "montserrat",
        size: 15,
        fontWeight: 400,
        position: { x: 0.5, y: 0.915 },
        color: "#8a7a62",
      },
    },
    midnightMinimal: {
      title: {
        fontFamily: "montserrat",
        size: 42,
        fontWeight: 600,
        position: { x: 0.5, y: 0.1 },
        textGlow: false,
        color: "#eef2ff",
      },
      subtitle: {
        fontFamily: "raleway",
        size: 16,
        fontWeight: 400,
        position: { x: 0.5, y: 0.152 },
        color: "#9fb3d2",
      },
      dedication: {
        fontFamily: "raleway",
        size: 14,
        fontWeight: 400,
        position: { x: 0.5, y: 0.92 },
        color: "#7a8ea8",
      },
    },
    vintageEngraving: {
      title: {
        fontFamily: "ebGaramond",
        size: 44,
        fontWeight: 500,
        position: { x: 0.5, y: 0.105 },
        textGlow: false,
        color: "#e8e2d8",
      },
      subtitle: {
        fontFamily: "crimsonText",
        size: 18,
        fontWeight: 400,
        position: { x: 0.5, y: 0.158 },
        color: "#b8b0a4",
      },
      dedication: {
        fontFamily: "crimsonText",
        size: 15,
        fontWeight: 400,
        position: { x: 0.5, y: 0.915 },
        color: "#9a9288",
      },
    },
    parchmentScroll: {
      title: {
        fontFamily: "libreBaskerville",
        size: 40,
        fontWeight: 700,
        position: { x: 0.5, y: 0.1 },
        textGlow: false,
        color: "#3f2f1f",
      },
      subtitle: {
        fontFamily: "lora",
        size: 17,
        fontWeight: 400,
        position: { x: 0.5, y: 0.152 },
        color: "#5a4a38",
      },
      dedication: {
        fontFamily: "lora",
        size: 14,
        fontWeight: 400,
        position: { x: 0.5, y: 0.92 },
        color: "#6a5a48",
      },
    },
  },
  polished: {
    navyGold: {
      title: {
        fontFamily: "cinzel",
        size: 52,
        fontWeight: 600,
        position: { x: 0.5, y: 0.12 },
        textGlow: true,
        textShadow: false,
        color: "#d7b56c",
      },
      subtitle: {
        fontFamily: "cormorant",
        size: 30,
        fontWeight: 500,
        position: { x: 0.5, y: 0.185 },
        textGlow: false,
        color: "#c8a662",
      },
      dedication: {
        fontFamily: "script",
        size: 26,
        fontWeight: 400,
        position: { x: 0.5, y: 0.9 },
        color: "#b98a3d",
      },
    },
    midnightMinimal: {
      title: {
        fontFamily: "montserrat",
        size: 46,
        fontWeight: 600,
        position: { x: 0.5, y: 0.115 },
        textGlow: false,
        color: "#e0e0e0",
      },
      subtitle: {
        fontFamily: "raleway",
        size: 22,
        fontWeight: 400,
        position: { x: 0.5, y: 0.175 },
        color: "#9fb3d2",
      },
      dedication: {
        fontFamily: "script",
        size: 20,
        fontWeight: 400,
        position: { x: 0.5, y: 0.905 },
        color: "#7a8ea8",
      },
    },
    vintageEngraving: {
      title: {
        fontFamily: "ebGaramond",
        size: 48,
        fontWeight: 600,
        position: { x: 0.5, y: 0.12 },
        textGlow: false,
        color: "#d6d0c4",
      },
      subtitle: {
        fontFamily: "crimsonText",
        size: 26,
        fontWeight: 400,
        position: { x: 0.5, y: 0.185 },
        color: "#b8b0a4",
      },
      dedication: {
        fontFamily: "dancingScript",
        size: 24,
        fontWeight: 400,
        position: { x: 0.5, y: 0.9 },
        color: "#a89888",
      },
    },
    parchmentScroll: {
      title: {
        fontFamily: "libreBaskerville",
        size: 44,
        fontWeight: 700,
        position: { x: 0.5, y: 0.115 },
        textGlow: false,
        color: "#3f2f1f",
      },
      subtitle: {
        fontFamily: "lora",
        size: 24,
        fontWeight: 400,
        position: { x: 0.5, y: 0.178 },
        color: "#5a4a38",
      },
      dedication: {
        fontFamily: "parisienne",
        size: 22,
        fontWeight: 400,
        position: { x: 0.5, y: 0.905 },
        color: "#6a5a48",
      },
    },
  },
};

export type StarDensityTuning = {
  /** Multiplier on bright-star radius (mag ≤ 2.3). */
  brightSizeBoost: number;
  /** Multiplier on bright-star alpha. */
  brightAlphaBoost: number;
  /** Scale minimal-drop probabilities (lower = denser field). */
  minimalDropScale: number;
  /** Adjust faint-star visibility cutoff. */
  visibilityCutoffDelta: number;
};

export function getStarDensityTuning(tier: MapLookTier): StarDensityTuning {
  switch (tier) {
    case "minimal":
      return {
        brightSizeBoost: 1.14,
        brightAlphaBoost: 1.18,
        minimalDropScale: 0.5,
        visibilityCutoffDelta: -0.025,
      };
    case "polished":
      return {
        brightSizeBoost: 1.04,
        brightAlphaBoost: 1.06,
        minimalDropScale: 0.85,
        visibilityCutoffDelta: 0,
      };
    default:
      return {
        brightSizeBoost: 1,
        brightAlphaBoost: 1,
        minimalDropScale: 1,
        visibilityCutoffDelta: 0,
      };
  }
};

export function applyTierTypography(
  tier: MapLookTier,
  styleId: StyleId,
  textBoxes: TextBox[],
): TextBox[] {
  if (tier === "custom") return textBoxes;
  const preset = TIER_TYPOGRAPHY[tier]?.[styleId];
  if (!preset) return textBoxes;
  return textBoxes.map((box) => {
    const patch = preset[box.id as KnownTextBoxId];
    if (!patch) return box;
    return { ...box, ...patch };
  });
}

/**
 * Whether the outer mat renders transparent (minimal PNG) or filled.
 * Print exports always use a filled mat so fulfillment files have no alpha holes.
 */
export function resolveTransparentMat(
  purpose: ExportMatPurpose,
  renderOptions?: Partial<RenderOptions>,
): boolean {
  if (purpose === "print") return false;
  return renderOptions?.transparentBackground ?? false;
}

export function applyMapLookTier(tier: MapLookTier, styleId: StyleId): Partial<RenderOptions> {
  if (tier === "custom") {
    return { mapLookTier: "custom", transparentBackground: false };
  }
  const preset = getRenderPresetOptions(TIER_TO_PRESET[tier], styleId);
  const tierOverrides: Partial<RenderOptions> =
    tier === "minimal"
      ? {
          transparentBackground: true,
          frameEnabled: false,
          showTechnicalRing: false,
        }
      : {
          transparentBackground: false,
          showTechnicalRing: styleId === "navyGold" || styleId === "vintageEngraving",
        };
  return {
    mapLookTier: tier,
    ...preset,
    ...tierOverrides,
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

/** PNG preview/export may use transparent mat on minimal; print always ships with filled mat. */
export function shouldShowTechnicalRing(
  renderOptions: Partial<RenderOptions> | undefined,
  styleId: StyleId,
): boolean {
  if (renderOptions?.showTechnicalRing !== undefined) {
    return renderOptions.showTechnicalRing;
  }
  const tier = resolveMapLookTier(renderOptions, styleId);
  if (tier === "minimal") return false;
  if (tier === "polished") {
    return styleId === "navyGold" || styleId === "vintageEngraving";
  }
  return false;
}

/** Fixed seed for visual snapshot tests — Santorini wedding night. */
export const MAP_TIER_SNAPSHOT_FIXTURE = {
  dateTime: "2024-06-01T18:00:00.000Z",
  location: {
    name: "Santorini, Greece",
    latitude: 36.3932,
    longitude: 25.4615,
    timezone: "Europe/Athens",
  },
  aspectRatio: "square" as const,
  shape: "rectangle" as const,
  seed: "map-tier-snapshot-v1",
};

const SNAPSHOT_TEXT_BOXES: TextBox[] = [
  {
    id: "title",
    label: "Title",
    text: "The Night We Became One",
    fontFamily: "cinzel",
    color: "#d7b56c",
    size: 48,
    align: "center",
  },
  {
    id: "subtitle",
    label: "Subtitle",
    text: "Santorini, Greece",
    fontFamily: "raleway",
    color: "#c8a662",
    size: 28,
    align: "center",
  },
  {
    id: "dedication",
    label: "Dedication",
    text: "June 1, 2024",
    fontFamily: "script",
    color: "#b98a3d",
    size: 26,
    align: "center",
  },
];

export function buildMapLookSnapshotState(
  tier: Exclude<MapLookTier, "custom">,
  styleId: StyleId,
) {
  const tierOptions = applyMapLookTier(tier, styleId);
  return {
    ...MAP_TIER_SNAPSHOT_FIXTURE,
    selectedStyle: styleId,
    renderOptions: tierOptions,
    textBoxes: applyTierTypography(tier, styleId, SNAPSHOT_TEXT_BOXES),
    revealed: true,
    previewFidelity: "high" as const,
  };
}
