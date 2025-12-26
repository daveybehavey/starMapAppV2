import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import crypto from "node:crypto";

type MapRecipe = {
  version: number;
  seed: string;
  datetimeISO: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  textBoxes: unknown;
  selectedStyle: string;
  aspectRatio?: string;
  shape?: string;
  renderOptions?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as MapRecipe;
  if (!body?.datetimeISO || !body?.location || !body?.textBoxes || !body?.selectedStyle) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const id = crypto.randomUUID();
  await kv.set<MapRecipe>(`map:${id}`, body);
  return NextResponse.json({ id });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const data = await kv.get<MapRecipe>(`map:${id}`);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
