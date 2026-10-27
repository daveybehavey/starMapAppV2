import type { TextBox, TextStyleBinding } from "./store";

/**
 * Ownership of a text box's typography (issue #408).
 *
 * Each typography property (colour, font) is independently either
 * "automatic" — it follows template style defaults and tier typography —
 * or "explicit" — the user (or a preset) authored it and automatic layers
 * must never overwrite it. A missing or malformed binding resolves to
 * explicit/explicit: provenance is never guessed, so legacy designs keep
 * exactly the colours and fonts they were saved with.
 */

export const AUTOMATIC_TEXT_STYLE_BINDING: TextStyleBinding = {
  color: "automatic",
  fontFamily: "automatic",
};

export const EXPLICIT_TEXT_STYLE_BINDING: TextStyleBinding = {
  color: "explicit",
  fontFamily: "explicit",
};

/**
 * Resolve an unknown value to a complete binding. Only the literal string
 * "automatic" grants automatic ownership, per property; literal "explicit",
 * missing values, malformed values, and malformed containers all resolve to
 * explicit. Ownership is never inferred from colour/font equality. Always
 * returns a fresh object.
 */
export function normalizeTextStyleBinding(value: unknown): TextStyleBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EXPLICIT_TEXT_STYLE_BINDING };
  }
  const record = value as Record<string, unknown>;
  return {
    color: record.color === "automatic" ? "automatic" : "explicit",
    fontFamily: record.fontFamily === "automatic" ? "automatic" : "explicit",
  };
}

/**
 * Clone a box with its binding normalized (typography untouched). Used at
 * whole-array replacement boundaries so provenance survives save/load and
 * hydration without ever being merged from another box by ID.
 */
export function cloneTextBoxWithNormalizedBinding<T extends TextBox>(box: T): T {
  return { ...box, textStyleBinding: normalizeTextStyleBinding(box.textStyleBinding) };
}

/**
 * Clone a box with both typography properties marked explicit. Used for
 * preset-authored boxes: a preset's typography is authored content and must
 * not be recoloured by style defaults or tier typography afterwards.
 */
export function cloneTextBoxWithExplicitBinding<T extends TextBox>(box: T): T {
  return { ...box, textStyleBinding: { ...EXPLICIT_TEXT_STYLE_BINDING } };
}
