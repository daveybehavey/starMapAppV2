/**
 * Keep in sync with src/components/PreviewStartForm.tsx
 * (buildEditorAction + buildQuickStartHref).
 */

export function buildEditorAction(
  source,
  checkout,
  printVariant,
  includeDigitalAddOn,
  includeCardAddOn
) {
  const params = new URLSearchParams({
    mode: "quick",
    source,
  });

  if (checkout) {
    params.set("checkout", checkout);
  }
  if (printVariant) {
    params.set("print_variant", printVariant);
  }
  if (includeDigitalAddOn) {
    params.set("include_digital_addon", "1");
  }
  if (includeCardAddOn) {
    params.set("include_card_addon", "1");
  }

  return `/editor?${params.toString()}`;
}

export function buildQuickStartHref(fields, intent) {
  const action = buildEditorAction(
    intent.source,
    intent.checkout,
    intent.printVariant,
    intent.includeDigitalAddOn,
    intent.includeCardAddOn
  );
  const params = new URLSearchParams(action.slice(action.indexOf("?") + 1));

  if (fields.date) {
    params.set("date", fields.date);
  }
  if (fields.location) {
    params.set("location", fields.location);
  }
  if (fields.lat) {
    params.set("lat", fields.lat);
  }
  if (fields.lon) {
    params.set("lon", fields.lon);
  }
  if (fields.tz) {
    params.set("tz", fields.tz);
  }

  return `/editor?${params.toString()}`;
}
