import type { Config } from "tailwindcss";

// Design tokens for the investigator interface (spec §25.5):
// "Professional, information-dense, restrained, accessible, fast. Colour is
// semantic and scarce — severity and risk only, never decoration."
//
// Dark by default. This is a console operators sit in front of for a shift, in
// rooms that are not bright, alongside a map that is itself dark — a white page
// between two dark surfaces is the thing people actually complain about.
//
// The neutral scale is blue-biased rather than pure grey, so it sits under the
// accent without looking like an unconsidered default. Severity and evidence
// are the only colours that carry meaning; everything else is structure.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Taken from the ATM / branch map, which is the reference page. The
        // palette is aligned to it rather than the other way round: it is the
        // screen that was designed against the real brief, so it wins, and
        // every other page inherits these tokens instead of re-picking hexes.
        //
        // Blue-biased neutrals, not grey. Under an accent this reads as chosen;
        // a pure grey scale reads as a default nobody looked at.
        paper: "#0A121C", // page background
        surface: "#0D1724", // card / panel
        raised: "#101B29", // controls, inputs, hovered rows
        ink: {
          900: "#E8EEF6", // primary text
          700: "#A9BACB", // secondary
          500: "#7A8CA3", // tertiary / muted
          300: "#55647A", // placeholder, disabled
        },
        line: {
          DEFAULT: "#1E2B3D", // hairline borders
          strong: "#2C3D54",
        },
        accent: "#4A8CD4", // selection and focus only — never decoration
        // Severity and evidence are the only colours that carry meaning
        // (spec §25.5), and these are the map's own values so a "high risk"
        // marker there and a HIGH chip elsewhere are the same red.
        severity: {
          low: "#8E9BB0",
          medium: "#E5A23D",
          high: "#E5484D",
          critical: "#F2666B",
        },
        evidence: {
          strong: "#3E9B6D",
          moderate: "#4A8CD4",
          weak: "#E5A23D",
          insufficient: "#7A8CA3",
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
