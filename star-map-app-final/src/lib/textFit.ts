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
