import { computeVisibleStars, type VisibleSky } from "@/lib/astronomy";
import type { LocationState, StyleId, TextBox } from "@/lib/store";
import { SHAPE_PATHS } from "@/lib/shapes";
import type { AspectRatio, Shape } from "@/lib/types";

export type { AspectRatio, Shape } from "@/lib/types";

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
  renderOptions?: {
    visualMode?: string;
    starIntensity?: "subtle" | "normal" | "bold";
    starGlow?: boolean;
    constellationLines?: "off" | "thin" | "thick";
    constellationLabels?: boolean;
    showGrid?: boolean;
    showPlanets?: boolean;
    planetEmphasis?: "normal" | "highlighted";
    showMoon?: boolean;
    moonSize?: "normal" | "large";
    colorTheme?: string;
    typography?: string;
    textLayout?: string;
    shapeMask?: "none" | "circle" | "heart" | "diamond" | "ring";
    backgroundColor?: string;
  };
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
    background: "#0d1b2a",
    vignette: "rgba(7, 13, 26, 0.65)",
    accent: "#c6a35c",
    star: "#fdf4dc",
    glow: "rgba(198, 163, 92, 0.4)",
  },
  vintageEngraving: {
    background: "#1b1b1b",
    vignette: "rgba(0, 0, 0, 0.55)",
    accent: "#d6d0c4",
    star: "#f0ede8",
    glow: "rgba(214, 208, 196, 0.25)",
  },
  parchmentScroll: {
    background: "#f5f0e6",
    vignette: "rgba(160, 128, 80, 0.35)",
    accent: "#9c7b3c",
    star: "#d8c59b",
    glow: "rgba(156, 123, 60, 0.3)",
  },
  midnightMinimal: {
    background: "#0c0f1a",
    vignette: "rgba(0, 0, 0, 0.7)",
    accent: "#8ea6c1",
    star: "#dfe8f7",
    glow: "rgba(74, 105, 163, 0.35)",
  },
};

