function clampColorChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const trimmed = color.trim();
  if (!trimmed.startsWith("#")) return null;
  let normalized = trimmed.slice(1);
  // Expand 3-digit hex to 6-digit (e.g., #fff -> #ffffff)
  if (normalized.length === 3) {
    normalized = normalized[0] + normalized[0] + normalized[1] + normalized[1] + normalized[2] + normalized[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function parseRgbColor(color: string): { r: number; g: number; b: number } | null {
  const match = color
    .trim()
    .match(/^rgba?\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)(?:\s*,\s*[^)]+)?\s*\)$/i);
  if (!match) return null;
  const r = Number.parseFloat(match[1]);
  const g = Number.parseFloat(match[2]);
  const b = Number.parseFloat(match[3]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return {
    r: clampColorChannel(r),
    g: clampColorChannel(g),
    b: clampColorChannel(b),
  };
}

export function toRgba(color: string, alpha: number) {
  const parsed = parseHexColor(color) ?? parseRgbColor(color);
  if (!parsed) return `rgba(255,255,255,${alpha})`;
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${alpha})`;
}

export function adjustColor(color: string, amount: number) {
  const parsed = parseHexColor(color) ?? parseRgbColor(color);
  if (!parsed) return color;
  const next = (value: number) => {
    const delta = Math.round(255 * amount);
    return Math.min(255, Math.max(0, value + delta));
  };
  return `rgb(${next(parsed.r)},${next(parsed.g)},${next(parsed.b)})`;
}
