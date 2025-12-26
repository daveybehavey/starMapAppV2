import type { AspectRatio } from "./types";

type ShapeData = {
  d: string;
  viewBox: { minX: number; minY: number; width: number; height: number };
};

const shapeCache = new Map<string, Promise<ShapeData | null>>();

export async function getShapeData(shape: string): Promise<ShapeData | null> {
  if (shape === "rectangle") return null;
  if (shapeCache.has(shape)) return shapeCache.get(shape)!;
  const load = (async () => {
    try {
      const svgText = await loadSvg(shape);
      if (!svgText) return null;
      const parsed = parseSvg(svgText);
      return parsed;
    } catch (err) {
      console.error(`Failed to load shape "${shape}":`, err);
      return null;
    }
  })().catch((err) => {
    shapeCache.delete(shape);
    throw err;
  });
  shapeCache.set(shape, load);
  return load;
}

export function getAspectFromViewBox(viewBox: { width: number; height: number }): AspectRatio {
  const ratio = viewBox.width / viewBox.height;
  if (isApprox(ratio, 1)) return "square";
  if (isApprox(ratio, 3 / 4)) return "3:4";
  if (isApprox(ratio, 2 / 3)) return "2:3";
  if (isApprox(ratio, 4 / 5)) return "4:5";
  return "square";
}

function isApprox(value: number, target: number, epsilon = 0.01) {
  return Math.abs(value - target) <= epsilon;
}

async function loadSvg(shape: string): Promise<string> {
  if (typeof window === "undefined") {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const svgPath = path.join(process.cwd(), "public", "shapes", `${shape}.svg`);
      return fs.readFile(svgPath, "utf8");
    } catch (err) {
      console.error(`Shape file missing: ${shape}.svg`, err);
      return "";
    }
  }
  try {
    const res = await fetch(`/shapes/${shape}.svg`);
    if (!res.ok) {
      throw new Error(`Shape ${shape} not found`);
    }
    return res.text();
  } catch (err) {
    console.error(`Failed to fetch shape ${shape}:`, err);
    return "";
  }
}

function parseSvg(svgText: string): ShapeData {
  const domParserAvailable = typeof DOMParser !== "undefined";
  if (domParserAvailable) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const path = doc.querySelector("path");
    if (!path) throw new Error("No path in SVG");
    const d = path.getAttribute("d") || "";
    const svg = doc.querySelector("svg");
    const viewBoxStr = svg?.getAttribute("viewBox") || "0 0 1 1";
    const [minX, minY, width, height] = viewBoxStr.split(/\s+/).map(Number);
    return {
      d,
      viewBox: {
        minX: Number.isFinite(minX) ? minX : 0,
        minY: Number.isFinite(minY) ? minY : 0,
        width: Number.isFinite(width) && width !== 0 ? width : 1,
        height: Number.isFinite(height) && height !== 0 ? height : 1,
      },
    };
  }

  const pathMatch = svgText.match(/<path[^>]*d=["']([^"']+)["'][^>]*>/i);
  if (!pathMatch) throw new Error("No path in SVG");
  const viewBoxMatch = svgText.match(/viewBox=["']([^"']+)["']/i);
  const viewBoxStr = viewBoxMatch?.[1] ?? "0 0 1 1";
  const [minX, minY, width, height] = viewBoxStr.split(/\s+/).map(Number);
  return {
    d: pathMatch[1],
    viewBox: {
      minX: Number.isFinite(minX) ? minX : 0,
      minY: Number.isFinite(minY) ? minY : 0,
      width: Number.isFinite(width) && width !== 0 ? width : 1,
      height: Number.isFinite(height) && height !== 0 ? height : 1,
    },
  };
}
