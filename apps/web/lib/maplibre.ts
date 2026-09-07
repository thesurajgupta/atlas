/**
 * The one place MapLibre is loaded.
 *
 * Two things have to happen before any map is constructed, and both are easy
 * to get wrong once per component instead of once per app:
 *
 * 1. **The import is dynamic.** MapLibre touches `window` and needs WebGL, so
 *    evaluating it during the server pass that produces the initial HTML would
 *    break the render.
 * 2. **The worker URL is set explicitly.** MapLibre otherwise resolves its
 *    worker from `import.meta.url`, which Next does not rewrite; the request
 *    404s to the HTML error page, the browser rejects it as a module script,
 *    and the worker never starts. Because MapLibre parses every source in that
 *    worker, the result is a map that emits no error and draws nothing at all —
 *    which is a far worse failure than a loud one. `scripts/sync-map-worker.mjs`
 *    puts the worker where this points.
 */

export const MAP_WORKER_URL = '/vendor/maplibre/maplibre-gl-worker.mjs';

let modulePromise: Promise<typeof import('maplibre-gl')> | null = null;

/**
 * Loads MapLibre, configured for this app. Safe to call from several
 * components: the module is imported once and the worker URL set once.
 */
export function loadMapLibre(): Promise<typeof import('maplibre-gl')> {
  modulePromise ??= import('maplibre-gl').then((maplibre) => {
    maplibre.setWorkerUrl(MAP_WORKER_URL);
    return maplibre;
  });
  return modulePromise;
}
