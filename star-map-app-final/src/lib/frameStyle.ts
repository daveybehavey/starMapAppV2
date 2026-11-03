/**
 * Frame border styles (PROD-SM W3-5, issue #503).
 *
 * The frame used to be a boolean (RenderOptions.frameEnabled): one
 * 3px accent rule at the frame inset for rectangles, the shape
 * outline for the other shapes. This module adds the style axis the
 * scoping memo called W3-5 — classic / double / hairline — as pure,
 * unit-testable geometry the renderer consumes, in the same shape as
 * the coordinate-grid helper (W1-3).
 *
 * Invariants the geometry guarantees (pinned in
 * scripts/unit/frameStyle.test.mjs):
 *
 * 1. "classic" is exactly the historical stroke — same inset (the
 *    caller resolves it with textFit.resolveFrameInsetPx, the
 *    text-fit source of truth, and hands it in), same 3×scale width,
 *    same 0.8 alpha — so every existing design renders
 *    byte-identically. An absent or unrecognised stored value
 *    resolves to classic; a saved design's value, including its
 *    absence, is never rewritten.
 * 2. "double" adds its second rule OUTSIDE the classic rule (toward
 *    the canvas edge), never inside it: the text-fit bound is the
 *    frame inset plus padding (textFit.ts, fleet U06/#409), so an
 *    inward rule would eat the clearance fitted text relies on.
 * 3. Every stroke stays at least 1px inside the canvas edge and the
 *    double's two rules never overlap; on pathological slivers where
 *    that cannot hold, the second rule is dropped and the design
 *    renders classic rather than a merged band. For shapes the
 *    second rule is a centre-scaled copy of the silhouette, and its
 *    separation is derived from the silhouette's real boundary
 *    geometry (shapeSecondRuleScaleFactor) — the rectangle's
 *    separation does not imply the shapes', whose edges pass much
 *    closer to the centre; where disjointness cannot be guaranteed
 *    the shape renders its classic outline alone.
 * 4. Frame style never reaches the text-fit inputs: textFit.ts does
 *    not read it, and resolveTextFitFrameEnabled still consumes only
 *    frameEnabled.
 */
import { SHAPE_CIRCLE_INSET_RATIO, SHAPE_PATHS } from "./shapes";
import { flattenPath } from "./shapeTextGeometry";
import { resolveShapeClipTransform } from "./shapeLayout";

export type FrameStyle = "classic" | "double" | "hairline";

export const FRAME_STYLE_OPTIONS: readonly { id: FrameStyle; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "double", label: "Double" },
  { id: "hairline", label: "Fine" },
];

/** Defensive resolution at every consumption boundary: only the two
 * non-default styles are honoured; anything else is classic. */
export function resolveFrameStyle(value: unknown): FrameStyle {
  return value === "double" || value === "hairline" ? value : "classic";
}

export interface FrameStroke {
  /** Distance from the canvas edge to the stroke's centre line. */
  insetPx: number;
  lineWidthPx: number;
  alpha: number;
}

const CLASSIC_LINE_WIDTH = 3; // × scale — the historical stroke width
const CLASSIC_ALPHA = 0.8; // the historical stroke alpha
const HAIRLINE_LINE_WIDTH = 1.25; // × scale
const HAIRLINE_ALPHA = 0.9;
const DOUBLE_INNER_LINE_WIDTH = 1.1; // × scale
const DOUBLE_INNER_ALPHA = 0.65;
const DOUBLE_GAP = 5; // × scale, clamped by doubleFrameGapPx
const MIN_FINE_LINE_WIDTH = 0.5;

/**
 * A fine rule's width: its per-scale width floored so it never
 * vanishes, and capped at the classic rule's width so "fine" can
 * never render bolder than "classic" on thumbnail-sized canvases
 * where the floor would otherwise overtake the classic width.
 */
function fineLineWidthPx(perScale: number, scale: number): number {
  return Math.min(
    Math.max(MIN_FINE_LINE_WIDTH, perScale * scale),
    CLASSIC_LINE_WIDTH * scale,
  );
}

/**
 * Distance between the classic rule and the double's second rule.
 * Clamped so the second rule (drawn at inset − gap) keeps canvas
 * margin: inset − gap − lineWidth/2 ≥ 1 for every realistic scale.
 */
function doubleFrameGapPx(insetPx: number, scale: number): number {
  return Math.min(Math.max(2, DOUBLE_GAP * scale), Math.max(2, insetPx - 3));
}

/**
 * The rectangle frame's strokes for a style — paint order is array
 * order (classic rule first, second rule after), matching how the
 * renderer loops. The caller resolves insetPx with
 * textFit.resolveFrameInsetPx so the stroke and the text-fit bound
 * share the one calculation (fleet U06).
 */
