import { computeVisibleStars, type VisibleSky } from "@/lib/astronomy";
import type { LocationState, StyleId, TextBox } from "@/lib/store";

export type AspectRatio = "square" | "3:4" | "2:3" | "4:5";

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
  aspectRatio: AspectRatio;
  renderOptions?: {
    showConstellations?: boolean;
    showGrid?: boolean;
    showPlanets?: boolean;
    showMoon?: boolean;
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
};

export const DEFAULT_RECIPE: MapRecipe = {
  version: 1,
  seed: "default",
  datetimeISO: new Date().toISOString(),
  location: { name: "", latitude: 0, longitude: 0, timezone: "UTC" },
  textBoxes: [],
  selectedStyle: "navyGold",
  aspectRatio: "square",
  renderOptions: {
    showConstellations: true,
    showGrid: false,
    showPlanets: true,
    showMoon: true,
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
  const sky = computeSky(recipe, width, height);

  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  if (canvas.style) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);
  drawBackground(ctx, width, height, recipe.selectedStyle);
  drawSky(ctx, width, height, recipe.selectedStyle, sky, recipe.renderOptions);
  drawText(ctx, width, height, recipe.textBoxes, textBounds);
  drawWatermark(ctx, width, height, watermark, recipe.selectedStyle);
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
      showConstellations: recipe.renderOptions?.showConstellations ?? true,
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
    aspectRatio: input.aspectRatio || "square",
    renderOptions: {
      showConstellations: input.renderOptions?.showConstellations ?? true,
      showGrid: input.renderOptions?.showGrid ?? false,
      showPlanets: input.renderOptions?.showPlanets ?? true,
      showMoon: input.renderOptions?.showMoon ?? true,
    },
  };
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  styleId: StyleId,
) {
  const theme = STYLE_THEME[styleId];
  ctx.fillStyle = theme.background;
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
  gradient.addColorStop(1, theme.vignette);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const inset = Math.max(8, Math.min(16, Math.floor(Math.min(width, height) * 0.03)));
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
}

function drawSky(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  styleId: StyleId,
  sky: VisibleSky | null,
  renderOptions?: MapRecipe["renderOptions"],
) {
  if (!sky) return;
  const theme = STYLE_THEME[styleId];

  if (renderOptions?.showConstellations ?? true) {
    drawConstellations(ctx, sky, theme.accent);
  }

  ctx.save();
  ctx.fillStyle = theme.star;
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 8;

  for (const star of sky.stars) {
    if (!Number.isFinite(star.x) || !Number.isFinite(star.y)) continue;
    const baseAlpha = brightnessFromMagnitude(star.magnitude);
    const alpha = clamp(baseAlpha * (star.opacity ?? 1), 0.05, 1);
    const radius = starRadiusFromMagnitude(star.magnitude);
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
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (renderOptions?.showMoon ?? true) {
    if (sky.moon && Number.isFinite(sky.moon.x) && Number.isFinite(sky.moon.y)) {
      drawMoon(ctx, sky.moon.x, sky.moon.y, theme.background, theme.star, theme.accent, sky.moon.phase);
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
) {
  const baseY = height * 0.72;
  const lineGap = 28;

  if (bounds) bounds.clear();

  textBoxes.forEach((box, index) => {
    ctx.font = `600 ${box.size}px ${FONT_STACKS[box.fontFamily]}`;
    ctx.fillStyle = box.color;
    ctx.textAlign = box.align;
    ctx.textBaseline = "middle";
    const px = clamp(box.position?.x ?? 0.5, 0, 1) * width;
    const py = clamp(box.position?.y ?? (baseY + index * lineGap) / height, 0, 1) * height;
    ctx.fillText(box.text, px, py);

    if (bounds) {
      const metrics = ctx.measureText(box.text);
      const textWidth = metrics.width;
      const textHeight = box.size * 1.2;
      let left = px;
      if (ctx.textAlign === "center") left = px - textWidth / 2;
      if (ctx.textAlign === "right") left = px - textWidth;
      const top = py - textHeight / 2;
      bounds.set(box.id, { x: left, y: top, width: textWidth, height: textHeight });
    }
  });
}

function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, show: boolean, styleId: StyleId) {
  if (!show) return;
  const theme = STYLE_THEME[styleId];
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.fillStyle = theme.star;
  ctx.globalAlpha = 0.06;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.min(width, height) * 0.12}px "Cinzel", serif`;
  ctx.fillText("PREVIEW", 0, 0);
  ctx.restore();
}

function drawConstellations(ctx: CanvasRenderingContext2D, sky: VisibleSky, accentColor: string) {
  if (!sky.constellations.length) return;
  ctx.save();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = 0.3;

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
) {
  const radius = 6;
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
