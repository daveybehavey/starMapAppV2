import type { Metadata } from "next";
import { SharedMapClient } from "./SharedMapClient";
import { kv } from "@vercel/kv";

type Recipe = {
  datetimeISO: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  textBoxes: Array<{ text: string }>;
  selectedStyle: string;
};

async function loadRecipe(id: string): Promise<Recipe | null> {
  const data = await kv.get<Recipe>(`map:${id}`);
  return data ?? null;
}

function siteOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const recipe = await loadRecipe(params.id);
  const titleText = recipe?.textBoxes?.[0]?.text || "Star Map Preview";
  const description =
    recipe?.location?.name && recipe?.datetimeISO
      ? `${recipe.location.name} — ${new Intl.DateTimeFormat("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date(recipe.datetimeISO))}`
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
