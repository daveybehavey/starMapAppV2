/**
 * Keep in sync with src/lib/editorLocationPrefill.ts
 * @param {string} href
 * @param {string | null | undefined} location
 */
export function withEditorLocation(href, location) {
  const value = typeof location === "string" ? location.trim() : "";
  if (!value) return href;

  const hashIndex = href.indexOf("#");
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);
  params.set("location", value);
  const search = params.toString();
  return search ? `${path}?${search}${hash}` : `${path}${hash}`;
}
