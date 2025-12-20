"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { computeVisibleStars, type VisibleSky } from "@/lib/astronomy";
import { StyleId, TextBox, useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

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

export default function PreviewCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef<VisibleSky | null>(null);
  const rafRef = useRef<number>();
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const { selectedStyle, textBoxes, dateTime, location, paid } = useStore(
    useShallow((state) => ({
      selectedStyle: state.selectedStyle,
      textBoxes: state.textBoxes,
      dateTime: state.dateTime,
      location: state.location,
      paid: state.paid,
    })),
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const scheduleDraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || dimensions.width === 0 || dimensions.height === 0) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const { width, height } = dimensions;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.save();
      ctx.scale(pixelRatio, pixelRatio);
      drawBackground(ctx, width, height, selectedStyle);
      drawSky(ctx, width, height, selectedStyle, skyRef.current);
      drawText(ctx, width, height, textBoxes);
      drawWatermark(ctx, width, height, paid, selectedStyle);
      ctx.restore();
    });
  }, [dimensions, paid, selectedStyle, textBoxes]);

  const recomputeSky = useCallback(() => {
    const { width, height } = dimensions;
    if (width === 0 || height === 0) return;
    const formatted = formatDateTimeForLocation(dateTime, location.timezone);
    if (!formatted) {
      skyRef.current = { stars: [], planets: [], moon: null, constellations: [] };
      scheduleDraw();
      return;
    }

    const visibleSky = computeVisibleStars(
      {
        date: formatted.date,
        time: formatted.time,
        lat: location.latitude,
        lon: location.longitude,
        bortle: 4.5,
        showConstellations: true,
      },
      width,
      height,
    );
    skyRef.current = visibleSky;
    scheduleDraw();
  }, [dateTime, dimensions, location.latitude, location.longitude, location.timezone, scheduleDraw]);

  useEffect(() => {
    recomputeSky();
  }, [recomputeSky]);

  useEffect(() => {
    scheduleDraw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleDraw]);

  return (
    <div
      ref={containerRef}
      className="relative h-[460px] overflow-hidden rounded-2xl border border-black/5 bg-white/30 shadow-2xl shadow-black/20 sm:h-[540px] md:h-[620px]"
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-black/10" />
    </div>
  );
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

  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, width - 40, height - 40);
}

function drawSky(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  styleId: StyleId,
  sky: VisibleSky | null,
) {
  if (!sky) return;
  const theme = STYLE_THEME[styleId];

  drawConstellations(ctx, sky, theme.accent);

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
  for (const planet of sky.planets) {
    if (!Number.isFinite(planet.x) || !Number.isFinite(planet.y)) continue;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(planet.x, planet.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (sky.moon && Number.isFinite(sky.moon.x) && Number.isFinite(sky.moon.y)) {
    drawMoon(ctx, sky.moon.x, sky.moon.y, theme.background, theme.star, theme.accent, sky.moon.phase);
  }

  ctx.restore();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  textBoxes: TextBox[],
) {
  const baseY = height * 0.72;
  const lineGap = 28;

  textBoxes.forEach((box, index) => {
    ctx.font = `600 ${box.size}px ${FONT_STACKS[box.fontFamily]}`;
    ctx.fillStyle = box.color;
    ctx.textAlign = box.align;
    ctx.textBaseline = "middle";
    const x =
      box.align === "left"
        ? width * 0.15
        : box.align === "right"
          ? width * 0.85
          : width * 0.5;
    const y = baseY + index * lineGap;
    ctx.fillText(box.text, x, y);
  });
}

function drawConstellations(
  ctx: CanvasRenderingContext2D,
  sky: VisibleSky,
  accentColor: string,
) {
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

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  paid: boolean,
  styleId: StyleId,
) {
  if (paid) return;
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

function formatDateTimeForLocation(dateTime: string, timeZone?: string) {
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
