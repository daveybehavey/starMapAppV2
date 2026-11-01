/**
 * Projected illuminated-disc geometry for the renderer's moon
 * (S93-2 class 4).
 *
 * The moon's shading is the projection of the sunlit hemisphere
 * onto the disc. For a normalized disc point (u, v) — u right, v
 * down, unit disc — with z the front-hemisphere depth
 * sqrt(1 − u² − v²) and phase angle α = 2π × phase:
 *
 *     lit ⇔ u × sin(α) − z × cos(α) ≥ 0
 *
 * This specifies right-lit waxing and left-lit waning in a fixed
 * screen orientation, and an illuminated area of exactly
 * (1 − cos α) / 2. The pre-fix renderer computed that illumination
 * fraction but painted a moving horizontal gradient whose stop sat
 * at 1 − illumination: new and full were reversed (phase 0 left
 * most of the disc bright, phase .5 most of it dark) and waxing
 * was left-lit.
 *
 * Pure and dependency-free (like shapeTextGeometry.ts) so the
 * plain-Node unit runner can import it directly. The renderer
 * (renderSky.ts drawMoon) turns the terminator geometry below
 * into a closed vector path — limb arc plus terminator ellipse —
 * so exports never raster-loop over the canvas.
 */

/** Normalize a phase into [0, 1); nonfinite input is phase zero. */
export function normalizeMoonPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  const wrapped = phase % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/** Illuminated fraction of the disc for a phase: (1 − cos α) / 2. */
export function moonIlluminationFraction(phase: number): number {
  const angle = normalizeMoonPhase(phase) * 2 * Math.PI;
  return (1 - Math.cos(angle)) / 2;
}

/**
 * Whether the normalized disc point (u, v) is lit at a phase, per
 * the projection in the header. Points outside the unit disc are
 * never lit.
 */
export function isMoonPointLit(u: number, v: number, phase: number): boolean {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return false;
  const depthSquared = 1 - u * u - v * v;
  if (depthSquared < 0) return false;
  const angle = normalizeMoonPhase(phase) * 2 * Math.PI;
  return u * Math.sin(angle) - Math.sqrt(depthSquared) * Math.cos(angle) >= 0;
}

export type MoonTerminatorGeometry =
  /** New moon: no point of the disc is lit. */
  | { kind: "empty" }
  /** Full moon: the whole disc is lit. */
  | { kind: "full" }
  | {
      kind: "partial";
      /** Waxing (phase < .5): lit from the right limb. Waning: from the left. */
      waxing: boolean;
      /**
       * The terminator ellipse's horizontal radius as a fraction
       * of the disc radius: |cos α|. The terminator is the
       * half-ellipse through the poles and (cos α, 0) in disc
       * space — a straight diameter at the quarter phases.
       */
      terminatorRadiusRatio: number;
      /**
       * Canvas arc flags for the lit region's closed path, drawn
       * as: limb arc from the top pole to the bottom pole, then
       * the terminator ellipse from the bottom pole back to the
       * top pole through (cos α × radius, 0).
       */
      limbCounterclockwise: boolean;
      terminatorCounterclockwise: boolean;
    };

/**
 * The terminator geometry for a phase, in the exact form drawMoon
 * paints. The flags follow from the projection in the header: at
 * the equator the terminator crosses at u = cos α (waxing) /
 * u = −cos α (waning), and the lit limb is the right one while
 * waxing, the left one while waning.
 */
export function resolveMoonTerminatorGeometry(
  phase: number,
): MoonTerminatorGeometry {
  const normalized = normalizeMoonPhase(phase);
  if (normalized === 0) return { kind: "empty" };
  if (normalized === 0.5) return { kind: "full" };
  const angle = normalized * 2 * Math.PI;
  const cos = Math.cos(angle);
  const waxing = normalized < 0.5;
  return {
    kind: "partial",
    waxing,
    terminatorRadiusRatio: Math.abs(cos),
    limbCounterclockwise: !waxing,
    terminatorCounterclockwise: waxing ? cos > 0 : cos < 0,
  };
}
