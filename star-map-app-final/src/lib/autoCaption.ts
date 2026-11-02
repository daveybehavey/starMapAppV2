// ─────────────────────────────────────────────────────────────────────────────
// Auto-generated occasion caption row (PROD-SM W2-4, #490) — pure helpers.
//
// Common-occasion designs (anniversary, birthday, "the night we met", …)
// usually want one factual line under the artwork: where and when. The
// design already carries that data (location name, coordinates, date),
// so the caption is generated from it — "{Location} · {coords} · {date}"
// — and inserted as an ORDINARY text box (id "caption") through the
// existing text-box machinery. There is no caption-specific state,
// renderer path, or styling: after insertion the row edits, moves,
// restyles, and deletes exactly like the title/subtitle/dedication rows,
// and re-clicking "Add Caption" simply refreshes its text from the
// design's current data.
//
// No caption is produced when the data is absent: the placeholder
// location sentinel (latitude 0 AND longitude 0 — the same sentinel the
// store's isInitialPlaceholderLocation and checkoutSkyGuard use), an
// unparseable date, or an empty/unrecognised timezone (the date could
// not be stated as it was at the location) all yield null, and the
// editor offers no button.
// ─────────────────────────────────────────────────────────────────────────────

import type { ShapeMaskFootprint } from "./shapeLayout";
import { getStyleTextDefaults } from "./styleDefaults";
import type { StyleId, TextBox } from "./store";
import { AUTOMATIC_TEXT_STYLE_BINDING } from "./textStyleBinding";
import { maskRowToCanvasRow } from "./textFit";

export const AUTO_CAPTION_BOX_ID = "caption";

export interface AutoCaptionInput {
  locationName: string;
  latitude: number;
  longitude: number;
  /** The design's date/time, ISO string (store state `dateTime`). */
  dateTimeISO: string;
  /** The location's timezone (store state `location.timezone`). */
  timezone: string;
}

function formatCoordinates(latitude: number, longitude: number): string {
  const latHemisphere = latitude >= 0 ? "N" : "S";
  const lonHemisphere = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(4)}° ${latHemisphere}, ${Math.abs(longitude).toFixed(4)}° ${lonHemisphere}`;
}

function formatCaptionDate(dateTimeISO: string, timezone: string): string | null {
  const date = new Date(dateTimeISO);
  if (!Number.isFinite(date.getTime())) return null;
  // The caption states the date AS IT WAS at the location, so it may
  // only be rendered in the location's own timezone. An empty or
  // unrecognised timezone makes that date unstatable — a silent UTC
  // fallback could print the neighbouring day as the occasion date —
  // so the honest outcome is no caption at all.
  const zone = (timezone ?? "").trim();
  if (!zone) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return null;
  }
}

/**
 * Build the caption line from the design's existing data, or null when
 * the data is absent (placeholder location or invalid date).
 */
export function buildAutoCaption(input: AutoCaptionInput): string | null {
  const { latitude, longitude } = input;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null; // placeholder sentinel
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const date = formatCaptionDate(input.dateTimeISO, input.timezone);
  if (!date) return null;

  const name = (input.locationName ?? "").trim();
  const segments = [
    ...(name ? [name] : []),
    formatCoordinates(latitude, longitude),
    date,
  ];
  return segments.join(" · ");
}

/** The design layout the caption's initial row is resolved against. */
export interface AutoCaptionLayout {
  /** The design's selected shape (store state `shape`). */
  shape?: string;
  /** Mask footprint for the design's layout, when resolvable. */
  shapeMaskFootprint?: ShapeMaskFootprint | null;
  /** Height of the canvas the footprint was resolved for. */
  canvasHeight?: number;
}

/**
 * The caption's initial rows — one 0.05 gap below each shape's designed
 * dedication row (textFit.ts: standard 0.9, diamond 0.64, heart/star
 * 0.65 in mask space), written as literals of record rather than
 * dedication + gap arithmetic: stored rows in the default-row system
 * are recognised by exact equality, and float addition drifts the
 * standard row off its canonical value (0.9 + 0.05 !== 0.95).
 *
 * The shape awareness is load-bearing, not cosmetic: the standard
 * bottom row (0.95) is OUTSIDE the mask on shaped designs — below the
 * diamond's bottom apex (0.94), below the heart's bottom tip (0.88),
 * and in the star's bottom notch (centre outside below 0.745) — where
 * the fit system can only shrink the caption to its floor and report
 * overflow, never move it inside.
 */
const STANDARD_CAPTION_ROW = 0.95;
const DIAMOND_CAPTION_ROW = 0.69;
const HEART_CAPTION_MASK_ROW = 0.7;
const STAR_CAPTION_MASK_ROW = 0.7;

/**
 * The caption's initial row for the design's shape. Heart/star rows
 * are mask-authored, so theirs is converted through the footprint
 * exactly like the designed rows themselves (verbatim without one:
 * legacy layouts and square canvases).
 */
export function resolveAutoCaptionRow(layout?: AutoCaptionLayout): number {
  const shape = layout?.shape;
  if (shape === "heart" || shape === "star") {
    return maskRowToCanvasRow(
      shape === "heart" ? HEART_CAPTION_MASK_ROW : STAR_CAPTION_MASK_ROW,
      layout?.shapeMaskFootprint,
      layout?.canvasHeight,
    );
  }
  if (shape === "diamond") return DIAMOND_CAPTION_ROW;
  return STANDARD_CAPTION_ROW;
}

/**
 * Insert the caption as an ordinary text box, or refresh the text of
 * the existing caption box (preserving any styling/position edits the
 * user made to it). Returns a new array when a box was added/changed,
 * the input array when the caption text is already current.
 *
 * The new box follows the store's addTextBox precedent: the selected
 * style's text defaults, automatic style binding (so template switches
 * keep it readable), centred alignment anchor at x 0.5 — the stored
 * position is the alignment anchor the renderer draws from, like every
 * sibling row — at the shape-aware initial row (resolveAutoCaptionRow):
 * just below the shape's dedication row, inside the mask on every
 * shape. Only the INITIAL row is shape-aware; once added, the caption
 * is the user's box and refresh never moves it.
 */
export function upsertAutoCaptionBox(
  textBoxes: readonly TextBox[],
  caption: string,
  selectedStyle: StyleId,
  layout?: AutoCaptionLayout,
): TextBox[] {
  const existing = textBoxes.find((box) => box.id === AUTO_CAPTION_BOX_ID);
  if (existing) {
    if (existing.text === caption) return textBoxes as TextBox[];
    return textBoxes.map((box) =>
      box.id === AUTO_CAPTION_BOX_ID ? { ...box, text: caption } : box,
    );
  }
  const textDefaults = getStyleTextDefaults(selectedStyle);
  const captionBox: TextBox = {
    id: AUTO_CAPTION_BOX_ID,
    label: "Caption",
    text: caption,
    fontFamily: textDefaults.fontFamily,
    color: textDefaults.color,
    textStyleBinding: { ...AUTOMATIC_TEXT_STYLE_BINDING },
    size: 20,
    align: "center",
    textShadow: false,
    textGlow: false,
    position: { x: 0.5, y: resolveAutoCaptionRow(layout) },
  };
  return [...textBoxes, captionBox];
}
