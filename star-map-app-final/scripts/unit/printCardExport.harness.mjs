/** Keep in sync with printCardExport.ts */
export const CARD_4X6_WIDTH_TO_HEIGHT = 4 / 6;

export function getCard4x6ExportDimensions(exportWidth) {
  const width = Math.max(800, Math.round(exportWidth));
  const height = Math.max(1200, Math.round(width / CARD_4X6_WIDTH_TO_HEIGHT));
  return { width, height };
}

export function cardRecipeFingerprintSuffix(recipeFingerprint) {
  return `${recipeFingerprint}:card_4x6`;
}
