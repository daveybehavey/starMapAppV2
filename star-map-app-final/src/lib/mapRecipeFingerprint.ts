import type { MapRecipe } from "@/lib/renderSky";

type FingerprintInput = Pick<
  MapRecipe,
  "datetimeISO" | "location" | "textBoxes" | "selectedStyle" | "aspectRatio" | "shape" | "renderOptions" | "seed" | "version"
>;

/** Stable string for comparing whether checkout can reuse an existing map id. */
export function stableMapRecipeFingerprint(recipe: FingerprintInput): string {
  const textBoxes = (recipe.textBoxes ?? []).map((box) => ({
    text: typeof box.text === "string" ? box.text : "",
    size: box.size ?? null,
    fontFamily: box.fontFamily ?? null,
    color: box.color ?? null,
    align: box.align ?? null,
  }));

  const location = recipe.location
    ? {
        name: recipe.location.name ?? "",
        latitude: recipe.location.latitude ?? null,
        longitude: recipe.location.longitude ?? null,
        timezone: recipe.location.timezone ?? "",
      }
    : null;

  return JSON.stringify({
    version: recipe.version ?? 1,
    seed: recipe.seed ?? "",
    datetimeISO: recipe.datetimeISO ?? "",
    location,
    textBoxes,
    selectedStyle: recipe.selectedStyle ?? "",
    aspectRatio: recipe.aspectRatio ?? "square",
    shape: recipe.shape ?? "rectangle",
    renderOptions: recipe.renderOptions ?? {},
  });
}
