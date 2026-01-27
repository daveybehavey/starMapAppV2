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
        // Primary brand colors
        parchment: "#f5f0e6",
        midnight: "#0c1021",
        gold: "#c6a35c",
        navy: "#0d1b2a",
        // Extended cosmic palette
        cosmic: {
          midnight: "#050915",
          deep: "#0f1f3a",
          surface: "#0a1427",
        },
        accent: {
          amber: "#f1c27d",
          gold: "#d7b56c",
          warm: "#e8c87d",
        },
        pale: {
          gold: "#f7f1e3",
          deep: "#ebddc2",
        },
      },
      // Standardized spacing scale (based on 4px)
      spacing: {
        "4.5": "1.125rem", // 18px
        "13": "3.25rem",   // 52px
        "15": "3.75rem",   // 60px
        "18": "4.5rem",    // 72px
      },
      // Standardized border radius
      borderRadius: {
        "4xl": "2rem",     // 32px - for large cards
        "5xl": "2.5rem",   // 40px - for hero elements
      },
      // Standardized box shadows
      boxShadow: {
        "glow-sm": "0 0 12px rgba(241, 194, 125, 0.2)",
        "glow-md": "0 0 20px rgba(241, 194, 125, 0.3)",
        "glow-lg": "0 0 30px rgba(241, 194, 125, 0.4)",
        "cosmic": "0 18px 45px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.08)",
        "cosmic-lg": "0 25px 60px rgba(0, 0, 0, 0.35)",
        "cosmic-hover": "0 30px 70px rgba(241, 194, 125, 0.25)",
        "inner-dark": "inset 0 2px 4px rgba(0, 0, 0, 0.2)",
        "inner-light": "inset 0 2px 4px rgba(0, 0, 0, 0.05)",
      },
      // Standardized ring (focus) colors
      ringColor: {
        focus: "rgba(241, 194, 125, 0.5)",
        "focus-light": "rgba(241, 194, 125, 0.3)",
      },
      // Animation timing
      transitionDuration: {
        "250": "250ms",
        "350": "350ms",
        "400": "400ms",
      },
      // Custom animations
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "scale-in": "scale-in 0.3s ease-out",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(241, 194, 125, 0.3)" },
          "50%": { boxShadow: "0 0 30px rgba(241, 194, 125, 0.5)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
