"use client";

import type { ReactNode } from "react";
import {
  Cinzel,
  Great_Vibes,
  Cormorant_Garamond,
  Montserrat,
  Libre_Baskerville,
  EB_Garamond,
  Crimson_Text,
  Lora,
  Raleway,
  Poppins,
  Dancing_Script,
  Parisienne,
  Bebas_Neue,
  Abril_Fatface,
} from "next/font/google";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-cinzel",
  preload: false,
  display: "swap",
});
const greatVibes = Great_Vibes({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-script",
  preload: false,
  display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cormorant",
  preload: false,
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-montserrat",
  preload: false,
  display: "swap",
});
const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-libre-baskerville",
  preload: false,
  display: "swap",
});
const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-eb-garamond",
  preload: false,
  display: "swap",
});
const crimsonText = Crimson_Text({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-crimson-text",
  preload: false,
  display: "swap",
});
const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-lora",
  preload: false,
  display: "swap",
});
const raleway = Raleway({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-raleway",
  preload: false,
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-poppins",
  preload: false,
  display: "swap",
});
const dancingScript = Dancing_Script({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-dancing-script",
  preload: false,
  display: "swap",
});
const parisienne = Parisienne({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-parisienne",
  preload: false,
  display: "swap",
});
const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas-neue",
  preload: false,
  display: "swap",
});
const abrilFatface = Abril_Fatface({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-abril-fatface",
  preload: false,
  display: "swap",
});

type EditorFontShellProps = {
  children: ReactNode;
  className?: string;
};

export default function EditorFontShell({ children, className = "" }: EditorFontShellProps) {
  return (
    <div
      className={`${cinzel.variable} ${greatVibes.variable} ${cormorant.variable} ${montserrat.variable} ${libreBaskerville.variable} ${ebGaramond.variable} ${crimsonText.variable} ${lora.variable} ${raleway.variable} ${poppins.variable} ${dancingScript.variable} ${parisienne.variable} ${bebasNeue.variable} ${abrilFatface.variable} ${className}`}
    >
      {children}
    </div>
  );
}
