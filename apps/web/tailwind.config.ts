import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b0e14",
        surface: "#121721",
        sidebar: "#0f141d",
        card: "#161c26",

        paper: "#F6F7F6",
        ink: {
          900: "#14181C",
          700: "#3A4249",
          500: "#5C6670",
          300: "#8B949C",
        },
        line: {
          DEFAULT: "#DCE1E6",
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