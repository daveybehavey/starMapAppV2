/** Missing/invalid mode preserves the historical caller-specific color path. */
export function resolveFixedStarColor(mode: unknown, historicalFixed: boolean, isParchment = false): boolean {
  // Parchment's measured contrast model requires its dark fixed ink.
  if (isParchment) return true;
  if (mode === "fixed") return true;
  if (mode === "spectral") return false;
  return historicalFixed;
}
