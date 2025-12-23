import { NextRequest } from "next/server";
import { kv } from "@vercel/kv";
import { createCanvas } from "@napi-rs/canvas";
import { MapRecipe, renderStarMap } from "@/lib/renderSky";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const data = await kv.get<MapRecipe>(`map:${params.id}`);
  if (!data) {
    return new Response("Not found", { status: 404 });
  }

  const width = size.width;
  const height = size.height;
  const canvas = createCanvas(width, height);

  renderStarMap({
    recipe: data,
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
