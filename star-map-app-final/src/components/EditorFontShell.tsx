"use client";

import type { ReactNode } from "react";
import localFont from "next/font/local";

/**
 * Editor title fonts are loaded from committed OFL woff2 files under `src/fonts/`
 * so production builds never fetch Google Fonts at compile time.
 */

function family(
  dir: string,
  weights: number[],
  variable: string,
  options?: { preload?: boolean }
) {
  return localFont({
    src: weights.map((weight) => ({
      path: `../fonts/${dir}/latin-${weight}-normal.woff2`,
      weight: String(weight),
      style: "normal" as const,
    })),
    variable,
    display: "swap",
    preload: options?.preload ?? false,
  });
}

const cinzel = family("cinzel", [600, 700], "--font-cinzel");
const greatVibes = family("great-vibes", [400], "--font-script");
const cormorant = family("cormorant-garamond", [400, 600, 700], "--font-cormorant");
const montserrat = family("montserrat", [400, 600, 700], "--font-montserrat");
const libreBaskerville = family("libre-baskerville", [400, 700], "--font-libre-baskerville");
const ebGaramond = family("eb-garamond", [400, 600, 700], "--font-eb-garamond");
const crimsonText = family("crimson-text", [400, 600, 700], "--font-crimson-text");
const lora = family("lora", [400, 600, 700], "--font-lora");
const raleway = family("raleway", [400, 600, 700], "--font-raleway");
const poppins = family("poppins", [400, 600, 700], "--font-poppins");
const dancingScript = family("dancing-script", [400, 700], "--font-dancing-script");
const parisienne = family("parisienne", [400], "--font-parisienne");
const bebasNeue = family("bebas-neue", [400], "--font-bebas-neue");
const abrilFatface = family("abril-fatface", [400], "--font-abril-fatface");

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
