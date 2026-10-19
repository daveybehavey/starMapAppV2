/**
 * Keep in sync with src/lib/mapLookTiers.ts
 * (resolveTransparentMat, resolveTextFitFrameEnabled).
 *
 * mapLookTiers.ts cannot be imported by the unit runner directly (it has
 * runtime "@/lib/..." imports), so the two pure resolvers are mirrored
 * here; personaSweepWaveD.test.mjs pins this mirror to the real source
 * and pins both text-render call sites to the shared helper.
 */

export function resolveTransparentMat(purpose, renderOptions) {
  if (purpose === "print") return false;
  return renderOptions?.transparentBackground ?? false;
}

export function resolveTextFitFrameEnabled(purpose, renderOptions) {
  const showFrame = renderOptions?.frameEnabled ?? true;
  return showFrame && !resolveTransparentMat(purpose, renderOptions);
}