export function computeFrameStrokes(
  insetPx: number,
  scale: number,
  style: FrameStyle,
): FrameStroke[] {
  const classic: FrameStroke = {
    insetPx,
    lineWidthPx: CLASSIC_LINE_WIDTH * scale,
    alpha: CLASSIC_ALPHA,
  };
  if (style === "hairline") {
    return [
      {
        insetPx,
        lineWidthPx: fineLineWidthPx(HAIRLINE_LINE_WIDTH, scale),
        alpha: HAIRLINE_ALPHA,
      },
    ];
  }
  if (style === "double") {
    const gap = doubleFrameGapPx(insetPx, scale);
    const innerInset = insetPx - gap;
    let innerLineWidth = fineLineWidthPx(DOUBLE_INNER_LINE_WIDTH, scale);
    // Invariant 3a: the second rule never crosses the last canvas pixel.
    if (innerInset - innerLineWidth / 2 < 1) {
      innerLineWidth = 2 * (innerInset - 1);
    }
    // Invariant 3b: the two rules never overlap — the second rule's
    // centre-side edge must stay outside the classic rule's edge-side
    // edge. Where either invariant cannot hold (pathological sliver
    // canvases), drop the second rule and render classic.
    if (
      innerLineWidth >= 0.5 &&
      innerInset + innerLineWidth / 2 < insetPx - classic.lineWidthPx / 2
    ) {
      return [
        classic,
        { insetPx: innerInset, lineWidthPx: innerLineWidth, alpha: DOUBLE_INNER_ALPHA },
      ];
    }
    return [classic];
  }
  return [classic];
}

export interface ShapeFrameStrokes {
  /** The silhouette outline stroke (mirrors the rectangle outer rule). */
  lineWidthPx: number;
  alpha: number;
  /**
   * The double's second rule for shapes: the same clip path stroked
   * again under a uniform scale about the canvas centre. The scale
   * factor is derived from the shape's ACTUAL boundary geometry (see
   * shapeSecondRuleScaleFactor): at least one frame-gap inside the
   * silhouette edge, and further in where the boundary passes close
   * to the centre, so the two strokes stay disjoint on every edge —
   * the rectangle separation does not carry to shapes on its own (a
   * star's inner edges sit much closer to the centre than the canvas
   * frame does). Null when the style has no second rule, or where
   * disjointness cannot be guaranteed (a silhouette whose boundary
   * the path flattener cannot handle, a centre outside the
   * silhouette, or a factor so small the rule would sit implausibly
   * deep) — the design then renders the classic outline alone.
   */
  inner: { scaleFactor: number; lineWidthPx: number; alpha: number } | null;
}

/** What computeShapeFrameStrokes needs to locate the real silhouette:
 * the shape whose clip path is being stroked and the design's
 * persisted shape-layout version (the clip transform depends on it). */
export interface ShapeFrameContext {
  shape: string;
  shapeLayoutVersion?: unknown;
}

type BoundaryPoint = readonly [number, number];

/**
 * The shape's boundary as a flattened polyline in CANVAS space — the
 * same geometry buildShapeClip strokes: the procedural circle arc,
 * or the SHAPE_PATHS path flattened and mapped through the clip
 * transform. Null where the path uses commands the flattener does
 * not support (birthdaycake's Q/T/H/V): no boundary, no guarantee.
 */
function shapeBoundaryPointsCanvas(
  shape: string,
  width: number,
  height: number,
  shapeLayoutVersion: unknown,
): BoundaryPoint[] | null {
  if (shape === "circle") {
    const minDim = Math.min(width, height);
    const radius = Math.max(1, minDim / 2 - minDim * SHAPE_CIRCLE_INSET_RATIO);
    const points: BoundaryPoint[] = [];
    const steps = 72;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      points.push([
        width / 2 + radius * Math.cos(angle),
        height / 2 + radius * Math.sin(angle),
      ]);
    }
    return points;
  }
  const entry = SHAPE_PATHS[shape];
  if (!entry?.d) return null;
  let flattened: { points: BoundaryPoint[] };
  try {
    flattened = flattenPath(entry.d);
  } catch {
    return null;
  }
  const transform = resolveShapeClipTransform(
    entry.viewBox,
    width,
    height,
    shapeLayoutVersion,
  );
  return flattened.points.map(
    ([x, y]): BoundaryPoint => [
      transform.translateX + x * transform.scaleX,
      transform.translateY + y * transform.scaleY,
    ],
  );
}