const FONT_STACKS: Record<TextBox["fontFamily"], string> = {
  playfair: '"Playfair Display", serif',
  cinzel: '"Cinzel", serif',
  script: '"Great Vibes", cursive',
  cormorant: '"Cormorant Garamond", serif',
  montserrat: '"Montserrat", sans-serif',
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
    showConstellations: true,
    showGrid: false,
    showPlanets: true,
    showMoon: true,
    shapeMask: "circle",
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

function resolveVisualMode(mode?: string): ModeSettings {
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
        palette: {
          background: "#0b0a1a",
          accent: "#d9b56f",
          star: "#fff5d9",
          glow: "rgba(217,181,111,0.6)",
        },
      };
    case "enhanced":
    default:
      return {
        glowBlur: 8,
        lineWidthFactor: 1,
        planetSizeFactor: 1,
        vignetteStrength: 1,
        vignetteOverlay: 0.05,
        lineAlpha: 0.32,
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
  pixelRatio = 1,
  textBounds,
}: {
  recipe: MapRecipe;
  canvas: CanvasLike;
  width: number;
  height: number;
  watermark: boolean;
  quality: "preview" | "og" | "export";
  pixelRatio?: number;
  textBounds?: Map<string, { x: number; y: number; width: number; height: number }>;
}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const shapeName = recipe.shape || (recipe.renderOptions?.shapeMask as Shape) || "rectangle";
  const targetHeight = height || Math.round(width / aspectRatioToNumber(recipe.aspectRatio));
  const sky = computeSky(recipe, width, targetHeight);
  const mode = resolveVisualMode(recipe.renderOptions?.visualMode);

  canvas.width = width * pixelRatio;
  canvas.height = targetHeight * pixelRatio;
  if (canvas.style) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${targetHeight}px`;
  }

  const baseWidth = 1200;
  const scale = width / baseWidth;
  const backgroundColor = recipe.renderOptions?.backgroundColor?.trim() || STYLE_THEME[recipe.selectedStyle].background;
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
  drawBackground(ctx, width, targetHeight, recipe.selectedStyle, mode, scale, shapeName);
  drawSky(ctx, width, targetHeight, recipe.selectedStyle, sky, recipe.renderOptions, mode, scale);
  ctx.restore();

  // Outline for clarity
  if (clipPath) {
    ctx.save();
    ctx.strokeStyle = STYLE_THEME[recipe.selectedStyle].accent;
    ctx.lineWidth = 2 * scale;
    ctx.globalAlpha = 0.9;
    ctx.stroke(clipPath);
    ctx.restore();
  }

  // Overlays
  drawText(ctx, width, targetHeight, recipe.textBoxes, textBounds, scale);
  drawWatermark(ctx, width, targetHeight, watermark, recipe.selectedStyle, scale);
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

export function computeSky(recipe: MapRecipe, width: number, height: number): VisibleSky | null {
  const formatted = formatDateTimeForLocation(recipe.datetimeISO, recipe.location.timezone);
  if (!formatted) return null;
  return computeVisibleStars(
    {
      date: formatted.date,
      time: formatted.time,
      lat: recipe.location.latitude,
      lon: recipe.location.longitude,
      bortle: 4.5,
      showConstellations: recipe.renderOptions?.constellationLines !== "off",
    },
    width,
    height,
  );
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
      visualMode: input.renderOptions?.visualMode ?? "enhanced",
      starIntensity: input.renderOptions?.starIntensity ?? "normal",
      starGlow: input.renderOptions?.starGlow ?? false,
      constellationLines: input.renderOptions?.constellationLines ?? "thin",
      constellationLabels: input.renderOptions?.constellationLabels ?? false,
      showGrid: input.renderOptions?.showGrid ?? false,
      showPlanets: input.renderOptions?.showPlanets ?? true,
      planetEmphasis: input.renderOptions?.planetEmphasis ?? "normal",
      showMoon: input.renderOptions?.showMoon ?? true,
      moonSize: input.renderOptions?.moonSize ?? "normal",
      colorTheme: input.renderOptions?.colorTheme ?? "night",
      typography: input.renderOptions?.typography ?? "classic",
      textLayout: input.renderOptions?.textLayout ?? "center",
      shapeMask: input.renderOptions?.shapeMask ?? "circle",
      backgroundColor: input.renderOptions?.backgroundColor ?? "",
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
) {
  const theme = STYLE_THEME[styleId];
  const palette = {
    background: mode.palette?.background ?? theme.background,
    vignette: theme.vignette,
    accent: mode.palette?.accent ?? theme.accent,
    star: mode.palette?.star ?? theme.star,
    glow: mode.palette?.glow ?? theme.glow,
  };

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createRadialGradient(
    width * 0.6,
    height * 0.35,
    width * 0.05,
    width * 0.5,
    height * 0.45,
    Math.max(width, height),
  );
  gradient.addColorStop(0, "rgba(255,255,255,0.08)");
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

  if (!shape || shape === "rectangle") {
    const inset = Math.max(8, Math.min(16, Math.floor(Math.min(width, height) * 0.03)));
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2 * scale;
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  }
}

function drawSky(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  styleId: StyleId,
  sky: VisibleSky | null,
  renderOptions?: MapRecipe["renderOptions"],
  mode?: ModeSettings,
  scale = 1,
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

  if (renderOptions?.constellationLines !== "off") {
    const lineWidth =
      renderOptions?.constellationLines === "thick"
        ? 1.2 * lineFactor
        : renderOptions?.constellationLines === "thin"
          ? 0.8 * lineFactor
          : 0.8 * lineFactor;
    drawConstellations(
      ctx,
      sky,
      palette.accent,
      lineWidth * scale,
      renderOptions?.constellationLabels ?? false,
      mode?.lineAlpha ?? 0.3,
    );
  }

  ctx.save();
  ctx.fillStyle = palette.star;
  ctx.shadowColor = palette.glow;
  const baseGlow = mode?.glowBlur ?? 8;
  const glow = (renderOptions?.starGlow ? baseGlow + 4 : baseGlow) * scale;
  ctx.shadowBlur = glow;

  for (const star of sky.stars) {
    if (!Number.isFinite(star.x) || !Number.isFinite(star.y)) continue;
    const baseAlpha = brightnessFromMagnitude(star.magnitude);
    const alpha = clamp(baseAlpha * (star.opacity ?? 1) * (mode?.starAlpha ?? 1), 0.05, 1);
    const radius = starRadiusFromMagnitude(star.magnitude) * (mode?.starSizeFactor ?? 1) * scale;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 14;
  ctx.shadowColor = theme.glow;
  ctx.globalAlpha = 0.95;
  if (renderOptions?.showPlanets ?? true) {
    for (const planet of sky.planets) {
      if (!Number.isFinite(planet.x) || !Number.isFinite(planet.y)) continue;
      ctx.fillStyle = palette.accent;
      const sizeBase = renderOptions?.planetEmphasis === "highlighted" ? 4.2 : 3.2;
      const size = sizeBase * (mode?.planetSizeFactor ?? 1) * scale;
      ctx.globalAlpha = (mode?.planetAlpha ?? 0.85) * (renderOptions?.planetEmphasis === "highlighted" ? 1 : 0.95);
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, size, 0, Math.PI * 2);
      ctx.fill();
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
    const fontSize = Math.max(10, box.size * scale);
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
      const metrics = ctx.measureText(box.text);
      const textWidth = metrics.width;
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
  const margin = 28 * scale;
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
    path.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
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
  showLabels = false,
  lineAlpha = 0.3,
) {
  if (!sky.constellations.length) return;
  ctx.save();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = lineAlpha;

  for (const constellation of sky.constellations) {
    for (const [a, b] of constellation.lines) {
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

  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius - 0.6, 0, Math.PI * 2);
  ctx.clip();

  const phaseAngle = phase * 2 * Math.PI;
  const illumination = (1 - Math.cos(phaseAngle)) / 2;
  const waxing = phase <= 0.5;
  const gradient = ctx.createLinearGradient(-radius, 0, radius, 0);
  const terminator = 0.5 + Math.cos(phaseAngle) / 2;

  if (waxing) {
    gradient.addColorStop(0, starColor);
    gradient.addColorStop(terminator, starColor);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.6)");
  } else {
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.6)");
    gradient.addColorStop(terminator, starColor);
    gradient.addColorStop(1, starColor);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  ctx.globalAlpha = 0.12 + illumination * 0.3;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

function starRadiusFromMagnitude(magnitude: number) {
  const clamped = clamp(magnitude, -1, 6.5);
  return clamp(3.6 - clamped * 0.45, 0.4, 3.6);
}

function brightnessFromMagnitude(magnitude: number) {
  const clamped = clamp(magnitude, -1, 6.5);
  const normalized = 1 - (clamped + 1) / 7.5;
  return clamp(normalized * 1.2, 0.12, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export { STYLE_THEME };
