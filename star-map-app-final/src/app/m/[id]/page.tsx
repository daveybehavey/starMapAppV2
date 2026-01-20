import type { Metadata } from "next";
import { ViewClient } from "./ViewClient";
import { kv } from "@/lib/kv";

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
  try {
    const data = await kv.get<Recipe>(`map:${id}`);
    return data ?? null;
  } catch (error) {
    console.error("Failed to load recipe:", error);
    return null;
  }
}

function siteOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const recipe = await loadRecipe(params.id);
  const titleText = recipe?.textBoxes?.[0]?.text || "Star Map";
  const description =
    recipe?.location?.name && recipe?.datetimeISO
      ? `The night sky over ${recipe.location.name} on ${new Intl.DateTimeFormat("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date(recipe.datetimeISO))}`
      : "A captured night sky moment.";
  const image = `${siteOrigin()}/m/${params.id}/opengraph-image`;

  return {
    title: `${titleText} | StarMapCo`,
    description,
    openGraph: {
      title: titleText,
      description,
      images: [{ url: image }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: titleText,
      description,
      images: [image],
    },
  };
}

export default function ViewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string>;
}) {
  return <ViewClient id={params.id} searchParams={searchParams} />;
}
