import type { AspectRatio, Shape } from "@/lib/types";
import type { StyleId, TextBox, RenderOptions, LocationState } from "@/lib/store";

const VALID_SHAPES = new Set<Shape>(["rectangle", "heart", "circle", "star", "diamond"]);
const VALID_ASPECT_RATIOS = new Set<AspectRatio>(["square", "3:4", "2:3", "4:5"]);

export type HydratableMapRecipe = {
  version?: number;
  seed?: string;
  datetimeISO?: string;
  location?: {
    name?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
  };
  textBoxes?: TextBox[];
  selectedStyle?: StyleId;
  aspectRatio?: AspectRatio;
  shape?: Shape;
  renderOptions?: Partial<RenderOptions> & { shapeMask?: string };
  selectedOccasion?: string | null;
};

export function normalizeHydratedLocation(location: HydratableMapRecipe["location"]): LocationState {
  return {
    name: location?.name?.trim() ?? "",
    latitude: typeof location?.latitude === "number" ? location.latitude : 0,
    longitude: typeof location?.longitude === "number" ? location.longitude : 0,
    timezone: location?.timezone?.trim() || "UTC",
  };
}

export function resolveRecipeShape(recipe: HydratableMapRecipe): Shape | null {
  if (recipe.shape && VALID_SHAPES.has(recipe.shape)) {
    return recipe.shape;
  }
  const legacy = recipe.renderOptions?.shapeMask;
  if (legacy && VALID_SHAPES.has(legacy as Shape)) {
    return legacy as Shape;
  }
  return null;
}

export function resolveRecipeAspectRatio(recipe: HydratableMapRecipe): AspectRatio | null {
  if (recipe.aspectRatio && VALID_ASPECT_RATIOS.has(recipe.aspectRatio)) {
    return recipe.aspectRatio;
  }
  return null;
}

export function isHydratableMapRecipe(
  value: unknown,
): value is HydratableMapRecipe & { datetimeISO: string } {
  if (!value || typeof value !== "object") return false;
  const recipe = value as HydratableMapRecipe;
  return typeof recipe.datetimeISO === "string" && Boolean(recipe.datetimeISO.trim());
}
