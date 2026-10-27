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
import { resolveTextFitFrameEnabled } from "@/lib/mapLookTiers";
import { resolveShapeMaskFootprint } from "@/lib/shapeLayout";
import { resolveShapeTextProfile } from "@/lib/shapeTextProfile";
import {
  clampTextCenterToShape,
  resolveTextAnchorToCenterX,
  resolveTextCenterToAnchorX,
} from "@/lib/textFit";
import { hitTestText } from "@/lib/textHitTest";
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
  // Shape/frame state the drag clamp bounds against, kept in a ref so
  // the pointer handlers (registered once) always read the current
  // values. Synced by the effect below once effectiveShape/baseRecipe
  // exist.
  const dragShapeLayoutRef = useRef<{ shape?: string; frameEnabled: boolean; shapeLayoutVersion?: number }>({
    shape: undefined,
    frameEnabled: true,
  });
  // Id of a box whose position the keyboard nudge or the pointer-up
  // commit just stored, pending the freshness recheck in the
  // text-layer effect below. Those paths clamp with the glyph rect
  // rendered at the box's PREVIOUS row, but the diamond fit is
  // row-dependent — a box moved toward the wider middle re-renders
  // wider — so the stored position is re-clamped once the text
  // layer has rendered bounds FOR that stored position. The effect
  // clears the flag when the recheck runs.
  const pendingShapeRecheckRef = useRef<string | null>(null);
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
    return textBoxes.map((box) => {
      if (box.id !== dragPreviewPosition.id) return box;
      // dragPreviewPosition is the glyph CENTRE (the pointer grabs
      // the glyph by its centre and both drag clamps work in centre
      // space), but box.position.x is the renderer's alignment
      // ANCHOR — convert centre -> anchor with the box's align and
      // rendered width before substituting, or the preview itself
      // draws a left-aligned glyph half a width right of the
      // pointer (right: mirrored). The width comes from boxRect:
      // the dragged box's rendered rect, which the pointer handlers
      // set at drag start and refresh on every move frame from the
      // same bounds the drag clamp uses. Only its WIDTH feeds the
      // conversion (the fit can widen the glyph when its row
      // changes mid-drag; the next move frame's refresh corrects
      // with the new width, and the commit + recheck guarantee the
      // stored position). Before any rect exists, the helper
      // converts by 0 (degenerate = identity). y is a centre in
      // both spaces (baseline "middle") and never converts.
      return {
        ...box,
        position: {
          x: resolveTextCenterToAnchorX(
            dragPreviewPosition.x,
            box.align,
            boxRect?.width ?? 0,
            dimensions.width,
          ),
          y: dragPreviewPosition.y,
        },
      };
    });
  }, [dragPreviewPosition, textBoxes, dimensions.width, boxRect]);

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

  // Keep the drag clamp's shape/frame inputs current. The frame
  // derivation is the same one the text layer renders with (below):
  // a transparent mat draws no frame, so drags must not clamp against
  // the frame's inset either.
  useEffect(() => {
    dragShapeLayoutRef.current = {
      shape: effectiveShape,
      frameEnabled: resolveTextFitFrameEnabled("preview", baseRecipe?.renderOptions),
      // #406: the diamond drag clamp must run in the same mask space
      // the render fits against — the design's persisted layout.
      shapeLayoutVersion: baseRecipe?.renderOptions?.shapeLayoutVersion,
    };
  }, [effectiveShape, baseRecipe]);

  // Shape-aware second stage of the drag clamp: clampPositionToCanvas
  // keeps the glyph rect on the canvas; this keeps it inside the
  // shape's print-safe region (diamond mask, rectangle frame) using
  // the rect the latest render recorded — the same rect hit testing
  // uses. Without a rendered rect there is nothing to bound against,
  // so the canvas-clamped position stands.
  const clampDragCenter = (
    center: { x: number; y: number },
    rect: { width: number; height: number } | undefined,
    bounds: Pick<DOMRect, "width" | "height">
  ) => {
    if (!rect) return center;
    return clampTextCenterToShape(center, {
      shape: dragShapeLayoutRef.current.shape,
      frameEnabled: dragShapeLayoutRef.current.frameEnabled,
      // #406: resolved here, at the clamp's own canvas size, from the
      // design's layout version (null = legacy canvas-space clamp).
      shapeMaskFootprint: resolveShapeMaskFootprint(
        Math.max(bounds.width, 1),
        Math.max(bounds.height, 1),
        dragShapeLayoutRef.current.shapeLayoutVersion,
      ),
      // #407: the heart/star clamp keeps the glyph rect inside the
      // mask, from the same interior profile the fit uses.
      shapeTextProfile: resolveShapeTextProfile(dragShapeLayoutRef.current.shape),
      rectWidthPx: rect.width,
      rectHeightPx: rect.height,
      width: Math.max(bounds.width, 1),
      height: Math.max(bounds.height, 1),
    });
  };
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
        // #413: the watermark is NOT painted on this base canvas. The
        // text-overlay canvas stacks above it, so a base-canvas mark
        // could be covered by customer text; the text-layer pass below
        // paints the mark last, above the text (SQ-55 composition
        // order). Single-canvas renders (exports, share image) still
        // draw it inside renderStarMap, after their text.
        watermark: false,
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
      shape: effectiveShape,
      // Same derivation renderStarMap feeds its own drawText call (the
      // base render above runs with the default "preview" mat purpose):
      // a transparent mat draws no frame, so the overlay must not fit
      // text against the frame's inset either.
      frameEnabled: resolveTextFitFrameEnabled("preview", baseRecipe?.renderOptions),
      // #406: the overlay's fit + watermark mask follow the design's
      // shape layout, exactly as the base render resolves it from the
      // same recipe.
      shapeLayoutVersion: baseRecipe?.renderOptions?.shapeLayoutVersion,
      // #413 paid-state fence: the existing `!paid` wiring, unchanged —
      // when the authoritative entitlement state resolves paid, this
      // effect re-runs (paid is a dependency below) and the overlay
      // repaints without the mark; unpaid, the mark returns.
      watermark: !paid,
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
    // Freshness recheck (independent gate P1 on PR #345): the nudge
    // and the pointer-up commit clamp a destination with the glyph
    // rect rendered at the box's PREVIOUS row. On the diamond the
    // fit is row-dependent (drawText fits a line to the mask width
    // across its own span), so a box moved toward the wider middle
    // re-renders WIDER than the rect its position was clamped with,
    // and the wider rect can spill at the stored position — which is
    // what export renders. The bounds written by the render above
    // are the first ones that describe the STORED position, so
    // re-clamp the just-committed box against them here.
    //
    // Termination is structural AND mathematical. Structural: the
    // flag is cleared before any corrective write, so exactly one
    // corrective pass runs per commit — the correction re-renders
    // with the flag already null. Mathematical: one pass lands on a
    // clamp fixed point, so a second pass would be a no-op anyway.
    // The rendered rect depends only on the centre row (for every
    // other shape it is row-independent, so staleness cannot arise
    // there at all): a correction that keeps the row keeps the rect
    // and satisfies the clamp for it by construction; a correction
    // that moves the row does so only toward a band edge, where the
    // lateral slack collapses to zero (a centred line fitted by the
    // fit itself is always contained) or in a regime whose rect is
    // row-independent (fit floor / full size).
    //
    // Eligibility is deliberately NOT "no externalRecipe". What
    // makes the recheck sound is that the bounds just written
    // describe the STORED position, and the checks below establish
    // exactly that: the id resolves to a store box, this display
    // renders that box, and the rendered position IS the stored
    // position. An externalRecipe whose boxes are the store's own
    // satisfies all three — interactive SimplifiedEditor derives
    // its recipe from the store's textBoxes — and needs the recheck
    // exactly as much as a store-driven canvas; excluding recipes
    // wholesale left the stale-rect spill reachable there. A
    // genuinely foreign recipe is only ever displayed read-only
    // (ViewClient), where the commit paths are readOnly-gated and
    // never set the flag; the readOnly branch below clears any
    // outstanding flag regardless. Every path that cannot soundly
    // correct clears the flag, so it can never spin unconsumed.
    const recheckId = pendingShapeRecheckRef.current;
    if (recheckId) {
      if (readOnly) {
        // A read-only display is not the store's to correct, and
        // its commit paths never set the flag in the first place.
        // Clear defensively so an outstanding flag can never linger
        // across a mode switch on this canvas instance (e.g.
        // SimplifiedEditor entering sample mode without a remount).
        pendingShapeRecheckRef.current = null;
      } else {
        const rendered = textLayerBoxes.find((box) => box.id === recheckId);
        const stored = textBoxes.find((box) => box.id === recheckId);
        if (!stored || !rendered || !stored.position || !rendered.position) {
          // Nothing sound to correct against, and no later render
          // from this display source will provide it: either the id
          // is not a store box (the sample-fallback ids a
          // SimplifiedEditor preview renders from its recipe while
          // the store is empty — updateTextBox no-ops on them), or
          // this display does not render the box at the stored
          // position at all. Clear rather than spin.
          pendingShapeRecheckRef.current = null;
        } else if (
          rendered.position.x === stored.position.x &&
          rendered.position.y === stored.position.y
        ) {
          // What was just rendered IS the stored position (no drag
          // preview substituting another position for this box), so
          // the fresh bounds are a sound basis for correcting it.
          // When a preview IS substituting, keep the flag: the render
          // that follows the preview clearing runs this again.
          pendingShapeRecheckRef.current = null;
          const freshRect = textBoundsRef.current.get(recheckId);
          if (freshRect) {
            // The stored position.x is the renderer's drawing
            // ANCHOR, not the glyph centre the shape clamp works
            // in (gate P2): drawText fills at position.x with
            // ctx.textAlign = the box's align, so for left/right
            // alignment anchor and centre differ by half the
            // rendered width. Convert anchor -> centre before
            // clamping and centre -> anchor before storing, or
            // the recheck moves contained aligned boxes and lets
            // others spill. (The drag, commit and nudge paths
            // clamp centres derived from the bounds rect itself,
            // so their CLAMPS need no conversion — but all three
            // convert centre -> anchor before PERSISTING, since
            // what they store is this same anchor field. E-3 was
            // exactly that missing conversion.)
            const clampedCenter = clampDragCenter(
              {
                x: resolveTextAnchorToCenterX(
                  stored.position.x,
                  stored.align,
                  freshRect.width,
                  width,
                ),
                y: stored.position.y,
              },
              freshRect,
              { width, height }
            );
            const corrected = {
              x: resolveTextCenterToAnchorX(
                clampedCenter.x,
                stored.align,
                freshRect.width,
                width,
              ),
              y: clampedCenter.y,
            };
            if (corrected.x !== stored.position.x || corrected.y !== stored.position.y) {
              updateTextBox(recheckId, { position: corrected });
            }
          }
        }
      }
    }
  }, [
    dimensions,
    textLayerBoxes,
    activeBox,
    previewFidelity,
    isDragging,
    textBoxes,
    updateTextBox,
    readOnly,
    paid,
  ]);

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
        if (event.detail >= 2) {
          setActiveBox(hit.id);
          const rect = textBoundsRef.current.get(hit.id);
          if (rect) setBoxRect(rect);
          dragRef.current = null;
          pendingDragRef.current = null;
          dragBoundsRef.current = null;
          dragActiveRef.current = false;
          setIsDragging(false);
          setDragPreviewPosition(null);
          setSnapGuides({ vertical: false, horizontal: false });
          requestAnimationFrame(() => {
            directEditInputRef.current?.focus();
            directEditInputRef.current?.select();
          });
          return;
        }
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
        const { x: clampedX, y: clampedY } = clampDragCenter(
          clampPositionToCanvas(centerX, centerY, dragBounds, rect),
          rect,
          dragBounds
        );
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
        // Re-clamp the commit against the glyph rect as rendered at
        // the preview position: a box whose fitted width changed
        // mid-drag (its row's fit bound changed) is stored at a
        // position clamped for the size it rendered at in preview.
        // That rect still predates the commit's own row whenever
        // the clamp itself moves the box (and the final preview
        // frame may not have rendered at all when pointer-up lands
        // first), so flag the box for the text-layer effect's
        // post-render recheck — the containment guarantee is final
        // only once bounds rendered FOR the stored position have
        // clamped it.
        const preview = dragPreviewRef.current;
        const commitRect = textBoundsRef.current.get(dragRef.current.id);
        const commitBounds = dragBoundsRef.current ?? canvas.getBoundingClientRect();
        const committed = clampDragCenter(preview, commitRect, commitBounds);
        // `committed` is the glyph CENTRE (both drag clamps work
        // in centre space); the store's position.x is the
        // renderer's alignment ANCHOR. Convert centre -> anchor
        // with the box's align and the commit rect's width before
        // persisting, or the stored value renders a left-aligned
        // glyph half a width right of the drop point (right:
        // mirrored) — and the post-render recheck cannot repair
        // it, because its anchor -> centre -> clamp -> anchor
        // round trip is the identity on a wrongly stored centre.
        // The align is read from the store directly: this handler
        // is registered once and its closure's textBoxes snapshot
        // is not the dragged box's current row. commitRect is the
        // rect rendered at the preview position — the same rect
        // the clamp just used, so the width matches the size the
        // position was clamped for (the recheck handles any later
        // row-fit change). y is a centre in both spaces.
        const commitBox = useStore
          .getState()
          .textBoxes.find((box) => box.id === dragRef.current?.id);
        updateTextBox(dragRef.current.id, {
          position: {
            x: resolveTextCenterToAnchorX(
              committed.x,
              commitBox?.align,
              commitRect?.width ?? 0,
              commitBounds.width,
            ),
            y: committed.y,
          },
        });
        pendingShapeRecheckRef.current = dragRef.current.id;
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

    // The nudge math works in glyph-CENTRE space. With no rendered
    // rect to take the centre from, derive it from the stored
    // position — which is the alignment ANCHOR, not a centre — via
    // resolveTextAnchorToCenterX. Without a rect there is no width
    // to convert with, so this reduces to the identity today; it
    // states the semantics explicitly instead of reading the
    // anchor as if it were a centre.
    const fallbackCenterX =
      clamp(
        resolveTextAnchorToCenterX(
          currentBox.position?.x ?? 0.5,
          currentBox.align,
          0,
          Math.max(bounds.width, 1),
        ),
        0,
        1,
      ) * Math.max(bounds.width, 1);
    const fallbackCenterY = clamp(currentBox.position?.y ?? 0.5, 0, 1) * Math.max(bounds.height, 1);
    const centerX = rect ? rect.x + rect.width / 2 : fallbackCenterX;
    const centerY = rect ? rect.y + rect.height / 2 : fallbackCenterY;
    const { x, y } = clampDragCenter(
      clampPositionToCanvas(centerX + deltaX, centerY + deltaY, bounds, rect),
      rect,
      bounds
    );

    // {x, y} is the clamped glyph CENTRE; the store's position.x
    // is the renderer's alignment ANCHOR — convert before
    // persisting (same defect and fix as the pointer-up commit),
    // with the rect the clamp just used. y never converts.
    updateTextBox(activeBox, {
      position: {
        x: resolveTextCenterToAnchorX(x, currentBox.align, rect?.width ?? 0, bounds.width),
        y,
      },
    });
    // Same freshness caveat as the pointer-up commit: the clamp
    // above used the rect rendered at the box's previous row, and a
    // nudge toward the diamond's wider middle re-renders the box
    // wider than that rect. Flag it so the text-layer effect
    // re-clamps the stored position against the bounds it actually
    // renders with.
    pendingShapeRecheckRef.current = activeBox;
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
            <p className="text-[10px] leading-relaxed text-neutral-400">
              Drag to move · Arrow keys to nudge · Double-click or Enter to edit
            </p>
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

