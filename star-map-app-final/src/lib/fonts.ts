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
  playfair: '"Playfair Display", Georgia, serif',
  cinzel: '"Cinzel", "Times New Roman", serif',
  script: '"Great Vibes", "Brush Script MT", cursive',
  cormorant: '"Cormorant Garamond", "Palatino Linotype", serif',
  montserrat: '"Montserrat", "Helvetica Neue", sans-serif',
  libreBaskerville: '"Libre Baskerville", "Book Antiqua", serif',
  ebGaramond: '"EB Garamond", Garamond, serif',
  crimsonText: '"Crimson Text", Georgia, serif',
  lora: '"Lora", "Cambria", serif',
  raleway: '"Raleway", "Trebuchet MS", sans-serif',
  poppins: '"Poppins", "Arial", sans-serif',
  dancingScript: '"Dancing Script", "Lucida Handwriting", cursive',
  parisienne: '"Parisienne", "Edwardian Script ITC", cursive',
  bebasNeue: '"Bebas Neue", Impact, sans-serif',
  abrilFatface: '"Abril Fatface", "Rockwell", display',
};

export const FONT_WEIGHTS: Record<TextBox["fontFamily"], number> = {
  playfair: 700,
  cinzel: 700,
  script: 400,
  cormorant: 600,
  montserrat: 600,
  libreBaskerville: 700,
  ebGaramond: 600,
  crimsonText: 600,
  lora: 600,
  raleway: 600,
  poppins: 600,
  dancingScript: 400,
  parisienne: 400,
  bebasNeue: 400,
  abrilFatface: 400,
};
