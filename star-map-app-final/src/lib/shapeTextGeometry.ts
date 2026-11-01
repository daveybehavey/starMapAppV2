/**
 * Shape-interior geometry for shape-aware text layout (#407, SQ-03).
 *
 * The diamond's text fit/clamp geometry is a closed-form tent
 * (textFit.ts), but heart and star are concave: above the heart's
 * cleft and below the star's bottom notch the horizontal cross-section
 * is TWO disjoint intervals, so an outer-envelope width would count
 * the gap as usable space. This module derives the real interior from
 * the same SHAPE_PATHS entries the renderer clips with
 * (buildShapeClip in renderSky.ts reads SHAPE_PATHS exclusively), so
 * the fit/clamp geometry and the rendered mask can never drift apart.
 * (The public/shapes/*.svg files SQ-03 worried about are loaded only
 * by lib/shapeUtils.ts, which has no consumers; the heart SVG there
 * diverges from SHAPE_PATHS and is dead code — recorded in the #407
 * PR, not fixed there.)
 *
 * Coordinates are MASK-normalized: x and y are fractions of the
 * shape's viewBox (0..1 on both axes for heart/star). A caller maps a
 * canvas span into mask space with the design's layout — under the
 * legacy layout the mask space IS the full canvas; under the #406
 * uniform layout it is the mask's centred square footprint
 * (shapeLayout.ts) — evaluates here, and maps the result back.
 *
 * The paths are flattened once (cubic Béziers at a fixed subdivision)
 * and every query is answered against that polygon. Between two
 * consecutive vertex rows the polygon's interval endpoints are linear
 * in y, and the interval STRUCTURE (which intervals exist, which one
 * contains a given segment) can only change at a vertex row — so
 * sampling a span at its endpoints plus every vertex row inside it is
 * exact for the flattened polygon, not an approximation grid.
 *
 * Pure and DOM-free (like shapeLayout.ts) so the plain-Node unit
 * runner can import it directly. Dependency-free for the same
 * reason (the watermarkPlacement.ts precedent): the SHAPE_PATHS
 * lookup lives in lib/shapeTextProfile.ts, which hands this module
 * the path data; everything here is a function of that data.
 */

/** One horizontal interior interval in mask-normalized x: [left, right]. */
export type ShapeInteriorInterval = readonly [number, number];

export interface ShapeTextProfile {
  /** Shape id this profile was built from ("heart" | "star"). */
  shape: string;
  /**
   * Sorted, unique mask-normalized rows at which the polygon has a
   * vertex (flattened Bézier points included). Interval structure can
   * only change at these rows.
   */
  criticalRows: readonly number[];
  /**
   * Sorted, unique mask-normalized rows of the path's STRUCTURAL
   * vertices only (move/line endpoints and curve endpoints — the
   * Bézier subdivision points are excluded). A much smaller set than
   * criticalRows; the drag clamp uses these as candidate rows, where
   * feasibility changes most.
   */
  vertexRows: readonly number[];
  /** Interior intervals at mask row `v` (0..1), sorted by left edge. */
  intervalsAt(v: number): ShapeInteriorInterval[];
  /**
   * Half-width of the interval containing the mask centre (x = 0.5)
   * at row `v`: how wide a CENTRED line may be at that row, as a
   * mask-normalized half-width. 0 when the centre is outside the mask
   * (the heart's cleft, the star's bottom notch).
   */
  centeredHalfWidthAt(v: number): number;
  /** Whether the segment [lo, hi] lies inside ONE interval at row `v`. */
  segmentContainedAt(v: number, lo: number, hi: number): boolean;
  /**
   * The largest CENTRED half-width available across a whole vertical
   * span (the minimum of centeredHalfWidthAt over the span) — the fit
   * bound for a centred line whose glyph box covers the span, and the
   * feasibility test for a drag centre's row.
   */
  centeredHalfWidthAcrossSpan(vTop: number, vBottom: number): number;
  /**
   * The set of centres (mask-normalized x) at which a segment of
   * half-width `halfWidth` fits inside the mask at EVERY row of the
   * span, as a sorted list of disjoint centre intervals.
   */
  validCenterIntervalsAcrossSpan(
    vTop: number,
    vBottom: number,
    halfWidth: number,
  ): Array<readonly [number, number]>;
  /**
   * The interior intervals that persist across a whole vertical
   * span: the intersection, over the span's sample rows, of each
   * row's interior interval set — the x-ranges inside the mask at
   * EVERY row of the span (S93-2 class 3). Disjoint intervals stay
   * disjoint: a span crossing the heart's cleft returns the two
   * lobe intervals, never a bridged envelope, so a consumer fitting
   * text against these intervals can never span the gap.
   */
  interiorIntervalsAcrossSpan(
    vTop: number,
    vBottom: number,
  ): ShapeInteriorInterval[];
  /**
   * Whether the whole glyph rectangle (centre + half extents, all
   * mask-normalized) lies inside the mask — segment containment at
   * every sample row of its vertical span.
   */
  rectContainedAt(cx: number, cy: number, halfWidth: number, halfHeight: number): boolean;
}

