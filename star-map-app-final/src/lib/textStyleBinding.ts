import type { TextBox, TextStyleBinding } from "./store";

/**
 * Ownership of a text box's typography (issue #408).
 *
 * Each typography property (colour, font, weight) is independently either
 * "automatic" — it follows template style defaults and tier typography —
 * or "explicit" — the user (or a preset) authored it and automatic layers
 * must never overwrite it. A missing or malformed binding resolves to
 * explicit/explicit: provenance is never guessed, so legacy designs keep
 * exactly the colours, fonts and weights they were saved with.
 */

export const AUTOMATIC_TEXT_STYLE_BINDING: TextStyleBinding = {
  color: "automatic",
  fontFamily: "automatic",
  fontWeight: "automatic",
};

export const EXPLICIT_TEXT_STYLE_BINDING: TextStyleBinding = {
  color: "explicit",
  fontFamily: "explicit",
  fontWeight: "explicit",
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
  const color = record.color === "automatic" ? "automatic" : "explicit";
  const fontFamily = record.fontFamily === "automatic" ? "automatic" : "explicit";
  // fontWeight joined the binding with the editor weight control (#481).
  // Bindings written before then carry no fontWeight key: a record that
  // marks any property "automatic" was written by the binding machinery as
  // a complete binding, and no user surface could set a weight before #481,
  // so such a record's weight ownership was automatic. Anything else keeps
  // the provenance-preserving explicit default.
  let fontWeight: "automatic" | "explicit";
  if (record.fontWeight === "automatic") fontWeight = "automatic";
  else if (record.fontWeight === "explicit") fontWeight = "explicit";
  else if (color === "automatic" || fontFamily === "automatic") fontWeight = "automatic";
  else fontWeight = "explicit";
  return { color, fontFamily, fontWeight };
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
