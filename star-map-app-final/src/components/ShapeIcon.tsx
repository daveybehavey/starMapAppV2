"use client";

import { getShapeGeometry } from "@/lib/shapes";
import type { Shape } from "@/lib/types";

type Props = {
  shape: Shape;
  className?: string;
};

const ICON_SIZE = 24;
const GLYPH_BOX = 20;

/**
 * Shape-picker icon (#415): an inline SVG of the shape's actual mask
 * geometry from `getShapeGeometry` — the same source the renderer
 * clips with — instead of a unicode glyph. Glyphs rendered through
 * font fallback, so the heart could appear as a red emoji on
 * Android; an SVG path cannot.
 *
 * Rendering contract: a fixed 24×24 box that never shrinks in flex
 * layouts; the canonical square canvas is contain-mapped into a
 * centred 20×20 area with its intrinsic margins preserved (no
 * per-silhouette bounding-box normalisation); filled with
 * `currentColor` so each picker's existing selected/unselected text
 * colours drive the icon, with no stroke and no selected-state
 * geometry change. The icon depicts the square-canvas mask — it does
 * not stretch when the customer changes aspect. Decorative only:
 * the button's visible label carries the accessible name.
 */
export function ShapeIcon({ shape, className = "" }: Props) {
  const { d, viewBox } = getShapeGeometry(shape);
  const [minX, minY, vbWidth, vbHeight] = viewBox;
  const scale = Math.min(GLYPH_BOX / vbWidth, GLYPH_BOX / vbHeight);
  const tx = (ICON_SIZE - vbWidth * scale) / 2 - minX * scale;
  const ty = (ICON_SIZE - vbHeight * scale) / 2 - minY * scale;

  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`}
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
        <path d={d} fill="currentColor" />
      </g>
    </svg>
  );
}
