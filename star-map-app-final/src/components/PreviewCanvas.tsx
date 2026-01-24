"use client";

import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { aspectRatioToNumber, buildRecipeFromState, renderStarMap, clamp, type MapRecipe } from "@/lib/renderSky";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

type Props = {
  onRendered?: () => void;
  fullscreen?: boolean;
  readOnly?: boolean;
  /** When provided with readOnly=true, uses this recipe instead of global store state */
  externalRecipe?: MapRecipe;
};

// Debounce hook for expensive calculations
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export default function PreviewCanvas({ onRendered, fullscreen = false, readOnly = false, externalRecipe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const pendingDragRef = useRef<{ x: number; y: number } | null>(null);
  const dragActiveRef = useRef(false);
  const textBoundsRef = useRef<Map<string, { x: number; y: number; width: number; height: number }>>(
    new Map(),
  );
  const { selectedStyle, textBoxes, dateTime, location, renderOptions, paid, updateTextBox, aspectRatio, shape, previewFidelity } =
    useStore(
      useShallow((state) => ({
        selectedStyle: state.selectedStyle,
        textBoxes: state.textBoxes,
        dateTime: state.dateTime,
        location: state.location,
        renderOptions: state.renderOptions,
        paid: state.paid,
        aspectRatio: state.aspectRatio,
        shape: state.shape,
        updateTextBox: state.updateTextBox,
        previewFidelity: state.previewFidelity,
      })),
    );
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [activeBox, setActiveBox] = useState<string | null>(null);
  const [boxRect, setBoxRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Debounce astronomy-intensive state changes (date, location) to reduce CPU load
  // Text box changes render immediately for responsive drag feedback
  const debouncedDateTime = useDebounce(dateTime, 150);
  const debouncedLocation = useDebounce(location, 150);

  // Memoize the recipe to avoid recalculating when only render-related props change
  // When externalRecipe is provided (read-only mode), use it directly instead of store state
  const recipe = useMemo(
    () =>
      externalRecipe ??
      buildRecipeFromState({
        dateTime: debouncedDateTime,
        location: debouncedLocation,
        textBoxes,
        selectedStyle,
        renderOptions,
        aspectRatio,
        shape,
      }),
    [externalRecipe, debouncedDateTime, debouncedLocation, textBoxes, selectedStyle, renderOptions, aspectRatio, shape]
  );

  // Use external recipe's aspect ratio and shape when provided
  const effectiveAspectRatio = externalRecipe?.aspectRatio ?? aspectRatio;
  const effectiveShape = externalRecipe?.shape ?? shape;

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      const { width, height } = dimensions;
      const deviceRatio = window.devicePixelRatio || 1;
      const fidelityBoost = previewFidelity === "high" ? 2 : 1;
      const pixelRatio = Math.min(deviceRatio * fidelityBoost, 3);
      renderStarMap({
        recipe,
        canvas,
        width,
        height,
        watermark: !paid,
        quality: "preview",
        premium: paid,
        pixelRatio,
        textBounds: textBoundsRef.current,
      });
      if (activeBox) {
        const rect = textBoundsRef.current.get(activeBox);
        if (rect) setBoxRect(rect);
      }
      setIsLoading(false);
      onRendered?.();
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [dimensions, activeBox, recipe, paid, previewFidelity, onRendered]);

  useEffect(() => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlePointerDown = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const hit = hitTestText(textBoundsRef.current, x, y);
      if (hit) {
        // Prevent the page from scrolling when dragging on touch devices.
        event.preventDefault();
        dragRef.current = {
          id: hit.id,
          offsetX: x - hit.centerX,
          offsetY: y - hit.centerY,
        };
        dragActiveRef.current = false;
        setIsDragging(false);
        setActiveBox(hit.id);
        const rect = textBoundsRef.current.get(hit.id);
        if (rect) setBoxRect(rect);
        canvas.setPointerCapture(event.pointerId);
      } else {
        setActiveBox(null);
        setBoxRect(null);
        dragActiveRef.current = false;
        setIsDragging(false);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      // Prevent touchmove from being treated as a scroll on mobile.
      event.preventDefault();
      if (!dragActiveRef.current) {
        dragActiveRef.current = true;
        setIsDragging(true);
      }
      const bounds = canvas.getBoundingClientRect();
      pendingDragRef.current = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      if (dragRafRef.current) return;
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        const drag = dragRef.current;
        const pending = pendingDragRef.current;
        if (!drag || !pending || !canvas) return;

        // Recalculate bounds fresh each frame for accuracy
        const bounds = canvas.getBoundingClientRect();
        const centerX = pending.x - drag.offsetX;
        const centerY = pending.y - drag.offsetY;
        const newX = clamp(centerX / bounds.width, 0.05, 0.95);
        const newY = clamp(centerY / bounds.height, 0.1, 0.95);
        updateTextBox(drag.id, { position: { x: newX, y: newY } });
        const rect = textBoundsRef.current.get(drag.id);
        if (rect) setBoxRect(rect);
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragRef.current) {
        canvas.releasePointerCapture(event.pointerId);
      }
      dragRef.current = null;
      dragActiveRef.current = false;
      setIsDragging(false);
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
    };
  }, [readOnly, updateTextBox]);

  useEffect(() => {
    if (readOnly) return;
    const handleOutside = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!canvas.contains(event.target as Node)) {
        setActiveBox(null);
        setBoxRect(null);
        dragActiveRef.current = false;
        setIsDragging(false);
      }
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [readOnly]);

  return (
    <div
      ref={containerRef}
      aria-busy={isLoading}
      aria-label={readOnly ? "Star map preview" : "Star map preview - drag text boxes to reposition"}
      className={`relative overflow-hidden rounded-2xl shadow-2xl ${
        fullscreen
          ? "max-w-[90vmin] max-h-[90vmin] border-2 border-[#d7b56c]/80 shadow-black/40"
          : "w-full border-2 border-[#d7b56c]/80 shadow-black/20 min-h-[280px] sm:min-h-[360px] md:min-h-[420px] lg:min-h-[520px]"
      }`}
      style={{ aspectRatio: `${aspectRatioToNumber(effectiveAspectRatio)} / 1` }}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${
          readOnly ? "" : "touch-none"
        } ${isLoading ? "opacity-0" : "opacity-100 canvas-twinkle"}`}
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f24]">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              <div className="absolute inset-0 animate-ping rounded-full border border-amber-400/20" />
            </div>
            <span className="text-xs text-neutral-400 animate-pulse">Rendering stars...</span>
          </div>
        </div>
      )}
      {isDragging && (
        <div
          className={`pointer-events-none absolute inset-[7%] border border-dashed border-white/30 bg-white/5 ${
            effectiveShape === "circle" ? "rounded-full" : "rounded-2xl"
          }`}
        />
      )}
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
