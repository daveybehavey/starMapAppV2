"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  aspectRatioToNumber,
  buildRecipeFromState,
  renderStarMap,
  renderStarMapTextLayer,
  clamp,
  type MapRecipe,
} from "@/lib/renderSky";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { useAstronomyWorker } from "@/hooks/useAstronomyWorker";

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

const SNAP_THRESHOLD = 0.012;
const STANDARD_PREVIEW_PIXEL_BUDGET = 4_400_000;
const HIGH_PREVIEW_PIXEL_BUDGET = 7_200_000;
const DRAG_PREVIEW_PIXEL_BUDGET = 2_200_000;

function clampPixelRatioToBudget(
  width: number,
  height: number,
  targetRatio: number,
  pixelBudget: number,
) {
  if (width <= 0 || height <= 0) return 1;
  const maxRatioForBudget = Math.sqrt(pixelBudget / (width * height));
  return clamp(targetRatio, 1, Math.max(1, maxRatioForBudget));
}

function resolvePreviewPixelRatio({
  width,
  height,
  previewFidelity,
  isDragging,
}: {
  width: number;
  height: number;
  previewFidelity: "standard" | "high";
  isDragging: boolean;
}) {
  const deviceRatio = window.devicePixelRatio || 1;
  const fidelityFloor = previewFidelity === "high" ? 2 : 1.5;
  const fidelityCap = previewFidelity === "high" ? 3 : 2.25;
  const pixelBudget = isDragging
    ? DRAG_PREVIEW_PIXEL_BUDGET
    : previewFidelity === "high"
      ? HIGH_PREVIEW_PIXEL_BUDGET
      : STANDARD_PREVIEW_PIXEL_BUDGET;
  const targetRatio = isDragging
    ? Math.min(deviceRatio, 1.1)
    : Math.min(Math.max(deviceRatio, fidelityFloor), fidelityCap);
  return clampPixelRatioToBudget(width, height, targetRatio, pixelBudget);
}

