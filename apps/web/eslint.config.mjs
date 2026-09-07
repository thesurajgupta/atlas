import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Flat config, required from ESLint 9. eslint-config-next 16 ships native flat
// exports, so this needs no FlatCompat shim.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // public/vendor holds verbatim copies of dependency bundles (see
  // scripts/sync-map-worker.mjs). Linting a vendor build reports on code this
  // repository does not own and cannot fix.
  globalIgnores([".next/**", "out/**", "build/**", "public/vendor/**", "next-env.d.ts"]),
]);
