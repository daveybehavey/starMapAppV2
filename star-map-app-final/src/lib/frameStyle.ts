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
 *    renders classic rather than a merged band.
 * 4. Frame style never reaches the text-fit inputs: textFit.ts does
 *    not read it, and resolveTextFitFrameEnabled still consumes only
 *    frameEnabled.
 */
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
   * again under a uniform scale about the canvas centre, which sits
   * the rule one frame-gap inside the silhouette edge. Null when the
   * style has no second rule (or it was dropped by the invariants).
   */
  inner: { scaleFactor: number; lineWidthPx: number; alpha: number } | null;
}

export function computeShapeFrameStrokes(
  insetPx: number,
  width: number,
  height: number,
  scale: number,
  style: FrameStyle,
): ShapeFrameStrokes {
  const strokes = computeFrameStrokes(insetPx, scale, style);
  const outer = strokes[0];
  let inner: ShapeFrameStrokes["inner"] = null;
  if (strokes.length > 1) {
    const minDim = Math.min(width, height);
    const gapPx = outer.insetPx - strokes[1].insetPx;
    const scaleFactor = (minDim - 2 * gapPx) / minDim;
    if (scaleFactor > 0 && scaleFactor < 1) {
      inner = {
        scaleFactor,
        lineWidthPx: strokes[1].lineWidthPx,
        alpha: strokes[1].alpha,
      };
    }
  }
  return { lineWidthPx: outer.lineWidthPx, alpha: outer.alpha, inner };
}
