import { Horizon, Observer } from "astronomy-engine";
import { computeVisibleStars, toUTCDateFromLocal, type VisibleSky } from "@/lib/astronomy";
import type { LocationState, RenderOptions, StyleId, TextBox } from "@/lib/store";
import { SHAPE_PATHS, SHAPE_CIRCLE_INSET_RATIO } from "@/lib/shapes";
import {
  resolveShapeClipTransform,
  resolveShapeLayoutVersion,
  resolveShapeMaskFootprint,
} from "@/lib/shapeLayout";
import type { AspectRatio, Shape } from "@/lib/types";
import { FONT_STACKS } from "@/lib/fonts";
import { adjustColor, parseHexColor, parseRgbColor, toRgba } from "@/lib/colorUtils";
import {
  resolveFrameInsetPx,
  resolveShapeTextAvailableWidth,
  resolveTextFitScale,
  type TextFitLayout,
} from "./textFit";
import { resolveShapeTextProfile } from "./shapeTextProfile";
import {
  resolveWatermarkPlacement,
  WATERMARK_OPACITY,
  WATERMARK_TEXT,
  type WatermarkMaskSampler,
  type WatermarkPlacement,
  type WatermarkTextMetrics,
} from "./watermarkPlacement";
export {
  resolveWatermarkPlacement,
  WATERMARK_OPACITY,
  WATERMARK_TEXT,
} from "./watermarkPlacement";
export type {
  WatermarkMaskSampler,
  WatermarkPlacement,
  WatermarkTextMetrics,
} from "./watermarkPlacement";
import {
  getStarDensityTuning,
  resolveMapLookTier,
  resolvePrintSafeInset,
  resolveTextFitFrameEnabled,
  resolveTransparentMat,
  shouldApplyPolishFinish,
  shouldUseFlatSkyBackground,
  type ExportMatPurpose,
  type MapLookTier,
} from "@/lib/mapLookTiers";

export type { AspectRatio, Shape } from "@/lib/types";
export { formatDateTimeForLocation } from "@/lib/dateTime";
import { aspectRatioToNumber } from "@/lib/aspectRatio";
export { aspectRatioToNumber, getExportDimensions } from "@/lib/aspectRatio";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TWO_PI = Math.PI * 2;
const BASE_CANVAS_WIDTH = 1200;
const DEFAULT_BORTLE = 4.5;
const FILM_GRAIN_SIZE_DIVISOR = 220;
const MILKY_WAY_BAND_WIDTH_FACTOR = 0.45;
const MILKY_WAY_BAND_LENGTH_FACTOR = 1.6;
const PROJECTION_RADIUS_FACTOR = 0.45;
const VALID_SHAPES = new Set<Shape>(["rectangle", "heart", "circle", "star", "diamond"]);
const STAR_INTENSITY_FACTORS = {
  subtle: { size: 0.7, alpha: 0.8 },
  normal: { size: 1, alpha: 1 },
  bold: { size: 1.3, alpha: 1.15 },
} as const;

export type MapRecipe = {
  version: number;
  seed: string;
  datetimeISO: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  textBoxes: TextBox[];
  selectedStyle: StyleId;
  shape: Shape;
  aspectRatio: AspectRatio;
  renderOptions?: Partial<RenderOptions>;
};

const STYLE_THEME: Record<
  StyleId,
  {
    background: string;
    vignette: string;
    accent: string;
    star: string;
    glow: string;
  }
> = {
  navyGold: {
    background: "#070b1b",
    vignette: "rgba(3, 6, 16, 0.75)",
    accent: "#d7b56c",
    star: "#f7f0e2",
    glow: "rgba(215, 181, 108, 0.5)",
  },
  vintageEngraving: {
    background: "#1b1b1b",
    vignette: "rgba(0, 0, 0, 0.55)",
    accent: "#d6d0c4",
    star: "#f0ede8",
    glow: "rgba(214, 208, 196, 0.25)",
  },
  parchmentScroll: {
    background: "#e9d3a5",
    vignette: "rgba(0, 0, 0, 0)",
    accent: "#6b4b2a",
    star: "#3a2d1f",
    glow: "rgba(110, 88, 73, 0)",
  },
  midnightMinimal: {
    background: "#070a14",
    vignette: "rgba(2, 6, 18, 0.68)",
    accent: "#d7e4ff",
    star: "#f5f8ff",
    glow: "rgba(0, 0, 0, 0)",
  },
};

export const DEFAULT_RECIPE: MapRecipe = {
  version: 1,
  seed: "default",
  datetimeISO: new Date().toISOString(),
  location: { name: "", latitude: 0, longitude: 0, timezone: "UTC" },
  textBoxes: [],
  selectedStyle: "navyGold",
  shape: "rectangle",
  aspectRatio: "square",
  renderOptions: {
    showGrid: false,
    showPlanets: true,
    showMoon: true,
    shapeMask: "rectangle",
    frameEnabled: true,
    premiumStars: "off",
    premiumPlanets: "off",
  },
};

/** Scale sky + typography inward on print exports to keep content inside trim zone. */
function applyPrintSafeTransform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  inset: number,
) {
  const innerW = Math.max(1, width - inset * 2);
  const innerH = Math.max(1, height - inset * 2);
  ctx.translate(inset, inset);
  ctx.scale(innerW / width, innerH / height);
}

type CanvasLike = {
  width: number;
  height: number;
  style?: { width?: string; height?: string };
  getContext: (type: "2d") => CanvasRenderingContext2D | null;
};

type RenderQuality = "preview" | "og" | "export";

type ModeSettings = {
  glowBlur: number;
  lineWidthFactor: number;
  planetSizeFactor: number;
  vignetteStrength: number;
  vignetteOverlay: number;
  lineAlpha: number;
  starSizeFactor: number;
  starAlpha: number;
  planetAlpha: number;
  moonSizeFactor: number;
  palette?: Partial<{
    background: string;
    accent: string;
    star: string;
    glow: string;
  }>;
};

type MinimalDropChances = {
  faint: number;
  mid: number;
  bright: number;
};

type StyleRenderProfile = {
  useFixedStarColor: boolean;
  allowGlow: boolean;
  starAlphaFloor: number;
  starSizeBoost: number;
  starVisibilityCutoff: number;
  starAlphaBoost: number;
  lineStrokeBoost: number;
  lineAlphaMultiplier: number;
  lineAlphaClamp: { min: number; max: number } | null;
  lineDashed: boolean;
  showMilkyWayBand: boolean;
  planetFlatColor: boolean;
  starJitterMin: number;
  starJitterRange: number;
  minimalDrop: MinimalDropChances | null;
};

type QualityVisualTuning = {
  lineAlphaMultiplier: number;
  haloRadiusMultiplier: number;
  haloAlphaMultiplier: number;
  sparkleEnabled: boolean;
  sparkleBrightnessCutoff: number;
  sparkleAlphaMultiplier: number;
};

const QUALITY_VISUAL_TUNING: Record<RenderQuality, QualityVisualTuning> = {
  preview: {
    lineAlphaMultiplier: 1.06,
    haloRadiusMultiplier: 1.08,
    haloAlphaMultiplier: 1.08,
    sparkleEnabled: true,
    sparkleBrightnessCutoff: 0.85,
    sparkleAlphaMultiplier: 0.38,
  },
  og: {
    lineAlphaMultiplier: 1.04,
    haloRadiusMultiplier: 1.05,
    haloAlphaMultiplier: 1.06,
    sparkleEnabled: true,
    sparkleBrightnessCutoff: 0.72,
    sparkleAlphaMultiplier: 0.32,
  },
  export: {
    lineAlphaMultiplier: 1,
    haloRadiusMultiplier: 1,
    haloAlphaMultiplier: 1,
    sparkleEnabled: false,
    sparkleBrightnessCutoff: -1,
    sparkleAlphaMultiplier: 0,
  },
};

const STYLE_RENDER_PROFILES: Record<StyleId, StyleRenderProfile> = {
  navyGold: {
    useFixedStarColor: false,
    allowGlow: true,
    starAlphaFloor: 0.018,
    starSizeBoost: 0.98,
    starVisibilityCutoff: 0,
    starAlphaBoost: 1,
    lineStrokeBoost: 1,
    lineAlphaMultiplier: 0.92,
    lineAlphaClamp: null,
    lineDashed: false,
    showMilkyWayBand: true,
    planetFlatColor: false,
    starJitterMin: 0.94,
    starJitterRange: 0.14,
    minimalDrop: null,
  },
  vintageEngraving: {
    useFixedStarColor: true,
    allowGlow: false,
    starAlphaFloor: 0.05,
    starSizeBoost: 0.88,
    starVisibilityCutoff: 0,
    starAlphaBoost: 0.9,
    lineStrokeBoost: 1.12,
    lineAlphaMultiplier: 1.15,
    lineAlphaClamp: null,
    lineDashed: true,
    showMilkyWayBand: false,
    planetFlatColor: true,
    starJitterMin: 0.97,
    starJitterRange: 0.05,
    minimalDrop: null,
  },
  parchmentScroll: {
    useFixedStarColor: true,
    allowGlow: false,
    starAlphaFloor: 0.075,
    starSizeBoost: 1.12,
    starVisibilityCutoff: 0,
    starAlphaBoost: 1,
    lineStrokeBoost: 1.2,
    lineAlphaMultiplier: 1.35,
    lineAlphaClamp: { min: 0.45, max: 0.8 },
    lineDashed: true,
    showMilkyWayBand: false,
    planetFlatColor: true,
    starJitterMin: 0.92,
    starJitterRange: 0.18,
    minimalDrop: null,
  },
  midnightMinimal: {
    useFixedStarColor: true,
    allowGlow: false,
    starAlphaFloor: 0.015,
    starSizeBoost: 1.08,
    starVisibilityCutoff: 0.09,
    starAlphaBoost: 1.16,
    lineStrokeBoost: 1,
    lineAlphaMultiplier: 1,
    lineAlphaClamp: null,
    lineDashed: false,
    showMilkyWayBand: false,
    planetFlatColor: false,
    // Keep minimalist mode sparse but slightly less aggressive for better readability.
    starJitterMin: 0.94,
    starJitterRange: 0.14,
    minimalDrop: {
      faint: 0.64,
      mid: 0.42,
      bright: 0.2,
    },
  },
};

