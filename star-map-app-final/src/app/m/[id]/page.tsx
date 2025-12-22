import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { SharedMapClient } from "./SharedMapClient";

type Recipe = {
  dateTime: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  textBoxes: Array<{ text: string }>;
  selectedStyle: string;
};

const DATA_FILE = path.join(process.cwd(), "data", "maps.json");

async function loadRecipe(id: string): Promise<Recipe | null> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const store = JSON.parse(raw) as Record<string, Recipe>;
    return store[id] ?? null;
  } catch {
    return null;
  }
}

function siteOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const recipe = await loadRecipe(params.id);
  const titleText = recipe?.textBoxes?.[0]?.text || "Star Map Preview";
  const description =
    recipe?.location?.name && recipe?.dateTime
      ? `${recipe.location.name} — ${new Intl.DateTimeFormat("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date(recipe.dateTime))}`
      : "A captured night sky moment.";
  const image = `${siteOrigin()}/m/${params.id}/opengraph-image`;

  return {
    title: titleText,
    description,
    openGraph: {
      title: titleText,
      description,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title: titleText,
      description,
      images: [image],
    },
  };
}

export default function SharedMapPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string>;
}) {
  return <SharedMapClient id={params.id} searchParams={searchParams} />;
}
