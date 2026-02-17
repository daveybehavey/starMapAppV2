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

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const recipe = await loadRecipe(id);
  const titleText = recipe?.textBoxes?.[0]?.text || "Star Map";
  const description =
    recipe?.location?.name && recipe?.datetimeISO
      ? `The night sky over ${recipe.location.name} on ${new Intl.DateTimeFormat("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date(recipe.datetimeISO))}`
      : "A captured night sky moment.";
  const image = `${siteOrigin()}/m/${id}/opengraph-image`;

  return {
    title: `${titleText} | StarMapCo`,
    description,
    robots: { index: false, follow: false },
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

export default async function ViewPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const normalizedSearchParams: Record<string, string> = {};

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (typeof value === "string") {
      normalizedSearchParams[key] = value;
      continue;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      normalizedSearchParams[key] = value[0];
    }
  }

  return (
    <ViewClient
      id={id}
      searchParams={Object.keys(normalizedSearchParams).length ? normalizedSearchParams : undefined}
    />
  );
}