function getMinimalDropChance(magnitude: number, drop: MinimalDropChances | null) {
  if (!drop) return 0;
  if (magnitude > 4.6) return drop.faint;
  if (magnitude > 3.4) return drop.mid;
  if (magnitude > 2.3) return drop.bright;
  return 0;
}

function resolveStarIntensity(intensity: unknown): keyof typeof STAR_INTENSITY_FACTORS {
  if (intensity === "subtle" || intensity === "normal" || intensity === "bold") {
    return intensity;
  }
  return "normal";
}

function resolveVisualMode(mode?: string, styleId?: StyleId): ModeSettings {
  switch (mode) {
    case "astronomical":
      return {
        glowBlur: 0,
        lineWidthFactor: 0.7,
        planetSizeFactor: 0.9,
        vignetteStrength: 0.2,
        vignetteOverlay: 0,
        lineAlpha: 0.22,
        starSizeFactor: 0.95,
        starAlpha: 0.9,
        planetAlpha: 0.7,
        moonSizeFactor: 0.95,
        palette: {
          background: "#050915",
          accent: "#9eb6d1",
          star: "#f8fbff",
          glow: "rgba(158,182,209,0.15)",
        },
      };
    case "illustrated":
      return {
        glowBlur: 14,
        lineWidthFactor: 1.25,
        planetSizeFactor: 1.2,
        vignetteStrength: 1.1,
        vignetteOverlay: 0.18,
        lineAlpha: 0.45,
        starSizeFactor: 1.1,
        starAlpha: 1,
        planetAlpha: 0.95,
        moonSizeFactor: 1.05,
        palette: (() => {
          const themeStyle = styleId ? STYLE_THEME[styleId] : STYLE_THEME.navyGold;
          return {
            background: themeStyle.background,
            accent: themeStyle.accent,
            star: themeStyle.star,
            glow: themeStyle.glow,
          };
        })(),
      };
    case "enhanced":
    default:
      return {
        glowBlur: 8,
        lineWidthFactor: 1,
        planetSizeFactor: 1,
        vignetteStrength: 1,
        vignetteOverlay: 0.05,
        lineAlpha: 0.38,
        starSizeFactor: 1,
        starAlpha: 1,
        planetAlpha: 0.85,
        moonSizeFactor: 1,
      };
  }
}

