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

import type { ExportMatPurpose } from "./mapLookTiers";
import type { ShapeMaskFootprint } from "./shapeLayout";
import type { ShapeTextProfile } from "./shapeTextGeometry";

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
 * The rectangle frame's inset from the canvas edge, in pixels — one
 * purpose-aware calculation, shared by the frame stroke (drawBackground
 * in renderSky.ts) and by the text-fit bound derived from it.
 * Text fitted against the canvas edge crosses that gold frame line
 * (fleet U06), so the frame's inner bounds are the text-fit bound
 * whenever the frame is drawn. Exported so the render path and the fit
 * share one source of truth.
 *
 * The legacy inset — max(8, min(16, floor(minDim * 0.03))) — is exact
 * for print renders and for any caller that omits the purpose: the
 * default is "print" so an unthreaded lower-level caller fails safe
 * toward the shipping physical product. Only an explicit "preview"
 * purpose scales the inset with canvas size (#409):
 * max(legacy, minDim * 16/1200) keeps the frame at the 1200px
 * reference proportion (16/1200) at every larger render size, while
 * staying bit-for-bit legacy at minDim <= 1200. Purpose is never
 * inferred from canvas size or export quality (print assets and
 * digital exports both render at quality "export").
 */
export function resolveFrameInsetPx(
  width: number,
  height: number,
  matPurpose: ExportMatPurpose = "print",
): number {
  const minDim = Math.min(width, height);
  const legacyInset = Math.max(8, Math.min(16, Math.floor(minDim * 0.03)));
  if (matPurpose !== "preview") return legacyInset;
  return Math.max(legacyInset, minDim * (16 / 1200));
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
 * These are MASK-space fractions: under the legacy layout the mask
 * space is the full canvas; under the #406 uniform layout it is the
 * mask's centred square footprint (resolveShapeMaskFootprint), and
 * callers convert canvas rows into that space before evaluating.
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
  /** Render purpose (#409): "preview" scales the frame inset with
   * canvas size; "print" — and omission, via the helper's default —
   * keeps the legacy inset the shipped product uses. */
  matPurpose?: ExportMatPurpose;
  /** Shape-mask footprint under the #406 uniform layout (layout
   * version 2), resolved by the caller from the design's persisted
   * version (shapeLayout.ts): the diamond's tent geometry is then
   * evaluated in that centred square footprint instead of the
   * stretched full canvas. Null/absent (the legacy layout — every
   * saved design) keeps the historical canvas-space geometry. A
   * resolved value is passed in, rather than the version itself, so
   * this module stays free of runtime imports (the plain-Node unit
   * runner imports it directly). */
  shapeMaskFootprint?: ShapeMaskFootprint | null;
  /** Shape-interior profile for the concave shapes (heart/star),
   * resolved by the caller from the renderer's own SHAPE_PATHS
   * (shapeTextGeometry.ts): the heart/star fit bound is the mask's
   * centred width across the line's span in MASK space — converted
   * with the footprint above under the uniform layout, or the full
   * canvas under legacy. Null/absent keeps the historical
   * full-canvas bound for those shapes. Passed in as data, like the
   * footprint, so this module stays free of runtime imports. */
  shapeTextProfile?: ShapeTextProfile | null;
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
 * - Heart/star (#407, SQ-03): the mask's CENTRED width across the
 *   line's own vertical span, from the shape-interior profile — the
 *   largest interval symmetric about the mask centre that stays
 *   inside the mask at every row of the span. Above the heart's
 *   cleft (and below the star's bottom notch) the centre is outside
 *   the mask, so a line there gets the same 1px-bound → shrink-floor
 *   treatment as a diamond apex crossing; the designed default rows
 *   (HEART/STAR_TEXT_BOX_ROWS below) keep designed text out of those
 *   zones entirely. Evaluated in mask space: under the uniform
 *   layout the span is converted into the footprint, under legacy
 *   the mask space is the canvas itself.
 * - Every other shape (and a frameless rectangle): the full canvas
 *   width, i.e. the pre-existing P01 behaviour, unchanged.
 */
export function resolveShapeTextAvailableWidth(layout: TextFitLayout): number {
  const { shape, frameEnabled = true, centerYNorm, lineHeightPx, width, height } =
    layout;
  if (!Number.isFinite(width) || width <= 0) return width;
  if (shape === "diamond") {
    if (!Number.isFinite(height) || height <= 0) return width;
    // #406 uniform layout: the diamond sits in a centred square
    // footprint, so the tent is evaluated in footprint space — the
    // row is measured from the footprint's top and the half-width is
    // a fraction of the footprint's edge, not of the canvas. (At a
    // square canvas the footprint IS the canvas and this reduces to
    // the legacy computation below.)
    const footprint = layout.shapeMaskFootprint ?? null;
    if (footprint) {
      const halfSpanPx = Math.max(0, lineHeightPx) / 2;
      const centerYPx = centerYNorm * height;
      const topHalf = resolveDiamondHalfWidthAt(
        (centerYPx - halfSpanPx - footprint.offsetY) / footprint.size,
      );
      const bottomHalf = resolveDiamondHalfWidthAt(
        (centerYPx + halfSpanPx - footprint.offsetY) / footprint.size,
      );
      return Math.max(1, Math.min(topHalf, bottomHalf) * 2 * footprint.size);
    }
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
  const textProfile = layout.shapeTextProfile ?? null;
  if ((shape === "heart" || shape === "star") && textProfile) {
    if (!Number.isFinite(height) || height <= 0) return width;
    const footprint = layout.shapeMaskFootprint ?? null;
    const halfSpanPx = Math.max(0, lineHeightPx) / 2;
    const centerYPx = centerYNorm * height;
    // Convert the line's vertical span into mask space (see the
    // header): footprint space under the uniform layout, canvas
    // fractions under legacy. The bound is the centred half-width
    // the mask offers across that whole span, back in canvas pixels
    // (mask x maps onto the footprint's edge, or the canvas width).
    const vTop = footprint
      ? (centerYPx - halfSpanPx - footprint.offsetY) / footprint.size
      : centerYNorm - halfSpanPx / height;
    const vBottom = footprint
      ? (centerYPx + halfSpanPx - footprint.offsetY) / footprint.size
      : centerYNorm + halfSpanPx / height;
    const xScalePx = footprint ? footprint.size : width;
    // A span whose centre rows sit in the cleft/notch measures a
    // real zero; clamp to 1px exactly as the diamond branch does, so
    // the fit lands on the shrink floor instead of answering the
    // helper's unmeasurable-input full size.
    return Math.max(
      1,
      textProfile.centeredHalfWidthAcrossSpan(vTop, vBottom) * 2 * xScalePx,
    );
  }
  if ((shape === undefined || shape === "rectangle") && frameEnabled) {
    const frameInset =
      resolveFrameInsetPx(width, height, layout.matPurpose) +
      resolveFrameTextFitPaddingPx(width);
    return Math.max(1, width - frameInset * 2);
  }
  return width;
}

/* ------------------------------------------------------------------ */
/* Drag clamp: keep a dragged box inside the shape's safe region     */
/* ------------------------------------------------------------------ */

/**
 * Layout inputs for clampTextCenterToShape: the same shape/frame
 * state the render path fits text against, plus the dragged box's
 * rendered glyph rect (fitted width x fitted fontSize * 1.2 — the
 * rect drawText records in its bounds map) and the canvas size, all
 * in pixels (any consistent scale; the editor preview's CSS pixels
 * are what the drag handlers have).
 */
export type TextDragClampLayout = {
  /** Selected shape id ("rectangle" | "circle" | "heart" | "star" | "diamond"). */
  shape?: string;
  /** Whether the gold frame/outline is drawn for this render. */
  frameEnabled?: boolean;
  /** Shape-mask footprint under the #406 uniform layout (2),
   * resolved by the caller (shapeLayout.ts): the diamond clamp then
   * runs in that centred square footprint. Null/absent keeps the
   * historical canvas-space clamp. */
  shapeMaskFootprint?: ShapeMaskFootprint | null;
  /** Shape-interior profile for the concave shapes (heart/star),
   * resolved by the caller (shapeTextGeometry.ts): the heart/star
   * clamp keeps the dragged glyph rect inside the mask, evaluated
   * in mask space (footprint under the uniform layout, full canvas
   * under legacy). Null/absent keeps the historical unclamped
   * behaviour for those shapes. */
  shapeTextProfile?: ShapeTextProfile | null;
  /** The dragged box's rendered glyph-rect width in pixels. */
  rectWidthPx: number;
  /** The dragged box's rendered glyph-rect height in pixels. */
  rectHeightPx: number;
  /** Canvas width in pixels. */
  width: number;
  /** Canvas height in pixels. */
  height: number;
};

/**
 * Clamp a text box's centre (normalized 0..1 — the space editor drag
 * positions are stored in) so the box's glyph rect stays inside the
 * shape's print-safe region: the drag-time counterpart of the fit
 * bound in resolveShapeTextAvailableWidth (fleet PR #17, finding B).
 *
 * The fit sizes a line for a CENTRED position — its available width
 * is the mask's width across the line's own span. A user-dragged box
 * keeps that fitted size wherever it is dropped, so near a boundary
 * its rect crosses the line the centred fit was protecting. Clamping
 * the centre against the same geometry keeps the rendered rect —
 * fitted width and all — inside the region, and because the clamped
 * position is the one that gets stored, preview and export stay in
 * parity by construction (both render the stored position through
 * the same drawText).
 *
 * - Diamond: the mask narrows linearly toward its apexes
 *   (resolveDiamondHalfWidthAt). The centre's row is first clamped
 *   so the rect's vertical span stays where the mask is at least as
 *   wide as the rect: the mask half-width at the span's end rows
 *   must be >= the rect's half-width, and since the half-width falls
 *   linearly from the middle, that puts the end rows within
 *   span * (1 - halfWidth / DIAMOND_MAX_HALF_WIDTH) of the middle.
 *   The centre column is then clamped to the mask width across the
 *   clamped span (the narrower end row — the tent function's
 *   minimum over the span). A rect too wide or tall to fit anywhere
 *   (its half-width beyond the mask's max, or its span longer than
 *   the rows that fit its width) is centred on the failing axis: no
 *   position contains it, and the spill that remains is the fit
 *   floor's pre-existing bounded spill, not the drag's.
 * - Heart/star (#407, SQ-03): the feasible region of centres whose
 *   WHOLE glyph rect fits inside the mask, evaluated in mask space
 *   from the shape-interior profile. A centre whose rect is already
 *   contained is returned exactly. Otherwise the centre's row moves
 *   to the closest row whose span offers the rect's width at the
 *   centre (a deterministic scan; if no row offers it, the row whose
 *   span offers the MOST width — the spill-minimising fallback, not
 *   a blind canvas middle: neither shape is vertically symmetric),
 *   and the column clamps into the valid-centre set across the
 *   clamped span (or the mask centre when that set is empty).
 * - Rectangle with its frame drawn: the frame's inner bounds, less
 *   the same padding the fit uses, on both axes. A rect larger than
 *   the region on an axis is centred on that axis.
 * - Every other shape (circle, birthdaycake, ...), and a frameless
 *   rectangle: the centre is returned unchanged. The fit deliberately
 *   bounds those shapes by the full canvas only, and their designed
 *   layouts place text outside the sky shape's chord (the circle
 *   default title row sits above the disc's narrow top), so treating
 *   the sky shape as a text bound there would fight the design; the
 *   canvas clamp the caller already applied remains the only bound.
 *
 * Each axis is clamped independently, so a drag slides along a
 * boundary instead of sticking to it. A centre already inside the
 * region is returned with its exact input values, so designed
 * default positions and interior drags are unaffected.
 */
/**
 * #407 drag-clamp candidate rows per (profile, rect half-height):
 * the 1/256 grid plus every structural-vertex row offset by the half-height.
 * A drag keeps one glyph rect for its whole duration, so this set is
 * built once and reused across pointer moves (Codex P1 on PR #432).
 */
const clampCandidateRowCache = {
  byProfile: new WeakMap<
    ShapeTextProfile,
    Map<number, { grid: number[]; critical: number[] }>
  >(),
  get(profile: ShapeTextProfile, halfHeightMask: number) {
    let byHeight = this.byProfile.get(profile);
    if (!byHeight) {
      byHeight = new Map();
      this.byProfile.set(profile, byHeight);
    }
    let entry = byHeight.get(halfHeightMask);
    if (!entry) {
      const grid: number[] = [];
      for (let step = 0; step <= 256; step++) grid.push(step / 256);
      // Structural-vertex rows only (profile.vertexRows): the
      // flattened criticalRows number in the hundreds (Bézier
      // subdivision points) and swamped the candidate set.
      const vertexSet = new Set<number>();
      for (const row of profile.vertexRows) {
        vertexSet.add(row - halfHeightMask);
        vertexSet.add(row + halfHeightMask);
      }
      const critical = Array.from(vertexSet).filter(
        (row) => Number.isFinite(row) && row >= 0 && row <= 1,
      );
      entry = { grid, critical };
      if (byHeight.size > 64) byHeight.clear();
      byHeight.set(halfHeightMask, entry);
    }
    return entry;
  },
};

export function clampTextCenterToShape(
  center: { x: number; y: number },
  layout: TextDragClampLayout,
): { x: number; y: number } {
  const {
    shape,
    frameEnabled = true,
    rectWidthPx,
    rectHeightPx,
    width,
    height,
  } = layout;
  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(rectWidthPx) ||
    !Number.isFinite(rectHeightPx) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    rectWidthPx < 0 ||
    rectHeightPx < 0
  ) {
    return center;
  }
  const halfWidthNorm = rectWidthPx / (width * 2);
  const halfHeightNorm = rectHeightPx / (height * 2);

  if (shape === "diamond") {
    // #406 uniform layout: run the same tent clamp in mask space —
    // the diamond's centred square footprint — then convert back to
    // canvas-normalized centre coordinates. The footprint is centred
    // on both axes, so mask-space centre is (0.5, 0.5) exactly as in
    // the canvas-space algorithm below.
    const footprint = layout.shapeMaskFootprint ?? null;
    if (footprint) {
      const halfWidthMask = rectWidthPx / (footprint.size * 2);
      const halfHeightMask = rectHeightPx / (footprint.size * 2);
      const rowSpan = DIAMOND_APEX_BOTTOM - 0.5;
      const maxRowOffset = rowSpan * (1 - halfWidthMask / DIAMOND_MAX_HALF_WIDTH);
      let maskY = (center.y * height - footprint.offsetY) / footprint.size;
      if (maxRowOffset < 0 || halfHeightMask > maxRowOffset) {
        maskY = 0.5;
      } else {
        const minY = 0.5 - maxRowOffset + halfHeightMask;
        const maxY = 0.5 + maxRowOffset - halfHeightMask;
        maskY = Math.min(maxY, Math.max(minY, maskY));
      }
      const bandHalfWidth = Math.min(
        resolveDiamondHalfWidthAt(maskY - halfHeightMask),
        resolveDiamondHalfWidthAt(maskY + halfHeightMask),
      );
      const slack = bandHalfWidth - halfWidthMask;
      const maskX = (center.x * width - footprint.offsetX) / footprint.size;
      const clampedMaskX =
        slack >= 0 ? Math.min(0.5 + slack, Math.max(0.5 - slack, maskX)) : 0.5;
      return {
        x: (footprint.offsetX + clampedMaskX * footprint.size) / width,
        y: (footprint.offsetY + maskY * footprint.size) / height,
      };
    }
    const rowSpan = DIAMOND_APEX_BOTTOM - 0.5;
    // How far from the middle an end row may sit while the mask
    // there is still at least as wide as the rect.
    const maxRowOffset = rowSpan * (1 - halfWidthNorm / DIAMOND_MAX_HALF_WIDTH);
    let y = center.y;
    if (maxRowOffset < 0 || halfHeightNorm > maxRowOffset) {
      y = 0.5;
    } else {
      const minY = 0.5 - maxRowOffset + halfHeightNorm;
      const maxY = 0.5 + maxRowOffset - halfHeightNorm;
      y = Math.min(maxY, Math.max(minY, y));
    }
    const bandHalfWidth = Math.min(
      resolveDiamondHalfWidthAt(y - halfHeightNorm),
      resolveDiamondHalfWidthAt(y + halfHeightNorm),
    );
    const slack = bandHalfWidth - halfWidthNorm;
    const x =
      slack >= 0
        ? Math.min(0.5 + slack, Math.max(0.5 - slack, center.x))
        : 0.5;
    return { x, y };
  }

  const textProfile = layout.shapeTextProfile ?? null;
  if ((shape === "heart" || shape === "star") && textProfile) {
    // Work in mask space throughout: the mask's own normalized
    // coordinates, where the interior profile is defined. Under the
    // uniform layout the mask occupies the centred square footprint;
    // under legacy it is the full canvas (offset 0, scale = canvas).
    const footprint = layout.shapeMaskFootprint ?? null;
    const xScalePx = footprint ? footprint.size : width;
    const yScalePx = footprint ? footprint.size : height;
    const offsetX = footprint ? footprint.offsetX : 0;
    const offsetY = footprint ? footprint.offsetY : 0;
    const maskX = (center.x * width - offsetX) / xScalePx;
    const maskY = (center.y * height - offsetY) / yScalePx;
    const halfWidthMask = rectWidthPx / (xScalePx * 2);
    const halfHeightMask = rectHeightPx / (yScalePx * 2);

    // A rect already contained at the input centre is feasible:
    // return the input exactly (the stored position must not drift
    // by a float round-trip through mask space).
    if (textProfile.rectContainedAt(maskX, maskY, halfWidthMask, halfHeightMask)) {
      return center;
    }

    // Row: the closest centre row whose whole vertical span can
    // contain the rect at SOME centre — feasibility comes from the
    // valid-centre intervals across the span, so a row where the
    // rect only fits OFF-CENTRE (a heart lobe above the cleft)
    // counts (Codex P2 on PR #432: gating on the centred half-width
    // made text jump below the cleft instead of stopping at the
    // lobe). The candidate set is bounded (the input row, every
    // structural-vertex row offset by the rect's half-height, and a 1/256
    // grid) and each span query is band-indexed in the profile
    // (Codex P1: the previous 1/1024 scan over the raw polygon cost
    // ~500ms per invalid drag position). Containment at the chosen
    // row is still exact — its intervals are computed exactly; the
    // grid only bounds which rows are considered (≤1/512 of the mask
    // from the true closest, imperceptible in a drag). If no row is
    // feasible, fall back to the row offering the most centred width
    // (ties: closest to the input, then the lower row) — the
    // spill-minimising position SQ-03 requires, deterministic in
    // all cases.
    const candidateEntry = clampCandidateRowCache.get(textProfile, halfHeightMask);
    const byDistance = (a: number, b: number) =>
      Math.abs(a - maskY) - Math.abs(b - maskY) || a - b;
    const candidateRows = [maskY, ...candidateEntry.grid, ...candidateEntry.critical].sort(byDistance);
    let resolvedY: number | null = null;
    let resolvedCenters: Array<readonly [number, number]> = [];
    for (const candidate of candidateRows) {
      const centers = textProfile.validCenterIntervalsAcrossSpan(
        candidate - halfHeightMask,
        candidate + halfHeightMask,
        halfWidthMask,
      );
      if (centers.length > 0) {
        resolvedY = candidate;
        resolvedCenters = centers;
        break;
      }
    }
    if (resolvedY === null) {
      // Fallback (the rect fits nowhere): the widest-band row over a
      // coarser set — every 4th grid row plus the critical offsets.
      // Precision is low-value here (the position only minimizes
      // spill) and this keeps the worst case inside a frame budget.
      let bestFallbackWidth = -1;
      resolvedY = 0.5;
      const fallbackRows = [
        ...candidateEntry.grid.filter((_, i) => i % 4 === 0),
        ...candidateEntry.critical,
      ].sort(byDistance);
      for (const candidate of fallbackRows) {
        const offered = textProfile.centeredHalfWidthAcrossSpan(
          candidate - halfHeightMask,
          candidate + halfHeightMask,
        );
        if (
          offered > bestFallbackWidth ||
          (offered === bestFallbackWidth &&
            Math.abs(candidate - maskY) < Math.abs(resolvedY - maskY))
        ) {
          bestFallbackWidth = offered;
          resolvedY = candidate;
        }
      }
    }

    // Column: clamp into the valid-centre set across the resolved
    // span (nearest point of the set; the mask centre when the set
    // is empty — the rect fits nowhere at this row, and the centred
    // spill matches the fit floor's behaviour).
    const validCenters =
      resolvedCenters.length > 0
        ? resolvedCenters
        : textProfile.validCenterIntervalsAcrossSpan(
            resolvedY - halfHeightMask,
            resolvedY + halfHeightMask,
            halfWidthMask,
          );
    let resolvedX = 0.5;
    if (validCenters.length > 0) {
      resolvedX = validCenters[0][0];
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const [lo, hi] of validCenters) {
        const nearest = Math.min(hi, Math.max(lo, maskX));
        const distance = Math.abs(nearest - maskX);
        if (distance < bestDistance) {
          bestDistance = distance;
          resolvedX = nearest;
        }
      }
    }
    return {
      x: (offsetX + resolvedX * xScalePx) / width,
      y: (offsetY + resolvedY * yScalePx) / height,
    };
  }

  if ((shape === undefined || shape === "rectangle") && frameEnabled) {
    // The clamp's sole caller is the editor preview, so the purpose is
    // pinned explicitly to "preview" (#409): at editor CSS sizes
    // (minDim <= 1200) that is exactly the legacy inset, and the
    // contract stays correct if the editor ever works larger.
    const insetPx =
      resolveFrameInsetPx(width, height, "preview") + resolveFrameTextFitPaddingPx(width);
    const clampAxis = (value: number, rectPx: number, sizePx: number) => {
      const min = (insetPx + rectPx / 2) / sizePx;
      const max = 1 - min;
      if (min > max) return 0.5;
      return Math.min(max, Math.max(min, value));
    };
    return {
      x: clampAxis(center.x, rectWidthPx, width),
      y: clampAxis(center.y, rectHeightPx, height),
    };
  }

  return center;
}

/* ------------------------------------------------------------------ */
/* Stored anchor <-> glyph centre conversion (gate P2 on PR #345)    */
/* ------------------------------------------------------------------ */

/**
 * A stored text position's x is the renderer's drawing ANCHOR, not
 * the glyph rect's centre: drawText (renderSky.ts) fills the text at
 * (position.x x canvas width) with ctx.textAlign = box.align, so a
 * left-aligned glyph spans [anchor, anchor + width] and a
 * right-aligned one [anchor - width, anchor]. (The y is always the
 * centre — the baseline is "middle" for every alignment — so only x
 * ever converts.) clampTextCenterToShape works in centre space, so
 * any path that feeds it a STORED position, or stores its result,
 * must convert with the box's alignment and rendered rect width:
 *
 *   centre = anchor + width/2 (left) | anchor (centre) | anchor - width/2 (right)
 *
 * Without the conversion the clamp both rejects positions whose
 * glyph is already contained (it judges the anchor as if it were
 * the centre) and permits anchors whose glyph edge lands outside
 * the region. Centre-aligned boxes — every designed default —
 * convert by exactly 0. Degenerate inputs convert by 0 as well, so
 * callers can apply the pair unconditionally.
 */
export function resolveTextAnchorToCenterX(
  anchorX: number,
  align: string | undefined,
  rectWidthPx: number,
  canvasWidthPx: number,
): number {
  return anchorX + textAnchorCenterOffsetX(align, rectWidthPx, canvasWidthPx);
}

/** Inverse of resolveTextAnchorToCenterX: centre -> stored anchor. */
export function resolveTextCenterToAnchorX(
  centerX: number,
  align: string | undefined,
  rectWidthPx: number,
  canvasWidthPx: number,
): number {
  return centerX - textAnchorCenterOffsetX(align, rectWidthPx, canvasWidthPx);
}

function textAnchorCenterOffsetX(
  align: string | undefined,
  rectWidthPx: number,
  canvasWidthPx: number,
): number {
  if (
    !Number.isFinite(rectWidthPx) ||
    !Number.isFinite(canvasWidthPx) ||
    canvasWidthPx <= 0 ||
    rectWidthPx < 0
  ) {
    return 0;
  }
  const halfWidthNorm = rectWidthPx / (canvasWidthPx * 2);
  if (align === "left") return halfWidthNorm;
  if (align === "right") return -halfWidthNorm;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Default text-box rows per shape (fleet PR #16: U14 diamond rows)    */
/* ------------------------------------------------------------------ */

/**
 * The three designed text boxes and the rows their DEFAULT positions
 * use. Every default path (store initial state, occasion-preset base
 * text, the sample recipes) lays the title out near the top, the
 * subtitle under it, and the dedication near the bottom. Those rows
 * sit inside the design for rectangle/circle, but on the diamond
 * they land in the apex zones, where the mask is only ~6–20% of the
 * canvas wide: the fleet's live re-check (PR #16) measured the
 * DEFAULT sample title at ~538px across a ~120px mask row, with the
 * 0.5x fit floor already binding — fitting alone cannot fix rows that
 * start in the apex. The diamond therefore gets its own default rows
 * in the mask's wide middle band; the fit above stays as the backstop
 * for user text at any row. Heart and star turned out to have the
 * same disease in concave form (their standard rows land in the
 * cleft, on the top point, and in the bottom notch) and got the same
 * treatment in #407 — see HEART/STAR_TEXT_BOX_ROWS below.
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

/**
 * Heart/star default rows (#407, SQ-03) — expressed in MASK space
 * (fractions of the mask's own height), because under the #406
 * uniform layout the mask sits in a centred footprint and a fixed
 * canvas fraction would land on different mask rows at every aspect.
 * resolveDefaultTextBoxRows converts them to canvas rows for the
 * caller's layout; under the legacy layout (and at any square
 * canvas) mask space IS the canvas and the values apply verbatim.
 *
 * SQ-03's geometry, against the shipped SHAPE_PATHS: the standard
 * rows are unusable on both shapes — the heart's title/subtitle rows
 * (0.12/0.18) sit above the cleft's bottom (0.20), where the centre
 * is OUTSIDE the mask, and its dedication row (0.90) sits below the
 * bottom tip (0.88); the star's title row crosses the top point
 * (~73px of mask width on a 1200px canvas) and its dedication row
 * falls in the bottom notch (centre outside below 0.745). The rows
 * below sit in each mask's wide band: on a 1200px canvas the heart
 * title gets ~991px of mask width across its span, the subtitle
 * ~935px, the dedication ~620px; the star title ~867px, subtitle
 * ~689px, dedication ~479px — both default text sets fit at scale 1
 * with the fit as backstop (pinned in
 * scripts/unit/shapeTextRows407.test.mjs). A #404 heart-path redraw
 * invalidates the heart numbers and requires a re-tune.
 */
export const HEART_TEXT_BOX_ROWS: Record<DefaultTextBoxId, number> = {
  title: 0.38,
  subtitle: 0.46,
  dedication: 0.65,
};

/** Star default rows — see HEART_TEXT_BOX_ROWS for the derivation. */
export const STAR_TEXT_BOX_ROWS: Record<DefaultTextBoxId, number> = {
  title: 0.43,
  subtitle: 0.5,
  dedication: 0.65,
};

const MASK_ROW_SETS: ReadonlyArray<Record<DefaultTextBoxId, number>> = [
  HEART_TEXT_BOX_ROWS,
  STAR_TEXT_BOX_ROWS,
];

/**
 * Tolerance for recognising a stored row as a heart/star default.
 * Mask rows reach storage through a footprint conversion and come
 * back through its inverse; the round trip is exact in real
 * arithmetic but can differ by a few ulps in floating point. 1e-9 of
 * canvas height is far below any renderable distance, and a
 * user-dragged row landing within it of a default is
 * indistinguishable from the default anyway. (The canvas-space sets
 * keep exact equality: their stored values are the literal
 * constants, with no conversion in between.)
 */
const MASK_ROW_RECOGNITION_EPSILON = 1e-9;

function maskRowToCanvasRow(
  row: number,
  footprint: ShapeMaskFootprint | null | undefined,
  canvasHeight: number | undefined,
): number {
  if (!footprint || !canvasHeight || canvasHeight <= 0) return row;
  return (footprint.offsetY + row * footprint.size) / canvasHeight;
}

function canvasRowToMaskRow(
  y: number,
  footprint: ShapeMaskFootprint | null | undefined,
  canvasHeight: number | undefined,
): number {
  if (!footprint || !canvasHeight || canvasHeight <= 0 || footprint.size <= 0) return y;
  return (y * canvasHeight - footprint.offsetY) / footprint.size;
}

/**
 * The default rows for a shape, as CANVAS fractions for the caller's
 * layout. Standard and diamond rows are canvas-authored and returned
 * as shipped (the diamond's rows were tuned as canvas fractions and
 * #406 deliberately left them so). Heart/star rows are mask-authored
 * (above) and converted through the caller's footprint: pass a
 * footprint resolved for the design's aspect (any canvas of that
 * aspect — the fractions are scale-free) plus that canvas's height;
 * without one, the mask rows are returned verbatim, which is exact
 * under the legacy layout and at square canvases.
 */
export function resolveDefaultTextBoxRows(
  shape?: string,
  shapeMaskFootprint?: ShapeMaskFootprint | null,
  canvasHeight?: number,
): Record<DefaultTextBoxId, number> {
  if (shape === "diamond") return DIAMOND_TEXT_BOX_ROWS;
  if (shape === "heart" || shape === "star") {
    const maskRows = shape === "heart" ? HEART_TEXT_BOX_ROWS : STAR_TEXT_BOX_ROWS;
    if (!shapeMaskFootprint) return maskRows;
    return {
      title: maskRowToCanvasRow(maskRows.title, shapeMaskFootprint, canvasHeight),
      subtitle: maskRowToCanvasRow(maskRows.subtitle, shapeMaskFootprint, canvasHeight),
      dedication: maskRowToCanvasRow(maskRows.dedication, shapeMaskFootprint, canvasHeight),
    };
  }
  return STANDARD_TEXT_BOX_ROWS;
}

const DEFAULT_TEXT_BOX_IDS: readonly DefaultTextBoxId[] = [
  "title",
  "subtitle",
  "dedication",
];

/**
 * Move the designed text boxes between the default row sets for the
 * given shape — four sets since #407 (SQ-03 §4): standard S,
 * diamond D, heart H, star T; rectangle/circle/birthdaycake resolve
 * to S. A box follows the shape ONLY while it still sits exactly on
 * ANOTHER set's default row (centred, x = 0.5): that is the
 * "untouched default" provenance the editor already uses for sample
 * text sync (a box whose text still equals the sample constant is
 * not user content). Canvas-space sets (S/D) are recognised by exact
 * row equality, as shipped; mask-space sets (H/T) are recognised by
 * converting the stored row back into mask space for the caller's
 * layout (epsilon above). A box the user dragged or nudged, a custom
 * box, and a preset box with its own authored rows are user data and
 * are never moved — with SQ-03's documented caveat that a preset row
 * coinciding exactly with any recognised row WILL migrate; that is a
 * limit of inferred provenance, unchanged from the two-set era.
 * Boxes already on the target set's rows are untouched (the target
 * is checked first), so the function is idempotent — including
 * heart↔star, whose shared dedication row (0.65) needs no move — and
 * it returns the original array (same reference) when nothing moved.
 *
 * The footprint/canvasHeight arguments carry the design's layout for
 * the mask-space conversions (see resolveDefaultTextBoxRows); omit
 * them for legacy/square layouts, where mask rows are canvas rows.
 */
export function applyDefaultTextRowsForShape<
  T extends { id: string; position?: { x: number; y: number } },
>(boxes: T[], shape?: string, shapeMaskFootprint?: ShapeMaskFootprint | null, canvasHeight?: number): T[] {
  const target = resolveDefaultTextBoxRows(shape, shapeMaskFootprint, canvasHeight);
  let changed = false;
  const next = boxes.map((box) => {
    if (!DEFAULT_TEXT_BOX_IDS.includes(box.id as DefaultTextBoxId)) return box;
    const id = box.id as DefaultTextBoxId;
    const position = box.position;
    if (!position || position.x !== DEFAULT_TEXT_BOX_X) return box;
    if (position.y === target[id]) return box;
    const maskY = canvasRowToMaskRow(position.y, shapeMaskFootprint, canvasHeight);
    const recognised =
      position.y === STANDARD_TEXT_BOX_ROWS[id] ||
      position.y === DIAMOND_TEXT_BOX_ROWS[id] ||
      MASK_ROW_SETS.some(
        (set) => Math.abs(maskY - set[id]) <= MASK_ROW_RECOGNITION_EPSILON,
      );
    if (!recognised) return box;
    changed = true;
    return { ...box, position: { x: position.x, y: target[id] } };
  });
  return changed ? next : boxes;
}
