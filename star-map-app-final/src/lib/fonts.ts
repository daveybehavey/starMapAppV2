import type { TextBox } from "./store";

export const fontOptions: Array<{ id: TextBox["fontFamily"]; label: string; premium?: boolean }> = [
  // Free fonts
  { id: "playfair", label: "Playfair Display" },
  { id: "cinzel", label: "Cinzel" },
  { id: "script", label: "Great Vibes" },
  { id: "cormorant", label: "Cormorant Garamond" },
  { id: "montserrat", label: "Montserrat" },
  // Premium fonts - Serif
  { id: "libreBaskerville", label: "Libre Baskerville", premium: true },
  { id: "ebGaramond", label: "EB Garamond", premium: true },
  { id: "crimsonText", label: "Crimson Text", premium: true },
  { id: "lora", label: "Lora", premium: true },
  // Premium fonts - Sans-serif
  { id: "raleway", label: "Raleway", premium: true },
  { id: "poppins", label: "Poppins", premium: true },
  // Premium fonts - Script/Decorative
  { id: "dancingScript", label: "Dancing Script", premium: true },
  { id: "parisienne", label: "Parisienne", premium: true },
  // Premium fonts - Display
  { id: "bebasNeue", label: "Bebas Neue", premium: true },
  { id: "abrilFatface", label: "Abril Fatface", premium: true },
];

export const FONT_STACKS: Record<TextBox["fontFamily"], string> = {
  playfair: 'var(--font-playfair), "Playfair Display", serif',
  cinzel: 'var(--font-cinzel), "Cinzel", serif',
  script: 'var(--font-script), "Great Vibes", cursive',
  cormorant: 'var(--font-cormorant), "Cormorant Garamond", serif',
  montserrat: 'var(--font-montserrat), "Montserrat", sans-serif',
  libreBaskerville: 'var(--font-libre-baskerville), "Libre Baskerville", serif',
  ebGaramond: 'var(--font-eb-garamond), "EB Garamond", serif',
  crimsonText: 'var(--font-crimson-text), "Crimson Text", serif',
  lora: 'var(--font-lora), "Lora", serif',
  raleway: 'var(--font-raleway), "Raleway", sans-serif',
  poppins: 'var(--font-poppins), "Poppins", sans-serif',
  dancingScript: 'var(--font-dancing-script), "Dancing Script", cursive',
  parisienne: 'var(--font-parisienne), "Parisienne", cursive',
  bebasNeue: 'var(--font-bebas-neue), "Bebas Neue", sans-serif',
  abrilFatface: 'var(--font-abril-fatface), "Abril Fatface", display',
};
