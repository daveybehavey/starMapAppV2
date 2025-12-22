import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type MapRecipe = {
  dateTime: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  textBoxes: unknown;
  selectedStyle: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "maps.json");

async function readStore(): Promise<Record<string, MapRecipe>> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as Record<string, MapRecipe>;
  } catch {
    return {};
  }
}

async function writeStore(data: Record<string, MapRecipe>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data), "utf8");
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as MapRecipe;
  if (!body?.dateTime || !body?.location || !body?.textBoxes || !body?.selectedStyle) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const store = await readStore();
  const id = crypto.randomUUID();
  store[id] = body;
  await writeStore(store);
  return NextResponse.json({ id });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const store = await readStore();
  if (!store[id]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(store[id]);
}
