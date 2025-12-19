"use client";

import { useEffect, useMemo, useRef } from "react";
import { StyleId, TextBox, useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

type Star = {
  x: number;
  y: number;
  brightness: number;
  radius: number;
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

export default function PreviewCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { selectedStyle, textBoxes, dateTime } = useStore(
    useShallow((state) => ({
      selectedStyle: state.selectedStyle,
      textBoxes: state.textBoxes,
      dateTime: state.dateTime,
    })),
  );

  const stars = useMemo(() => generateStars(650, 42), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const { width, height } = container.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.save();
      ctx.scale(pixelRatio, pixelRatio);
      drawBackground(ctx, width, height, selectedStyle);
      drawStars(ctx, width, height, selectedStyle, stars);
      drawText(ctx, width, height, textBoxes);
      ctx.restore();
    };

    render();
    window.addEventListener("resize", render);
    return () => window.removeEventListener("resize", render);
  }, [selectedStyle, textBoxes, dateTime, stars]);

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

function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  styleId: StyleId,
  stars: Star[],
) {
  const theme = STYLE_THEME[styleId];
  ctx.save();
  ctx.fillStyle = theme.star;
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 8;

  for (const star of stars) {
    const x = star.x * width;
    const y = star.y * height;
    ctx.globalAlpha = star.brightness;
    ctx.beginPath();
    ctx.arc(x, y, star.radius, 0, Math.PI * 2);
    ctx.fill();
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

function generateStars(count: number, seed = 1): Star[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const brightness = 0.35 + rand() * 0.65;
    const radius = 0.4 + rand() * 1.4;
    return {
      x: rand(),
      y: rand(),
      brightness,
      radius,
    };
  });
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
