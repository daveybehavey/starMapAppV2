/**
 * Shape-mask layout versions (#406, SQ-02 Option A).
 *
 * The shape masks (heart / star / diamond / birthdaycake) are authored
 * on square SVG viewBoxes. Layout version 1 — the historical renderer
 * behaviour, and the meaning of a MISSING version on every design
 * saved before this field existed — stretches the path independently
 * on X and Y to fill whatever canvas the design's aspect ratio gives
 * it, so the same heart renders plump on a square canvas and as a
 * long balloon at 2:3.
 *
 * Layout version 2 scales the path UNIFORMLY (contain): one scale
 * factor, `min(W / vbW, H / vbH)`, with the viewBox footprint centred
 * on the canvas and the remainder left as mat — the treatment the
 * circle mask (a min-dimension radius) and the rectangle (the full
 * canvas) already had, so the shape family is coherent under v2.
 * Silhouette proportions then depend only on the path, never on the
 * canvas aspect.
 *
 * Versioning contract (SQ-02 §3):
 * - A design's version is persisted in its render options
 *   (`RenderOptions.shapeLayoutVersion`); absent means legacy (v1).
 * - New designs are stamped v2 at creation (editor initial state,
 *   simplified-editor sample). Saved designs are NEVER silently
 *   converted: every hydration / draft / download path carries the
 *   stored value through verbatim, including "absent".
 * - Changing an existing design's aspect retains its version.
 *
 * This module is pure (no DOM) so the geometry is unit-testable in
 * Node; `buildShapeClip` in renderSky.ts turns the resolved transform
 * into a Path2D, and textFit.ts evaluates the diamond's text geometry
 * in the same footprint space.
 */

export const SHAPE_LAYOUT_VERSION_LEGACY = 1;
export const SHAPE_LAYOUT_VERSION_UNIFORM = 2;

/** Resolve a persisted value to a known layout version. Only the
 * exact value 2 selects the uniform layout; anything else (absent,
 * 1, malformed) is legacy, so an unreadable design renders exactly
 * as it did before the field existed. */
export function resolveShapeLayoutVersion(value: unknown): 1 | 2 {
  return value === SHAPE_LAYOUT_VERSION_UNIFORM
    ? SHAPE_LAYOUT_VERSION_UNIFORM
    : SHAPE_LAYOUT_VERSION_LEGACY;
}

export interface ShapeClipTransform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

/**
 * The affine map from SVG viewBox coordinates to canvas pixels for a
 * path shape, as `p' = (scaleX * x + translateX, scaleY * y +
 * translateY)`.
 *
 * - Legacy: the historical independent factors — `scaleX = W / vbW`,
 *   `scaleY = H / vbH`, translated by `(-minX, -minY)` (the exact map
 *   the pre-#406 DOMMatrix composition produced).
 * - Uniform (SQ-02 Option A): `s = min(W / vbW, H / vbH)` on both
 *   axes, with the scaled viewBox footprint centred:
 *   `tx = (W - s * vbW) / 2 - s * minX`, `ty` likewise.
 */
export function resolveShapeClipTransform(
  viewBox: readonly [number, number, number, number],
  width: number,
  height: number,
  shapeLayoutVersion: unknown,
): ShapeClipTransform {
  const [minX, minY, vbWidth, vbHeight] = viewBox;
  if (resolveShapeLayoutVersion(shapeLayoutVersion) === SHAPE_LAYOUT_VERSION_UNIFORM) {
    const s = Math.min(width / vbWidth, height / vbHeight);
    return {
      scaleX: s,
      scaleY: s,
      translateX: (width - s * vbWidth) / 2 - s * minX,
      translateY: (height - s * vbHeight) / 2 - s * minY,
    };
  }
  return {
    scaleX: width / vbWidth,
    scaleY: height / vbHeight,
    // `0 - minX`, not `-minX`: for a zero origin the unary form yields
    // -0, which is numerically identical but makes the legacy map
    // compare unequal (Object.is) to the uniform map at square
    // canvases, where the two must coincide exactly.
    translateX: 0 - minX,
    translateY: 0 - minY,
  };
}

export interface ShapeMaskFootprint {
  /** Footprint edge length in pixels (the viewBox is square). */
  size: number;
  /** Canvas pixel offset of the footprint's left edge. */
  offsetX: number;
  /** Canvas pixel offset of the footprint's top edge. */
  offsetY: number;
}

/**
 * The square footprint a path shape's viewBox occupies on the canvas
 * under the uniform layout: side `min(W, H)`, centred. Returns null
 * under the legacy layout, whose mask space is the full (stretched)
 * canvas — callers evaluating geometry in mask space (the diamond
 * text fit / drag clamp in textFit.ts) use their historical
 * canvas-space math verbatim in that case.
 */
export function resolveShapeMaskFootprint(
  width: number,
  height: number,
  shapeLayoutVersion: unknown,
): ShapeMaskFootprint | null {
  if (resolveShapeLayoutVersion(shapeLayoutVersion) !== SHAPE_LAYOUT_VERSION_UNIFORM) {
    return null;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const size = Math.min(width, height);
  return { size, offsetX: (width - size) / 2, offsetY: (height - size) / 2 };
}
