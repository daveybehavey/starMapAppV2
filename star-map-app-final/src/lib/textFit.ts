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
 * Inner padding between the rectangle frame line and fitted text, as a
 * fraction of canvas width (~6px on the 1200px base canvas, ~5px at
 * the ~1040px preview scale the fleet measured, scaling up for print
 * resolutions). The frame-aware fit bound otherwise stops AT the frame
 * line's centre, so a max-length line's glyphs touched the gold line
 * (fleet PR #16, check 1 nit on the U06 fix). The padding keeps a
 * visible clearance on both sides of a fitted line.
 */
export const FRAME_TEXT_FIT_PADDING_RATIO = 0.005;

export function resolveFrameTextFitPaddingPx(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.max(2, Math.round(width * FRAME_TEXT_FIT_PADDING_RATIO));
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
 *   (canvas width minus the frame inset on both sides), less the
 *   small inner padding above so fitted glyphs clear the frame line
 *   instead of touching it.
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
    return Math.max(
      1,
      width - (resolveFrameInsetPx(width, height) + resolveFrameTextFitPaddingPx(width)) * 2,
    );
  }
  return width;
}

/* ------------------------------------------------------------------ */
/* Default text-box rows per shape (fleet PR #16: U14 diamond rows)    */
/* ------------------------------------------------------------------ */

/**
 * The three designed text boxes and the rows their DEFAULT positions
 * use. Every default path (store initial state, occasion-preset base
 * text, the sample recipes) lays the title out near the top, the
 * subtitle under it, and the dedication near the bottom. Those rows
 * sit inside the design for rectangle/circle/heart/star, but on the
 * diamond they land in the apex zones, where the mask is only ~6–20%
 * of the canvas wide: the fleet's live re-check (PR #16) measured the
 * DEFAULT sample title at ~538px across a ~120px mask row, with the
 * 0.5x fit floor already binding — fitting alone cannot fix rows that
 * start in the apex. The diamond therefore gets its own default rows
 * in the mask's wide middle band; the fit above stays as the backstop
 * for user text at any row.
 */
export type DefaultTextBoxId = "title" | "subtitle" | "dedication";

/** Every designed default is horizontally centred. */
export const DEFAULT_TEXT_BOX_X = 0.5;

/** Default rows for every shape except diamond (the long-standing layout). */
export const STANDARD_TEXT_BOX_ROWS: Record<DefaultTextBoxId, number> = {
  title: 0.12,
  subtitle: 0.18,
  dedication: 0.9,
};

/**
 * Diamond default rows, tuned against the mask geometry above
 * (apexes 0.06/0.94, max half-width 0.44): at each row, the mask width
 * across the line's own span fits BOTH default text sets at base size
 * with fit scale 1 — on a 1200px canvas the sample title (Playfair
 * 600 @52, ~625px measured) gets ~802px at 0.42; the subtitle
 * (Cinzel 600 @36, ~349px) ~977px at 0.485; the dedication
 * (Great Vibes @32, ~138px) ~682px at 0.64. The title row also keeps
 * even the fleet's extra-long title contained by the fit (scale
 * ~0.52, above the 0.5 floor). Title just above centre, subtitle
 * beneath it, dedication in the lower-middle above the bottom apex.
 * The pinned measurement table lives in
 * scripts/unit/personaSweepU14DiamondFix.test.mjs.
 */
export const DIAMOND_TEXT_BOX_ROWS: Record<DefaultTextBoxId, number> = {
  title: 0.42,
  subtitle: 0.485,
  dedication: 0.64,
};

export function resolveDefaultTextBoxRows(
  shape?: string,
): Record<DefaultTextBoxId, number> {
  return shape === "diamond" ? DIAMOND_TEXT_BOX_ROWS : STANDARD_TEXT_BOX_ROWS;
}

const DEFAULT_TEXT_BOX_IDS: readonly DefaultTextBoxId[] = [
  "title",
  "subtitle",
  "dedication",
];

/**
 * Move the designed text boxes between the two default row sets for
 * the given shape. A box follows the shape ONLY while it still sits
 * exactly on the OTHER set's default row (centred, x = 0.5): that is
 * the "untouched default" provenance the editor already uses for
 * sample text sync (a box whose text still equals the sample constant
 * is not user content). A box the user dragged or nudged, a custom
 * box, and a preset box with its own authored rows are user data and
 * are never moved. Boxes already on the target set's rows are
 * untouched, so the function is idempotent, and it returns the
 * original array (same reference) when nothing moved.
 */
export function applyDefaultTextRowsForShape<
  T extends { id: string; position?: { x: number; y: number } },
>(boxes: T[], shape?: string): T[] {
  const target = resolveDefaultTextBoxRows(shape);
  const other =
    shape === "diamond" ? STANDARD_TEXT_BOX_ROWS : DIAMOND_TEXT_BOX_ROWS;
  let changed = false;
  const next = boxes.map((box) => {
    if (!DEFAULT_TEXT_BOX_IDS.includes(box.id as DefaultTextBoxId)) return box;
    const id = box.id as DefaultTextBoxId;
    const position = box.position;
    if (!position || position.x !== DEFAULT_TEXT_BOX_X || position.y !== other[id]) {
      return box;
    }
    changed = true;
    return { ...box, position: { x: position.x, y: target[id] } };
  });
  return changed ? next : boxes;
}
