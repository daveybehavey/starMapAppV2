import { NextRequest } from "next/server";

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  importance?: number;
  address?: {
    country_code?: string;
    state?: string;
  };
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return Response.json([], { status: 200 });
  }

  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=" +
    encodeURIComponent(query);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "star-map-app/1.0 (+https://github.com/)",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return Response.json({ error: "Geocoding failed" }, { status: 502 });
    }

    const results = (await res.json()) as NominatimResult[];

    const queryLower = query.toLowerCase();
    const preferCountries: string[] = [];
    const preferStates: string[] = [];
    if (queryLower.includes("british columbia") || queryLower.includes(" bc")) {
      preferCountries.push("ca");
      preferStates.push("british columbia");
    }
    if (queryLower.includes("canada")) preferCountries.push("ca");
    if (queryLower.includes("australia")) preferCountries.push("au");
    if (queryLower.includes("united states") || queryLower.includes("usa") || queryLower.includes(" us")) {
      preferCountries.push("us");
    }
    if (queryLower.includes("united kingdom") || queryLower.includes("uk")) {
      preferCountries.push("gb");
    }

    const scored = results.map((item) => {
      const countryCode = item.address?.country_code?.toLowerCase() || "";
      const state = item.address?.state?.toLowerCase() || "";
      let score = (item.importance ?? 0) * 10;
      const tokens = queryLower.split(/\s+/).filter(Boolean);
      for (const t of tokens) {
        if (item.display_name.toLowerCase().includes(t)) score += 0.5;
      }
      if (preferCountries.length) {
        if (preferCountries.includes(countryCode)) score += 5;
        else score -= 1;
      }
      if (preferStates.length && preferStates.some((s) => state.includes(s))) {
        score += 3;
      }
      return {
        id: item.place_id,
        name: item.display_name,
        latitude: Number.parseFloat(item.lat),
        longitude: Number.parseFloat(item.lon),
        category: item.class,
        type: item.type,
        countryCode,
        state,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const trimmed = scored.map(({ score, ...rest }) => rest);

    return Response.json(trimmed, { status: 200 });
  } catch {
    return Response.json({ error: "Geocoding request error" }, { status: 500 });
  }
}
