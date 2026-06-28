/** 4×6 portrait greeting card aspect (width ÷ height = 4/6). */
export const CARD_4X6_WIDTH_TO_HEIGHT = 4 / 6;

export function getCard4x6ExportDimensions(exportWidth: number) {
  const width = Math.max(800, Math.round(exportWidth));
  const height = Math.max(1200, Math.round(width / CARD_4X6_WIDTH_TO_HEIGHT));
  return { width, height };
}

export function cardRecipeFingerprintSuffix(recipeFingerprint: string) {
  return `${recipeFingerprint}:card_4x6`;
}
