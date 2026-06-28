/** @param {string} source @param {string} [mode] */
export function buildDigitalEditorCheckoutHref(source, mode = "quick") {
  const params = new URLSearchParams({
    mode,
    source,
    checkout: "digital",
  });
  return `/editor?${params.toString()}`;
}
