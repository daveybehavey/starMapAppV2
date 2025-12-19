import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        playfair: ["var(--font-playfair)", "serif"],
        cinzel: ["var(--font-cinzel)", "serif"],
        script: ["var(--font-great-vibes)", "cursive"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        parchment: "#f5f0e6",
        midnight: "#0c1021",
        gold: "#c6a35c",
        navy: "#0d1b2a",
      },
    },
  },
  plugins: [],
};

export default config;
