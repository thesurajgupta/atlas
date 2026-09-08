/**
 * Which basemap the console draws under its markers.
 *
 * Three states, resolved in order:
 *
 * 1. `NEXT_PUBLIC_ATLAS_MAP_STYLE` set to a URL — a self-hosted MapLibre style
 *    document. This is what a deployment should use.
 * 2. `NEXT_PUBLIC_ATLAS_MAP_STYLE=osm` — OpenStreetMap raster tiles, built
 *    below. No key, no account, and real streets under the markers.
 * 3. Unset — the offline graticule in `components/money-trail/map-style.ts`.
 *    A real projection with no imagery, which is the honest default for a
 *    public repository.
 *
 * ## The trade-off, stated rather than buried
 *
 * OSM tiles mean **every pan sends a viewport to openstreetmap.org**. For a
 * system whose deployment story includes air-gapped operation that is a
 * decision for a deployment, not a default baked into a public repo — which is
 * why it is opt-in through configuration and off unless someone sets the
 * variable. `apps/web/.env.local.example` turns it on for local demos.
 *
 * The OSM Foundation's tile usage policy also applies: their servers are for
 * development and low-volume use, they require an identifying `Referer`, and
 * anything running for real should point variable 1 at its own tile server.
 * <https://operations.osmfoundation.org/policies/tiles/>
 */

import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";

const CONFIGURED = process.env.NEXT_PUBLIC_ATLAS_MAP_STYLE?.trim() ?? "";

export type BasemapKind = "configured" | "osm" | "offline";

export function basemapKind(): BasemapKind {
  if (CONFIGURED === "") return "offline";
  return CONFIGURED.toLowerCase() === "osm" ? "osm" : "configured";
}

/** The style URL, when one is configured. Empty for `osm` and `offline`. */
export const CONFIGURED_STYLE_URL = basemapKind() === "configured" ? CONFIGURED : "";

/**
 * OpenStreetMap raster tiles, dimmed to sit under this console's palette.
 *
 * Raster rather than vector because OSM publishes raster tiles without a key,
 * and a vector basemap would need a tile server this project does not have. The
 * brightness and saturation are pulled down so a white-ish street map does not
 * fight a dark UI — the markers have to be the brightest thing on the panel or
 * the page stops being about the data.
 */
export function buildOsmStyle(): StyleSpecification {
  return {
    version: 8,
    // Required by the spec for raster-only styles; no glyphs are drawn.
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      // A ground colour under the tiles, so a tile that has not loaded yet is
      // the console's own dark rather than a white flash.
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#0A121C" },
      },
      {
        id: "osm",
        type: "raster",
        source: "osm",
        paint: {
          "raster-brightness-max": 0.62,
          "raster-saturation": -0.45,
          "raster-contrast": 0.1,
          "raster-opacity": 0.85,
        },
      },
    ],
  };
}

/**
 * Point MapLibre at a worker URL that resolves.
 *
 * MapLibre 6 works out where its worker lives from the `import.meta.url` of the
 * chunk the bundler put it in, and asks for `./maplibre-gl-worker.mjs` beside
 * it. Under Next that chunk sits in `/_next/static/chunks/`, which has no such
 * file, so the request 404s and the worker never starts.
 *
 * The failure looks like success, which is why it is worth a comment: raster
 * tiles decode on the main thread, so the basemap draws normally. GeoJSON is
 * tiled in the worker, so every marker layer in the console silently stays
 * empty — a map that looks fine and shows nothing.
 *
 * `scripts/copy-maplibre-worker.mjs` copies the worker into `public/` before
 * `dev` and `build`; this points MapLibre at that copy. Idempotent, so every
 * map component can call it without coordinating.
 */
export function installMapWorker(maplibre: typeof import("maplibre-gl")): void {
  if (maplibre.getWorkerUrl() === WORKER_URL) return;
  maplibre.setWorkerUrl(WORKER_URL);
}

const WORKER_URL = "/maplibre-gl-worker.mjs";
