import type { AspectRatio } from "./types";

export function aspectRatioToNumber(aspect: AspectRatio): number {
  switch (aspect) {
    case "3:4":
      return 3 / 4;
    case "2:3":
      return 2 / 3;
    case "4:5":
      return 4 / 5;
    default:
      return 1;
  }
}

/**
 * Canvas dimensions for an export rendered at a given ladder width.
 *
 * Height derives ONLY from the design's selected aspect ratio — never from
 * the shape mask's SVG viewBox: every shipped shape viewBox is square
 * ("0 0 100 100"), so viewBox-derived heights silently squared every
 * heart/circle/star/diamond export (E-2) while the preview and rectangle
 * exports used the selected aspect. The renderer scales the shape path to
 * whatever canvas it is given (buildShapeClip in renderSky.ts), so the
 * canvas aspect is the design's aspect, full stop. Every export surface
 * (downloads, checkout print asset, share image, simplified editor,
 * download page) must size through here so the paths cannot drift apart
 * again.
 */
export function getExportDimensions(
  width: number,
  aspectRatio: AspectRatio,
): { width: number; height: number } {
  const height = Math.max(1, Math.round(width / aspectRatioToNumber(aspectRatio)));
  return { width, height };
}