/** Fixed Bézier subdivision: deterministic across runs and platforms. */
const BEZIER_SUBDIVISIONS = 64;

type Point = readonly [number, number];

function tokenizePath(d: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const pattern = /[MLCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(d)) !== null) {
    const raw = match[0];
    tokens.push(/[MLCZ]/i.test(raw) ? raw.toUpperCase() : Number(raw));
  }
  return tokens;
}

/**
 * Flatten an absolute M/L/C/Z path (the subset SHAPE_PATHS uses) into
 * polygon vertices in viewBox units. Implicit coordinate groups repeat
 * the current command, and pairs after an M are implicit L — the SVG
 * rules the authored paths rely on.
 */
function flattenPath(d: string): { points: Point[]; vertices: Point[] } {
  const tokens = tokenizePath(d);
  const points: Point[] = [];
  const vertices: Point[] = [];
  let i = 0;
  let command: string | null = null;
  let current: Point = [0, 0];
  let subpathStart: Point = [0, 0];
  const readNumber = (): number => {
    const value = tokens[i++];
    if (typeof value !== "number") throw new Error(`shape path: expected number at ${i - 1}`);
    return value;
  };
  while (i < tokens.length) {
    if (typeof tokens[i] === "string") {
      command = tokens[i++] as string;
      if (command === "Z") {
        points.push(subpathStart);
        current = subpathStart;
        command = null;
      }
      continue;
    }
    if (command === "M") {
      current = [readNumber(), readNumber()];
      subpathStart = current;
      points.push(current);
      vertices.push(current);
      command = "L";
    } else if (command === "L") {
      current = [readNumber(), readNumber()];
      points.push(current);
      vertices.push(current);
    } else if (command === "C") {
      const [x1, y1, x2, y2, x, y] = [
        readNumber(),
        readNumber(),
        readNumber(),
        readNumber(),
        readNumber(),
        readNumber(),
      ];
      const [x0, y0] = current;
      for (let step = 1; step <= BEZIER_SUBDIVISIONS; step++) {
        const t = step / BEZIER_SUBDIVISIONS;
        const mt = 1 - t;
        points.push([
          mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x,
          mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y,
        ]);
      }
      current = [x, y];
      vertices.push(current);
    } else {
      throw new Error(`shape path: unexpected token at ${i}`);
    }
  }
  return { points, vertices };
}

/**
 * Build the text-geometry profile for one shape path (viewBox units
 * in, mask-normalized geometry out). Exported for the app-side
 * resolver (lib/shapeTextProfile.ts) and for tests, which pin the
 * geometry against SHAPE_PATHS directly.
 */
