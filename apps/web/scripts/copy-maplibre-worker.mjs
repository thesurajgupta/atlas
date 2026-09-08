/**
 * Put MapLibre's worker somewhere the browser can actually fetch it.
 *
 * MapLibre 6 derives its worker URL from the `import.meta.url` of whichever
 * chunk the bundler emitted it into, then resolves `./maplibre-gl-worker.mjs`
 * against it. Under Next's bundler that chunk lives in `/_next/static/chunks/`,
 * where no such file exists — the request 404s, the dev server answers with the
 * HTML fallback, and the browser refuses it for its MIME type.
 *
 * The failure is close to silent and was worth a day: raster tiles are decoded
 * on the main thread, so the basemap still drew. Only the GeoJSON sources —
 * every marker on every map in the console — are tiled in the worker, so the
 * map came up looking correct and simply had no markers on it.
 *
 * So the worker is copied into `public/` at its published version and pointed
 * at explicitly by `installMapWorker`. Copied rather than committed: it is
 * vendor output, and a stale copy of it would be a version skew nobody would
 * think to look for.
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const dist = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
const out = join(here, "..", "public");

// The worker is a module that imports its sibling shared chunk by relative
// path, so both have to land next to each other or the import 404s in turn.
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(out, { recursive: true });
for (const file of files) {
  copyFileSync(join(dist, file), join(out, file));
}
console.log(`maplibre worker → ${out}`);
