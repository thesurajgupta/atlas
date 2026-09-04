import type { Config } from "tailwindcss";

// Design tokens for the investigator interface (spec §25.5):
// "Professional, information-dense, restrained, accessible, fast. Colour is
// semantic and scarce — severity and risk only, never decoration."
//
// Palette is deliberately quiet: one neutral scale for structure, and a small
// set of named severity/evidence colours that are the ONLY place colour
// carries meaning. Nothing here is chosen for decoration.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F7F6", // page background — cool, quiet, not warm-cream
        surface: "#FFFFFF", // card / panel background
        ink: {
          900: "#14181C", // primary text
          700: "#3A4249", // secondary text
          500: "#5C6670", // tertiary / muted text
          300: "#8B949C", // placeholder, disabled
        },
        line: {
          DEFAULT: "#DCE1E6", // hairline borders
          strong: "#C2C9CF",
        },
        severity: {
          low: "#3A4249",
          medium: "#9A6700",
          high: "#B3261E",
          critical: "#7A1712",
        },
        evidence: {
          strong: "#1D6F5C",
          moderate: "#4A6FA5",
          weak: "#9A6700",
          insufficient: "#5C6670",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.2rem" }],
        base: ["0.875rem", { lineHeight: "1.35rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
