import { Horizon, Observer } from "astronomy-engine";
import { computeVisibleStars, type VisibleSky } from "@/lib/astronomy";
import type { LocationState, RenderOptions, StyleId, TextBox } from "@/lib/store";
import { SHAPE_PATHS } from "@/lib/shapes";
import type { AspectRatio, Shape } from "@/lib/types";
import { FONT_STACKS } from "@/lib/fonts";

export type { AspectRatio, Shape } from "@/lib/types";

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
    background: "#0c0f1a",
    vignette: "rgba(0, 0, 0, 0)",
    accent: "#e0e0e0",
    star: "#e0e0e0",
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
    shapeMask: "circle",
    frameEnabled: true,
    premiumStars: "off",
    premiumPlanets: "off",
  },
};

export function aspectRatioToNumber(aspect: AspectRatio): number {
  switch (aspect) {
    case "3:4":
      return 3 / 4;
    case "2:3":
      return 2 / 3;
    case "4:5":
      return 4 / 5;
    default:
      return 1;
  }
}

type CanvasLike = {
  width: number;
  height: number;
  style?: { width?: string; height?: string };
  getContext: (type: "2d") => CanvasRenderingContext2D | null;
};

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
}: {
  recipe: MapRecipe;
  canvas: CanvasLike;
  width: number;
  height: number;
  watermark: boolean;
  quality: "preview" | "og" | "export";
  premium?: boolean;
  pixelRatio?: number;
  textBounds?: Map<string, { x: number; y: number; width: number; height: number }>;
}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Validate shape - filter out invalid values like "none" or "ring"
  const validShapes = new Set(["rectangle", "heart", "circle", "star", "diamond"]);
  const rawShape = recipe.shape || recipe.renderOptions?.shapeMask;
  const shapeName: Shape = (rawShape && validShapes.has(rawShape)) ? rawShape as Shape : "rectangle";
  const targetHeight = height || Math.round(width / aspectRatioToNumber(recipe.aspectRatio));
  const sky = computeSky(recipe, width, targetHeight);
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
  const clipPath = buildShapeClip(shapeName, width, targetHeight);

  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);
  // Layer: frame background
  ctx.clearRect(0, 0, width, targetHeight);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, targetHeight);

  // Layer: clipped sky
  ctx.save();
  if (clipPath) ctx.clip(clipPath, "nonzero");
  drawBackground(
    ctx,
    width,
    targetHeight,
    recipe.selectedStyle,
    mode,
    scale,
    shapeName,
    showFrame,
    recipe.renderOptions?.backgroundColor,
  );
  if (recipe.selectedStyle === "parchmentScroll") {
    drawPaperTexture(ctx, width, targetHeight);
  }
  drawSky(ctx, width, targetHeight, recipe, recipe.selectedStyle, sky, recipe.renderOptions, mode, scale, premium);
  if (premium && recipe.selectedStyle !== "midnightMinimal" && recipe.selectedStyle !== "parchmentScroll") {
    drawPremiumVignette(ctx, width, targetHeight, mode);
  }
  ctx.restore();

  // Shape outline using theme accent color
  if (clipPath && showFrame) {
    const theme = STYLE_THEME[recipe.selectedStyle];
    const frameColor = mode?.palette?.accent ?? theme.accent;
    ctx.save();
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 3 * scale;
    ctx.globalAlpha = 0.8;
    ctx.stroke(clipPath);
    ctx.restore();
  }

  // Overlays
  drawText(ctx, width, targetHeight, recipe.textBoxes, textBounds, scale);
  drawWatermark(ctx, width, targetHeight, watermark, recipe.selectedStyle, scale);
  if (premium && recipe.selectedStyle !== "midnightMinimal" && recipe.selectedStyle !== "parchmentScroll") {
    drawFilmGrain(ctx, width, targetHeight, mode);
  }
  ctx.restore();
}

