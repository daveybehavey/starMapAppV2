"use client";

import type { ReactNode } from "react";
import localFont from "next/font/local";

/**
 * Editor title fonts are loaded from committed OFL woff2 files under `src/fonts/`
 * so production builds never fetch Google Fonts at compile time.
 *
 * Each `localFont(...)` call must stay at module scope (Next.js font-loader rule).
 */

const cinzel = localFont({
  src: [
    { path: "../fonts/cinzel/latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/cinzel/latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-cinzel",
  display: "swap",
  preload: false,
});

const greatVibes = localFont({
  src: [{ path: "../fonts/great-vibes/latin-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--font-script",
  display: "swap",
  preload: false,
});

const cormorant = localFont({
  src: [
    { path: "../fonts/cormorant-garamond/latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/cormorant-garamond/latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/cormorant-garamond/latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});

const montserrat = localFont({
  src: [
    { path: "../fonts/montserrat/latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/montserrat/latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/montserrat/latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-montserrat",
  display: "swap",
  preload: false,
});

const libreBaskerville = localFont({
  src: [
    { path: "../fonts/libre-baskerville/latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/libre-baskerville/latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-libre-baskerville",
  display: "swap",
  preload: false,
});

const ebGaramond = localFont({
  src: [
    { path: "../fonts/eb-garamond/latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/eb-garamond/latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/eb-garamond/latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-eb-garamond",
  display: "swap",
  preload: false,
});

const crimsonText = localFont({
  src: [
    { path: "../fonts/crimson-text/latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/crimson-text/latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/crimson-text/latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-crimson-text",
  display: "swap",
  preload: false,
});

const lora = localFont({
  src: [
    { path: "../fonts/lora/latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/lora/latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/lora/latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-lora",
  display: "swap",
  preload: false,
});

const raleway = localFont({
  src: [
    { path: "../fonts/raleway/latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/raleway/latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/raleway/latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-raleway",
  display: "swap",
  preload: false,
});

const poppins = localFont({
  src: [
    { path: "../fonts/poppins/latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/poppins/latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/poppins/latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
  preload: false,
});

const dancingScript = localFont({
  src: [
    { path: "../fonts/dancing-script/latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/dancing-script/latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-dancing-script",
  display: "swap",
  preload: false,
});

const parisienne = localFont({
  src: [{ path: "../fonts/parisienne/latin-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--font-parisienne",
  display: "swap",
  preload: false,
});

const bebasNeue = localFont({
  src: [{ path: "../fonts/bebas-neue/latin-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--font-bebas-neue",
  display: "swap",
  preload: false,
});

const abrilFatface = localFont({
  src: [{ path: "../fonts/abril-fatface/latin-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--font-abril-fatface",
  display: "swap",
  preload: false,
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
