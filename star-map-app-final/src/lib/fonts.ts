import type { TextBox } from "./store";

// #411: every font is available to everyone — there is no premium/locked
// font tier. Do not reintroduce a `premium` flag here; the editor pickers
// and the render path must never branch on a font entitlement.
export const fontOptions: Array<{ id: TextBox["fontFamily"]; label: string }> = [
  { id: "playfair", label: "Playfair Display" },
  { id: "cinzel", label: "Cinzel" },
  { id: "script", label: "Great Vibes" },
  { id: "cormorant", label: "Cormorant Garamond" },
  { id: "montserrat", label: "Montserrat" },
  // Serif
  { id: "libreBaskerville", label: "Libre Baskerville" },
  { id: "ebGaramond", label: "EB Garamond" },
  { id: "crimsonText", label: "Crimson Text" },
  { id: "lora", label: "Lora" },
  // Sans-serif
  { id: "raleway", label: "Raleway" },
  { id: "poppins", label: "Poppins" },
  // Script/Decorative
  { id: "dancingScript", label: "Dancing Script" },
  { id: "parisienne", label: "Parisienne" },
  // Display
  { id: "bebasNeue", label: "Bebas Neue" },
  { id: "abrilFatface", label: "Abril Fatface" },
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
