// ─────────────────────────────────────────────────────────────────────────────
// Watermark placement solver (#413, design SQ-55) — pure geometry.
//
// The old watermark was a single "StarMapCo" wordmark at 18% opacity in
// the bottom-left canvas corner, drawn unclipped after the shape layers:
// for every non-rectangle shape it landed on the mat in dead space, never
// touched the artwork, and cropping the corner removed it entirely.
//
// The SQ-55 treatment replaces it with ONE centre-anchored wordmark
// whose complete painted bounds lie (a) inside the actual artwork mask
// — the same resolved clip path that paints the sky — with 0.02D
// clearance, and (b) inside the canvas's central 50% region, also with
// 0.02D clearance (D = the mask bbox's shorter dimension). Keeping the
// whole mark inside the central region is what makes it crop-resistant:
// every 25% crop (any one edge, or any corner removing 25% of width AND
// height) retains that region, so every such crop retains 100% of the
// mark.
//
// Visual envelope: font size 0.045D reducible to 0.035D, painted width
// capped at 0.36D, outline width 0.025 × fontSize, composited at 24%
// opacity applied once (the painting lives in renderSky.ts; this module
// is the dependency-free solver so unit tests can import it directly).
// ─────────────────────────────────────────────────────────────────────────────

export const WATERMARK_TEXT = "StarMapCo";
export const WATERMARK_OPACITY = 0.24;
export const WATERMARK_MAX_FONT_RATIO = 0.045;
export const WATERMARK_MIN_FONT_RATIO = 0.035;
export const WATERMARK_MAX_WIDTH_RATIO = 0.36;
export const WATERMARK_CLEARANCE_RATIO = 0.02;
export const WATERMARK_STROKE_RATIO = 0.025;

export interface WatermarkMaskSampler {
  /** Bounding box of the artwork mask, in final canvas coordinates. */
  bbox: { x: number; y: number; width: number; height: number };
  /** True when the point (final canvas coordinates) is inside the mask. */
  contains: (x: number, y: number) => boolean;
}

