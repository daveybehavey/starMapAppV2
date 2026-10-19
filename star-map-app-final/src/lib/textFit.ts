// Fit-to-width sizing for canvas text boxes (used by renderSky's drawText).
//
// A text box renders as a single line at its configured font size. When the
// measured line is wider than the canvas, the old behaviour pinned the line's
// centre to the canvas centre and let it spill symmetrically off both edges —
// straight into the customer's final print (finding P01: long geocoded place
// names synced into the subtitle overflowed the rendered map).
//
// These helpers compute the shrink factor that makes a line fit its
// available width. Lines that already fit return a scale of exactly 1, so
// their rendering is unchanged. Shrinking stops at MIN_TEXT_FIT_SCALE: below
// half size a line no longer reads as the same design element (and print
// legibility suffers), so a pathological string wider than 2x the canvas is
// still drawn at the floored size rather than silently clipped, wrapped, or
// truncated — it can still spill, but bounded, centred, and legible.

/** Smallest fraction of the configured size that fit-to-width may shrink to. */
export const MIN_TEXT_FIT_SCALE = 0.5;

export function resolveTextFitScale(
  textWidth: number,
  availableWidth: number,
  minScale: number = MIN_TEXT_FIT_SCALE,
): number {
  if (!Number.isFinite(textWidth) || !Number.isFinite(availableWidth)) return 1;
  if (textWidth <= 0 || availableWidth <= 0) return 1;
  if (textWidth <= availableWidth) return 1;
  const floor = Math.min(1, Math.max(0, minScale));
  return Math.max(floor, availableWidth / textWidth);
}

export function resolveFittedFontSize(
  fontSize: number,
  textWidth: number,
  availableWidth: number,
  minScale: number = MIN_TEXT_FIT_SCALE,
): number {
  if (!Number.isFinite(fontSize) || fontSize <= 0) return fontSize;
  return fontSize * resolveTextFitScale(textWidth, availableWidth, minScale);
}

/**
 * The rectangle frame's inset from the canvas edge, in pixels — the exact
 * formula drawBackground in renderSky.ts strokes the frame with. Text
 * fitted against the canvas edge crosses that gold frame line (fleet
 * U06), so the frame's inner bounds are the text-fit bound whenever the
 * frame is drawn. Exported so the render path and the fit share one
 * source of truth.
 */
export function resolveFrameInsetPx(width: number, height: number): number {
  return Math.max(8, Math.min(16, Math.floor(Math.min(width, height) * 0.03)));
}

/**
 * Diamond mask geometry, from SHAPE_PATHS.diamond
 * ("M50 6 L94 50 L50 94 L6 50 Z" on a 100x100 viewBox, scaled to the full
 * canvas): apexes at y = 0.06 / 0.94, widest (half-width 0.44) at y = 0.5.
 * The half-width at a row is linear between the apexes and the middle.
 */
export const DIAMOND_APEX_TOP = 0.06;
export const DIAMOND_APEX_BOTTOM = 0.94;
export const DIAMOND_MAX_HALF_WIDTH = 0.44;

export function resolveDiamondHalfWidthAt(yNorm: number): number {
  if (!Number.isFinite(yNorm)) return 0;
  if (yNorm <= DIAMOND_APEX_TOP || yNorm >= DIAMOND_APEX_BOTTOM) return 0;
  const distanceFromMiddle = Math.abs(yNorm - 0.5);
  const span = DIAMOND_APEX_BOTTOM - 0.5; // 0.44 of canvas height per side
  return DIAMOND_MAX_HALF_WIDTH * (1 - distanceFromMiddle / span);
}

export type TextFitLayout = {
  /** Selected shape id ("rectangle" | "circle" | "heart" | "star" | "diamond"). */
  shape?: string;
  /** Whether the gold frame/outline is drawn for this render. */
  frameEnabled?: boolean;
  /** The line's resolved centre row, normalized 0..1 of canvas height. */
  centerYNorm: number;
  /** The line's unfitted height in pixels (font size x line height). */
  lineHeightPx: number;
  /** Canvas width in pixels. */
  width: number;
  /** Canvas height in pixels. */
  height: number;
};

/**
 * The width a single text line may occupy without crossing the design's
 * own boundary for the shape being rendered (fleet U06 + U14):
 *
 * - Rectangle with its frame drawn: the frame's inner bounds
 *   (canvas width minus the frame inset on both sides).
 * - Diamond: the mask's width across the line's own vertical span. The
 *   diamond narrows linearly toward its apexes, so the bound is the
 *   narrowest mask width the line's glyph box touches — a title at the
 *   default top row gets the narrow width of that row, not the wide
 *   middle. The span is measured with the UNfitted line height, which
 *   overstates the fitted line's span and therefore understates the
 *   width: the error is on the safe side. A span crossing an apex has
 *   zero mask width; that real-geometry zero is clamped to a 1px bound
 *   (see the branch) so the fit resolves to the shrink floor rather
 *   than the fit helper's unmeasurable-input full size.
 * - Every other shape (and a frameless rectangle): the full canvas
 *   width, i.e. the pre-existing P01 behaviour, unchanged.
 */
export function resolveShapeTextAvailableWidth(layout: TextFitLayout): number {
  const { shape, frameEnabled = true, centerYNorm, lineHeightPx, width, height } =
    layout;
  if (!Number.isFinite(width) || width <= 0) return width;
  if (shape === "diamond") {
    if (!Number.isFinite(height) || height <= 0) return width;
    const halfSpanNorm = Math.max(0, lineHeightPx) / 2 / height;
    const topHalf = resolveDiamondHalfWidthAt(centerYNorm - halfSpanNorm);
    const bottomHalf = resolveDiamondHalfWidthAt(centerYNorm + halfSpanNorm);
    // The mask narrows to zero width at its apexes, so a line whose span
    // crosses an apex legitimately has NO room — that zero is a real
    // measurement, not a measurement failure. Clamp to the same 1px
    // minimum the frame branch below uses: resolveTextFitScale reserves
    // a non-positive available width for "unmeasurable" and answers
    // scale 1 (full size), which would double the line exactly where
    // the mask is narrowest. At a 1px bound the fit lands on the
    // MIN_TEXT_FIT_SCALE floor instead, continuous with the rows just
    // inside the apex.
    return Math.max(1, Math.min(topHalf, bottomHalf) * 2 * width);
  }
  if ((shape === undefined || shape === "rectangle") && frameEnabled) {
    return Math.max(1, width - resolveFrameInsetPx(width, height) * 2);
  }
  return width;
}
