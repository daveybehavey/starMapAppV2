import { ImageResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

type MapRecipe = {
  dateTime: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  textBoxes: Array<{ label: string; text: string }>;
  selectedStyle: string;
};

const DATA_FILE = path.join(process.cwd(), "data", "maps.json");

async function loadRecipe(id: string): Promise<MapRecipe | null> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const store = JSON.parse(raw) as Record<string, MapRecipe>;
    return store[id] ?? null;
  } catch {
    return null;
  }
}

export const runtime = "edge";
export const alt = "Star map preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  const recipe = await loadRecipe(params.id);
  const dateLabel = recipe?.dateTime
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(
        new Date(recipe.dateTime),
      )
    : "A special night";
  const locationLabel = recipe?.location?.name || "Somewhere under the stars";
  const title = recipe?.textBoxes?.[0]?.text || "Our Night Sky";
  const subtitle = recipe?.textBoxes?.[1]?.text || "A constellation of memories";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px",
          backgroundImage:
            "linear-gradient(180deg, #0b0f3b 0%, #060822 55%, #040515 100%), radial-gradient(circle at 50% 20%, rgba(238, 203, 123, 0.15), transparent 45%)",
          color: "#fdf4dc",
          fontFamily: '"Cinzel", "Playfair Display", serif',
        }}
      >
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 26,
            color: "rgba(253, 244, 220, 0.8)",
            marginBottom: 22,
          }}
        >
          {subtitle}
        </div>
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            padding: "14px 18px",
            borderRadius: 999,
            background: "rgba(253, 244, 220, 0.12)",
            border: "1px solid rgba(253, 244, 220, 0.3)",
            fontSize: 20,
            gap: 6,
            width: "fit-content",
          }}
        >
          <span style={{ fontWeight: 700 }}>{locationLabel}</span>
          <span style={{ fontSize: 18, color: "rgba(253,244,220,0.75)" }}>{dateLabel}</span>
        </div>
      </div>
    ),
    { width: size.width, height: size.height },
  );
}
