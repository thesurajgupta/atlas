/**
 * Copies MapLibre's worker bundle into `public/vendor/maplibre/`.
 *
 * Run automatically by the `predev` and `prebuild` npm scripts. The output is
 * generated, not committed — it is a verbatim copy of two files from the
 * pinned `maplibre-gl` dependency, and generating it means it can never drift
 * from the installed version.
 *
 * ## Why this exists
 *
 * MapLibre spawns its worker from `new URL('./maplibre-gl-worker.mjs',
 * import.meta.url)`. That resolves against the *bundled chunk's* URL, and Next
 * does not rewrite the expression or emit the worker as an asset, so the
 * request lands on a path the app does not serve. The dev server answers it
 * with the HTML 404 page, the browser rejects that as a module script on MIME
 * grounds, and the worker never starts.
 *
 * The failure is silent and total: MapLibre parses *every* source in the
 * worker, so with no worker there are no tiles, no `load` event and no error
 * event either — just a canvas that stays empty. `lib/maplibre.ts` points
 * `setWorkerUrl` at what this script writes, which is the vendor's documented
 * escape hatch for bundlers that cannot resolve the worker themselves.
 *
 * Both files are needed: the worker imports `./maplibre-gl-shared.mjs` as a
 * sibling, so they have to land in the same directory.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(HERE, '..', 'node_modules', 'maplibre-gl', 'dist');
const TARGET_DIR = path.join(HERE, '..', 'public', 'vendor', 'maplibre');

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

if (!existsSync(SOURCE_DIR)) {
  // Not an error: a lint-only or type-only checkout may have no dependencies
  // installed yet, and failing here would break those for no reason.
  console.log('maplibre-gl is not installed — skipping worker sync.');
  process.exit(0);
}

await mkdir(TARGET_DIR, { recursive: true });
for (const file of FILES) {
  await copyFile(path.join(SOURCE_DIR, file), path.join(TARGET_DIR, file));
}
console.log(`Synced ${FILES.length} MapLibre worker files to public/vendor/maplibre/.`);
