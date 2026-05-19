import { z } from "zod";
import { apiFetch, ApiError } from "@/lib/api/apiClient";
import { env } from "@/config/env";

const createMapResponseSchema = z.object({
  id: z.string().uuid(),
});

export type MapTextBoxInput = {
  id?: string;
  label?: string;
  text: string;
  fontFamily?: string;
  align?: "left" | "center" | "right";
  size?: number;
};

export type CreateMapRecipeInput = {
  version?: number;
  seed?: string;
  datetimeISO: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  textBoxes: MapTextBoxInput[];
  selectedStyle: "navyGold" | "vintageEngraving" | "parchmentScroll" | "midnightMinimal";
  aspectRatio?: "square" | "3:4" | "2:3" | "4:5";
  shape?: "rectangle" | "heart" | "circle" | "star" | "diamond";
  renderOptions?: Record<string, unknown>;
};

export function getMapViewerUrl(mapId: string) {
  const base = env.EXPO_PUBLIC_API_BASE_URL.replace(/\/?api\/?$/i, "").replace(/\/$/, "");
  return `${base}/m/${mapId}`;
}

export async function createMapRecipe(body: CreateMapRecipeInput, mobileToken?: string | null) {
  const headers: Record<string, string> = {};
  if (mobileToken) {
    headers.Authorization = `Bearer ${mobileToken}`;
  }

  try {
    const result = await apiFetch<unknown>("/maps", {
      method: "POST",
      headers,
      body,
    });
    return createMapResponseSchema.parse(result);
  } catch (error) {
    if (error instanceof ApiError) {
      const message =
        typeof error.payload === "object" &&
        error.payload !== null &&
        "error" in error.payload &&
        typeof (error.payload as { error?: unknown }).error === "string"
          ? (error.payload as { error: string }).error
          : error.message;
      throw new Error(message);
    }
    throw error;
  }
}
