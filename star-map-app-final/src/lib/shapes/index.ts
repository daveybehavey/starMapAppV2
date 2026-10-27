import type { Shape } from "../types";

export const SHAPE_PATHS: Record<string, { d: string; viewBox: [number, number, number, number] }> = {
  rectangle: { d: "", viewBox: [0, 0, 100, 100] }, // handled procedurally
  circle: { d: "M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z", viewBox: [0, 0, 100, 100] },
  diamond: { d: "M50 6 L94 50 L50 94 L6 50 Z", viewBox: [0, 0, 100, 100] },
  heart: {
    d: "M50 88 C24 70 8 52 8 34 C8 20 19 10 32 10 C41 10 48 14 50 20 C52 14 59 10 68 10 C81 10 92 20 92 34 C92 52 76 70 50 88 Z",
    viewBox: [0, 0, 100, 100],
  },
  star: { d: "M50 4 L61.8 35.1 L95 38.2 L69 59.9 L77.6 92 L50 74.5 L22.4 92 L31 59.9 L5 38.2 L38.2 35.1 Z", viewBox: [0, 0, 100, 100] },
  birthdaycake: {
    d: "M20 70 H80 V88 H20 Z M20 70 V55 Q30 50 40 55 T60 55 T80 55 V70 Z M32 55 V40 h4 V55 Z M52 55 V36 h4 V55 Z M72 55 V42 h4 V55 Z",
    viewBox: [0, 0, 100, 100],
  },
};

/* ------------------------------------------------------------------ */
/* Canonical square-canvas geometry — shared by the renderer's mask   */
/* (buildShapeClip in renderSky.ts) and the ShapeIcon picker icons     */
/* (#415), so the two can never drift apart.                           */
/* ------------------------------------------------------------------ */

/**
 * The circle mask is procedural in the renderer: an arc of radius
 * `minDim / 2 − minDim × SHAPE_CIRCLE_INSET_RATIO` centred on the
 * canvas — i.e. radius 0.44 × min(W,H). The SHAPE_PATHS circle entry
 * above (radius 50) is NOT what the renderer draws; buildShapeClip
 * branches to the procedural arc before ever reading it.
 */
export const SHAPE_CIRCLE_INSET_RATIO = 0.06;
export const SHAPE_CIRCLE_RADIUS_RATIO = 0.5 - SHAPE_CIRCLE_INSET_RATIO;

export interface ShapeGeometry {
  d: string;
  viewBox: [number, number, number, number];
}

const CANONICAL_VIEWBOX: [number, number, number, number] = [0, 0, 100, 100];

/**
 * SVG-compatible geometry for `shape` on the canonical 100×100 square
 * canvas, with each silhouette's intrinsic margins preserved.
 *
 * - heart / star / diamond: the exact SHAPE_PATHS entries the renderer
 *   clips with — a future path change (e.g. #404) updates the icons
 *   automatically.
 * - circle: the renderer's procedural arc expressed as a path —
 *   centre (50, 50), radius 100 × SHAPE_CIRCLE_RADIUS_RATIO = 44.
 * - rectangle: the renderer's procedural full-canvas mask.
 */
export function getShapeGeometry(shape: Shape): ShapeGeometry {
  switch (shape) {
    case "heart":
    case "star":
    case "diamond": {
      const entry = SHAPE_PATHS[shape];
      return { d: entry.d, viewBox: [...entry.viewBox] };
    }
    case "circle": {
      const radius = Math.round(100 * SHAPE_CIRCLE_RADIUS_RATIO);
      const top = 50 - radius;
      const bottom = 50 + radius;
      return {
        d: `M50 ${top} A${radius} ${radius} 0 1 1 50 ${bottom} A${radius} ${radius} 0 1 1 50 ${top} Z`,
        viewBox: [...CANONICAL_VIEWBOX],
      };
    }
    case "rectangle":
      return { d: "M0 0 H100 V100 H0 Z", viewBox: [...CANONICAL_VIEWBOX] };
  }
}