export function buildShapeTextProfile(
  shape: string,
  d: string,
  viewBox: readonly [number, number, number, number],
): ShapeTextProfile {
  const [minX, minY, vbWidth, vbHeight] = viewBox;
  const { points: polygon, vertices } = flattenPath(d);
  const criticalRows = Array.from(
    new Set(polygon.map(([, y]) => (y - minY) / vbHeight)),
  ).sort((a, b) => a - b);
  const vertexRows = Array.from(
    new Set(vertices.map(([, y]) => (y - minY) / vbHeight)),
  ).sort((a, b) => a - b);

  // Edge index for scanline queries (Codex P1 on PR #432: a naive
  // intervalsAt rescans the whole flattened polygon — several
  // hundred edges — and the drag clamp issues thousands of span
  // queries per pointer move, ~500ms per invalid drag position).
  // Non-horizontal edges are bucketed into horizontal bands; a
  // scanline only tests the edges in its own band. Horizontal edges
  // never satisfy the half-open crossing rule and are excluded.
  const BAND_COUNT = 256;
  const edges: Array<readonly [number, number, number, number]> = [];
  const bands: number[][] = Array.from({ length: BAND_COUNT }, () => []);
  for (let k = 0; k + 1 < polygon.length; k++) {
    const [x1, y1] = polygon[k];
    const [x2, y2] = polygon[k + 1];
    if (y1 === y2) continue;
    const edgeIndex = edges.length;
    edges.push([x1, y1, x2, y2]);
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    const bandLo = Math.max(0, Math.min(BAND_COUNT - 1, Math.floor(((lo - minY) / vbHeight) * BAND_COUNT)));
    const bandHi = Math.max(0, Math.min(BAND_COUNT - 1, Math.floor(((hi - minY) / vbHeight) * BAND_COUNT)));
    for (let band = bandLo; band <= bandHi; band++) bands[band].push(edgeIndex);
  }

  function intervalsAt(v: number): ShapeInteriorInterval[] {
    if (!Number.isFinite(v)) return [];
    const y = minY + v * vbHeight;
    const band = Math.max(0, Math.min(BAND_COUNT - 1, Math.floor(v * BAND_COUNT)));
    const crossings: number[] = [];
    for (const edgeIndex of bands[band]) {
      const [x1, y1, x2, y2] = edges[edgeIndex];
      // Half-open edge rule: an edge counts when the scanline is in
      // [min(y1,y2), max(y1,y2)) — a vertex shared by two edges is
      // counted exactly once, so crossings pair up deterministically.
      if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
        crossings.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    crossings.sort((a, b) => a - b);
    const intervals: ShapeInteriorInterval[] = [];
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const left = (crossings[k] - minX) / vbWidth;
      const right = (crossings[k + 1] - minX) / vbWidth;
      if (right > left) intervals.push([left, right]);
    }
    return intervals;
  }

  function centeredHalfWidthAt(v: number): number {
    for (const [left, right] of intervalsAt(v)) {
      if (left <= 0.5 && 0.5 <= right) return Math.min(0.5 - left, right - 0.5);
    }
    return 0;
  }

  function segmentContainedAt(v: number, lo: number, hi: number): boolean {
    return intervalsAt(v).some(([left, right]) => left <= lo && hi <= right);
  }

  const profile: ShapeTextProfile = {
    shape,
    criticalRows,
    vertexRows,
    intervalsAt,
    centeredHalfWidthAt,
    segmentContainedAt,
    centeredHalfWidthAcrossSpan(vTop: number, vBottom: number): number {
      let min = Number.POSITIVE_INFINITY;
      for (const row of shapeSpanSampleRows(profile, vTop, vBottom)) {
        min = Math.min(min, centeredHalfWidthAt(row));
      }
      return Number.isFinite(min) ? min : 0;
    },
    validCenterIntervalsAcrossSpan(
      vTop: number,
      vBottom: number,
      halfWidth: number,
    ): Array<readonly [number, number]> {
      let valid: Array<readonly [number, number]> | null = null;
      for (const row of shapeSpanSampleRows(profile, vTop, vBottom)) {
        const rowValid: Array<readonly [number, number]> = [];
        for (const [left, right] of intervalsAt(row)) {
          if (right - left >= halfWidth * 2) rowValid.push([left + halfWidth, right - halfWidth]);
        }
        if (valid === null) {
          valid = rowValid;
        } else {
          const next: Array<readonly [number, number]> = [];
          for (const [aLo, aHi] of valid) {
            for (const [bLo, bHi] of rowValid) {
              const lo = Math.max(aLo, bLo);
              const hi = Math.min(aHi, bHi);
              if (lo <= hi) next.push([lo, hi]);
            }
          }
          valid = next;
        }
        if (valid.length === 0) break;
      }
      return valid ?? [];
    },
    interiorIntervalsAcrossSpan(
      vTop: number,
      vBottom: number,
    ): ShapeInteriorInterval[] {
      // The persistent intervals are exactly the valid centres for a
      // zero-width segment: per row every interior interval is a
      // valid placement for a point, and the span's set is the
      // intersection over the span's sample rows.
      return profile.validCenterIntervalsAcrossSpan(vTop, vBottom, 0);
    },
    rectContainedAt(cx: number, cy: number, halfWidth: number, halfHeight: number): boolean {
      const lo = cx - halfWidth;
      const hi = cx + halfWidth;
      for (const row of shapeSpanSampleRows(profile, cy - halfHeight, cy + halfHeight)) {
        if (!segmentContainedAt(row, lo, hi)) return false;
      }
      return true;
    },
  };
  return profile;
}

