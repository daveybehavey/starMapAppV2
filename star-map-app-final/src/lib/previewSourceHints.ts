/** True when traffic came from a wedding money page on a print-intent CTA. */
export function isWeddingPrintLandingSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  if (!s.includes("wedding")) return false;
  return s.includes("framed") || s.includes("unframed") || s.includes("print");
}

export function isWeddingTrafficSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return source.toLowerCase().includes("wedding");
}
