// ─────────────────────────────────────────────────────────────────────────────
// Planet name labels (PROD-SM W2-2, #489) — pure style + layout.
//
// Planet labels deliberately reuse the renderer's existing annotation
// system — the constellation labels painted by drawConstellations in
// renderSky.ts — rather than introducing a parallel style: same
// Montserrat 500 face, same tier-based sizes and letter spacing, same
// uppercase treatment, same accent-colour alpha rule, and the same
// collision rule (a label whose bounds overlap an already-placed label
// is skipped). This module is the dependency-free half (style table +
// placement solver) so unit tests can import it directly, following
// the watermarkPlacement / moonPhaseGeometry pattern; renderSky.ts
// owns the canvas painting.
//
// Placement: a planet's label is centred horizontally on the planet's
// rendered centre and sits just below its rendered disc. Both inputs
// (centre, radius) are the values the renderer computed for this same
// paint pass, so the label can never drift from the disc it names.
// ─────────────────────────────────────────────────────────────────────────────

import type { MapLookTier } from "./mapLookTiers";

export interface PlanetLabelStyle {
  /** Full canvas font string, e.g. `500 9.5px "Montserrat", sans-serif`. */
  font: string;
  fontSizePx: number;
  letterSpacingPx: number;
  /** Fill alpha, mirroring the constellation-label alpha rule. */
  alpha: number;
  collisionPadX: number;
  collisionPadY: number;
}

/**
 * The constellation-label alpha rule is
 * clamp(lineAlpha + tierBoost, 0.32, 0.78) with lineAlpha defaulting
 * to 0.3 in drawConstellations. Planet labels use that same default
 * base so the two annotation kinds sit at the same strength.
 */
const PLANET_LABEL_BASE_ALPHA = 0.3;

function clampLabelAlpha(value: number) {
  return Math.min(0.78, Math.max(0.32, value));
}

export function resolvePlanetLabelStyle(
  mapLookTier: MapLookTier,
  scale: number,
): PlanetLabelStyle {
  // S93-2 class 1 (same rule as the constellation labels): the size
  // minima are reference-canvas minima — they floor the unscaled tier
  // size, then scale with the canvas.
  const fontSizePx =
    mapLookTier === "minimal"
      ? Math.max(7.5, 8) * scale
      : mapLookTier === "polished"
        ? Math.max(8.5, 9.5) * scale
        : Math.max(8, 9) * scale;
  const letterSpacingPx =
    mapLookTier === "minimal" ? 0.2 * scale : mapLookTier === "polished" ? 0.15 * scale : 0.12 * scale;
  return {
    font: `500 ${fontSizePx}px "Montserrat", sans-serif`,
    fontSizePx,
    letterSpacingPx,
    alpha: clampLabelAlpha(
      PLANET_LABEL_BASE_ALPHA + (mapLookTier === "polished" ? 0.26 : 0.22),
    ),
    collisionPadX: mapLookTier === "minimal" ? 6 * scale : 5 * scale,
    collisionPadY: mapLookTier === "minimal" ? 5 * scale : 4 * scale,
  };
}

export interface PlanetLabelInput {
  name: string;
  /** Rendered centre of the planet disc, in canvas pixels. */
  x: number;
  y: number;
  /** Rendered disc radius, in canvas pixels. */
  radius: number;
}

export interface PlanetLabelPlacement {
  name: string;
  /** Uppercase display text, matching the constellation labels. */
  text: string;
  /** Label centre, in canvas pixels (painted with middle baseline). */
  x: number;
  y: number;
}

interface LabelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve which planet labels paint, and where. `measure` returns the
 * rendered width of a label's text in pixels (the renderer passes
 * ctx.measureText with the label font already set). Planets are
 * considered in input order; a label is skipped when its padded
 * bounds overlap a label already placed — the constellation-label
 * collision rule, unchanged.
 */
export function resolvePlanetLabelPlacements(
  planets: readonly PlanetLabelInput[],
  style: PlanetLabelStyle,
  measure: (text: string) => number,
): PlanetLabelPlacement[] {
  const placed: LabelBounds[] = [];
  const overlaps = (a: LabelBounds) =>
    placed.some((b) => {
      const paddedA = {
        x: a.x - style.collisionPadX,
        y: a.y - style.collisionPadY,
        width: a.width + style.collisionPadX * 2,
        height: a.height + style.collisionPadY * 2,
      };
      return !(
        paddedA.x + paddedA.width < b.x ||
        b.x + b.width < paddedA.x ||
        paddedA.y + paddedA.height < b.y ||
        b.y + b.height < paddedA.y
      );
    });

  const placements: PlanetLabelPlacement[] = [];
  for (const planet of planets) {
    if (!planet.name) continue;
    if (!Number.isFinite(planet.x) || !Number.isFinite(planet.y)) continue;
    const text = planet.name.toUpperCase();
    const labelX = planet.x;
    const labelY = planet.y + planet.radius + style.fontSizePx * 0.85;
    const width = measure(text);
    const bounds: LabelBounds = {
      x: labelX - width / 2,
      y: labelY - style.fontSizePx * 0.55,
      width,
      height: style.fontSizePx * 1.1,
    };
    if (overlaps(bounds)) continue;
    placed.push(bounds);
    placements.push({ name: planet.name, text, x: labelX, y: labelY });
  }
  return placements;
}
