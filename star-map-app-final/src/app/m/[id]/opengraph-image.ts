import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";
import { createCanvas } from "@napi-rs/canvas";
import { aspectRatioToNumber, MapRecipe, renderStarMap } from "@/lib/renderSky";
import { getShapeData } from "@/lib/shapeUtils";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const data = await kv.get<MapRecipe>(`map:${params.id}`);
  if (!data) {
    return new Response("Not found", { status: 404 });
  }

  const recipe: MapRecipe = {
    ...data,
    shape: (data as any).shape ?? (data.renderOptions as any)?.shapeMask ?? "rectangle",
    aspectRatio: data.aspectRatio ?? "square",
  };

  const width = size.width;
  const shapeData = await getShapeData(recipe.shape).catch(() => null);
  const ratio = shapeData
    ? shapeData.viewBox.width / shapeData.viewBox.height
    : aspectRatioToNumber(recipe.aspectRatio);
  const height = shapeData ? Math.max(1, Math.round(width / ratio)) : size.height;
  const canvas = createCanvas(width, height);

  await renderStarMap({
    recipe,
    canvas: canvas as unknown as HTMLCanvasElement,
    width,
    height,
    watermark: true,
    quality: "og",
    pixelRatio: 1,
  });

  const buffer = canvas.toBuffer("image/png");
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
