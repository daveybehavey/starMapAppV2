/**
 * Editor text-box limits, shared by every surface that edits a text box
 * (desktop editor, mobile editor).
 *
 * Audit #516 E1/E4: the numeric size inputs passed Number(value) unclamped
 * and draft restore clamped to 10–200, while the UI range is 10–64 — a
 * typed 999 was stored and restored as 200, outside every control's range.
 * Text inputs carried no length limit at all, so the saved-map API's
 * 240-char truncation (MAX_TEXT_LENGTH in src/app/api/maps/route.ts) cut
 * text silently at save time. The UI now enforces and surfaces both limits.
 *
 * The size bounds themselves are defined in editorDraft.ts (which must
 * stay runtime-dependency-free) and re-exported here.
 */
import { TEXT_BOX_MAX_SIZE, TEXT_BOX_MIN_SIZE } from "@/lib/editorDraft";

export { TEXT_BOX_MAX_SIZE, TEXT_BOX_MIN_SIZE };

/** Mirrors MAX_TEXT_LENGTH in src/app/api/maps/route.ts (saved-map sanitizer). */
export const TEXT_BOX_MAX_TEXT_LENGTH = 240;

export function clampTextBoxSize(value: number): number {
  return Math.min(TEXT_BOX_MAX_SIZE, Math.max(TEXT_BOX_MIN_SIZE, value));
}
