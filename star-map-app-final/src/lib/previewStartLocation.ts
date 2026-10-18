/**
 * Location field resolution for the quick-start form (PreviewStartForm).
 *
 * The form submits a native GET to /editor carrying `location` and, when
 * the place is coordinate-resolved, `lat` / `lon` / `tz` — the same params
 * the editor parses via parseEditorLocationQuery. This helper decides
 * which of those fields a submission carries, keeping the typeahead
 * (C3) payload identical in shape and semantics to the previous
 * validated submit:
 *
 * - A place picked from the typeahead suggestions is coordinate-resolved:
 *   lat/lon/tz come from the picked place, but only while the submitted
 *   text still equals the picked place's name (editing the text after
 *   picking un-resolves it, exactly like the pre-typeahead form cleared
 *   prefilled coordinates when the text changed).
 * - Otherwise, landing-page default coordinates apply only while the text
 *   still equals the initial prefilled location.
 * - Otherwise the submission is name-only, as free-typed locations
 *   always were.
 */
import type { EditorLocationPrefill } from "@/lib/editorLocationPrefill";

/** A place the visitor explicitly picked from geocode suggestions. */
export type PickedPreviewLocation = EditorLocationPrefill;

export type PreviewLocationFields = {
  location: string;
  lat?: string;
  lon?: string;
  tz?: string;
};

export function resolvePreviewLocationFields(input: {
  locationText: string;
  picked: PickedPreviewLocation | null;
  defaultCoords?: Pick<EditorLocationPrefill, "latitude" | "longitude" | "timezone"> | null;
  initialLocation?: string;
}): PreviewLocationFields {
  const location = input.locationText;

  if (input.picked && location === input.picked.name) {
    return {
      location,
      lat: String(input.picked.latitude),
      lon: String(input.picked.longitude),
      tz: input.picked.timezone,
    };
  }

  const initialLocation = input.initialLocation?.trim() ?? "";
  if (input.defaultCoords && initialLocation && location.trim() === initialLocation) {
    return {
      location,
      lat: String(input.defaultCoords.latitude),
      lon: String(input.defaultCoords.longitude),
      tz: input.defaultCoords.timezone,
    };
  }

  return { location };
}