/** Distance from a point to a segment (perpendicular foot clamped). */
function pointToSegmentDistance(
  px: number,
  py: number,
  a: BoundaryPoint,
  b: BoundaryPoint,
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy) / lengthSq),
        );
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Distance between two segments (0 when they cross). */
function segmentToSegmentDistance(
  p1: BoundaryPoint,
  p2: BoundaryPoint,
  p3: BoundaryPoint,
  p4: BoundaryPoint,
): number {
  const orient = (
    a: BoundaryPoint,
    b: BoundaryPoint,
    c: BoundaryPoint,
  ): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return 0;
  }
  return Math.min(
    pointToSegmentDistance(p1[0], p1[1], p3, p4),
    pointToSegmentDistance(p2[0], p2[1], p3, p4),
    pointToSegmentDistance(p3[0], p3[1], p1, p2),
    pointToSegmentDistance(p4[0], p4[1], p1, p2),
  );
}

/**
 * Whether the boundary polyline and its centre-scaled copy at
 * factor k stay at least `cutoff` apart everywhere — measured, not
 * modelled: a star's inner edges pass close enough to the centre
 * that the separation there is a fraction of the canvas-frame gap,
 * and only the measured distance says whether the two strokes stay
 * disjoint. Segment pairs whose bounding boxes already clear the
 * cutoff are skipped without the exact distance.
 */
function boundarySeparationClears(
  points: BoundaryPoint[],
  width: number,
  height: number,
  k: number,
  cutoff: number,
): boolean {
  const centreX = width / 2;
  const centreY = height / 2;
  const scaled: BoundaryPoint[] = points.map(([x, y]) => [
    centreX + k * (x - centreX),
    centreY + k * (y - centreY),
  ]);
  const cutoffSq = cutoff * cutoff;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const aMinX = Math.min(a[0], b[0]);
    const aMaxX = Math.max(a[0], b[0]);
    const aMinY = Math.min(a[1], b[1]);
    const aMaxY = Math.max(a[1], b[1]);
    for (let j = 0; j + 1 < scaled.length; j++) {
      const c = scaled[j];
      const d = scaled[j + 1];
      const gapX = Math.max(
        0,
        aMinX - Math.max(c[0], d[0]),
        Math.min(c[0], d[0]) - aMaxX,
      );
      const gapY = Math.max(
        0,
        aMinY - Math.max(c[1], d[1]),
        Math.min(c[1], d[1]) - aMaxY,
      );
      if (gapX * gapX + gapY * gapY >= cutoffSq) continue;
      if (segmentToSegmentDistance(a, b, c, d) < cutoff) return false;
    }
  }
  return true;
}

/**
 * The second rule's scale factor for a shape, or null to drop it.
 * Starts from the frame-gap factor and walks the factor down (the
 * gap up, ×1.25 per step) until the MEASURED separation between the
 * silhouette and its scaled copy clears half the two stroke widths
 * combined, plus a small margin. A factor below 0.9 would park the
 * rule implausibly deep (and signals a centre outside the
 * silhouette), so the rule is dropped instead of placed there.
 */
function shapeSecondRuleScaleFactor(
  points: BoundaryPoint[],
  width: number,
  height: number,
  gapScaleFactor: number,
  outerLineWidthPx: number,
  innerLineWidthPx: number,
): number | null {
  if (points.length < 2) return null;
  const neededSeparation = (outerLineWidthPx + innerLineWidthPx) / 2 + 0.25;
  let scaleFactor = gapScaleFactor;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (scaleFactor < 0.9 || scaleFactor >= 1) return null;
    if (
      boundarySeparationClears(
        points,
        width,
        height,
        scaleFactor,
        neededSeparation,
      )
    ) {
      return scaleFactor;
    }
    scaleFactor = 1 - (1 - scaleFactor) * 1.25;
  }
  return null;
}

export function computeShapeFrameStrokes(
  insetPx: number,
  width: number,
  height: number,
  scale: number,
  style: FrameStyle,
  shapeCtx?: ShapeFrameContext,
): ShapeFrameStrokes {
  const strokes = computeFrameStrokes(insetPx, scale, style);
  const outer = strokes[0];
  let inner: ShapeFrameStrokes["inner"] = null;
  if (strokes.length > 1) {
    const minDim = Math.min(width, height);
    const gapPx = outer.insetPx - strokes[1].insetPx;
    const gapScaleFactor = (minDim - 2 * gapPx) / minDim;
    const points = shapeCtx
      ? shapeBoundaryPointsCanvas(
          shapeCtx.shape,
          width,
          height,
          shapeCtx.shapeLayoutVersion,
        )
      : null;
    const scaleFactor =
      points !== null
        ? shapeSecondRuleScaleFactor(
            points,
            width,
            height,
            gapScaleFactor,
            outer.lineWidthPx,
            strokes[1].lineWidthPx,
          )
        : null;
    if (scaleFactor !== null) {
      inner = {
        scaleFactor,
        lineWidthPx: strokes[1].lineWidthPx,
        alpha: strokes[1].alpha,
      };
    }
  }
  return { lineWidthPx: outer.lineWidthPx, alpha: outer.alpha, inner };
}
