/**
 * Basemap style resolution for the MapLibre surfaces.
 *
 * ## Which maps this covers
 *
 * The money-trail entity locator (`components/money-trail/EntityLocationMap`).
 * The cash-out map used to share this file; it renders a Google basemap now
 * (`components/map/CashOutMap`, `lib/google-maps.ts`) and reads none of it.
 *
 * ## Where the basemap comes from
 *
 * The style URL is configuration, never a literal in the source. Set
 * `NEXT_PUBLIC_ATLAS_MAP_STYLE` to a self-hosted MapLibre style document and
 * this map renders that. Leave it unset — as it is in this repository — and it
 * falls back to the offline graticule style built below.
 *
 * Nothing here is hardcoded to a tile vendor. A public tile server would mean
 * every panel open sends a coordinate to a third party, which for a system with
 * an air-gapped deployment story is a decision for a deployment, not a default
 * in a public repo (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md, "deployment
 * specifics" and "live endpoint addresses"). The cash-out map is the deliberate
 * exception, and `lib/google-maps.ts` states the terms of it.
 *
 * ## The offline style
 *
 * `buildGraticuleStyle` draws meridians and parallels and nothing else. This is
 * worth being precise about: a graticule is not a picture of the world, it is
 * the coordinate system itself. Every line is at exactly the latitude or
 * longitude it claims, at any zoom, with no data behind it to be wrong. It
 * requests nothing from anywhere. Drawing invented coastlines or streets to
 * make a 140px panel look map-like would be fabricating geography; drawing the
 * reference grid is not.
 */

import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Feature, FeatureCollection, LineString } from 'geojson';

/**
 * A self-hosted MapLibre style document, if this deployment has one.
 *
 * Read through a static property access rather than a dynamic key, because Next
 * inlines `NEXT_PUBLIC_*` at build time only when it can see the whole
 * expression.
 */
export const CONFIGURED_MAP_STYLE_URL: string =
  process.env.NEXT_PUBLIC_ATLAS_MAP_STYLE?.trim() ?? '';

export const HAS_CONFIGURED_BASEMAP = CONFIGURED_MAP_STYLE_URL.length > 0;

const GRID_COLOR = '#20374F';

/**
 * Meridians and parallels at `spacing` degrees, covering `extent` degrees
 * around a centre.
 *
 * Generated around the centre rather than globally because a 0.1° world
 * graticule is 5,400 lines that nobody will ever pan to. The window is wide
 * enough that panning at the zoom levels these maps use stays inside it.
 */
export function buildGraticule(
  centreLatitude: number,
  centreLongitude: number,
  spacing: number,
  extent: number,
): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];

  // Snap to the spacing so lines land on round values — a graticule offset by
  // a fraction of a degree is harder to read a coordinate off than no grid.
  const snap = (value: number) => Math.round(value / spacing) * spacing;
  const steps = Math.ceil(extent / spacing);

  const minLatitude = Math.max(-85, snap(centreLatitude) - steps * spacing);
  const maxLatitude = Math.min(85, snap(centreLatitude) + steps * spacing);
  const minLongitude = snap(centreLongitude) - steps * spacing;
  const maxLongitude = snap(centreLongitude) + steps * spacing;

  for (let i = 0; i <= steps * 2; i += 1) {
    const latitude = minLatitude + i * spacing;
    if (latitude >= -85 && latitude <= 85) {
      features.push({
        type: 'Feature',
        // A whole-degree line is drawn heavier, so the grid has a readable scale.
        properties: { major: Math.abs(latitude % 1) < 1e-9 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [minLongitude, latitude],
            [maxLongitude, latitude],
          ],
        },
      });
    }

    const longitude = minLongitude + i * spacing;
    features.push({
      type: 'Feature',
      properties: { major: Math.abs(longitude % 1) < 1e-9 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [longitude, minLatitude],
          [longitude, maxLatitude],
        ],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * The grid-only style: a dark ground and a coordinate grid.
 *
 * Two grids at different spacings, switched by zoom, so the map stays legible
 * whether the viewer is looking at a degree or a tenth of one. Used by the
 * small entity locator, where 140px of height has no room for coastline.
 */
export function buildGraticuleStyle(latitude: number, longitude: number): StyleSpecification {
  return {
    version: 8,
    // No glyphs or sprite are declared: this style has no labels and no icons,
    // so it never requests a font or image from anywhere.
    sources: {
      'graticule-coarse': {
        type: 'geojson',
        data: buildGraticule(latitude, longitude, 1, 12),
      },
      'graticule-fine': {
        type: 'geojson',
        data: buildGraticule(latitude, longitude, 0.1, 1.5),
      },
    },
    layers: [
      { id: 'ground', type: 'background', paint: { 'background-color': '#020617' } },
      {
        id: 'graticule-fine',
        type: 'line',
        source: 'graticule-fine',
        minzoom: 8.5,
        paint: { 'line-color': GRID_COLOR, 'line-width': 0.6 },
      },
      {
        id: 'graticule-coarse',
        type: 'line',
        source: 'graticule-coarse',
        paint: {
          'line-color': ['case', ['get', 'major'], '#334155', GRID_COLOR],
          'line-width': ['case', ['get', 'major'], 1, 0.6],
        },
      },
    ],
  };
}
