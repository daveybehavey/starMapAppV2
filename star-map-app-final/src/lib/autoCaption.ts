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
// store's isInitialPlaceholderLocation and checkoutSkyGuard use) or an
// unparseable date both yield null, and the editor offers no button.
// ─────────────────────────────────────────────────────────────────────────────

import { getStyleTextDefaults } from "./styleDefaults";
import type { StyleId, TextBox } from "./store";
import { AUTOMATIC_TEXT_STYLE_BINDING } from "./textStyleBinding";

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
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  try {
    return format(timezone || "UTC");
  } catch {
    // An unrecognised timezone must not kill the caption; the date in
    // UTC is the honest fallback (the store only writes IANA names or
    // the browser's zone, so this is a defensive path).
    try {
      return format("UTC");
    } catch {
      return null;
    }
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
 * sibling row — placed just below the dedication row (y 0.9) at 0.95.
 */
export function upsertAutoCaptionBox(
  textBoxes: readonly TextBox[],
  caption: string,
  selectedStyle: StyleId,
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
    position: { x: 0.5, y: 0.95 },
  };
  return [...textBoxes, captionBox];
}
