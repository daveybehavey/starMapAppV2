// Runtime clock supplies the origin; Date performs all arithmetic/ISO formatting.
export function assertProfileInstants(instants) {
  if (instants.length !== 8) throw new Error("Profile requires exactly 8 instants");
  for (const iso of instants) {
    if (!Number.isFinite(Date.parse(iso))) {
      throw new Error("Invalid profile instant: " + iso);
    }
    if (new Date(iso).toISOString() !== iso) {
      throw new Error("Non-canonical profile instant: " + iso);
    }
  }
  if (new Set(instants).size !== 8) throw new Error("Profile requires 8 unique instants");
  return instants;
}

export function buildProfileInstants() {
  const start = Date.now();
  return assertProfileInstants(Array.from({ length: 8 }, (_, i) =>
    new Date(start + i * 70 * 60 * 1000).toISOString(),
  ));
}
