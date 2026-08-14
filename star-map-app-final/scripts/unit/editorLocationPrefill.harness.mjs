/**
 * Keep in sync with src/lib/editorLocationPrefill.ts
 */

function splitHref(href) {
  const hashIndex = href.indexOf("#");
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  return { path, query, hash };
}

export function isValidEditorCoordinatePair(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isValidEditorTimeZone(timeZone) {
  const trimmed = typeof timeZone === "string" ? timeZone.trim() : "";
  if (!trimmed) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function hasConfirmedEditorLocation(location) {
  const name = location?.name?.trim() ?? "";
  if (!name) return false;
  const latitude = typeof location.latitude === "number" ? location.latitude : Number.NaN;
  const longitude = typeof location.longitude === "number" ? location.longitude : Number.NaN;
  if (!isValidEditorCoordinatePair(latitude, longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

export function withEditorLocation(href, location) {
  if (location == null) return href;

  if (typeof location === "string") {
    const value = location.trim();
    if (!value) return href;
    const { path, query, hash } = splitHref(href);
    const params = new URLSearchParams(query);
    params.set("location", value);
    params.delete("lat");
    params.delete("lon");
    params.delete("tz");
    const search = params.toString();
    return search ? `${path}?${search}${hash}` : `${path}${hash}`;
  }

  const name = typeof location.name === "string" ? location.name.trim() : "";
  if (!name || !isValidEditorCoordinatePair(location.latitude, location.longitude)) {
    return href;
  }

  const { path, query, hash } = splitHref(href);
  const params = new URLSearchParams(query);
  params.set("location", name);
  params.set("lat", String(location.latitude));
  params.set("lon", String(location.longitude));
  const tz = (location.timezone || "").trim();
  params.set("tz", tz && isValidEditorTimeZone(tz) ? tz : "UTC");
  const search = params.toString();
  return search ? `${path}?${search}${hash}` : `${path}${hash}`;
}

export function parseEditorLocationQuery(params) {
  const name = params.get("location")?.trim() ?? "";
  if (!name) return null;

  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  const tzRaw = params.get("tz")?.trim() ?? "";
  const latitude = latRaw == null || latRaw.trim() === "" ? Number.NaN : Number.parseFloat(latRaw);
  const longitude = lonRaw == null || lonRaw.trim() === "" ? Number.NaN : Number.parseFloat(lonRaw);
  const hasResolvedCoordinates = isValidEditorCoordinatePair(latitude, longitude);

  if (!hasResolvedCoordinates) {
    return {
      name,
      latitude: Number.NaN,
      longitude: Number.NaN,
      timezone: "",
      hasResolvedCoordinates: false,
    };
  }

  const timezone = tzRaw && isValidEditorTimeZone(tzRaw) ? tzRaw : "UTC";

  return {
    name,
    latitude,
    longitude,
    timezone,
    hasResolvedCoordinates: true,
  };
}

export function applyEditorLocationQueryToState(previous, params) {
  const parsed = parseEditorLocationQuery(params);
  if (!parsed) return null;
  if (!parsed.hasResolvedCoordinates) {
    const previousName = typeof previous?.name === "string" ? previous.name.trim() : "";
    const nextName = parsed.name;
    const previousConfirmed = hasConfirmedEditorLocation(previous);
    if (previousConfirmed && previousName !== nextName) {
      return {
        name: nextName,
        latitude: Number.NaN,
        longitude: Number.NaN,
        timezone: "",
        hasResolvedCoordinates: false,
      };
    }
    return {
      name: nextName,
      latitude: previous.latitude,
      longitude: previous.longitude,
      timezone: previous.timezone,
      hasResolvedCoordinates: false,
    };
  }
  return {
    name: parsed.name,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    timezone: parsed.timezone,
    hasResolvedCoordinates: true,
  };
}
