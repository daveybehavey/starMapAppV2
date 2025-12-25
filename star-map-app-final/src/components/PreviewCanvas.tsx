"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildRecipeFromState, renderStarMap } from "@/lib/renderSky";
import { TextBox, useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

type Props = {
  onRendered?: () => void;
};

export default function PreviewCanvas({ onRendered }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const textBoundsRef = useRef<Map<string, { x: number; y: number; width: number; height: number }>>(
    new Map(),
  );
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [activeBox, setActiveBox] = useState<string | null>(null);
  const [boxRect, setBoxRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const { selectedStyle, textBoxes, dateTime, location, renderOptions, paid, updateTextBox } = useStore(
    useShallow((state) => ({
      selectedStyle: state.selectedStyle,
      textBoxes: state.textBoxes,
      dateTime: state.dateTime,
      location: state.location,
      renderOptions: state.renderOptions,
      paid: state.paid,
      updateTextBox: state.updateTextBox,
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
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const { width, height } = dimensions;
      const pixelRatio = window.devicePixelRatio || 1;
      const recipe = buildRecipeFromState({
        dateTime,
        location,
        textBoxes,
        selectedStyle,
        renderOptions,
      });
      renderStarMap({
        recipe,
        canvas,
        width,
        height,
        watermark: !paid,
        quality: "preview",
        pixelRatio,
        textBounds: textBoundsRef.current,
      });
      if (activeBox) {
        const rect = textBoundsRef.current.get(activeBox);
        if (rect) setBoxRect(rect);
      }
      onRendered?.();
    });
  }, [activeBox, dateTime, dimensions, location, onRendered, paid, renderOptions, selectedStyle, textBoxes]);

  useEffect(() => {
    scheduleDraw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlePointerDown = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const hit = hitTestText(textBoundsRef.current, x, y);
      if (hit) {
        dragRef.current = {
          id: hit.id,
          offsetX: x - hit.centerX,
          offsetY: y - hit.centerY,
        };
        setActiveBox(hit.id);
        const rect = textBoundsRef.current.get(hit.id);
        if (rect) setBoxRect(rect);
        canvas.setPointerCapture(event.pointerId);
      } else {
        setActiveBox(null);
        setBoxRect(null);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const bounds = canvas.getBoundingClientRect();
      const centerX = event.clientX - bounds.left - dragRef.current.offsetX;
      const centerY = event.clientY - bounds.top - dragRef.current.offsetY;
      const newX = clamp(centerX / bounds.width, 0.05, 0.95);
      const newY = clamp(centerY / bounds.height, 0.1, 0.95);
      updateTextBox(dragRef.current.id, { position: { x: newX, y: newY } });
      const rect = textBoundsRef.current.get(dragRef.current.id);
      if (rect) setBoxRect(rect);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragRef.current) {
        canvas.releasePointerCapture(event.pointerId);
      }
      dragRef.current = null;
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [updateTextBox]);

  useEffect(() => {
    const handleOutside = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!canvas.contains(event.target as Node)) {
        setActiveBox(null);
        setBoxRect(null);
      }
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-[460px] overflow-hidden rounded-2xl border border-black/5 bg-white/30 shadow-2xl shadow-black/20 sm:h-[540px] md:h-[620px]"
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {activeBox && boxRect && (
        <div
          className="pointer-events-none absolute rounded-md border border-amber-300/70 bg-amber-200/10 shadow-[0_0_0_1px_rgba(251,191,36,0.4)]"
          style={{
            left: boxRect.x - 6,
            top: boxRect.y - 6,
            width: boxRect.width + 12,
            height: boxRect.height + 12,
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-black/10" />
    </div>
  );
}

function hitTestText(
  bounds: Map<string, { x: number; y: number; width: number; height: number }>,
  x: number,
  y: number,
) {
  for (const [id, rect] of Array.from(bounds.entries()).reverse()) {
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      return { id, centerX: rect.x + rect.width / 2, centerY: rect.y + rect.height / 2 };
    }
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
