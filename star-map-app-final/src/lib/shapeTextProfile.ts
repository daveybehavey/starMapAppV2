/**
 * App-side resolver for the #407 shape-interior profiles
 * (lib/shapeTextGeometry.ts): looks the shape up in SHAPE_PATHS —
 * the same entries buildShapeClip renders from — and builds the
 * profile once per shape. Kept out of shapeTextGeometry.ts so that
 * module stays dependency-free for the plain-Node unit runner.
 */

import { SHAPE_PATHS } from "@/lib/shapes";
import {
  buildShapeTextProfile,
  type ShapeTextProfile,
} from "./shapeTextGeometry";

const profileCache = new Map<string, ShapeTextProfile | null>();

/**
 * The text-geometry profile for a shape, or null for shapes whose
 * text layout is not mask-bound (rectangle/circle/diamond/birthdaycake
 * keep their existing treatment in textFit.ts).
 */
export function resolveShapeTextProfile(
  shape: string | undefined,
): ShapeTextProfile | null {
  if (shape !== "heart" && shape !== "star") return null;
  const cached = profileCache.get(shape);
  if (cached !== undefined) return cached;
  const entry = SHAPE_PATHS[shape];
  const profile = entry?.d
    ? buildShapeTextProfile(shape, entry.d, entry.viewBox)
    : null;
  profileCache.set(shape, profile);
  return profile;
}
