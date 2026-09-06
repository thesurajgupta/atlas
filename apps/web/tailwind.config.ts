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
        // Dark operations console. The tokens keep their semantic names, so
        // every page that was written against `paper` / `surface` / `ink` /
        // `line` retheme without touching a single component — which is the
        // reason the palette was tokenised in the first place.
        paper: "#0B0E14", // page background
        surface: "#141A24", // card / panel
        raised: "#1B2330", // controls, inputs, hovered rows
        ink: {
          900: "#F1F5F9", // primary text
          700: "#CBD5E1", // secondary
          500: "#94A3B8", // tertiary / muted
          300: "#64748B", // placeholder, disabled
        },
        line: {
          DEFAULT: "#233044", // hairline borders
          strong: "#334155",
        },
        accent: "#38BDF8", // selection and focus only — never decoration
        // Severity and evidence are the only colours that carry meaning
        // (spec §25.5). Lifted off the light-theme values because #B3261E on
        // #0B0E14 fails contrast — same semantics, legible ground.
        severity: {
          low: "#94A3B8",
          medium: "#FBBF24",
          high: "#F87171",
          critical: "#FB7185",
        },
        evidence: {
          strong: "#34D399",
          moderate: "#60A5FA",
          weak: "#FBBF24",
          insufficient: "#94A3B8",
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