export function renderStarMap({
  recipe,
  canvas,
  width,
  height,
  watermark,
  quality,
  premium = false,
  pixelRatio = 1,
  textBounds,
  skyOverride,
  skipSkyCompute = false,
  includeText = true,
  matPurpose = "preview",
}: {
  recipe: MapRecipe;
  canvas: CanvasLike;
  width: number;
  height: number;
  watermark: boolean;
  quality: RenderQuality;
  premium?: boolean;
  pixelRatio?: number;
  textBounds?: Map<string, { x: number; y: number; width: number; height: number }>;
  skyOverride?: VisibleSky | null;
  skipSkyCompute?: boolean;
  includeText?: boolean;
  /** Print forces filled mat; preview/PNG follow tier transparentBackground. */
  matPurpose?: ExportMatPurpose;
}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Validate shape - filter out invalid values like "none" or "ring"
  const rawShape = recipe.shape || recipe.renderOptions?.shapeMask;
  const shapeName: Shape =
    typeof rawShape === "string" && VALID_SHAPES.has(rawShape as Shape)
      ? (rawShape as Shape)
      : "rectangle";
  const targetHeight = height || Math.round(width / aspectRatioToNumber(recipe.aspectRatio));
  const sky = skyOverride ?? (skipSkyCompute ? null : computeSky(recipe, width, targetHeight));
  const mode = resolveVisualMode(recipe.renderOptions?.visualMode, recipe.selectedStyle);

  // Defensive check for invalid dimensions
  if (width <= 0 || targetHeight <= 0) {
    console.warn('Invalid canvas dimensions:', { width, targetHeight });
    return;
  }

  canvas.width = width * pixelRatio;
  canvas.height = targetHeight * pixelRatio;
  if (canvas.style) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${targetHeight}px`;
  }

  const baseWidth = BASE_CANVAS_WIDTH;
  const scale = width / baseWidth;
  // Support both renderOptions.backgroundColor and legacy top-level backgroundColor
  type RecipeWithLegacy = typeof recipe & { backgroundColor?: string };
  const legacyBg = (recipe as RecipeWithLegacy).backgroundColor;
  const backgroundColor =
    (recipe.renderOptions?.backgroundColor || "").trim() ||
    (typeof legacyBg === "string" ? legacyBg.trim() : "") ||
    "#0b0f24";
  const showFrame = recipe.renderOptions?.frameEnabled ?? true;
  const mapLookTier = resolveMapLookTier(recipe.renderOptions, recipe.selectedStyle);
  const transparentMat = resolveTransparentMat(matPurpose, recipe.renderOptions);
  const printSafeInset = resolvePrintSafeInset(matPurpose, width, targetHeight);
  // #406: the design's persisted shape-layout version (absent = the
  // legacy stretch every saved design was rendered with).
  const shapeLayoutVersion = resolveShapeLayoutVersion(
    recipe.renderOptions?.shapeLayoutVersion,
  );
  const clipPath = buildShapeClip(shapeName, width, targetHeight, shapeLayoutVersion);

  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);
  // Layer: frame background (transparent mat for minimal tier)
  ctx.clearRect(0, 0, width, targetHeight);
  if (!transparentMat) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, targetHeight);
  }

  // Layer: clipped sky
  ctx.save();
  if (clipPath) ctx.clip(clipPath, "nonzero");
  if (printSafeInset > 0) {
    applyPrintSafeTransform(ctx, width, targetHeight, printSafeInset);
  }
  drawBackground(
    ctx,
    width,
    targetHeight,
    recipe.selectedStyle,
    mode,
    scale,
    shapeName,
    showFrame && !transparentMat,
    recipe.renderOptions?.backgroundColor,
    recipe.renderOptions,
    matPurpose,
  );
  if (recipe.selectedStyle === "parchmentScroll") {
    drawPaperTexture(ctx, width, targetHeight, quality);
  }
  drawSky(
    ctx,
    width,
    targetHeight,
    recipe,
    recipe.selectedStyle,
    sky,
    recipe.renderOptions,
    mode,
    scale,
    premium,
    quality,
    mapLookTier,
  );
  const polishFinish = shouldApplyPolishFinish(recipe.renderOptions, recipe.selectedStyle);
  if (
    polishFinish &&
    recipe.selectedStyle !== "midnightMinimal" &&
    recipe.selectedStyle !== "parchmentScroll"
  ) {
    drawPremiumVignette(ctx, width, targetHeight, mode);
  }
  ctx.restore();

  // Shape outline using theme accent color (rectangle already has inset frame in drawBackground)
  if (clipPath && showFrame && !transparentMat && shapeName !== "rectangle") {
    const theme = STYLE_THEME[recipe.selectedStyle];
    const frameColor = mode?.palette?.accent ?? theme.accent;
    ctx.save();
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 3 * scale;
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.8;
    ctx.stroke(clipPath);
    ctx.restore();
  }

  // Overlays
  if (includeText) {
    ctx.save();
    if (printSafeInset > 0) {
      applyPrintSafeTransform(ctx, width, targetHeight, printSafeInset);
    }
    drawText(ctx, width, targetHeight, recipe.textBoxes, textBounds, scale, {
      shape: shapeName,
      frameEnabled: resolveTextFitFrameEnabled(matPurpose, recipe.renderOptions),
      matPurpose,
      // #406: the diamond fit evaluates against the same footprint
      // the clip was built from (null under the legacy layout).
      shapeMaskFootprint: resolveShapeMaskFootprint(width, targetHeight, shapeLayoutVersion),
      // #407: the heart/star fit evaluates against the shape's
      // interior profile (the renderer's own SHAPE_PATHS geometry).
      shapeTextProfile: resolveShapeTextProfile(shapeName),
    });
    ctx.restore();
  } else if (textBounds) {
    textBounds.clear();
  }
  drawWatermark(ctx, {
    width,
    height: targetHeight,
    show: watermark,
    clipPath,
    // #406: the mask sampler cache keys on maskKey + dimensions, so
    // the layout version rides the key — a legacy and a v2 design of
    // the same shape at the same size must never share a cached mask.
    maskKey: `${shapeName}|layout-${shapeLayoutVersion}`,
    pixelRatio,
  });
  const allowGrain =
    premium &&
    polishFinish &&
    quality !== "export" &&
    recipe.selectedStyle !== "midnightMinimal" &&
    recipe.selectedStyle !== "parchmentScroll";
  if (allowGrain) {
    drawFilmGrain(ctx, width, targetHeight, mode, quality);
  }
  ctx.restore();
}

export function renderStarMapTextLayer({
  canvas,
  width,
  height,
  textBoxes,
  pixelRatio = 1,
  textBounds,
  shape,
  frameEnabled,
  watermark = false,
  matPurpose = "preview",
  shapeLayoutVersion,
}: {
  canvas: CanvasLike;
  width: number;
  height: number;
  textBoxes: TextBox[];
  pixelRatio?: number;
  textBounds?: Map<string, { x: number; y: number; width: number; height: number }>;
  /** Editor text overlay: pass the live shape/frame so the overlay's fit
   * (and the drag bounds derived from it) matches the export render. */
  shape?: string;
  frameEnabled?: boolean;
  /** The overlay only ever renders the live editor preview, so its fit
   * uses the "preview" purpose (#409): at backing sizes above 1200px
   * its frame-aware bound must scale exactly like the base canvas
   * renderStarMap draws underneath it. */
  matPurpose?: ExportMatPurpose;
  /** #406: the design's shape-layout version, so the overlay's text
   * fit and watermark mask match the base canvas render underneath
   * (absent = legacy, as for every pre-#406 design). */
  shapeLayoutVersion?: unknown;
  /** #413: the overlay canvas stacks ABOVE the base canvas in the
   * editor, so the watermark is painted here — after the text — to keep
   * it on top of the final preview composition (SQ-55 composition
   * order). PreviewCanvas wires this to the same `!paid` fence the base
   * render used before; single-canvas renders (exports, share) keep
   * drawing the mark inside renderStarMap. */
  watermark?: boolean;
}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (width <= 0 || height <= 0) {
    if (textBounds) textBounds.clear();
    return;
  }

  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.style) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);
  const scale = width / BASE_CANVAS_WIDTH;
  const resolvedShapeLayoutVersion = resolveShapeLayoutVersion(shapeLayoutVersion);
  drawText(ctx, width, height, textBoxes, textBounds, scale, {
    shape,
    frameEnabled,
    matPurpose,
    shapeMaskFootprint: resolveShapeMaskFootprint(width, height, resolvedShapeLayoutVersion),
    // #407: same interior profile the base render fits against.
    shapeTextProfile: resolveShapeTextProfile(shape),
  });
  if (watermark) {
    const shapeName: Shape =
      typeof shape === "string" && VALID_SHAPES.has(shape as Shape)
        ? (shape as Shape)
        : "rectangle";
    drawWatermark(ctx, {
      width,
      height,
      show: true,
      clipPath: buildShapeClip(shapeName, width, height, resolvedShapeLayoutVersion),
      // Same cache-key rule as the base render: version in the key.
      maskKey: `${shapeName}|layout-${resolvedShapeLayoutVersion}`,
      pixelRatio,
    });
  }
  ctx.restore();
}

import { LRUCache } from "./lruCache";

// Cache for sky computation - keyed by date/location/dimensions hash
const skyCache = new LRUCache<string, VisibleSky>(10);

// Cache for text metrics - avoids expensive measureText calls
const textMetricsCache = new LRUCache<string, number>(100);

function getCachedTextWidth(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  const key = `${text}|${font}`;
  const cached = textMetricsCache.get(key);
  if (cached !== undefined) return cached;
  ctx.font = font;
  const width = ctx.measureText(text).width;
  textMetricsCache.set(key, width);
  return width;
}

function createSkyCacheKey(recipe: MapRecipe, width: number, height: number): string {
  return `${recipe.datetimeISO}|${recipe.location.latitude}|${recipe.location.longitude}|${recipe.location.timezone}|${width}|${height}|${recipe.renderOptions?.constellationLines !== "off"}`;
}

export function computeSky(recipe: MapRecipe, width: number, height: number): VisibleSky | null {
  const cacheKey = createSkyCacheKey(recipe, width, height);
  const cached = skyCache.get(cacheKey);
  if (cached) return cached;

  // E-1: render the stored instant exactly — never rebuild it from
  // wall-clock fields (see astronomy.computeVisibleStars).
  if (!Number.isFinite(new Date(recipe.datetimeISO).getTime())) return null;

  const sky = computeVisibleStars(
    {
      datetimeISO: recipe.datetimeISO,
      lat: recipe.location.latitude,
      lon: recipe.location.longitude,
      bortle: DEFAULT_BORTLE,
      showConstellations: recipe.renderOptions?.constellationLines !== "off",
    },
    width,
    height,
  );

  // Store in cache (LRU eviction handled automatically)
  skyCache.set(cacheKey, sky);
  return sky;
}

export function buildRecipeFromState(input: {
  dateTime: string;
  location: LocationState;
  textBoxes: TextBox[];
  selectedStyle: StyleId;
  aspectRatio?: AspectRatio;
  shape?: Shape;
  renderOptions?: MapRecipe["renderOptions"];
  seed?: string;
}): MapRecipe {
  return {
    version: 1,
    seed: input.seed || "default",
    datetimeISO: input.dateTime,
    location: input.location,
    textBoxes: input.textBoxes,
    selectedStyle: input.selectedStyle,
    shape:
      input.shape || (input.renderOptions?.shapeMask as Shape) || "rectangle",
    aspectRatio: input.aspectRatio || "square",
    renderOptions: {
      mapLookTier: input.renderOptions?.mapLookTier,
      visualMode: input.renderOptions?.visualMode ?? "illustrated",
      starIntensity: input.renderOptions?.starIntensity ?? "normal",
      starGlow: input.renderOptions?.starGlow ?? true,
      constellationLines: input.renderOptions?.constellationLines ?? "thin",
      constellationLabels: input.renderOptions?.constellationLabels ?? false,
      showGrid: input.renderOptions?.showGrid ?? false,
      showPlanets: input.renderOptions?.showPlanets ?? true,
      premiumStars: input.renderOptions?.premiumStars ?? "off",
      premiumPlanets: input.renderOptions?.premiumPlanets ?? "off",
      planetEmphasis: input.renderOptions?.planetEmphasis ?? "highlighted",
      showMoon: input.renderOptions?.showMoon ?? true,
      moonSize: input.renderOptions?.moonSize ?? "large",
      // shapeMask is the legacy name for the same value: it mirrors the
      // resolved shape field exactly, never a fixed default (fleet U14:
      // the mask stayed "circle" for every selected shape).
      shapeMask:
        input.shape || (input.renderOptions?.shapeMask as Shape) || "rectangle",
      // #406: the design's shape-layout version rides through verbatim
      // — including undefined. Defaulting it here would silently
      // convert every legacy design that passes through a rebuild
      // (download normalize, checkout, hydration fingerprints).
      shapeLayoutVersion: input.renderOptions?.shapeLayoutVersion,
      frameEnabled: input.renderOptions?.frameEnabled ?? true,
      backgroundColor: input.renderOptions?.backgroundColor ?? "",
      constellationColor: input.renderOptions?.constellationColor ?? "",
      constellationLineScale: input.renderOptions?.constellationLineScale ?? 1.1,
      transparentBackground: input.renderOptions?.transparentBackground ?? false,
      showTechnicalRing: input.renderOptions?.showTechnicalRing ?? false,
    },
  };
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  styleId: StyleId,
  mode: ModeSettings,
  scale: number,
  shape?: Shape,
  showFrame = true,
  backgroundOverride?: string,
  renderOptions?: MapRecipe["renderOptions"],
  matPurpose: ExportMatPurpose = "print",
) {
  const theme = STYLE_THEME[styleId];
  const resolvedBackground =
    (backgroundOverride ?? "").trim() ||
    mode.palette?.background ||
    theme.background;
  const palette = {
    background: resolvedBackground,
    vignette: theme.vignette,
    accent: mode.palette?.accent ?? theme.accent,
    star: mode.palette?.star ?? theme.star,
    glow: mode.palette?.glow ?? theme.glow,
  };

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  const flatSky = shouldUseFlatSkyBackground(renderOptions, styleId);
  const noGradient = flatSky;
  if (!noGradient) {
    const gradient = ctx.createRadialGradient(
      width * 0.6,
      height * 0.35,
      width * 0.05,
      width * 0.5,
      height * 0.45,
      Math.max(width, height),
    );
    gradient.addColorStop(0, "rgba(255,255,255,0.05)");
    gradient.addColorStop(1, palette.vignette);
    ctx.save();
    ctx.globalAlpha = Math.min(1.2, Math.max(0, mode.vignetteStrength));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    if (mode.vignetteOverlay > 0) {
      ctx.save();
      const overlay = ctx.createRadialGradient(width * 0.5, height * 0.45, width * 0.2, width * 0.5, height * 0.5, Math.max(width, height) * 0.8);
      overlay.addColorStop(0, "rgba(0,0,0,0)");
      overlay.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.globalAlpha = mode.vignetteOverlay;
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  if (styleId === "parchmentScroll") {
    ctx.save();
    const edge = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.35,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.85,
    );
    edge.addColorStop(0, "rgba(0,0,0,0)");
    edge.addColorStop(1, "rgba(92,64,36,0.18)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Rectangle border using theme accent color. The inset comes from
  // textFit.ts so the text fit-to-width bound (drawText) is derived from
  // the same purpose-aware calculation this stroke uses — one source of
  // truth (fleet U06; purpose threading #409: for a given width, height
  // and purpose, the stroked frame and the frame-aware fit bound use
  // the same inset).
  if (showFrame && (!shape || shape === "rectangle")) {
    const inset = resolveFrameInsetPx(width, height, matPurpose);
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 3 * scale;
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    ctx.globalAlpha = 1;
  }
}

type SkyPalette = {
  background: string;
  vignette: string;
  accent: string;
  star: string;
  glow: string;
};

function drawConstellationLayer(
  ctx: CanvasRenderingContext2D,
  sky: VisibleSky,
  renderOptions: MapRecipe["renderOptions"] | undefined,
  mode: ModeSettings | undefined,
  styleProfile: StyleRenderProfile,
  qualityTuning: QualityVisualTuning,
  palette: SkyPalette,
  lineFactor: number,
  scale: number,
  premium: boolean,
  styleId: StyleId,
  mapLookTier: MapLookTier,
) {
  if (renderOptions?.constellationLines === "off") return;

  const constellationColor =
    renderOptions?.constellationColor && renderOptions.constellationColor.trim().length > 0
      ? renderOptions.constellationColor
      : palette.accent;
  const lineScale = clamp(renderOptions?.constellationLineScale ?? 1, 0.6, 1.6);
  const lineWidth =
    renderOptions?.constellationLines === "thick"
      ? 1.2 * lineFactor
      : renderOptions?.constellationLines === "thin"
        ? 0.8 * lineFactor
        : 0.8 * lineFactor;
  const strokeWidth = lineWidth * lineScale * scale * styleProfile.lineStrokeBoost;
  const rawLineAlpha =
    (mode?.lineAlpha ?? 0.3) *
    styleProfile.lineAlphaMultiplier *
    qualityTuning.lineAlphaMultiplier;
  const lineAlpha = styleProfile.lineAlphaClamp
    ? clamp(rawLineAlpha, styleProfile.lineAlphaClamp.min, styleProfile.lineAlphaClamp.max)
    : rawLineAlpha;

  drawConstellations(
    ctx,
    sky,
    constellationColor,
    strokeWidth,
    renderOptions?.constellationLabels ?? false,
    lineAlpha,
    premium,
    styleProfile.lineDashed,
    scale,
    mapLookTier,
  );
}

function drawStarLayer(
  ctx: CanvasRenderingContext2D,
  sky: VisibleSky,
  renderOptions: MapRecipe["renderOptions"] | undefined,
  mode: ModeSettings | undefined,
  styleProfile: StyleRenderProfile,
  qualityTuning: QualityVisualTuning,
  palette: SkyPalette,
  premiumStars: boolean,
  premiumThreshold: number,
  scale: number,
  densityTuning: ReturnType<typeof getStarDensityTuning>,
) {
  const starIntensity = resolveStarIntensity(renderOptions?.starIntensity);
  const intensityFactor = STAR_INTENSITY_FACTORS[starIntensity].size;
  const intensityAlphaBoost = STAR_INTENSITY_FACTORS[starIntensity].alpha;
  const starGlowEnabled = renderOptions?.starGlow ?? true;
  const baseGlow = mode?.glowBlur ?? 8;
  const glow = (starGlowEnabled ? baseGlow + 4 : baseGlow) * scale;
  const glowMagnitudeCutoff = 3.2;

  ctx.save();
  ctx.fillStyle = palette.star;
  ctx.shadowColor = styleProfile.allowGlow ? palette.glow : "transparent";
  ctx.shadowBlur = styleProfile.allowGlow && starGlowEnabled ? glow : 0;

  for (let i = 0; i < sky.stars.length; i += 1) {
    const star = sky.stars[i];
    if (!Number.isFinite(star.x) || !Number.isFinite(star.y)) continue;
    const baseAlpha = brightnessFromMagnitude(star.magnitude);
    if (!Number.isFinite(baseAlpha)) continue;

    const alpha = clamp(
      baseAlpha *
        (star.opacity ?? 1) *
        (mode?.starAlpha ?? 1) *
        intensityAlphaBoost *
        styleProfile.starAlphaBoost *
        (star.magnitude <= 2.3 ? densityTuning.brightAlphaBoost : 1),
      styleProfile.starAlphaFloor,
      1,
    );
    if (!Number.isFinite(alpha)) continue;
    if (styleProfile.starVisibilityCutoff > 0 && alpha < styleProfile.starVisibilityCutoff + densityTuning.visibilityCutoffDelta) continue;

    const jitter = styleProfile.starJitterMin + randFromSeed((i + 1) * 17) * styleProfile.starJitterRange;
    const brightBoost = star.magnitude <= 2.3 ? densityTuning.brightSizeBoost : 1;
    const radius =
      starRadiusFromMagnitude(star.magnitude) *
      (mode?.starSizeFactor ?? 1) *
      intensityFactor *
      styleProfile.starSizeBoost *
      brightBoost *
      jitter *
      scale;
    if (!Number.isFinite(radius) || radius <= 0) continue;

    const dropChance =
      getMinimalDropChance(star.magnitude, styleProfile.minimalDrop) * densityTuning.minimalDropScale;
    if (dropChance > 0 && randFromSeed((i + 1) * 43.73) < dropChance) continue;

    if (premiumStars && star.magnitude <= premiumThreshold) {
      const premiumColor = typeof star.bv === "number" ? bvToRgb(star.bv) : getStarColor(i, star.magnitude);
      drawPremiumStar(ctx, star.x, star.y, radius, alpha, premiumColor, star.magnitude, i);
      continue;
    }

    const color = styleProfile.useFixedStarColor
      ? palette.star
      : (typeof star.bv === "number" ? bvToRgb(star.bv) : getStarColor(i, star.magnitude));

    if (styleProfile.allowGlow && starGlowEnabled && star.magnitude <= glowMagnitudeCutoff) {
      const isBright = star.magnitude <= 1.2;
      const isMidBrightness = star.magnitude <= 2.4;
      const haloRadius =
        radius *
        (isBright ? 3.2 : isMidBrightness ? 2.5 : 2.1) *
        qualityTuning.haloRadiusMultiplier;
      const haloCoreAlpha = isBright
        ? Math.min(0.72, alpha * 0.92 * qualityTuning.haloAlphaMultiplier)
        : isMidBrightness
          ? Math.min(0.58, alpha * 0.72 * qualityTuning.haloAlphaMultiplier)
          : Math.min(0.44, alpha * 0.58 * qualityTuning.haloAlphaMultiplier);
      const haloMidAlpha = isBright
        ? alpha * 0.36 * qualityTuning.haloAlphaMultiplier
        : isMidBrightness
          ? alpha * 0.28 * qualityTuning.haloAlphaMultiplier
          : alpha * 0.2 * qualityTuning.haloAlphaMultiplier;

      ctx.save();
      ctx.shadowBlur = 0;
      const halo = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, haloRadius);
      halo.addColorStop(0, toRgba(color, haloCoreAlpha));
      halo.addColorStop(0.45, toRgba(color, haloMidAlpha));
      halo.addColorStop(1, toRgba(color, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(star.x, star.y, haloRadius, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(star.x, star.y, radius, 0, TWO_PI);
    ctx.fill();

    if (
      qualityTuning.sparkleEnabled &&
      star.magnitude <= qualityTuning.sparkleBrightnessCutoff &&
      radius > 0.9 * scale
    ) {
      const sparkleAlpha = clamp(alpha * qualityTuning.sparkleAlphaMultiplier, 0.06, 0.38);
      drawStarSparkle(ctx, star.x, star.y, radius, sparkleAlpha, color);
    }
  }

  ctx.restore();
}

function drawPlanetaryLayer(
  ctx: CanvasRenderingContext2D,
  sky: VisibleSky,
  renderOptions: MapRecipe["renderOptions"] | undefined,
  mode: ModeSettings | undefined,
  styleProfile: StyleRenderProfile,
  palette: SkyPalette,
  premiumPlanets: boolean,
  themeGlowColor: string,
  scale: number,
) {
  ctx.save();
  ctx.shadowBlur = styleProfile.allowGlow ? 14 : 0;
  ctx.shadowColor = styleProfile.allowGlow ? themeGlowColor : "transparent";
  ctx.globalAlpha = 0.95;

  if (renderOptions?.showPlanets ?? true) {
    for (const planet of sky.planets) {
      if (!Number.isFinite(planet.x) || !Number.isFinite(planet.y)) continue;
      const sizeBase = renderOptions?.planetEmphasis === "highlighted" ? 4.2 : 3.2;
      const magnitudeSize = planetRadiusFromMagnitude(planet.magnitude, sizeBase);
      const size = magnitudeSize * (mode?.planetSizeFactor ?? 1) * scale;
      ctx.globalAlpha = (mode?.planetAlpha ?? 0.85) * (renderOptions?.planetEmphasis === "highlighted" ? 1 : 0.95);

      if (premiumPlanets && renderOptions?.premiumPlanets === "realistic") {
        drawPremiumPlanet(ctx, planet, size, palette);
        continue;
      }

      const planetColor = styleProfile.planetFlatColor ? palette.star : (PLANET_COLORS[planet.name] ?? palette.accent);
      if (!styleProfile.planetFlatColor) {
        ctx.save();
        const glowGradient = ctx.createRadialGradient(
          planet.x, planet.y, size * 0.5,
          planet.x, planet.y, size * 2.5
        );
        glowGradient.addColorStop(0, toRgba(planetColor, 0.25));
        glowGradient.addColorStop(0.6, toRgba(planetColor, 0.08));
        glowGradient.addColorStop(1, toRgba(planetColor, 0));
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, size * 2.5, 0, TWO_PI);
        ctx.fill();
        ctx.restore();

        const bodyGradient = ctx.createRadialGradient(
          planet.x - size * 0.3, planet.y - size * 0.3, size * 0.1,
          planet.x, planet.y, size
        );
        bodyGradient.addColorStop(0, adjustColor(planetColor, 0.15));
        bodyGradient.addColorStop(1, adjustColor(planetColor, -0.1));
        ctx.fillStyle = bodyGradient;
      } else {
        ctx.fillStyle = planetColor;
      }
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, size, 0, TWO_PI);
      ctx.fill();
    }
  }

  if ((renderOptions?.showMoon ?? true) && sky.moon && Number.isFinite(sky.moon.x) && Number.isFinite(sky.moon.y)) {
    const moonSizeMultiplier = renderOptions?.moonSize === "large" ? 1.4 : 1;
    drawMoon(
      ctx,
      sky.moon.x,
      sky.moon.y,
      palette.background,
      palette.star,
      palette.accent,
      sky.moon.phase,
      moonSizeMultiplier * (mode?.planetSizeFactor ?? 1) * (mode?.moonSizeFactor ?? 1) * scale,
    );
  }

  ctx.restore();
}

function drawSky(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  recipe: MapRecipe,
  styleId: StyleId,
  sky: VisibleSky | null,
  renderOptions?: MapRecipe["renderOptions"],
  mode?: ModeSettings,
  scale = 1,
  premium = false,
  quality: RenderQuality = "preview",
  mapLookTier: MapLookTier = "custom",
) {
  if (!sky) return;
  const theme = STYLE_THEME[styleId];
  const palette = {
    background: mode?.palette?.background ?? theme.background,
    vignette: theme.vignette,
    accent: mode?.palette?.accent ?? theme.accent,
    star: mode?.palette?.star ?? theme.star,
    glow: mode?.palette?.glow ?? theme.glow,
  };
  const lineFactor = mode?.lineWidthFactor ?? 1;
  const polishFinish = shouldApplyPolishFinish(renderOptions, styleId);
  const cinematicDetail = premium || polishFinish;
  const premiumStars = premium && (renderOptions?.premiumStars ?? "off") !== "off";
  const premiumPlanets = premium && (renderOptions?.premiumPlanets ?? "off") !== "off";
  const premiumThreshold = (renderOptions?.premiumStars ?? "off") === "realistic" ? 2.2 : 0.6;
  const styleProfile = STYLE_RENDER_PROFILES[styleId];
  const qualityTuning = QUALITY_VISUAL_TUNING[quality];
  drawConstellationLayer(
    ctx,
    sky,
    renderOptions,
    mode,
    styleProfile,
    qualityTuning,
    palette,
    lineFactor,
    scale,
    cinematicDetail,
    styleId,
    mapLookTier,
  );

  if (cinematicDetail && styleProfile.showMilkyWayBand) {
    const bandColor = resolveBandColor(palette.star);
    drawMilkyWayBand(ctx, width, height, recipe, bandColor, mode);
  }

  const densityTuning = getStarDensityTuning(mapLookTier);
  drawStarLayer(
    ctx,
    sky,
    renderOptions,
    mode,
    styleProfile,
    qualityTuning,
    palette,
    premiumStars,
    premiumThreshold,
    scale,
    densityTuning,
  );
  drawPlanetaryLayer(
    ctx,
    sky,
    renderOptions,
    mode,
    styleProfile,
    palette,
    premiumPlanets,
    theme.glow,
    scale,
  );

  if (renderOptions?.showTechnicalRing) {
    drawTechnicalRing(ctx, width, height, palette.accent, scale);
  }
}

function drawPremiumVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode?: ModeSettings,
) {
  const baseStrength = 0.14 + (mode?.vignetteStrength ?? 1) * 0.06;
  const strength = clamp(baseStrength, 0.1, 0.3);
  const gradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    Math.min(width, height) * 0.2,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.85,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.6, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawStarSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  color: string,
) {
  const primaryArm = radius * 2.2;
  const secondaryArm = radius * 1.45;

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = toRgba(color, 0.85);
  ctx.lineWidth = Math.max(0.2, radius * 0.18);
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(-primaryArm, 0);
  ctx.lineTo(primaryArm, 0);
  ctx.moveTo(0, -primaryArm);
  ctx.lineTo(0, primaryArm);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.6;
  ctx.lineWidth = Math.max(0.2, radius * 0.12);
  ctx.beginPath();
  ctx.moveTo(-secondaryArm, -secondaryArm);
  ctx.lineTo(secondaryArm, secondaryArm);
  ctx.moveTo(-secondaryArm, secondaryArm);
  ctx.lineTo(secondaryArm, -secondaryArm);
  ctx.stroke();
  ctx.restore();
}

function drawFilmGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: ModeSettings | undefined,
  quality: RenderQuality,
) {
  // Keep paid exports clean for print; grain remains a preview/OG-only effect.
  if (quality === "export") return;
  const strength = clamp(0.05 + (mode?.vignetteStrength ?? 1) * 0.015, 0.04, 0.09);
  const grainSize = Math.max(1, Math.round(Math.min(width, height) / FILM_GRAIN_SIZE_DIVISOR));
  const cols = Math.ceil(width / grainSize);
  const rows = Math.ceil(height / grainSize);
  ctx.save();
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const seed = (x + 1) * 73856093 ^ (y + 1) * 19349663;
      const v = Math.floor(randFromSeed(seed) * 255);
      ctx.fillStyle = `rgba(${v},${v},${v},${strength})`;
      ctx.fillRect(x * grainSize, y * grainSize, grainSize, grainSize);
    }
  }
  ctx.restore();
}

function drawPaperTexture(ctx: CanvasRenderingContext2D, width: number, height: number, quality: RenderQuality) {
  // Avoid large block artifacts on high-res exports by increasing paper texture detail.
  const divisor = quality === "export" ? 500 : 180;
  const grainSize = Math.max(1, Math.round(Math.min(width, height) / divisor));
  const alphaBase = quality === "export" ? 0.018 : 0.05;
  const alphaRange = quality === "export" ? 0.038 : 0.08;
  const cols = Math.ceil(width / grainSize);
  const rows = Math.ceil(height / grainSize);
  ctx.save();
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const seed = (x + 3) * 4099 ^ (y + 7) * 1319;
      const n = randFromSeed(seed);
      const alpha = alphaBase + n * alphaRange;
      ctx.fillStyle = `rgba(104, 76, 38, ${alpha})`;
      ctx.fillRect(x * grainSize, y * grainSize, grainSize, grainSize);
    }
  }
  ctx.restore();
}

function drawMilkyWayBand(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  recipe: MapRecipe,
  color: string,
  mode?: ModeSettings,
) {
  const bandAngle = computeGalacticBandAngle(recipe, width, height) ?? Math.PI * 0.18;
  const bandWidth = Math.min(width, height) * MILKY_WAY_BAND_WIDTH_FACTOR;
  const bandLength = Math.max(width, height) * MILKY_WAY_BAND_LENGTH_FACTOR;
  const baseStrength = 0.12 + (mode?.vignetteStrength ?? 1) * 0.05;
  const strength = clamp(baseStrength, 0.08, 0.22);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(bandAngle);
  const gradient = ctx.createLinearGradient(0, -bandWidth, 0, bandWidth);
  // Smoother gradient with more stops for natural Milky Way appearance
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.15, toRgba(color, strength * 0.08));
  gradient.addColorStop(0.25, toRgba(color, strength * 0.22));
  gradient.addColorStop(0.35, toRgba(color, strength * 0.55));
  gradient.addColorStop(0.45, toRgba(color, strength * 0.85));
  gradient.addColorStop(0.5, toRgba(color, strength));
  gradient.addColorStop(0.55, toRgba(color, strength * 0.85));
  gradient.addColorStop(0.65, toRgba(color, strength * 0.55));
  gradient.addColorStop(0.75, toRgba(color, strength * 0.22));
  gradient.addColorStop(0.85, toRgba(color, strength * 0.08));
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(-bandLength / 2, -bandWidth, bandLength, bandWidth * 2);
  ctx.restore();
}

function computeGalacticBandAngle(recipe: MapRecipe, width: number, height: number) {
  // E-1: same instant contract as computeSky — consume the stored instant.
  const date = new Date(recipe.datetimeISO);
  if (!Number.isFinite(date.getTime())) return null;
  const observer = new Observer(recipe.location.latitude, recipe.location.longitude, 0);

  const gc = projectRaDec(17.761, -28.94, date, observer, width, height);
  const ac = projectRaDec(5.761, 28.94, date, observer, width, height);
  if (!gc || !ac) return null;

  const dx = ac.x - gc.x;
  const dy = ac.y - gc.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return null;
  return Math.atan2(dy, dx);
}

function projectRaDec(
  raHours: number,
  decDegrees: number,
  date: Date,
  observer: Observer,
  width: number,
  height: number,
) {
  const hor = Horizon(date, observer, raHours, decDegrees);
  const r = (90 - hor.altitude) / 90;
  const angle = (hor.azimuth * Math.PI) / 180;
  const radius = Math.min(width, height) * PROJECTION_RADIUS_FACTOR;
  const x = width / 2 + r * Math.sin(angle) * radius;
  const y = height / 2 - r * Math.cos(angle) * radius;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function resolveBandColor(color: string) {
  const trimmed = color.trim();
  if (parseHexColor(trimmed) || parseRgbColor(trimmed)) return trimmed;
  // Fallback to neutral white if color format is unexpected
  return "#ffffff";
}

/** Keep text centers inside the canvas so exports match editor drag bounds. */
function resolveTextCenterNormalized(
  position: { x?: number; y?: number } | undefined,
  index: number,
  textWidth: number,
  textHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const scale = canvasWidth / BASE_CANVAS_WIDTH;
  const lineGapNorm = (28 * scale) / canvasHeight;
  const rawX = clamp(position?.x ?? 0.5, 0, 1);
  const rawY = clamp(position?.y ?? 0.72 + index * lineGapNorm, 0, 1);
  const halfWidth = textWidth / (canvasWidth * 2);
  const halfHeight = textHeight / (canvasHeight * 2);
  const minX = clamp(halfWidth, 0, 0.5);
  const maxX = clamp(1 - halfWidth, 0.5, 1);
  const minY = clamp(halfHeight, 0, 0.5);
  const maxY = clamp(1 - halfHeight, 0.5, 1);
  return {
    x: clamp(rawX, minX, maxX),
    y: clamp(rawY, minY, maxY),
  };
}

function drawText(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  textBoxes: TextBox[],
  bounds?: Map<string, { x: number; y: number; width: number; height: number }>,
  scale = 1,
  textLayout?: Pick<TextFitLayout, "shape" | "frameEnabled" | "matPurpose" | "shapeMaskFootprint" | "shapeTextProfile">,
) {
  if (bounds) bounds.clear();

  textBoxes.forEach((box, index) => {
    // Skip empty text boxes
    if (!box.text || box.text.trim() === "") return;

    const weight = box.fontWeight ?? 600;
    const baseFontSize = Math.max(10, (box.size ?? 28) * scale);
    const baseFont = `${weight} ${baseFontSize}px ${FONT_STACKS[box.fontFamily]}`;
    // Fit-to-width (P01): a line wider than the canvas shrinks to fit
    // instead of spilling symmetrically off both edges of the print. Lines
    // that already fit get a fit scale of exactly 1 and the identical font
    // string, so their rendering is unchanged.
    const measuredWidth = getCachedTextWidth(ctx, box.text, baseFont);
    // The canvas edge is not the bound: fitted lines must stay inside
    // the design's own boundary — the gold frame line on a framed
    // rectangle (fleet U06), the mask's width at the line's own row on a
    // diamond (fleet U14). The line's centre row is resolved with the
    // unfitted height first; resolveShapeTextAvailableWidth measures the
    // span with that same unfitted height, so the bound is conservative.
    const provisional = resolveTextCenterNormalized(
      box.position,
      index,
      measuredWidth,
      baseFontSize * 1.2,
      width,
      height,
    );
    const availableWidth = resolveShapeTextAvailableWidth({
      shape: textLayout?.shape,
      frameEnabled: textLayout?.frameEnabled ?? true,
      matPurpose: textLayout?.matPurpose,
      shapeMaskFootprint: textLayout?.shapeMaskFootprint,
      shapeTextProfile: textLayout?.shapeTextProfile,
      centerYNorm: provisional.y,
      lineHeightPx: baseFontSize * 1.2,
      width,
      height,
    });
    const fitScale = resolveTextFitScale(measuredWidth, availableWidth);
    const fontSize = baseFontSize * fitScale;
    const font =
      fitScale < 1 ? `${weight} ${fontSize}px ${FONT_STACKS[box.fontFamily]}` : baseFont;
    ctx.font = font;
    ctx.fillStyle = box.color;
    if (box.textGlow) {
      ctx.shadowColor = `${box.color}90`;
      ctx.shadowBlur = 12 * scale;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else if (box.textShadow) {
      ctx.shadowColor = `${box.color}80`;
      ctx.shadowBlur = 6 * scale;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
    ctx.textAlign = box.align;
    ctx.textBaseline = "middle";
    const textWidth = getCachedTextWidth(ctx, box.text, font);
    const textHeight = fontSize * 1.2;
    const { x: normX, y: normY } = resolveTextCenterNormalized(
      box.position,
      index,
      textWidth,
      textHeight,
      width,
      height,
    );
    const px = normX * width;
    const py = normY * height;
    ctx.fillText(box.text, px, py);

    if (bounds) {
      let left = px;
      if (ctx.textAlign === "center") left = px - textWidth / 2;
      if (ctx.textAlign === "right") left = px - textWidth;
      const top = py - textHeight / 2;
      bounds.set(box.id, { x: left, y: top, width: textWidth, height: textHeight });
    }
  });
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Watermark painting (#413, design SQ-55)
//
// The placement solver, treatment constants, and types live in
// ./watermarkPlacement (dependency-free, unit-testable). This section
// owns the canvas side: rasterizing the renderer's actual clip path
// into the solver's mask sampler, painting the two-tone wordmark into
// an isolated layer, and compositing it at WATERMARK_OPACITY once.
// ─────────────────────────────────────────────────────────────────────────────


/** Mask rasters are capped at this longest side; containment decisions
 * are made against the raster the renderer itself built, so renderer
 * and acceptance checks can never disagree about the mask. */
const WATERMARK_MASK_MAX_RASTER_DIM = 1024;

/**
 * Rasterize the renderer's actual clip path into a mask sampler. The
 * sampler is cached per shape + logical size: it depends only on the
 * mask geometry, never on the font or the pixel ratio, so editor
 * re-renders (drag frames, keystrokes) reuse it.
 */
const watermarkMaskCache = new LRUCache<string, WatermarkMaskSampler>(8);

export function resolveWatermarkMaskSampler(
  clipPath: Path2D,
  width: number,
  height: number,
  maskKey: string,
): WatermarkMaskSampler | null {
  const cacheKey = `${maskKey}|${width}x${height}`;
  const cached = watermarkMaskCache.get(cacheKey);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const rasterScale = Math.min(1, WATERMARK_MASK_MAX_RASTER_DIM / Math.max(width, height));
  const rasterWidth = Math.max(1, Math.round(width * rasterScale));
  const rasterHeight = Math.max(1, Math.round(height * rasterScale));
  const raster = document.createElement("canvas");
  raster.width = rasterWidth;
  raster.height = rasterHeight;
  const rasterCtx = raster.getContext("2d");
  if (!rasterCtx) return null;
  rasterCtx.scale(rasterScale, rasterScale);
  rasterCtx.fillStyle = "#ffffff";
  rasterCtx.fill(clipPath, "nonzero");
  let data: Uint8ClampedArray;
  try {
    data = rasterCtx.getImageData(0, 0, rasterWidth, rasterHeight).data;
  } catch {
    return null;
  }
  let minPx = rasterWidth;
  let minPy = rasterHeight;
  let maxPx = -1;
  let maxPy = -1;
  for (let y = 0; y < rasterHeight; y++) {
    for (let x = 0; x < rasterWidth; x++) {
      if (data[(y * rasterWidth + x) * 4 + 3] > 0) {
        if (x < minPx) minPx = x;
        if (x > maxPx) maxPx = x;
        if (y < minPy) minPy = y;
        if (y > maxPy) maxPy = y;
      }
    }
  }
  if (maxPx < 0) return null;
  const sampler: WatermarkMaskSampler = {
    bbox: {
      x: minPx / rasterScale,
      y: minPy / rasterScale,
      width: (maxPx - minPx + 1) / rasterScale,
      height: (maxPy - minPy + 1) / rasterScale,
    },
    contains: (x: number, y: number) => {
      const rx = Math.floor(x * rasterScale);
      const ry = Math.floor(y * rasterScale);
      if (rx < 0 || ry < 0 || rx >= rasterWidth || ry >= rasterHeight) return false;
      return data[(ry * rasterWidth + rx) * 4 + 3] > 0;
    },
  };
  watermarkMaskCache.set(cacheKey, sampler);
  return sampler;
}

/**
 * Paint the SQ-55 wordmark onto `ctx` (which must already be in final
 * canvas coordinates — renderStarMap / renderStarMapTextLayer apply
 * the device-pixel scaling to the context once, and this function
 * follows the same rule). The fill and outline are painted at full
 * opacity into an isolated layer, then composited at WATERMARK_OPACITY
 * exactly once. The layer is clipped to the mask as a final safeguard
 * (containment is proven before clipping; clipped lettering would be a
 * solver failure, not a rendering strategy). Returns the placement, or
 * null when no valid placement exists — in which case nothing is
 * painted.
 */
export function paintWatermark(
  ctx: CanvasRenderingContext2D,
  args: {
    width: number;
    height: number;
    clipPath: Path2D | null;
    maskKey: string;
    pixelRatio?: number;
  },
): WatermarkPlacement | null {
  const { width, height, clipPath, maskKey } = args;
  const pixelRatio = args.pixelRatio ?? 1;
  if (!clipPath || width <= 0 || height <= 0) return null;
  if (typeof document === "undefined") return null;
  const sampler = resolveWatermarkMaskSampler(clipPath, width, height, maskKey);
  if (!sampler) return null;

  const layer = document.createElement("canvas");
  layer.width = Math.max(1, Math.round(width * pixelRatio));
  layer.height = Math.max(1, Math.round(height * pixelRatio));
  const layerCtx = layer.getContext("2d");
  if (!layerCtx) return null;
  layerCtx.scale(pixelRatio, pixelRatio);
  layerCtx.textAlign = "center";
  layerCtx.textBaseline = "middle";

  const measure = (fontSize: number): WatermarkTextMetrics => {
    layerCtx.font = `700 ${fontSize}px "Cinzel", serif`;
    const m = layerCtx.measureText(WATERMARK_TEXT);
    return {
      left: m.actualBoundingBoxLeft ?? m.width / 2,
      right: m.actualBoundingBoxRight ?? m.width / 2,
      ascent: m.actualBoundingBoxAscent ?? fontSize * 0.72,
      descent: m.actualBoundingBoxDescent ?? fontSize * 0.08,
    };
  };

  const placement = resolveWatermarkPlacement({ width, height, mask: sampler, measure });
  if (!placement) return null;

  layerCtx.save();
  layerCtx.clip(clipPath, "nonzero");
  layerCtx.font = `700 ${placement.fontSize}px "Cinzel", serif`;
  layerCtx.lineWidth = placement.lineWidth;
  layerCtx.lineJoin = "round";
  layerCtx.strokeStyle = "#000000";
  layerCtx.fillStyle = "#ffffff";
  layerCtx.strokeText(WATERMARK_TEXT, placement.centerX, placement.centerY);
  layerCtx.fillText(WATERMARK_TEXT, placement.centerX, placement.centerY);
  layerCtx.restore();

  ctx.save();
  ctx.clip(clipPath, "nonzero");
  ctx.globalAlpha = WATERMARK_OPACITY;
  ctx.drawImage(layer, 0, 0, width, height);
  ctx.restore();
  return placement;
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  args: {
    width: number;
    height: number;
    show: boolean;
    clipPath: Path2D | null;
    maskKey: string;
    pixelRatio: number;
  },
) {
  // Paid-state fence (SQ-55): this guard stays FIRST — before any text
  // measurement, mask rasterization, layer allocation, or painting —
  // so a paid render is byte-identical to a render with the watermark
  // stage bypassed entirely. Callers keep wiring visibility to the
  // existing watermark flag (`watermark: !paid` in PreviewCanvas), never
  // to premium status, resolution, or a locally cached paid assumption.
  if (!args.show) return;
  paintWatermark(ctx, args);
}

export function buildShapeClip(
  shape: string,
  width: number,
  height: number,
  shapeLayoutVersion?: unknown,
): Path2D | null {
  if (shape === "rectangle") {
    const path = new Path2D();
    path.rect(0, 0, width, height);
    return path;
  }
  if (shape === "circle") {
    const path = new Path2D();
    const minDim = Math.min(width, height);
    const inset = minDim * SHAPE_CIRCLE_INSET_RATIO; // slight inset to match star map footprint
    const radius = Math.max(1, minDim / 2 - inset);
    path.arc(width / 2, height / 2, radius, 0, TWO_PI);
    return path;
  }
  const entry = SHAPE_PATHS[shape];
  if (!entry?.d) return null;
  const path = new Path2D(entry.d);
  // #406 (SQ-02 Option A): layout v2 scales the path uniformly
  // (contain, centred, mat around it); v1/absent keeps the historical
  // independent X/Y stretch that saved designs were rendered with.
  // The transform math lives in shapeLayout.ts (pure, unit-tested).
  const transform = resolveShapeClipTransform(
    entry.viewBox,
    width,
    height,
    shapeLayoutVersion,
  );
  const matrix = new DOMMatrix();
  matrix.translateSelf(transform.translateX, transform.translateY);
  matrix.scaleSelf(transform.scaleX, transform.scaleY);
  const scaled = new Path2D();
  scaled.addPath(path, matrix);
  return scaled;
}

function drawConstellations(
  ctx: CanvasRenderingContext2D,
  sky: VisibleSky,
  accentColor: string,
  lineWidth = 0.8,
  showLabels = false,
  lineAlpha = 0.3,
  premium = false,
  dashed = false,
  scale = 1,
  mapLookTier: MapLookTier = "custom",
) {
  if (!sky.constellations.length) return;
  const lines = sky.constellations.flatMap((constellation) => constellation.lines);

  const drawLines = () => {
    for (const [a, b] of lines) {
      const starA = sky.stars[a];
      const starB = sky.stars[b];
      if (
        !starA ||
        !starB ||
        !Number.isFinite(starA.x) ||
        !Number.isFinite(starA.y) ||
        !Number.isFinite(starB.x) ||
        !Number.isFinite(starB.y)
      ) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(starA.x, starA.y);
      ctx.lineTo(starB.x, starB.y);
      ctx.stroke();
    }
  };

  ctx.save();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = lineAlpha;
  ctx.lineCap = "round";
  ctx.setLineDash(dashed ? [3 * scale, 2 * scale] : []);

  if (premium) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, lineAlpha * 1.4);
    ctx.shadowColor = toRgba(accentColor, 0.65);
    ctx.shadowBlur = Math.max(2, 6 * scale);
    ctx.lineWidth = lineWidth * 1.35;
    drawLines();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = Math.min(0.75, lineAlpha * 1.6);
    ctx.strokeStyle = adjustColor(accentColor, 0.12);
    ctx.lineWidth = Math.max(0.6, lineWidth * 0.85);
    ctx.lineCap = "round";
    ctx.setLineDash(dashed ? [3 * scale, 2 * scale] : []);
    drawLines();
    ctx.restore();
  } else {
    drawLines();
  }

  ctx.restore();

  if (!showLabels) return;

  const labelFontSize =
    mapLookTier === "minimal"
      ? Math.max(7.5, 8 * scale)
      : mapLookTier === "polished"
        ? Math.max(8.5, 9.5 * scale)
        : Math.max(8, 9 * scale);
  const labelLetterSpacing =
    mapLookTier === "minimal" ? 0.2 * scale : mapLookTier === "polished" ? 0.15 * scale : 0.12 * scale;
  const collisionPadX = mapLookTier === "minimal" ? 6 * scale : 5 * scale;
  const collisionPadY = mapLookTier === "minimal" ? 5 * scale : 4 * scale;

  const placed: Array<{ x: number; y: number; width: number; height: number }> = [];
  const overlaps = (a: { x: number; y: number; width: number; height: number }) =>
    placed.some((b) => {
      const paddedA = {
        x: a.x - collisionPadX,
        y: a.y - collisionPadY,
        width: a.width + collisionPadX * 2,
        height: a.height + collisionPadY * 2,
      };
      return !(
        paddedA.x + paddedA.width < b.x ||
        b.x + b.width < paddedA.x ||
        paddedA.y + paddedA.height < b.y ||
        b.y + b.height < paddedA.y
      );
    });

  ctx.save();
  ctx.setLineDash([]);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = clamp(lineAlpha + (mapLookTier === "polished" ? 0.26 : 0.22), 0.32, 0.78);
  ctx.font = `500 ${labelFontSize}px "Montserrat", sans-serif`;
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${labelLetterSpacing}px`;
  }
  if (premium) {
    ctx.shadowColor = toRgba(accentColor, 0.45);
    ctx.shadowBlur = Math.max(2, 4 * scale);
  }

  for (const constellation of sky.constellations) {
    if (constellation.lines.length < 2) continue;
    const indexes = new Set<number>();
    for (const [a, b] of constellation.lines) {
      indexes.add(a);
      indexes.add(b);
    }
    if (indexes.size < 3) continue;

    let xTotal = 0;
    let yTotal = 0;
    let count = 0;
    for (const index of indexes) {
      const point = sky.stars[index];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      xTotal += point.x;
      yTotal += point.y;
      count += 1;
    }
    if (count < 3) continue;

    const labelX = xTotal / count;
    const labelY = yTotal / count - 10 * scale;
    const label = constellation.name.toUpperCase();
    const metrics = ctx.measureText(label);
    const bounds = {
      x: labelX - metrics.width / 2,
      y: labelY - labelFontSize * 0.55,
      width: metrics.width,
      height: labelFontSize * 1.1,
    };
    if (overlaps(bounds)) continue;

    placed.push(bounds);
    ctx.fillText(label, labelX, labelY);
  }

  ctx.restore();
}