/**
 * Rows a span must be evaluated at to be exact for the flattened
 * polygon: the span's endpoints plus every critical row inside it.
 * Returned sorted, clamped to [0, 1].
 */
export function shapeSpanSampleRows(
  profile: ShapeTextProfile,
  vTop: number,
  vBottom: number,
): number[] {
  const lo = Math.max(0, Math.min(vTop, vBottom));
  const hi = Math.min(1, Math.max(vTop, vBottom));
  // criticalRows is sorted: binary-search the slice inside the span
  // instead of scanning every vertex row per query (the drag clamp
  // issues hundreds of span queries per pointer move).
  const critical = profile.criticalRows;
  let start = 0;
  let end = critical.length;
  while (start < end) {
    const mid = (start + end) >> 1;
    if (critical[mid] <= lo) start = mid + 1;
    else end = mid;
  }
  const rows = [lo];
  for (let i = start; i < critical.length && critical[i] < hi; i++) {
    rows.push(critical[i]);
  }
  rows.push(hi);
  return rows;
}

/**
 * The largest CENTRED half-width available across a whole vertical
 * span (the minimum of centeredHalfWidthAt over the span) — the fit
 * bound for a centred line whose glyph box covers the span, and the
 * feasibility test for a drag centre's row. Exact per the sampling
 * argument in shapeSpanSampleRows. Delegates to the profile method of
 * the same name; this free form exists for callers (tests, proof
 * harnesses) that hold a profile directly.
 */
export function resolveCenteredHalfWidthAcrossSpan(
  profile: ShapeTextProfile,
  vTop: number,
  vBottom: number,
): number {
  return profile.centeredHalfWidthAcrossSpan(vTop, vBottom);
}

/**
 * The set of centres (mask-normalized x) at which a segment of
 * half-width `halfWidth` fits inside the mask at EVERY row of the
 * span, as a sorted list of disjoint centre intervals. Per row the
 * valid centres are the union of [left + halfWidth, right −
 * halfWidth] over intervals wide enough to hold the segment; the
 * span's set is the intersection over the span's sample rows (exact,
 * per the header's sampling argument). Delegates to the profile
 * method of the same name.
 */
export function resolveValidCenterIntervalsAcrossSpan(
  profile: ShapeTextProfile,
  vTop: number,
  vBottom: number,
  halfWidth: number,
): Array<readonly [number, number]> {
  return profile.validCenterIntervalsAcrossSpan(vTop, vBottom, halfWidth);
}

/**
 * The interior intervals that persist across a whole vertical span
 * (the intersection of the per-row interval sets over the span's
 * sample rows). Delegates to the profile method of the same name;
 * this free form exists for callers (tests, proof harnesses) that
 * hold a profile directly.
 */
export function resolveInteriorIntervalsAcrossSpan(
  profile: ShapeTextProfile,
  vTop: number,
  vBottom: number,
): ShapeInteriorInterval[] {
  return profile.interiorIntervalsAcrossSpan(vTop, vBottom);
}