export interface WatermarkTextMetrics {
  /** Glyph bounds relative to the centred/middle alignment point. */
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

export interface WatermarkPlacement {
  fontSize: number;
  lineWidth: number;
  centerX: number;
  centerY: number;
  /** Complete painted bounds (glyphs + outline) in canvas coordinates. */
  bounds: { x: number; y: number; width: number; height: number };
}

/**
 * Pure placement solver (SQ-55): given the canvas size, a sampler over
 * the renderer's actual mask, and a text measurer, find the wordmark's
 * font size and centre. Starts at the centre of the mask bbox; if that
 * position fails containment, takes the nearest valid position to it
 * (ties: smaller vertical displacement, then smaller horizontal).
 * Returns null when no position satisfies the constraints at the
 * minimum size — the caller must then paint NOTHING (never fall back to
 * the mat or shrink below the envelope).
 */
export function resolveWatermarkPlacement(args: {
  width: number;
  height: number;
  mask: WatermarkMaskSampler;
  measure: (fontSize: number) => WatermarkTextMetrics;
}): WatermarkPlacement | null {
  const { width, height, mask, measure } = args;
  const B = mask.bbox;
  const D = Math.min(B.width, B.height);
  if (!Number.isFinite(D) || D <= 0 || width <= 0 || height <= 0) return null;
  const clearance = WATERMARK_CLEARANCE_RATIO * D;

  // Font size: start at 0.045D; if the painted width exceeds 0.36D,
  // reduce proportionally toward the 0.035D floor. Below the floor the
  // width cap cannot be honoured, so there is no placement.
  let fontSize = WATERMARK_MAX_FONT_RATIO * D;
  let metrics = measure(fontSize);
  let lineWidth = WATERMARK_STROKE_RATIO * fontSize;
  let paintedWidth = metrics.left + metrics.right + lineWidth;
  const maxPaintedWidth = WATERMARK_MAX_WIDTH_RATIO * D;
  if (paintedWidth > maxPaintedWidth) {
    const scaledSize = fontSize * (maxPaintedWidth / paintedWidth);
    if (scaledSize < WATERMARK_MIN_FONT_RATIO * D) return null;
    fontSize = scaledSize;
    metrics = measure(fontSize);
    lineWidth = WATERMARK_STROKE_RATIO * fontSize;
    paintedWidth = metrics.left + metrics.right + lineWidth;
    if (paintedWidth > maxPaintedWidth * 1.001) return null;
  }
  const paintedHeight = metrics.ascent + metrics.descent + lineWidth;

  const boundsFor = (centerX: number, centerY: number) => ({
    x: centerX - metrics.left - lineWidth / 2,
    y: centerY - metrics.ascent - lineWidth / 2,
    width: paintedWidth,
    height: paintedHeight,
  });

  // Painted bounds inside the central 50% region with clearance.
  const fitsCentralRegion = (b: WatermarkPlacement["bounds"]) =>
    b.x >= 0.25 * width + clearance &&
    b.y >= 0.25 * height + clearance &&
    b.x + b.width <= 0.75 * width - clearance &&
    b.y + b.height <= 0.75 * height - clearance;

  // Painted bounds inside the mask with clearance: equivalently, the
  // bounds dilated by the clearance must be fully mask-contained.
  // Sampled on a grid finer than the clearance so concave intrusions
  // (the heart's dip, the star's notches) cannot slip between samples.
  const fitsMask = (b: WatermarkPlacement["bounds"]) => {
    const x0 = b.x - clearance;
    const x1 = b.x + b.width + clearance;
    const y0 = b.y - clearance;
    const y1 = b.y + b.height + clearance;
    const step = Math.max(0.5, clearance / 2);
    const nx = Math.max(1, Math.ceil((x1 - x0) / step));
    const ny = Math.max(1, Math.ceil((y1 - y0) / step));
    for (let i = 0; i <= nx; i++) {
      const x = x0 + (i / nx) * (x1 - x0);
      for (let j = 0; j <= ny; j++) {
        const y = y0 + (j / ny) * (y1 - y0);
        if (!mask.contains(x, y)) return false;
      }
    }
    return true;
  };

  const isValid = (centerX: number, centerY: number) => {
    const b = boundsFor(centerX, centerY);
    return fitsCentralRegion(b) && fitsMask(b);
  };

  const homeX = B.x + B.width / 2;
  const homeY = B.y + B.height / 2;
  if (isValid(homeX, homeY)) {
    return { fontSize, lineWidth, centerX: homeX, centerY: homeY, bounds: boundsFor(homeX, homeY) };
  }

  // Nearest valid position to the mask centre. Candidate centres are
  // pruned to those whose painted bounds can satisfy the central-region
  // constraint at all, then ordered nearest-first (ties: smaller
  // vertical displacement, then smaller horizontal, then up/left for
  // determinism).
  const minCenterX = 0.25 * width + clearance + metrics.left + lineWidth / 2;
  const maxCenterX = 0.75 * width - clearance - metrics.right - lineWidth / 2;
  const minCenterY = 0.25 * height + clearance + metrics.ascent + lineWidth / 2;
  const maxCenterY = 0.75 * height - clearance - metrics.descent - lineWidth / 2;
  if (minCenterX > maxCenterX || minCenterY > maxCenterY) return null;
  const step = 0.01 * D;
  const ixMin = Math.ceil((minCenterX - homeX) / step);
  const ixMax = Math.floor((maxCenterX - homeX) / step);
  const iyMin = Math.ceil((minCenterY - homeY) / step);
  const iyMax = Math.floor((maxCenterY - homeY) / step);
  const candidates: { dx: number; dy: number; dist2: number }[] = [];
  for (let ix = ixMin; ix <= ixMax; ix++) {
    for (let iy = iyMin; iy <= iyMax; iy++) {
      if (ix === 0 && iy === 0) continue;
      const dx = ix * step;
      const dy = iy * step;
      candidates.push({ dx, dy, dist2: dx * dx + dy * dy });
    }
  }
  candidates.sort(
    (a, b) =>
      a.dist2 - b.dist2 ||
      Math.abs(a.dy) - Math.abs(b.dy) ||
      Math.abs(a.dx) - Math.abs(b.dx) ||
      a.dy - b.dy ||
      a.dx - b.dx,
  );
  for (const candidate of candidates) {
    const centerX = homeX + candidate.dx;
    const centerY = homeY + candidate.dy;
    if (isValid(centerX, centerY)) {
      return { fontSize, lineWidth, centerX, centerY, bounds: boundsFor(centerX, centerY) };
    }
  }
  return null;
}