function drawTechnicalRing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accentColor: string,
  scale: number,
) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * PROJECTION_RADIUS_FACTOR * 0.98;
  const tickCount = 12;

  ctx.save();
  ctx.strokeStyle = toRgba(accentColor, 0.22);
  ctx.lineWidth = Math.max(0.6, 1 * scale);
  ctx.setLineDash([4 * scale, 6 * scale]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(0.5, 0.75 * scale);
  ctx.strokeStyle = toRgba(accentColor, 0.18);
  for (let i = 0; i < tickCount; i += 1) {
    const angle = (i / tickCount) * TWO_PI - Math.PI / 2;
    const inner = radius - 6 * scale;
    const outer = radius + (i % 3 === 0 ? 4 * scale : 2 * scale);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMoon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  background: string,
  starColor: string,
  accent: string,
  phase: number,
  sizeMultiplier: number,
) {
  const radius = 6 * sizeMultiplier;
  ctx.save();
  ctx.translate(x, y);

  const phaseAngle = phase * 2 * Math.PI;
  const illumination = (1 - Math.cos(phaseAngle)) / 2;
  const waxing = phase <= 0.5;

  // Outer atmospheric glow
  const outerGlow = ctx.createRadialGradient(0, 0, radius * 0.8, 0, 0, radius * 2.2);
  outerGlow.addColorStop(0, toRgba(accent, 0.12));
  outerGlow.addColorStop(0.5, toRgba(accent, 0.05));
  outerGlow.addColorStop(1, toRgba(accent, 0));
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 2.2, 0, TWO_PI);
  ctx.fill();

  // Background mask
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 1, 0, TWO_PI);
  ctx.fill();

  // Base moon surface
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TWO_PI);
  ctx.fill();

  // Clip to moon for surface details
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius - 0.6, 0, TWO_PI);
  ctx.clip();

  // Maria (dark "sea" regions) - visible on moon surface
  const mariaRegions = [
    { x: -0.2, y: -0.15, rx: 0.22, ry: 0.18 },   // Mare Imbrium (Sea of Rains)
    { x: 0.12, y: 0.08, rx: 0.14, ry: 0.18 },    // Mare Tranquillitatis
    { x: -0.08, y: 0.22, rx: 0.18, ry: 0.12 },   // Mare Nubium
    { x: 0.25, y: -0.1, rx: 0.12, ry: 0.14 },    // Mare Serenitatis
    { x: -0.25, y: 0.05, rx: 0.1, ry: 0.12 },    // Oceanus Procellarum edge
  ];
  ctx.fillStyle = toRgba(background, 0.2);
  for (const m of mariaRegions) {
    ctx.beginPath();
    ctx.ellipse(m.x * radius, m.y * radius, m.rx * radius, m.ry * radius, 0, 0, TWO_PI);
    ctx.fill();
  }

  // Crater highlights (bright spots)
  const craterSpots = [
    { x: 0.32, y: -0.38, r: 0.08 },   // Tycho-like rays
    { x: -0.28, y: 0.32, r: 0.05 },   // Copernicus
    { x: 0.15, y: 0.35, r: 0.04 },    // Kepler
    { x: -0.1, y: -0.35, r: 0.035 },  // Aristarchus
  ];
  ctx.fillStyle = toRgba(starColor, 0.3);
  for (const c of craterSpots) {
    ctx.beginPath();
    ctx.arc(c.x * radius, c.y * radius, c.r * radius, 0, TWO_PI);
    ctx.fill();
  }

  // Phase terminator gradient
  const gradient = ctx.createLinearGradient(-radius, 0, radius, 0);
  const terminator = 0.5 + Math.cos(phaseAngle) / 2;

  if (waxing) {
    gradient.addColorStop(0, starColor);
    gradient.addColorStop(Math.max(0, terminator - 0.08), starColor);
    gradient.addColorStop(terminator, toRgba(starColor, 0.5));
    gradient.addColorStop(Math.min(1, terminator + 0.08), "rgba(0, 0, 0, 0.6)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.65)");
  } else {
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.65)");
    gradient.addColorStop(Math.max(0, terminator - 0.08), "rgba(0, 0, 0, 0.6)");
    gradient.addColorStop(terminator, toRgba(starColor, 0.5));
    gradient.addColorStop(Math.min(1, terminator + 0.08), starColor);
    gradient.addColorStop(1, starColor);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  // Earthshine on dark side during crescent phases
  if (illumination < 0.35) {
    ctx.globalAlpha = 0.06 * (1 - illumination * 2.5);
    ctx.fillStyle = starColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Limb glow effect
  ctx.globalAlpha = 0.15 + illumination * 0.25;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 1.5, 0, TWO_PI);
  ctx.fill();

  ctx.restore();
}

function drawPremiumStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  color: string,
  magnitude: number,
  seed: number,
) {
  const brightness = clamp(1.6 - magnitude, 0, 2);
  const haloSize = radius * (6 + brightness * 1.8);
  const haloSoft = radius * (10 + brightness * 2.4);
  const spikeSize = radius * (3.4 + brightness * 0.7);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const outerHalo = ctx.createRadialGradient(0, 0, 0, 0, 0, haloSoft);
  outerHalo.addColorStop(0, toRgba(color, 0.18 + brightness * 0.05));
  outerHalo.addColorStop(0.55, toRgba(color, 0.04));
  outerHalo.addColorStop(1, toRgba(color, 0));
  ctx.fillStyle = outerHalo;
  ctx.beginPath();
  ctx.arc(0, 0, haloSoft, 0, TWO_PI);
  ctx.fill();

  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, haloSize);
  halo.addColorStop(0, toRgba(color, 0.5));
  halo.addColorStop(0.6, toRgba(color, 0.18));
  halo.addColorStop(1, toRgba(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, haloSize, 0, TWO_PI);
  ctx.fill();

  // Bokeh count scales with star brightness (magnitude 0.2 = very bright, 2.2 = premium threshold)
  const bokehCount = magnitude <= 0.2 ? 3 : magnitude <= 1.0 ? 2 : magnitude <= 1.8 ? 1 : 0;
  for (let i = 0; i < bokehCount; i += 1) {
    const a = randFromSeed(seed * 31 + i * 7) * TWO_PI;
    const dist = radius * (3 + randFromSeed(seed * 97 + i * 11) * 5);
    const bx = Math.cos(a) * dist;
    const by = Math.sin(a) * dist;
    const bSize = radius * (1.4 + randFromSeed(seed * 53 + i * 13) * 1.8);
    ctx.globalAlpha = alpha * (0.12 + 0.06 * brightness);
    const blur = ctx.createRadialGradient(bx, by, 0, bx, by, bSize * 2.2);
    blur.addColorStop(0, toRgba(color, 0.28));
    blur.addColorStop(0.6, toRgba(color, 0.08));
    blur.addColorStop(1, toRgba(color, 0));
    ctx.fillStyle = blur;
    ctx.beginPath();
    ctx.arc(bx, by, bSize * 2.2, 0, TWO_PI);
    ctx.fill();
  }

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = toRgba(color, 0.45 + brightness * 0.12);
  ctx.lineWidth = Math.max(0.5, radius * (0.35 + brightness * 0.08));
  ctx.beginPath();
  ctx.moveTo(-spikeSize, 0);
  ctx.lineTo(spikeSize, 0);
  ctx.moveTo(0, -spikeSize);
  ctx.lineTo(0, spikeSize);
  ctx.stroke();

  ctx.fillStyle = toRgba(color, 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.15, 0, TWO_PI);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = alpha * 0.7;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.55, 0, TWO_PI);
  ctx.fill();

  ctx.restore();
}

