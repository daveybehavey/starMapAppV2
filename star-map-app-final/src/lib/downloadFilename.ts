import type { MapRecipe } from "@/lib/renderSky";

type BuildDownloadFilenameInput = {
  recipe?: MapRecipe | null;
  mode: "hd" | "preview";
  mapId?: string | null;
};

function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function getTitleSegment(recipe?: MapRecipe | null): string {
  if (!recipe?.textBoxes?.length) return "custom-star-map";
  const titleBox =
    recipe.textBoxes.find((box) => box.id === "title" && box.text.trim()) ??
    recipe.textBoxes.find((box) => box.label?.toLowerCase() === "title" && box.text.trim()) ??
    recipe.textBoxes.find((box) => box.text.trim());
  const title = titleBox?.text?.trim();
  if (!title) return "custom-star-map";
  return slugifySegment(title) || "custom-star-map";
}

function getDateSegment(recipe?: MapRecipe | null): string {
  const raw = recipe?.datetimeISO?.trim();
  if (!raw) return "date-unknown";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "date-unknown";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMapIdSegment(mapId?: string | null): string {
  if (!mapId) return "";
  const clean = mapId.replace(/[^a-zA-Z0-9]/g, "");
  if (!clean) return "";
  return clean.slice(0, 10).toLowerCase();
}

export function buildStarMapDownloadFilename(input: BuildDownloadFilenameInput): string {
  const title = getTitleSegment(input.recipe);
  const date = getDateSegment(input.recipe);
  const mapId = getMapIdSegment(input.mapId);
  const quality = input.mode === "hd" ? "hd" : "preview";
  const mapIdSuffix = mapId ? `-${mapId}` : "";
  return `starmap-${title}-${date}-${quality}${mapIdSuffix}.png`;
}
