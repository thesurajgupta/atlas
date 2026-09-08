"use client";

/**
 * The console's map: real projection, real coordinates, markers from the data.
 *
 * MapLibre is loaded with a dynamic `import()` inside the effect, never at
 * module scope — it touches `window` and needs WebGL, so evaluating it during
 * the server pass would break the render. The container server-renders empty
 * and the map attaches on the client, so the markup matches on both sides.
 *
 * Markers are style layers rather than DOM `Marker` elements, so they are drawn
 * by the same renderer as the basemap, pan and zoom for free, and cannot escape
 * the container.
 *
 * **Fill is risk, outline is kind.** Two facts that must not be conflated: a
 * bank branch is not suspicious for being a branch. Keeping them on separate
 * visual channels is what lets an operator read both at a glance.
 *
 * Nothing here invents a location. Every marker is an endpoint that exists in
 * the data with coordinates it actually carries; an endpoint without them —
 * a crypto off-ramp has no physical place — is not drawn at all rather than
 * being given a plausible one.
 */

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { basemapKind, buildOsmStyle, CONFIGURED_STYLE_URL, installMapWorker } from "@/lib/basemap";
import { buildOfflineStyle } from "@/components/money-trail/map-style";

export interface MapEndpoint {
  id: string;
  label: string;
  lat: number;
  lon: number;
  kind: "ATM" | "Branch" | "Other";
  risk: "HIGH" | "MEDIUM" | "LOW";
  /**
   * This endpoint is on the current case's ranked list.
   *
   * Its own colour, not a shade of the risk scale: "the model ranked this for
   * the case in front of you" and "this location carries historical risk" are
   * different claims, and an operator has to be able to tell them apart at a
   * glance. A high-risk ATM nobody predicted is not the same instruction as a
   * predicted one.
   */
  predicted?: boolean;
  /** Relative model score, not a probability. Shown as-is where shown. */
  score?: number;
  rank?: number;
}

const RISK_FILL: Record<MapEndpoint["risk"], string> = {
  HIGH: "#E5484D",
  MEDIUM: "#E5A23D",
  LOW: "#3E9B6D",
};

/** Predicted cash-out. Distinct hue, so it cannot be read as a risk band. */
const PREDICTED_FILL = "#8B5CF6";

/**
 * Which markers pulse.
 *
 * Only the two that are actionable: a predicted cash-out, and a high-risk
 * endpoint. Everything pulsing is the same as nothing pulsing — the effect is
 * spent on the markers an officer is meant to move towards, and the ordinary
 * ATMs stay small and quiet so those two are findable in a dense district.
 */
function isActionable(e: MapEndpoint): boolean {
  return e.predicted === true || e.risk === "HIGH";
}

const KIND_STROKE: Record<MapEndpoint["kind"], string> = {
  ATM: "#E8EEF6",
  Branch: "#4A8CD4",
  Other: "#7A8CA3",
};

