/** RFC-4122 UUID (versions 1–8) used for map ids in KV. Client-safe (no server imports). */
export function isValidMapId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed);
}

export function parseMapIdParam(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return isValidMapId(trimmed) ? trimmed : null;
}
