/**
 * Shared configuration arrays used across desktop and mobile views.
 * Single source of truth for styles, visual modes, shapes, and constellation presets.
 */

import type { StyleId, RenderOptions } from "./store";
import type { Shape } from "./types";

// Re-export fontOptions from fonts.ts for convenience
export { fontOptions } from "./fonts";

export const styles: { id: StyleId; name: string; note: string }[] = [
  { id: "navyGold", name: "Navy & Gold", note: "Luxe midnight with gilded accents" },
  { id: "vintageEngraving", name: "Vintage Engraving", note: "Linework etched on deep charcoal" },
  { id: "parchmentScroll", name: "Parchment Scroll", note: "Warm cream with antique border" },
  { id: "midnightMinimal", name: "Midnight Minimal", note: "Clean noir with subtle glow" },
];

export { mapLookTiers } from "./mapLookTiers";

export const visualModes: { id: RenderOptions["visualMode"]; label: string; description: string }[] = [
  { id: "astronomical", label: "Astronomical", description: "Pure star field, minimal embellishment" },
  { id: "enhanced", label: "Enhanced", description: "Balanced glow and detail (default)" },
  { id: "illustrated", label: "Illustrated", description: "Artistic finish with richer accents" },
];

export const shapes: { id: Shape; label: string }[] = [
  { id: "rectangle", label: "Rectangle" },
  { id: "heart", label: "Heart" },
  { id: "circle", label: "Circle" },
  { id: "star", label: "Star" },
];

export const shapeSymbols: Record<Shape, string> = {
  rectangle: "■",
  heart: "♥",
  circle: "●",
  star: "★",
  diamond: "◆",
};

export const shapeSymbolScale: Record<Shape, string> = {
  rectangle: "scale(1.05)",
  heart: "scale(1.3)",
  circle: "scale(1.15)",
  star: "scale(1.05)",
  diamond: "scale(1.1)",
};

export const constellationPresets: { id: RenderOptions["constellationLines"]; label: string; note: string }[] = [
  { id: "off", label: "Off", note: "No lines visible" },
  { id: "thin", label: "Thin", note: "Subtle guides (default)" },
  { id: "thick", label: "Bold", note: "Stronger, etched lines" },
];
