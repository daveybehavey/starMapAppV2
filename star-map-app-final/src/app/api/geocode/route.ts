import { NextRequest } from "next/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

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
  // Rate limit: 30 requests per minute per IP (Nominatim TOS requires ~1/sec max)
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(`geocode:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

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
        "User-Agent": "StarMapCo/1.0 (https://starmapco.com; mailto:support@starmapco.com)",
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
      const latitude = Number.parseFloat(item.lat);
      const longitude = Number.parseFloat(item.lon);

      // Validate coordinates are finite and within valid bounds
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        return null;
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return null;
      }

      return {
        id: item.place_id,
        name: item.display_name,
        latitude,
        longitude,
        category: item.class,
        type: item.type,
        countryCode,
        state,
        score,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

    scored.sort((a, b) => b.score - a.score);

    const trimmed = scored.map((item) => ({
      id: item.id,
      name: item.name,
      latitude: item.latitude,
      longitude: item.longitude,
      category: item.category,
      type: item.type,
      countryCode: item.countryCode,
      state: item.state,
    }));

    return Response.json(trimmed, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return Response.json({ error: "Geocoding request error" }, { status: 500 });
  }
}