export default function PreviewCanvas({
  onRendered,
  fullscreen = false,
  readOnly = false,
  externalRecipe,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const pendingDragRef = useRef<{ x: number; y: number } | null>(null);
  const dragBoundsRef = useRef<DOMRect | null>(null);
  const dragPreviewRef = useRef<{ id: string; x: number; y: number } | null>(null);
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
  const [dragPreviewPosition, setDragPreviewPosition] = useState<{ id: string; x: number; y: number } | null>(
    null
  );
  const [snapGuides, setSnapGuides] = useState<{ vertical: boolean; horizontal: boolean }>({
    vertical: false,
    horizontal: false,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const directEditInputRef = useRef<HTMLInputElement>(null);

  // Debounce astronomy-intensive state changes (date, location) to reduce CPU load
  // Text box changes render immediately for responsive drag feedback
  const debouncedDateTime = useDebounce(dateTime, 150);
  const debouncedLocation = useDebounce(location, 150);
  const effectiveTextBoxes = useMemo(() => {
    if (!dragPreviewPosition) return textBoxes;
    return textBoxes.map((box) =>
      box.id === dragPreviewPosition.id
        ? { ...box, position: { x: dragPreviewPosition.x, y: dragPreviewPosition.y } }
        : box
    );
  }, [dragPreviewPosition, textBoxes]);

  const textLayerBoxes = useMemo(
    () => (externalRecipe ? externalRecipe.textBoxes : effectiveTextBoxes),
    [effectiveTextBoxes, externalRecipe],
  );

  useEffect(() => {
    dragPreviewRef.current = dragPreviewPosition;
  }, [dragPreviewPosition]);

  const activeTextBox = useMemo(
    () => textBoxes.find((box) => box.id === activeBox) ?? null,
    [activeBox, textBoxes]
  );

  // Build a text-free base recipe so dragging/editing text does not force full sky redraws.
  // When externalRecipe is provided (read-only mode), use it directly.
  const baseRecipe = useMemo(
    () =>
      externalRecipe ??
      buildRecipeFromState({
        dateTime: debouncedDateTime,
        location: debouncedLocation,
        textBoxes: [],
        selectedStyle,
        renderOptions,
        aspectRatio,
        shape,
      }),
    [
      externalRecipe,
      debouncedDateTime,
      debouncedLocation,
      selectedStyle,
      renderOptions,
      aspectRatio,
      shape,
    ]
  );

  // Use external recipe's aspect ratio and shape when provided
  const effectiveAspectRatio = externalRecipe?.aspectRatio ?? aspectRatio;
  const effectiveShape = externalRecipe?.shape ?? shape;
  const skyHeight = useMemo(() => {
    if (dimensions.height > 0) return Math.round(dimensions.height);
    if (dimensions.width > 0) {
      return Math.max(1, Math.round(dimensions.width / aspectRatioToNumber(effectiveAspectRatio)));
    }
    return 0;
  }, [dimensions.height, dimensions.width, effectiveAspectRatio]);
  const skyWorkerInput = useMemo(
    () => ({
      dateTime: baseRecipe.datetimeISO,
      location: {
        latitude: baseRecipe.location.latitude,
        longitude: baseRecipe.location.longitude,
        timezone: baseRecipe.location.timezone,
      },
      width: Math.max(0, Math.round(dimensions.width)),
      height: Math.max(0, skyHeight),
      showConstellations: baseRecipe.renderOptions?.constellationLines !== "off",
      enabled: true,
    }),
    [
      dimensions.width,
      baseRecipe.datetimeISO,
      baseRecipe.location.latitude,
      baseRecipe.location.longitude,
      baseRecipe.location.timezone,
      baseRecipe.renderOptions?.constellationLines,
      skyHeight,
    ],
  );
  const { sky: workerSky, pending: skyPending, supported: skySupported, error: skyWorkerError } =
    useAstronomyWorker(skyWorkerInput);
  const shouldSkipMainThreadSkyCompute =
    skySupported && !skyWorkerError && workerSky !== null;

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
    const canvas = baseCanvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;
    if (skySupported && skyPending && !workerSky) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      const { width, height } = dimensions;
      const pixelRatio = resolvePreviewPixelRatio({
        width,
        height,
        previewFidelity,
        isDragging: false,
      });
      renderStarMap({
        recipe: baseRecipe,
        canvas,
        width,
        height,
        watermark: !paid,
        // Keep editor preview visually aligned with purchased exports (no preview-only grain/sparkle).
        quality: "export",
        premium: paid,
        pixelRatio,
        skyOverride: workerSky,
        skipSkyCompute: shouldSkipMainThreadSkyCompute,
        includeText: false,
      });
      setIsLoading(false);
      onRendered?.();
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    dimensions,
    baseRecipe,
    paid,
    previewFidelity,
    onRendered,
    skyPending,
    shouldSkipMainThreadSkyCompute,
    skySupported,
    workerSky,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;
    const { width, height } = dimensions;
    const pixelRatio = resolvePreviewPixelRatio({
      width,
      height,
      previewFidelity,
      isDragging,
    });
    renderStarMapTextLayer({
      canvas,
      width,
      height,
      textBoxes: textLayerBoxes,
      pixelRatio,
      textBounds: textBoundsRef.current,
    });
    if (activeBox) {
      const rect = textBoundsRef.current.get(activeBox);
      if (rect) {
        setBoxRect((current) => {
          if (
            current &&
            Math.abs(current.x - rect.x) < 0.4 &&
            Math.abs(current.y - rect.y) < 0.4 &&
            Math.abs(current.width - rect.width) < 0.4 &&
            Math.abs(current.height - rect.height) < 0.4
          ) {
            return current;
          }
          return rect;
        });
      }
    }
  }, [dimensions, textLayerBoxes, activeBox, previewFidelity, isDragging]);

  useEffect(() => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary) return;
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
          pointerId: event.pointerId,
        };
        pendingDragRef.current = { x, y };
        dragBoundsRef.current = bounds;
        dragActiveRef.current = false;
        setIsDragging(false);
        setSnapGuides({ vertical: false, horizontal: false });
        setActiveBox(hit.id);
        const rect = textBoundsRef.current.get(hit.id);
        if (rect) setBoxRect(rect);
        canvas.setPointerCapture(event.pointerId);
      } else {
        setActiveBox(null);
        setBoxRect(null);
        setDragPreviewPosition(null);
        dragActiveRef.current = false;
        setIsDragging(false);
        setSnapGuides({ vertical: false, horizontal: false });
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      const drag = dragRef.current;
      if (!drag) return;
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
        const activeDrag = dragRef.current;
        const pending = pendingDragRef.current;
        const dragBounds = dragBoundsRef.current;
        if (!activeDrag || !pending || !canvas || !dragBounds) return;

        const centerX = pending.x - activeDrag.offsetX;
        const centerY = pending.y - activeDrag.offsetY;
        const rect = textBoundsRef.current.get(activeDrag.id);
        const { x: clampedX, y: clampedY } = clampPositionToCanvas(centerX, centerY, dragBounds, rect);
        const snapVertical = Math.abs(clampedX - 0.5) <= SNAP_THRESHOLD;
        const snapHorizontal = Math.abs(clampedY - 0.5) <= SNAP_THRESHOLD;
        const newX = snapVertical ? 0.5 : clampedX;
        const newY = snapHorizontal ? 0.5 : clampedY;
        setSnapGuides((current) =>
          current.vertical === snapVertical && current.horizontal === snapHorizontal
            ? current
            : { vertical: snapVertical, horizontal: snapHorizontal }
        );
        setDragPreviewPosition((current) => {
          if (
            current &&
            current.id === activeDrag.id &&
            Math.abs(current.x - newX) < 0.0005 &&
            Math.abs(current.y - newY) < 0.0005
          ) {
            return current;
          }
          return { id: activeDrag.id, x: newX, y: newY };
        });
        const nextRect = textBoundsRef.current.get(activeDrag.id);
        if (nextRect) {
          setBoxRect((current) => {
            if (
              current &&
              Math.abs(current.x - nextRect.x) < 0.4 &&
              Math.abs(current.y - nextRect.y) < 0.4 &&
              Math.abs(current.width - nextRect.width) < 0.4 &&
              Math.abs(current.height - nextRect.height) < 0.4
            ) {
              return current;
            }
            return nextRect;
          });
        }
      });
    };

    const handlePointerUp = () => {
      if (!dragRef.current) return;
      if (canvas.hasPointerCapture(dragRef.current.pointerId)) {
        canvas.releasePointerCapture(dragRef.current.pointerId);
      }
      if (
        dragActiveRef.current &&
        dragPreviewRef.current &&
        dragPreviewRef.current.id === dragRef.current.id
      ) {
        updateTextBox(dragRef.current.id, {
          position: { x: dragPreviewRef.current.x, y: dragPreviewRef.current.y },
        });
      }

      dragRef.current = null;
      pendingDragRef.current = null;
      dragBoundsRef.current = null;
      setDragPreviewPosition(null);
      dragActiveRef.current = false;
      setIsDragging(false);
      setSnapGuides({ vertical: false, horizontal: false });
    };

    canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
    canvas.addEventListener("pointermove", handlePointerMove, { passive: false });
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
    };
  }, [readOnly, updateTextBox]);

  const nudgeActiveTextBox = useCallback((deltaX: number, deltaY: number) => {
    if (readOnly || !activeBox) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const rect = textBoundsRef.current.get(activeBox);
    const currentBox = textBoxes.find((box) => box.id === activeBox);
    if (!currentBox) return;

    const fallbackCenterX = clamp(currentBox.position?.x ?? 0.5, 0, 1) * Math.max(bounds.width, 1);
    const fallbackCenterY = clamp(currentBox.position?.y ?? 0.5, 0, 1) * Math.max(bounds.height, 1);
    const centerX = rect ? rect.x + rect.width / 2 : fallbackCenterX;
    const centerY = rect ? rect.y + rect.height / 2 : fallbackCenterY;
    const { x, y } = clampPositionToCanvas(centerX + deltaX, centerY + deltaY, bounds, rect);

    updateTextBox(activeBox, { position: { x, y } });
    setDragPreviewPosition(null);
    const nextRect = textBoundsRef.current.get(activeBox);
    if (nextRect) setBoxRect(nextRect);
  }, [activeBox, readOnly, textBoxes, updateTextBox]);

  useEffect(() => {
    if (readOnly || !activeBox) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTypingTarget =
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT";

      if (event.key === "Escape") {
        setActiveBox(null);
        setBoxRect(null);
        setDragPreviewPosition(null);
        dragActiveRef.current = false;
        setIsDragging(false);
        setSnapGuides({ vertical: false, horizontal: false });
        return;
      }

      if (event.key === "Enter" && !isTypingTarget) {
        event.preventDefault();
        directEditInputRef.current?.focus();
        directEditInputRef.current?.select();
        return;
      }

      if (isTypingTarget || event.metaKey || event.ctrlKey || event.altKey) return;

      const step = event.shiftKey ? 10 : 4;
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          nudgeActiveTextBox(0, -step);
          break;
        case "ArrowDown":
          event.preventDefault();
          nudgeActiveTextBox(0, step);
          break;
        case "ArrowLeft":
          event.preventDefault();
          nudgeActiveTextBox(-step, 0);
          break;
        case "ArrowRight":
          event.preventDefault();
          nudgeActiveTextBox(step, 0);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeBox, nudgeActiveTextBox, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    const handleOutside = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (!container.contains(event.target as Node)) {
        setActiveBox(null);
        setBoxRect(null);
        setDragPreviewPosition(null);
        dragActiveRef.current = false;
        setIsDragging(false);
        setSnapGuides({ vertical: false, horizontal: false });
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
        ref={baseCanvasRef}
        className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500 ${
          isLoading ? "opacity-0" : `${readOnly ? "canvas-twinkle " : ""}opacity-100`
        }`}
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
          readOnly ? "pointer-events-none" : "touch-none"
        } ${isLoading ? "opacity-0" : "opacity-100"}`}
        style={{ touchAction: readOnly ? "auto" : "none" }}
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
      {isDragging && snapGuides.vertical && (
        <div className="pointer-events-none absolute inset-y-[6%] left-1/2 z-[2] w-px -translate-x-1/2 bg-amber-300/65" />
      )}
      {isDragging && snapGuides.horizontal && (
        <div className="pointer-events-none absolute inset-x-[6%] top-1/2 z-[2] h-px -translate-y-1/2 bg-amber-300/65" />
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
      {activeTextBox && !readOnly && (
        <div className="absolute inset-x-3 bottom-3 z-10 rounded-2xl border border-white/15 bg-[#081122]/88 p-3 text-white shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur md:inset-x-auto md:right-3 md:w-[320px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/75">
                Selected text
              </p>
              <p className="mt-1 text-sm font-semibold text-white">{activeTextBox.label}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveBox(null);
                setBoxRect(null);
                setDragPreviewPosition(null);
              }}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              Done
            </button>
          </div>
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <label
                htmlFor={`direct-text-input-${activeTextBox.id}`}
                className="text-[11px] font-medium text-white/70"
              >
                Edit {activeTextBox.label} text
              </label>
              <input
                ref={directEditInputRef}
                id={`direct-text-input-${activeTextBox.id}`}
                type="text"
                value={activeTextBox.text}
                onChange={(event) => updateTextBox(activeTextBox.id, { text: event.target.value })}
                className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div />
              <button
                type="button"
                aria-label={`Nudge ${activeTextBox.label} up`}
                onClick={() => nudgeActiveTextBox(0, -4)}
                className="rounded-xl border border-white/15 bg-white/6 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                ↑
              </button>
              <div />
              <button
                type="button"
                aria-label={`Nudge ${activeTextBox.label} left`}
                onClick={() => nudgeActiveTextBox(-4, 0)}
                className="rounded-xl border border-white/15 bg-white/6 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                ←
              </button>
              <button
                type="button"
                aria-label={`Nudge ${activeTextBox.label} down`}
                onClick={() => nudgeActiveTextBox(0, 4)}
                className="rounded-xl border border-white/15 bg-white/6 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Nudge ${activeTextBox.label} right`}
                onClick={() => nudgeActiveTextBox(4, 0)}
                className="rounded-xl border border-white/15 bg-white/6 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                →
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-white/62">
              Drag directly on the preview, or use arrow keys to nudge. Hold Shift for bigger moves. Press Enter to
              focus the text field.
            </p>
          </div>
        </div>
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
  const padding = 18;
  for (const [id, rect] of Array.from(bounds.entries()).reverse()) {
    if (
      x >= rect.x - padding &&
      x <= rect.x + rect.width + padding &&
      y >= rect.y - padding &&
      y <= rect.y + rect.height + padding
    ) {
      return { id, centerX: rect.x + rect.width / 2, centerY: rect.y + rect.height / 2 };
    }
  }
  return null;
}
