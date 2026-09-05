'use client';

/**
 * A compact MapLibre map for one entity's location.
 *
 * MapLibre is loaded with a dynamic `import()` inside the effect, never at
 * module scope: it touches `window` and needs WebGL, so evaluating it during
 * the server pass that produces the initial HTML would break the render. The
 * container is server-rendered empty and the map attaches on the client, which
 * keeps the markup identical on both sides and avoids a hydration mismatch.
 *
 * The marker is a style layer rather than a `Marker` DOM element, so it is
 * drawn by the same renderer as everything else, pans and zooms with the map
 * for free, and cannot escape the container.
 *
 * Amber marks a cash-out because that is the categorical colour this console
 * uses for "value left the traceable system". It says where, not how bad.
 */

import { useEffect, useRef, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

import { CONFIGURED_MAP_STYLE_URL, HAS_CONFIGURED_BASEMAP, buildOfflineStyle } from './map-style';

const ACCENT_COLOR = { amber: '#fbbf24', sky: '#38bdf8' } as const;

export interface EntityLocationMapProps {
  readonly latitude: number;
  readonly longitude: number;
  readonly displayLabel?: string;
  readonly isSynthetic: boolean;
  readonly accent: 'amber' | 'sky';
}

export default function EntityLocationMap({
  latitude,
  longitude,
  displayLabel,
  isSynthetic,
  accent,
}: EntityLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let cancelled = false;
    // Typed as the module's Map so the cleanup does not need a cast; the import
    // is dynamic, so this is the only place the type is named.
    let map: import('maplibre-gl').Map | null = null;

    void (async () => {
      try {
        const { Map: MapLibreMap } = await import('maplibre-gl');
        if (cancelled) return;

        map = new MapLibreMap({
          container,
          style: HAS_CONFIGURED_BASEMAP
            ? CONFIGURED_MAP_STYLE_URL
            : buildOfflineStyle(latitude, longitude),
          center: [longitude, latitude],
          zoom: 9,
          // Flat, always. This is a locator, not a terrain view.
          pitch: 0,
          maxPitch: 0,
          dragRotate: false,
          pitchWithRotate: false,
          touchZoomRotate: true,
          // No logo, no attribution bar, no navigation cluster — the panel is
          // 300px wide and every control would cost more than it gives.
          attributionControl: false,
        });
        map.touchZoomRotate.disableRotation();

        map.on('load', () => {
          if (cancelled || map === null) return;
          map.addSource('entity-location', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [longitude, latitude] },
            },
          });
          map.addLayer({
            id: 'entity-location-halo',
            type: 'circle',
            source: 'entity-location',
            paint: {
              'circle-radius': 13,
              'circle-color': ACCENT_COLOR[accent],
              'circle-opacity': 0.16,
            },
          });
          map.addLayer({
            id: 'entity-location-point',
            type: 'circle',
            source: 'entity-location',
            paint: {
              'circle-radius': 5,
              'circle-color': ACCENT_COLOR[accent],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#020617',
            },
          });
        });

        // A configured style that fails to load must say so rather than leaving
        // a blank rectangle that reads as "there is nothing here".
        map.on('error', (event) => {
          if (cancelled) return;
          setFailure(event.error?.message ?? 'the basemap style could not be loaded');
        });
      } catch {
        if (!cancelled) setFailure('the map library could not be loaded');
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
      map = null;
    };
  }, [latitude, longitude, accent]);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative overflow-hidden rounded-sm border border-slate-800">
        <div
          ref={containerRef}
          className="h-[140px] w-full bg-slate-950"
          role="img"
          aria-label={
            displayLabel === undefined
              ? `Map centred on ${latitude}, ${longitude}`
              : `Map centred on ${displayLabel}`
          }
        />
        {isSynthetic && (
          <span className="pointer-events-none absolute top-1 left-1 rounded-sm border border-amber-500/40 bg-slate-950/85 px-1.5 py-0.5 text-micro font-semibold tracking-[0.1em] text-amber-300 uppercase">
            Synthetic
          </span>
        )}
        {failure !== null && (
          <p className="absolute inset-x-0 bottom-0 bg-slate-950/90 px-2 py-1 text-micro text-slate-400">
            Map unavailable — {failure}.
          </p>
        )}
      </div>
      {!HAS_CONFIGURED_BASEMAP && (
        <p className="text-micro leading-relaxed text-slate-600">
          Coordinate grid only — no basemap style is configured. Set{' '}
          <code className="font-mono text-slate-500">NEXT_PUBLIC_ATLAS_MAP_STYLE</code> to a
          self-hosted MapLibre style to render imagery.
        </p>
      )}
    </div>
  );
}
