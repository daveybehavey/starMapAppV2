import type { AspectRatio } from "./types";

export interface AspectOption {
  id: AspectRatio;
  label: string;
}

/**
 * The single aspect-option list consumed by every aspect picker
 * (EditorExperience Frame card, MobileCreate Frame section).
 *
 * Labels name the orientation and the exact ratio (#410): all three
 * non-square formats are portrait (width < height), so the old
 * "Poster" (4:5) and "Wide" (2:3) labels were both wrong. The 3:4
 * option belongs here too — the render/export pipeline has always
 * supported it (`aspectRatioToNumber`, saved-design validation), the
 * pickers simply never offered it.
 *
 * Order is display order in both pickers. IDs are the persisted
 * `AspectRatio` values; saved designs store these IDs, never labels.
 */
export const ASPECT_OPTIONS: readonly AspectOption[] = [
  { id: "square", label: "Square (1:1)" },
  { id: "3:4", label: "Portrait (3:4)" },
  { id: "2:3", label: "Portrait (2:3)" },
  { id: "4:5", label: "Portrait (4:5)" },
];
