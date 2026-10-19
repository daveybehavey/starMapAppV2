/**
 * Keep in sync with src/lib/previewStartLocation.ts
 */

export function resolvePreviewLocationFields(input) {
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
