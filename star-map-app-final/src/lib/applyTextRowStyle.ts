import type { TextBox } from "./store";

/** Copy styling only; content, identity and authored anchors stay on their rows. */
export function applyTextRowStyle(boxes: TextBox[], sourceId: string): TextBox[] {
  const source = boxes.find((box) => box.id === sourceId);
  if (!source || boxes.length < 2) return boxes;
  return boxes.map((box) => {
    if (box.id === sourceId) return box;
    const next: TextBox = {
      ...box,
      fontFamily: source.fontFamily,
      size: source.size,
      color: source.color,
      align: source.align,
      textStyleBinding: { color: "explicit", fontFamily: "explicit", fontWeight: "explicit" },
    };
    // Absence has rendering semantics too (weight defaults to 600, effects off).
    for (const key of ["fontWeight", "textShadow", "textGlow"] as const) {
      delete next[key];
    }
    if (source.fontWeight !== undefined) next.fontWeight = source.fontWeight;
    if (source.textShadow !== undefined) next.textShadow = source.textShadow;
    if (source.textGlow !== undefined) next.textGlow = source.textGlow;
    return next;
  });
}
