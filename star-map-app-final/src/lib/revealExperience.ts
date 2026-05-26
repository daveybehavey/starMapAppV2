export const REVEAL_STAGES = [
  {
    label: "Moment",
    title: "Pinning down your moment",
    description: "Locking the exact date, local time, and place that matter for this sky.",
  },
  {
    label: "Sky",
    title: "Tracing the visible sky",
    description: "Plotting stars, constellations, and balance for your location.",
  },
  {
    label: "Finish",
    title: "Finishing the keepsake preview",
    description: "Composing the final map so HD and print options are ready next.",
  },
] as const;

export function getRevealProgressPercent(stageIndex: number) {
  const clamped = Math.max(0, Math.min(REVEAL_STAGES.length - 1, stageIndex));
  return `${Math.round(((clamped + 1) / REVEAL_STAGES.length) * 100)}%`;
}

/** Minimum overlay time so stages feel intentional; canvas may finish earlier or later. */
export const REVEAL_MIN_VISIBLE_MS = 700;
/** Never block the user longer than this if rendering is slow. */
export const REVEAL_MAX_WAIT_MS = 8000;