function drawPremiumPlanet(
  ctx: CanvasRenderingContext2D,
  planet: { name: string; x: number; y: number; magnitude?: number },
  size: number,
  palette: { accent: string },
) {
  const baseColors: Record<string, string> = {
    Mercury: "#b7b0a6",
    Venus: "#e1c79b",
    Mars: "#d46b4d",
    Jupiter: "#d9c2a3",
    Saturn: "#d8c5a2",
  };
  const base = baseColors[planet.name] ?? palette.accent;
  const light = adjustColor(base, 0.22);
  const dark = adjustColor(base, -0.18);

  ctx.save();
  ctx.translate(planet.x, planet.y);
  ctx.shadowBlur = 0;

  // Outer atmospheric glow
  const outerGlow = ctx.createRadialGradient(0, 0, size * 0.8, 0, 0, size * 2.8);
  outerGlow.addColorStop(0, toRgba(base, 0.15));
  outerGlow.addColorStop(0.5, toRgba(base, 0.05));
  outerGlow.addColorStop(1, toRgba(base, 0));
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.8, 0, TWO_PI);
  ctx.fill();

  // Planet body gradient
  const gradient = ctx.createRadialGradient(-size * 0.35, -size * 0.35, size * 0.2, 0, 0, size);
  gradient.addColorStop(0, light);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, TWO_PI);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, TWO_PI);
  ctx.clip();

  if (planet.name === "Jupiter") {
    // Horizontal cloud bands
    const bandColors = [
      adjustColor(base, -0.12),
      adjustColor(base, 0.05),
      adjustColor(base, -0.08),
    ];
    const bandPositions = [-0.7, -0.35, 0, 0.35, 0.7];
    for (let i = 0; i < bandPositions.length; i++) {
      ctx.fillStyle = bandColors[i % bandColors.length];
      ctx.globalAlpha = 0.4;
      ctx.fillRect(-size, bandPositions[i] * size, size * 2, size * 0.22);
    }
    ctx.globalAlpha = 1;

    // Great Red Spot
    ctx.save();
    ctx.fillStyle = "#c45d3a";
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(size * 0.25, size * 0.18, size * 0.22, size * 0.12, -0.15, 0, TWO_PI);
    ctx.fill();
    // Inner highlight of GRS
    ctx.fillStyle = "#d87755";
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(size * 0.23, size * 0.16, size * 0.12, size * 0.06, -0.15, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  if (planet.name === "Saturn") {
    const bandColor = adjustColor(base, -0.06);
    ctx.fillStyle = bandColor;
    for (let y = -size; y < size; y += size * 0.4) {
      ctx.globalAlpha = 0.25;
      ctx.fillRect(-size, y, size * 2, size * 0.15);
    }
    ctx.globalAlpha = 1;
  }

  if (planet.name === "Mars") {
    // North polar ice cap
    ctx.fillStyle = adjustColor(base, 0.35);
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.75, size * 0.35, size * 0.18, 0, 0, TWO_PI);
    ctx.fill();
    // Dark feature (Syrtis Major)
    ctx.fillStyle = adjustColor(base, -0.2);
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.ellipse(size * 0.15, size * 0.1, size * 0.25, size * 0.35, 0.2, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (planet.name === "Venus") {
    // Subtle cloud patterns
    ctx.fillStyle = adjustColor(base, -0.05);
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.ellipse(-size * 0.2, 0, size * 0.6, size * 0.8, 0.3, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Saturn rings with Cassini division
  if (planet.name === "Saturn") {
    ctx.save();
    ctx.scale(1.6, 0.45);

    // Outer A ring
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = adjustColor(base, 0.15);
    ctx.lineWidth = Math.max(0.8, size * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.15, size * 1.15, 0, 0, TWO_PI);
    ctx.stroke();

    // Cassini division (dark gap)
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = Math.max(0.3, size * 0.04);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.0, size * 1.0, 0, 0, TWO_PI);
    ctx.stroke();

    // Inner B ring (brighter)
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = adjustColor(base, 0.2);
    ctx.lineWidth = Math.max(0.8, size * 0.14);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.88, size * 0.88, 0, 0, TWO_PI);
    ctx.stroke();

    // Innermost C ring (faint)
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = adjustColor(base, 0.05);
    ctx.lineWidth = Math.max(0.4, size * 0.06);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.72, size * 0.72, 0, 0, TWO_PI);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}

function starRadiusFromMagnitude(magnitude: number) {
  const clamped = clamp(magnitude, -1, 6.5);
  return clamp(3.8 - clamped * 0.42, 0.4, 3.8);
}

// Planet radius based on apparent magnitude
// Venus at -4.5 should be larger than Mars at +1.5
function planetRadiusFromMagnitude(magnitude: number, baseSize: number): number {
  // Typical range: Venus -4.5 to Saturn +1.5
  // Normalize so brighter planets are larger
  const normalized = clamp((2 - magnitude) / 6, 0.5, 1.6);
  return baseSize * normalized;
}

// Planet colors for standard mode rendering
const PLANET_COLORS: Record<string, string> = {
  Mercury: "#c7bfb5",
  Venus: "#fffde7",
  Mars: "#e57373",
  Jupiter: "#ffcc80",
  Saturn: "#ffe082",
};

function brightnessFromMagnitude(magnitude: number) {
  const clamped = clamp(magnitude, -1, 6.5);
  const normalized = 1 - (clamped + 1) / 7.5;
  const boosted = Math.pow(normalized, 1.25);
  return clamp(boosted * 1.35, 0.12, 1);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    console.warn('clamp received non-finite value:', value);
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function getStarColor(index: number, magnitude: number) {
  const colors = ["#f7f0e2", "#d7e7ff", "#ffe4bd"];
  const seed = Math.abs(Math.floor(index * 7 + magnitude * 29));
  return colors[seed % colors.length];
}

// B-V color index to RGB with smooth interpolation
// Based on astronomical color-temperature relationships
const BV_COLOR_STOPS = [
  { bv: -0.4, r: 155, g: 176, b: 255 },  // Blue (O/B stars)
  { bv: 0.0, r: 170, g: 191, b: 255 },   // Blue-white (A stars)
  { bv: 0.15, r: 202, g: 215, b: 255 },  // White-blue
  { bv: 0.4, r: 248, g: 247, b: 255 },   // White (F stars)
  { bv: 0.6, r: 255, g: 244, b: 234 },   // Yellow-white (G stars)
  { bv: 0.8, r: 255, g: 239, b: 213 },   // Yellow
  { bv: 1.0, r: 255, g: 210, b: 161 },   // Orange-yellow (K stars)
  { bv: 1.4, r: 255, g: 204, b: 111 },   // Orange
  { bv: 2.0, r: 255, g: 189, b: 111 },   // Red-orange (M stars)
];

function bvToRgb(bv: number): string {
  const t = clamp(bv, -0.4, 2.0);

  // Find surrounding color stops and interpolate
  for (let i = 0; i < BV_COLOR_STOPS.length - 1; i++) {
    const curr = BV_COLOR_STOPS[i];
    const next = BV_COLOR_STOPS[i + 1];
    if (t <= next.bv) {
      const ratio = (t - curr.bv) / (next.bv - curr.bv);
      const r = Math.round(curr.r + ratio * (next.r - curr.r));
      const g = Math.round(curr.g + ratio * (next.g - curr.g));
      const b = Math.round(curr.b + ratio * (next.b - curr.b));
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }
  }
  return "#ffbd6f";
}

function randFromSeed(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export const __testUtils = {
  parseHexColor,
  parseRgbColor,
  toRgba,
  adjustColor,
  toUTCDateFromLocal,
  resolveTextCenterNormalized,
};

export { STYLE_THEME, clamp };