export function formatDateTimeForLocation(dateTime: string, timeZone?: string) {
  const date = new Date(dateTime);
  if (!Number.isFinite(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPart["type"]) =>
    parts.find((p) => p.type === type)?.value;

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");

  if (!year || !month || !day || !hour || !minute) return null;
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
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

  const formatted = formatDateTimeForLocation(recipe.datetimeISO, recipe.location.timezone);
  if (!formatted) return null;

  const sky = computeVisibleStars(
    {
      date: formatted.date,
      time: formatted.time,
      lat: recipe.location.latitude,
      lon: recipe.location.longitude,
      timezone: recipe.location.timezone,
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
    shape: input.shape || (input.renderOptions?.shapeMask as Shape) || "rectangle",
    aspectRatio: input.aspectRatio || "square",
    renderOptions: {
      visualMode: input.renderOptions?.visualMode ?? "illustrated",
      starIntensity: input.renderOptions?.starIntensity ?? "bold",
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
      shapeMask: input.renderOptions?.shapeMask ?? "circle",
      frameEnabled: input.renderOptions?.frameEnabled ?? true,
      backgroundColor: input.renderOptions?.backgroundColor ?? "",
      constellationColor: input.renderOptions?.constellationColor ?? "",
      constellationLineScale: input.renderOptions?.constellationLineScale ?? 1.1,
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

  const noGradient = styleId === "midnightMinimal" || styleId === "parchmentScroll";
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

  // Rectangle border using theme accent color
  if (showFrame && (!shape || shape === "rectangle")) {
    const inset = Math.max(8, Math.min(16, Math.floor(Math.min(width, height) * 0.03)));
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 3 * scale;
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    ctx.globalAlpha = 1;
  }
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
  const premiumStars = premium && (renderOptions?.premiumStars ?? "off") !== "off";
  const premiumPlanets = premium && (renderOptions?.premiumPlanets ?? "off") !== "off";
  const premiumThreshold = (renderOptions?.premiumStars ?? "off") === "realistic" ? 2.2 : 0.6;
  const isMinimal = styleId === "midnightMinimal";
  const isParchment = styleId === "parchmentScroll";
  const useFixedStarColor = isMinimal || isParchment;
  const allowGlow = !isMinimal && !isParchment;
  const parchmentAlphaFloor = isParchment ? 0.07 : 0.02;
  const parchmentSizeBoost = isParchment ? 1.18 : 1;

  // Apply starIntensity to affect star brightness and size
  // subtle = smaller/dimmer, normal = default, bold = larger/brighter
  const starIntensity = renderOptions?.starIntensity ?? "normal";
  const intensityFactor = starIntensity === "subtle" ? 0.7 : starIntensity === "bold" ? 1.3 : 1.0;
  const intensityAlphaBoost = starIntensity === "subtle" ? 0.8 : starIntensity === "bold" ? 1.15 : 1.0;

  if (renderOptions?.constellationLines !== "off") {
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
    const strokeWidth = lineWidth * lineScale * scale * (isParchment ? 1.2 : 1);
    const lineAlpha = isParchment ? clamp((mode?.lineAlpha ?? 0.3) * 1.5, 0.45, 0.8) : (mode?.lineAlpha ?? 0.3);
    drawConstellations(
      ctx,
      sky,
      constellationColor,
      strokeWidth,
      renderOptions?.constellationLabels ?? false,
      lineAlpha,
      premium,
      isParchment,
      scale,
    );
  }

  if (premium && !isMinimal && !isParchment) {
    const bandColor = resolveBandColor(palette.star);
    drawMilkyWayBand(ctx, width, height, recipe, bandColor, mode);
  }

  ctx.save();
  ctx.fillStyle = palette.star;
  ctx.shadowColor = allowGlow ? palette.glow : "transparent";
  const baseGlow = mode?.glowBlur ?? 8;
  const glow = (renderOptions?.starGlow ? baseGlow + 4 : baseGlow) * scale;
  ctx.shadowBlur = allowGlow && renderOptions?.starGlow ? glow : 0;

  for (let i = 0; i < sky.stars.length; i += 1) {
    const star = sky.stars[i];
    if (!Number.isFinite(star.x) || !Number.isFinite(star.y)) continue;
    const baseAlpha = brightnessFromMagnitude(star.magnitude);
    if (!Number.isFinite(baseAlpha)) continue;
    // Apply intensity alpha boost
    const alpha = clamp(baseAlpha * (star.opacity ?? 1) * (mode?.starAlpha ?? 1) * intensityAlphaBoost, parchmentAlphaFloor, 1);
    if (!Number.isFinite(alpha)) continue;
    // Apply intensity size factor
    const jitter = 0.92 + randFromSeed((i + 1) * 17) * 0.18;
    const radius =
      starRadiusFromMagnitude(star.magnitude) * (mode?.starSizeFactor ?? 1) * intensityFactor * parchmentSizeBoost * jitter * scale;
    if (!Number.isFinite(radius) || radius <= 0) continue;
    if (premiumStars && star.magnitude <= premiumThreshold) {
      const color = typeof star.bv === "number" ? bvToRgb(star.bv) : getStarColor(i, star.magnitude);
      drawPremiumStar(ctx, star.x, star.y, radius, alpha, color, star.magnitude, i);
      continue;
    }
    const color = useFixedStarColor
      ? palette.star
      : (typeof star.bv === "number" ? bvToRgb(star.bv) : getStarColor(i, star.magnitude));
    const isBright = star.magnitude <= 1.2;

    if (allowGlow && (renderOptions?.starGlow || isBright)) {
      ctx.save();
      ctx.shadowBlur = 0;
      const haloRadius = radius * (isBright ? 3.2 : 2.4);
      const halo = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, haloRadius);
      halo.addColorStop(0, toRgba(color, Math.min(0.7, alpha * 0.9)));
      halo.addColorStop(0.45, toRgba(color, alpha * 0.35));
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
  }

  ctx.shadowBlur = allowGlow ? 14 : 0;
  ctx.shadowColor = allowGlow ? theme.glow : "transparent";
  ctx.globalAlpha = 0.95;
  if (renderOptions?.showPlanets ?? true) {
    for (const planet of sky.planets) {
      if (!Number.isFinite(planet.x) || !Number.isFinite(planet.y)) continue;
      const sizeBase = renderOptions?.planetEmphasis === "highlighted" ? 4.2 : 3.2;
      // Apply magnitude-based sizing
      const magnitudeSize = planetRadiusFromMagnitude(planet.magnitude, sizeBase);
      const size = magnitudeSize * (mode?.planetSizeFactor ?? 1) * scale;
      ctx.globalAlpha = (mode?.planetAlpha ?? 0.85) * (renderOptions?.planetEmphasis === "highlighted" ? 1 : 0.95);
      if (premiumPlanets && renderOptions?.premiumPlanets === "realistic") {
        drawPremiumPlanet(ctx, planet, size, palette);
      } else {
        // Use planet-specific color
        const planetColor = isParchment ? palette.star : (PLANET_COLORS[planet.name] ?? palette.accent);

        if (!isParchment) {
          // Draw atmospheric glow
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

          // Draw planet body with subtle gradient
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
  }

  if (renderOptions?.showMoon ?? true) {
    if (sky.moon && Number.isFinite(sky.moon.x) && Number.isFinite(sky.moon.y)) {
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
  }

  ctx.restore();
}

function drawPremiumVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode?: ModeSettings,
) {
  const baseStrength = 0.16 + (mode?.vignetteStrength ?? 1) * 0.08;
  const strength = clamp(baseStrength, 0.12, 0.38);
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

function drawFilmGrain(ctx: CanvasRenderingContext2D, width: number, height: number, mode?: ModeSettings) {
  const strength = clamp(0.08 + (mode?.vignetteStrength ?? 1) * 0.02, 0.06, 0.14);
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

function drawPaperTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const grainSize = Math.max(1, Math.round(Math.min(width, height) / 180));
  const cols = Math.ceil(width / grainSize);
  const rows = Math.ceil(height / grainSize);
  ctx.save();
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const seed = (x + 3) * 4099 ^ (y + 7) * 1319;
      const n = randFromSeed(seed);
      const alpha = 0.05 + n * 0.08;
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
  const formatted = formatDateTimeForLocation(recipe.datetimeISO, recipe.location.timezone);
  if (!formatted) return null;
  const date = toUTCDateFromLocal(formatted.date, formatted.time, recipe.location.timezone);
  if (!date) return null;
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

function toUTCDateFromLocal(dateStr: string, timeStr: string, timezone: string) {
  const [yearRaw, monthRaw, dayRaw] = dateStr.split("-").map(Number);
  if (!yearRaw || !monthRaw || !dayRaw) return null;
  const [hourRaw, minuteRaw] = timeStr.split(":").map(Number);
  if (Number.isNaN(hourRaw) || Number.isNaN(minuteRaw)) return null;

  const hour = clamp(hourRaw, 0, 23);
  const minute = clamp(minuteRaw, 0, 59);

  try {
    const testDate = new Date(Date.UTC(yearRaw, monthRaw - 1, dayRaw, hour, minute, 0));
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(testDate);
    const localYear = Number(parts.find(p => p.type === "year")?.value);
    const localMonth = Number(parts.find(p => p.type === "month")?.value);
    const localDay = Number(parts.find(p => p.type === "day")?.value);
    const localHour = Number(parts.find(p => p.type === "hour")?.value);
    const localMinute = Number(parts.find(p => p.type === "minute")?.value);

    const localMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);
    const utcMs = testDate.getTime();
    const offsetMs = utcMs - localMs;

    const targetLocalMs = Date.UTC(yearRaw, monthRaw - 1, dayRaw, hour, minute, 0);
    return new Date(targetLocalMs + offsetMs);
  } catch {
    return new Date(Date.UTC(yearRaw, monthRaw - 1, dayRaw, hour, minute, 0));
  }
}

function resolveBandColor(color: string) {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) return trimmed;
  // Fallback to neutral white if color format is unexpected
  return "#ffffff";
}

function drawText(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  textBoxes: TextBox[],
  bounds?: Map<string, { x: number; y: number; width: number; height: number }>,
  scale = 1,
) {
  const baseY = height * 0.72;
  const lineGap = 28 * scale;

  if (bounds) bounds.clear();

  textBoxes.forEach((box, index) => {
    // Skip empty text boxes
    if (!box.text || box.text.trim() === "") return;

    const fontSize = Math.max(10, (box.size ?? 28) * scale);
    ctx.font = `600 ${fontSize}px ${FONT_STACKS[box.fontFamily]}`;
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
    const px = clamp(box.position?.x ?? 0.5, 0, 1) * width;
    const py = clamp(box.position?.y ?? (baseY + index * lineGap) / height, 0, 1) * height;
    ctx.fillText(box.text, px, py);

    if (bounds) {
      const font = `600 ${fontSize}px ${FONT_STACKS[box.fontFamily]}`;
      const textWidth = getCachedTextWidth(ctx, box.text, font);
      const textHeight = fontSize * 1.2;
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

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  show: boolean,
  styleId: StyleId,
  scale: number,
) {
  if (!show) return;
  const theme = STYLE_THEME[styleId];
  ctx.save();
  ctx.fillStyle = theme.star;
  ctx.globalAlpha = 0.18;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  const fontSize = Math.max(12, Math.min(width, height) * 0.035 * scale);
  ctx.font = `700 ${fontSize}px "Cinzel", serif`;
  const margin = 50 * scale;
  ctx.fillText("StarMapCo", margin, height - margin);
  ctx.restore();
}

function buildShapeClip(shape: string, width: number, height: number): Path2D | null {
  if (shape === "rectangle") {
    const path = new Path2D();
    path.rect(0, 0, width, height);
    return path;
  }
  if (shape === "circle") {
    const path = new Path2D();
    const minDim = Math.min(width, height);
    const inset = minDim * 0.06; // slight inset to match star map footprint
    const radius = Math.max(1, minDim / 2 - inset);
    path.arc(width / 2, height / 2, radius, 0, TWO_PI);
    return path;
  }
  const entry = SHAPE_PATHS[shape];
  if (!entry?.d) return null;
  const path = new Path2D(entry.d);
  const [minX, minY, vbWidth, vbHeight] = entry.viewBox;
  const matrix = new DOMMatrix();
  matrix.translateSelf(-minX, -minY);
  matrix.scaleSelf(width / vbWidth, height / vbHeight);
  const scaled = new Path2D();
  scaled.addPath(path, matrix);
  return scaled;
}

function drawConstellations(
  ctx: CanvasRenderingContext2D,
  sky: VisibleSky,
  accentColor: string,
  lineWidth = 0.8,
  _showLabels = false, // TODO: Implement constellation label rendering
  lineAlpha = 0.3,
  premium = false,
  dashed = false,
  scale = 1,
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

function toRgba(hex: string, alpha: number) {
  let normalized = hex.replace("#", "");
  // Expand 3-digit hex to 6-digit (e.g., #fff -> #ffffff)
  if (normalized.length === 3) {
    normalized = normalized[0] + normalized[0] + normalized[1] + normalized[1] + normalized[2] + normalized[2];
  }
  if (normalized.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function adjustColor(hex: string, amount: number) {
  let normalized = hex.replace("#", "");
  // Expand 3-digit hex to 6-digit (e.g., #fff -> #ffffff)
  if (normalized.length === 3) {
    normalized = normalized[0] + normalized[0] + normalized[1] + normalized[1] + normalized[2] + normalized[2];
  }
  if (normalized.length !== 6) return hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const next = (value: number) => {
    const delta = Math.round(255 * amount);
    return Math.min(255, Math.max(0, value + delta));
  };
  return `rgb(${next(r)},${next(g)},${next(b)})`;
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

export { STYLE_THEME, clamp };
