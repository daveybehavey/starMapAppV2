import type { AspectRatio } from "@/lib/types";

export function getAspectRatioLabel(aspectRatio: AspectRatio) {
  switch (aspectRatio) {
    case "4:5":
      return "Poster";
    case "2:3":
      return "Tall";
    case "3:4":
      return "Classic";
    case "square":
    default:
      return "Square";
  }
}
