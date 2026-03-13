export const REVEAL_STAGES = [
  {
    label: "Time",
    title: "Matching your exact night sky",
    description: "Anchoring your date, time, and location for an accurate sky.",
  },
  {
    label: "Stars",
    title: "Plotting stars and constellations",
    description: "Balancing brightness, structure, and detail for a clean preview.",
  },
  {
    label: "Finish",
    title: "Composing your keepsake preview",
    description: "Preparing the final preview so HD and print options are ready next.",
  },
] as const;

export function getRevealProgressPercent(stageIndex: number) {
  const clamped = Math.max(0, Math.min(REVEAL_STAGES.length - 1, stageIndex));
  return `${Math.round(((clamped + 1) / REVEAL_STAGES.length) * 100)}%`;
}
