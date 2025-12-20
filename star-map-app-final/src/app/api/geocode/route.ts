import { NextRequest } from "next/server";

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
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

    const mapped = results.map((item) => ({
      id: item.place_id,
      name: item.display_name,
      latitude: Number.parseFloat(item.lat),
      longitude: Number.parseFloat(item.lon),
      category: item.class,
      type: item.type,
    }));

    return Response.json(mapped, { status: 200 });
  } catch {
    return Response.json({ error: "Geocoding request error" }, { status: 500 });
  }
}
