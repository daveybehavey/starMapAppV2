"use client";

import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import {
  aspectRatioToNumber,
  buildRecipeFromState,
  renderStarMap,
  clamp,
  type MapRecipe,
} from "@/lib/renderSky";
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

export default function PreviewCanvas({
  onRendered,
  fullscreen = false,
  readOnly = false,
  externalRecipe,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const pendingDragRef = useRef<{ x: number; y: number } | null>(null);
  const dragBoundsRef = useRef<DOMRect | null>(null);
  const dragActiveRef = useRef(false);
  const textBoundsRef = useRef<Map<string, { x: number; y: number; width: number; height: number }>>(
    new Map()
  );
  const {
    selectedStyle,
    textBoxes,
    dateTime,
    location,
    renderOptions,
    paid,
    updateTextBox,
    aspectRatio,
    shape,
    previewFidelity,
  } = useStore(
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
    }))
  );
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [activeBox, setActiveBox] = useState<string | null>(null);
  const [boxRect, setBoxRect] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  );
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
    [
      externalRecipe,
      debouncedDateTime,
      debouncedLocation,
      textBoxes,
      selectedStyle,
      renderOptions,
      aspectRatio,
      shape,
    ]
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
      // Drag updates happen frequently, so reduce resolution while dragging for smoother mobile interaction.
      const pixelRatio = isDragging ? 1 : Math.min(deviceRatio * fidelityBoost, 3);
      renderStarMap({
        recipe,
        canvas,
        width,
        height,
        watermark: !paid,
        quality: "preview",
        premium: isDragging ? false : paid,
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
  }, [dimensions, activeBox, recipe, paid, previewFidelity, isDragging, onRendered]);

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
        pendingDragRef.current = { x, y };
        dragBoundsRef.current = bounds;
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
      const bounds = dragBoundsRef.current ?? canvas.getBoundingClientRect();
      pendingDragRef.current = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      if (dragRafRef.current) return;
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        const drag = dragRef.current;
        const pending = pendingDragRef.current;
        const dragBounds = dragBoundsRef.current;
        if (!drag || !pending || !canvas || !dragBounds) return;

        const centerX = pending.x - drag.offsetX;
        const centerY = pending.y - drag.offsetY;
        const rect = textBoundsRef.current.get(drag.id);
        const { x: newX, y: newY } = clampPositionToCanvas(centerX, centerY, dragBounds, rect);
        updateTextBox(drag.id, { position: { x: newX, y: newY } });
        const nextRect = textBoundsRef.current.get(drag.id);
        if (nextRect) setBoxRect(nextRect);
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!dragRef.current) return;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      dragRef.current = null;
      pendingDragRef.current = null;
      dragBoundsRef.current = null;
      dragActiveRef.current = false;
      setIsDragging(false);
    };

    canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
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
          ? "max-h-[90vmin] max-w-[90vmin] border-2 border-[#d7b56c]/80 shadow-black/40"
          : "min-h-[280px] w-full border-2 border-[#d7b56c]/80 shadow-black/20 sm:min-h-[360px] md:min-h-[420px] lg:min-h-[520px]"
      }`}
      style={{ aspectRatio: `${aspectRatioToNumber(effectiveAspectRatio)} / 1` }}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
          readOnly ? "" : "touch-none"
        } ${isLoading ? "opacity-0" : "canvas-twinkle opacity-100"}`}
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f24]">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              <div className="absolute inset-0 animate-ping rounded-full border border-amber-400/20" />
            </div>
            <span className="animate-pulse text-xs text-neutral-400">Rendering stars...</span>
          </div>
        </div>
      )}
      {isDragging && (
        <div
          className={`pointer-events-none absolute inset-[2%] border border-dashed border-white/30 bg-white/5 ${
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

function clampPositionToCanvas(
  centerX: number,
  centerY: number,
  bounds: Pick<DOMRect, "width" | "height">,
  textRect?: { width: number; height: number }
) {
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const halfWidth = textRect ? textRect.width / (width * 2) : 0;
  const halfHeight = textRect ? textRect.height / (height * 2) : 0;
  const minX = clamp(halfWidth, 0, 0.5);
  const maxX = clamp(1 - halfWidth, 0.5, 1);
  const minY = clamp(halfHeight, 0, 0.5);
  const maxY = clamp(1 - halfHeight, 0.5, 1);
  return {
    x: clamp(centerX / width, minX, maxX),
    y: clamp(centerY / height, minY, maxY),
  };
}

function hitTestText(
  bounds: Map<string, { x: number; y: number; width: number; height: number }>,
  x: number,
  y: number
) {
  for (const [id, rect] of Array.from(bounds.entries()).reverse()) {
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      return { id, centerX: rect.x + rect.width / 2, centerY: rect.y + rect.height / 2 };
    }
  }
  return null;
}
