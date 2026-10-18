/**
 * Keep in sync with the pure exports of src/lib/setupGuide.ts
 * (scrollToSetupField is DOM-only and intentionally not mirrored).
 */

export function getSetupGuideField(input) {
  if (!input.hasDate) return "date";
  if (!input.hasPlace) return "place";
  return null;
}
