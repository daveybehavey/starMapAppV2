import type { Metadata } from "next";
import {
  Cinzel,
  Great_Vibes as GreatVibes,
  Playfair_Display as PlayfairDisplay,
} from "next/font/google";
import "./globals.css";

const playfair = PlayfairDisplay({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  display: "swap",
});

const greatVibes = GreatVibes({
  variable: "--font-great-vibes",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vintage Constellation Maps",
  description:
    "Create a personalized night sky map with curated vintage and luxe styles, ready for print or keepsake gifting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${playfair.variable} ${cinzel.variable} ${greatVibes.variable} bg-parchment text-midnight min-h-screen antialiased`}
      >
        <div className="min-h-screen bg-gradient-to-br from-parchment via-white to-parchment">
          {children}
        </div>
      </body>
    </html>
  );
}