export function EndpointMap({
  endpoints,
  selectedId,
  onSelect,
  className = "",
}: {
  endpoints: MapEndpoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const kind = basemapKind();

  // The selection handler changes identity every render while the map is built
  // once, so the click listener has to reach the current one through a ref.
  // Assigned in an effect rather than during render — a ref write during render
  // is not safe under concurrent rendering, and the linter is right to say so.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;

    void (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        installMapWorker(maplibre);
        if (cancelled) return;

        const withCoords = endpoints.filter(
          (e) => Number.isFinite(e.lat) && Number.isFinite(e.lon),
        );
        const centre = withCoords[0] ?? { lat: 28.6139, lon: 77.209 };

        map = new maplibre.Map({
          container,
          style:
            kind === "configured"
              ? CONFIGURED_STYLE_URL
              : kind === "osm"
                ? buildOsmStyle()
                : buildOfflineStyle(centre.lat, centre.lon),
          center: [centre.lon, centre.lat],
          zoom: 10,
          attributionControl: { compact: true },
          // The console is read, not explored. Rotation makes a map harder to
          // compare against another screen for no gain here.
          dragRotate: false,
          pitchWithRotate: false,
        });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled || map === null) return;
          setReady(true);
        });
        map.on("error", (event) => {
          // A failed tile is not a failed map — the markers are still at real
          // coordinates. Surfaced quietly rather than replacing the panel.
          if (!cancelled) setFailure(String(event.error?.message ?? "map error"));
        });
      } catch (err) {
        if (!cancelled) setFailure(err instanceof Error ? err.message : "map failed to load");
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // Built once. Marker updates are handled by the effect below, so a changing
    // endpoint list does not tear down and rebuild the whole map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // Markers, and the viewport that fits them.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;

    const withCoords = endpoints.filter(
      (e) => Number.isFinite(e.lat) && Number.isFinite(e.lon),
    );

    const data = {
      type: "FeatureCollection" as const,
      features: withCoords.map((e) => ({
        type: "Feature" as const,
        properties: {
          id: e.id,
          label: e.label,
          fill: e.predicted ? PREDICTED_FILL : RISK_FILL[e.risk],
          stroke: KIND_STROKE[e.kind],
          selected: e.id === selectedId ? 1 : 0,
          actionable: isActionable(e) ? 1 : 0,
          // Ordinary ATMs and branches stay small. A map where every marker
          // shouts is one where the two that matter are invisible.
          radius: e.id === selectedId ? 9 : isActionable(e) ? 6.5 : 3.5,
        },
        geometry: { type: "Point" as const, coordinates: [e.lon, e.lat] },
      })),
    };

    const existing = map.getSource("endpoints") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(data);
    } else {
      map.addSource("endpoints", { type: "geojson", data });

      // The halo sits *under* the dots and only draws for actionable markers.
      // Its radius and opacity are animated below; keeping it a separate layer
      // means the dot itself never moves, so a marker cannot drift off its own
      // coordinate while it pulses.
      map.addLayer({
        id: "endpoint-pulse",
        type: "circle",
        source: "endpoints",
        filter: ["==", ["get", "actionable"], 1],
        paint: {
          "circle-radius": 8,
          "circle-color": ["get", "fill"],
          "circle-opacity": 0.35,
          "circle-blur": 0.5,
        },
      });

      map.addLayer({
        id: "endpoint-dot",
        type: "circle",
        source: "endpoints",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": ["get", "fill"],
          "circle-stroke-color": ["get", "stroke"],
          "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 3, 1.5],
          "circle-opacity": 0.9,
        },
      });
      map.on("click", "endpoint-dot", (event) => {
        const id = event.features?.[0]?.properties?.["id"];
        if (typeof id === "string") onSelectRef.current?.(id);
      });
      map.on("mouseenter", "endpoint-dot", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "endpoint-dot", () => {
        map.getCanvas().style.cursor = "";
      });
    }

    // Fit to what is drawn, so a case in one district and a case across six
    // states both open on ground the reader can place.
    if (withCoords.length > 1) {
      const lons = withCoords.map((e) => e.lon);
      const lats = withCoords.map((e) => e.lat);
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 56, maxZoom: 13, duration: 0 },
      );
    }
  }, [endpoints, selectedId, ready]);

  // The pulse.
  //
  // Driven by rAF rather than CSS, because the markers are style layers inside
  // the WebGL canvas — there is no DOM node to animate. Paused for
  // `prefers-reduced-motion`, where the halo simply stays at its resting size:
  // the marker is still larger and still coloured, so nothing is only
  // communicated by movement.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      // ~1.6s period. Slow enough to read as a beacon rather than a flicker.
      const phase = ((now - start) % 1600) / 1600;
      const eased = Math.sin(phase * Math.PI);
      if (map.getLayer("endpoint-pulse")) {
        map.setPaintProperty("endpoint-pulse", "circle-radius", 8 + eased * 10);
        map.setPaintProperty("endpoint-pulse", "circle-opacity", 0.34 - eased * 0.26);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full" />

      {kind === "offline" && (
        <p className="pointer-events-none absolute bottom-2 left-2 rounded border border-line bg-paper/90 px-2 py-1 text-[10px] text-ink-500">
          Coordinate grid only — no basemap configured. Set{" "}
          <code className="font-mono">NEXT_PUBLIC_ATLAS_MAP_STYLE</code>.
        </p>
      )}
      {failure && (
        <p className="pointer-events-none absolute bottom-2 right-2 rounded border border-severity-medium/40 bg-paper/90 px-2 py-1 text-[10px] text-severity-medium">
          Basemap tiles unavailable — markers are still at real coordinates.
        </p>
      )}
    </div>
  );
}
