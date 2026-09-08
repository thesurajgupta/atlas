import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Flat config, required from ESLint 9. eslint-config-next 16 ships native flat
// exports, so this needs no FlatCompat shim.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // `public/maplibre-gl-*.mjs` is vendor output copied in by
  // `scripts/copy-maplibre-worker.mjs`, not source. Linting it produces a
  // thousand warnings about minified code nobody here wrote.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/maplibre-gl-*.mjs",
  ]),
]);
