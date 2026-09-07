'use client';

/**
 * The cash-out map: a real Google basemap, synthetic endpoints on top of it.
 *
 * ## What is real here and what is not
 *
 * The ground is Google's — satellite imagery, roads, place names, state
 * boundaries, at a fidelity no vendored dataset in this repository can match,
 * and that fidelity is the point: an operator has to be able to tell "the far
 * side of the district" from "the next street" without leaving the screen.
 *
 * Everything drawn *on* that ground is synthetic. No complaint put an endpoint
 * anywhere, and no calibrated model produced a score. The caption under the map
 * says so, the popup says so per endpoint, and neither statement is decorative.
 *
 * ## Loading
 *
 * The API is fetched by `lib/google-maps.ts`, always from an effect and never
 * during a server render: it touches `window` on evaluation. The container is
 * server-rendered empty and the map attaches on the client, so the markup
 * matches on both sides and there is no hydration mismatch. Whether a key is
 * configured is a build-time constant, identical on server and client, so the
 * missing-key panel renders the same in both passes too.
 *
 * ## Why `google.maps.Marker`
 *
 * `AdvancedMarkerElement` is the current API and is what this would use given
 * a choice — but it renders nothing without a cloud-configured Map ID, which
 * is a second piece of deployment configuration for a screen whose whole
 * requirement was "set one key and it works". `Marker` is deprecated and
 * explicitly still supported, with twelve months' notice promised before
 * removal. If a Map ID is ever provisioned, this is the file that changes.
 *
 * ## Colour carries two facts
 *
 * Fill is the risk band — red, amber, green. Outline is what the endpoint is —
 * cyan for an ATM, slate for a branch. A branch is not suspicious for being a
 * branch, so the categorical dimension never borrows the severity scale
 * (spec §25.5). The map legend spells both out.
 *
 * Keyboard and screen-reader users read this data in the ranked table beside
 * the map, which carries the same rows and the same selection.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';

import { geodesicCircle, type LatLon } from '@/lib/geo';
import {
  GOOGLE_MAPS_KEY_VARIABLE,
  HAS_GOOGLE_MAPS_KEY,
  loadGoogleMaps,
  onGoogleMapsAuthFailure,
} from '@/lib/google-maps';

export type CashOutPriority = 'high' | 'medium' | 'low';
export type CashOutKind = 'ATM' | 'Branch';

export interface CashOutMapPoint extends LatLon {
  readonly id: string;
  readonly label: string;
  readonly kind: CashOutKind;
  readonly operator: string;
  readonly area: string;
  readonly priority: CashOutPriority;
  readonly probability: number;
  /**
   * Formatted by the page, not here. The popup and the table's distance column
   * are the same number said the same way; formatting it twice is how they
   * eventually stop being.
   */
  readonly distanceLabel: string;
}

export interface CashOutMapProps {
  /**
   * Every candidate in the case. A marker is built once per entry and then
   * shown or hidden — filtering must not churn map objects.
   */
  readonly points: readonly CashOutMapPoint[];
  /** Which of `points` the filters currently admit. */
  readonly visibleIds: ReadonlySet<string>;
  /** The last confirmed hop — the point every distance on this screen is from. */
  readonly origin: LatLon & { readonly label: string };
  /** Search-radius rings, in kilometres. */
  readonly ringRadiiKm: readonly number[];
  readonly showPaths: boolean;
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly className?: string;
}

/**
 * Risk bands. Marker fill and the map legend read from this one table; the
 * ranked table beside the map keeps its own chip tokens.
 */
export const RISK_COLOR: Record<CashOutPriority, string> = {
  high: '#DC2626',
  medium: '#F59E0B',
  low: '#10B981',
};

/** What the endpoint is, never how bad it is. */
export const KIND_COLOR: Record<CashOutKind, string> = {
  ATM: '#22D3EE',
  Branch: '#93A7BD',
};

const RISK_LABEL: Record<CashOutPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const ACCENT = '#4A8CD4';
const SELECTION = '#FFFFFF';

/**
 * India, generously bounded — Gujarat to Arunachal, Kanyakumari to Ladakh.
 * The opening view is this box unioned with the case, so the country fills the
 * panel whether the candidates sit in one district or in six states.
 */
const INDIA_BOUNDS = { south: 6.5, west: 68.0, north: 35.8, east: 97.5 } as const;

const MIN_ZOOM = 3;
const MAX_ZOOM = 19;

/** A unit square, so `scale` means the same thing as it does for a circle. */
const SQUARE_PATH = 'M -1 -1 H 1 V 1 H -1 Z';

const markerScale = (priority: CashOutPriority) => (priority === 'low' ? 6 : 7.5);

function endpointIcon(point: CashOutMapPoint): google.maps.Symbol {
  return {
    path: point.kind === 'ATM' ? google.maps.SymbolPath.CIRCLE : SQUARE_PATH,
    scale: markerScale(point.priority),
    fillColor: RISK_COLOR[point.priority],
    fillOpacity: 0.95,
    strokeColor: KIND_COLOR[point.kind],
    strokeWeight: 2,
  };
}

/** Dashed, because a line from the last hop to a candidate is inferred, not observed. */
function dashPattern(opacity: number): google.maps.IconSequence[] {
  return [
    {
      icon: {
        path: 'M 0,-1 0,1',
        strokeColor: ACCENT,
        strokeOpacity: opacity,
        strokeWeight: 1.2,
        scale: 3,
      },
      offset: '0',
      repeat: '10px',
    },
  ];
}

/**
 * The popup body, built as DOM rather than an HTML string: every value below
 * is fixture text today and case data tomorrow, and `textContent` is what keeps
 * that change from being an injection.
 *
 * Only fields the point actually carries appear. Nothing is invented to fill a
 * row out.
 */
function buildInfoContent(point: CashOutMapPoint): HTMLElement {
  const root = document.createElement('div');
  root.className = 'atlas-map-info';

  const title = document.createElement('p');
  title.className = 'atlas-map-info__title';
  title.textContent = point.label;
  root.appendChild(title);

  const badges = document.createElement('div');
  badges.className = 'atlas-map-info__badges';

  const kind = document.createElement('span');
  kind.className = 'atlas-map-info__badge';
  kind.style.color = KIND_COLOR[point.kind];
  kind.style.borderColor = `${KIND_COLOR[point.kind]}66`;
  kind.textContent = point.kind;
  badges.appendChild(kind);

  const risk = document.createElement('span');
  risk.className = 'atlas-map-info__badge';
  risk.style.color = RISK_COLOR[point.priority];
  risk.style.borderColor = `${RISK_COLOR[point.priority]}66`;
  risk.textContent = `${RISK_LABEL[point.priority]} risk`;
  badges.appendChild(risk);

  root.appendChild(badges);

  const rows: [string, string][] = [
    ['Area', point.area],
    ['Operator', point.operator],
    ['Score', `${point.probability}%`],
    ['From last hop', point.distanceLabel],
  ];

  const list = document.createElement('dl');
  list.className = 'atlas-map-info__rows';
  for (const [term, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }
  root.appendChild(list);

  const note = document.createElement('p');
  note.className = 'atlas-map-info__note';
  note.textContent = 'Synthetic endpoint. Illustrative score — no calibrated model run.';
  root.appendChild(note);

  return root;
}

export default function CashOutMap({
  points,
  visibleIds,
  origin,
  ringRadiiKm,
  showPaths,
  selectedId,
  onSelect,
  className,
}: CashOutMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, google.maps.Marker>());
  const pathsRef = useRef(new Map<string, google.maps.Polyline>());
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const selectionRingRef = useRef<google.maps.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Click handlers are registered once per marker. Reading the callback through
  // a ref keeps it current without rebuilding markers every time the parent
  // re-renders with a new closure.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  /**
   * Set when a selection came from clicking the marker itself. A row click
   * should bring the map to the marker; a marker click should not yank the map
   * out from under the hand that just clicked it.
   *
   * Only ever set for a selection that actually changes, so it is always
   * consumed by the effect below rather than left standing for the next one.
   */
  const selectedFromMarkerRef = useRef(false);
  /** The selection the map opens with is state, not an action — do not chase it. */
  const initialSelectionAppliedRef = useRef(false);
  /** Read by the marker click handler, which is registered once and never re-created. */
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const openInfoWindow = useCallback((point: CashOutMapPoint) => {
    const map = mapRef.current;
    const info = infoRef.current;
    const marker = markersRef.current.get(point.id);
    if (map === null || info === null || marker === undefined) return;
    info.setContent(buildInfoContent(point));
    info.open({ map, anchor: marker });
  }, []);

  const frameSearchArea = useCallback(
    (map: google.maps.Map) => {
      const bounds = new google.maps.LatLngBounds(
        { lat: INDIA_BOUNDS.south, lng: INDIA_BOUNDS.west },
        { lat: INDIA_BOUNDS.north, lng: INDIA_BOUNDS.east },
      );
      bounds.extend({ lat: origin.latitude, lng: origin.longitude });
      for (const point of points) bounds.extend({ lat: point.latitude, lng: point.longitude });
      map.fitBounds(bounds, 24);
    },
    [origin.latitude, origin.longitude, points],
  );

  /* ---------------- map creation, once ---------------- */
  useEffect(() => {
    const container = containerRef.current;
    if (container === null || !HAS_GOOGLE_MAPS_KEY) return;

    let cancelled = false;
    let map: google.maps.Map | null = null;
    let rings: google.maps.Polyline[] = [];
    let originMarkers: google.maps.Marker[] = [];
    // Captured here rather than read in the cleanup: these two hold the map's
    // overlays, and the cleanup has to dispose of the ones this map created.
    const markers = markersRef.current;
    const paths = pathsRef.current;

    const unsubscribeAuthFailure = onGoogleMapsAuthFailure(() => {
      if (!cancelled) setFailure('Google rejected the configured API key');
    });

    void (async () => {
      try {
        const maps = await loadGoogleMaps();
        if (cancelled) return;

        map = new maps.Map(container, {
          center: { lat: 22.4, lng: 79.5 },
          zoom: 4.4,
          // Imagery plus labels: the satellite ground an operator recognises,
          // with the road and place names that make it navigable.
          mapTypeId: maps.MapTypeId.HYBRID,
          // Darkens the API's own chrome so the controls do not arrive as a
          // white cluster on a dark console.
          colorScheme: 'DARK',
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          // Flat, always. This is an operations map, not a terrain view — a
          // tilted map makes distances impossible to read off by eye.
          tilt: 0,
          rotateControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          scaleControl: true,
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: maps.MapTypeControlStyle.DROPDOWN_MENU,
            position: maps.ControlPosition.TOP_RIGHT,
            mapTypeIds: [maps.MapTypeId.HYBRID, maps.MapTypeId.SATELLITE, maps.MapTypeId.ROADMAP],
          },
          // Google's own points of interest are not this case's endpoints, and
          // a click that opens a restaurant card is a click that did not select
          // a candidate.
          clickableIcons: false,
        });
        mapRef.current = map;

        for (const radiusKm of ringRadiiKm) {
          rings.push(
            new maps.Polyline({
              map,
              path: geodesicCircle(origin, radiusKm).map(([lng, lat]) => ({ lat, lng })),
              strokeOpacity: 0,
              icons: dashPattern(0.5),
              clickable: false,
              zIndex: 1,
            }),
          );
        }

        const originPosition = { lat: origin.latitude, lng: origin.longitude };
        originMarkers.push(
          new maps.Marker({
            map,
            position: originPosition,
            clickable: false,
            zIndex: 2,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 13,
              fillColor: ACCENT,
              fillOpacity: 0.22,
              strokeWeight: 0,
            },
          }),
          new maps.Marker({
            map,
            position: originPosition,
            title: origin.label,
            clickable: false,
            zIndex: 3,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 5,
              fillColor: ACCENT,
              fillOpacity: 1,
              strokeColor: '#0A1420',
              strokeWeight: 1.6,
            },
          }),
        );

        selectionRingRef.current = new maps.Marker({
          map,
          position: originPosition,
          visible: false,
          clickable: false,
          zIndex: 4,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 13,
            fillOpacity: 0,
            strokeColor: SELECTION,
            strokeWeight: 1.6,
          },
        });

        infoRef.current = new maps.InfoWindow();

        frameSearchArea(map);
        setReady(true);
      } catch {
        if (!cancelled) setFailure('the Google Maps API could not be loaded');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeAuthFailure();

      infoRef.current?.close();
      infoRef.current = null;

      for (const marker of markers.values()) {
        google.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
      }
      markers.clear();

      for (const path of paths.values()) path.setMap(null);
      paths.clear();

      for (const ring of rings) ring.setMap(null);
      rings = [];
      for (const marker of originMarkers) marker.setMap(null);
      originMarkers = [];

      selectionRingRef.current?.setMap(null);
      selectionRingRef.current = null;

      if (map !== null) google.maps.event.clearInstanceListeners(map);
      mapRef.current = null;
      initialSelectionAppliedRef.current = false;
      setReady(false);
    };
    // The map is built once and its overlays are updated in place below. Only
    // the origin and the rings define the map itself, so only a genuine change
    // to either warrants a rebuild.
  }, [origin, ringRadiiKm, frameSearchArea]);

  /* ---------------- markers and connectors, one per point ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !ready) return;

    const markers = markersRef.current;
    const paths = pathsRef.current;
    const live = new Set(points.map((point) => point.id));

    for (const [id, marker] of markers) {
      if (live.has(id)) continue;
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
      markers.delete(id);
    }
    for (const [id, path] of paths) {
      if (live.has(id)) continue;
      path.setMap(null);
      paths.delete(id);
    }

    for (const point of points) {
      const position = { lat: point.latitude, lng: point.longitude };

      const existing = markers.get(point.id);
      if (existing === undefined) {
        const marker = new google.maps.Marker({
          map,
          position,
          title: point.label,
          icon: endpointIcon(point),
          zIndex: 10,
        });
        marker.addListener('click', () => {
          // Clicking the marker that is already current re-opens its popup and
          // changes nothing else. Routing it through `onSelect` would set a
          // state React then discards as unchanged, leaving the "came from a
          // marker" flag standing for whatever selection happened next.
          if (point.id === selectedIdRef.current) {
            openInfoWindow(point);
            return;
          }
          selectedFromMarkerRef.current = true;
          onSelectRef.current(point.id);
        });
        markers.set(point.id, marker);
      } else {
        existing.setPosition(position);
        existing.setIcon(endpointIcon(point));
      }

      if (!paths.has(point.id)) {
        paths.set(
          point.id,
          new google.maps.Polyline({
            map,
            path: [{ lat: origin.latitude, lng: origin.longitude }, position],
            geodesic: true,
            strokeOpacity: 0,
            icons: dashPattern(0.42),
            clickable: false,
            zIndex: 1,
          }),
        );
      }
    }
  }, [ready, points, origin.latitude, origin.longitude, openInfoWindow]);

  /* ---------------- filters ---------------- */
  useEffect(() => {
    if (!ready) return;
    for (const [id, marker] of markersRef.current) marker.setVisible(visibleIds.has(id));
    for (const [id, path] of pathsRef.current) path.setVisible(showPaths && visibleIds.has(id));
  }, [ready, visibleIds, showPaths]);

  /* ---------------- selection ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    const info = infoRef.current;
    const ring = selectionRingRef.current;
    if (map === null || info === null || ring === null || !ready) return;

    const fromMarker = selectedFromMarkerRef.current;
    selectedFromMarkerRef.current = false;
    const isInitial = !initialSelectionAppliedRef.current;
    initialSelectionAppliedRef.current = true;

    const selected = points.find((point) => point.id === selectedId);
    const marker = markersRef.current.get(selectedId);

    // A selection the filters have hidden keeps its row in the table but has
    // nothing to point at on the map.
    if (selected === undefined || marker === undefined || !visibleIds.has(selectedId)) {
      ring.setVisible(false);
      info.close();
      return;
    }

    const position = { lat: selected.latitude, lng: selected.longitude };
    ring.setPosition(position);
    ring.setVisible(true);

    // The map opens framed on the country with a row already current in the
    // table. Panning to it and opening a popup on load would undo that frame
    // before anyone has asked for anything.
    if (isInitial) return;

    openInfoWindow(selected);
    if (!fromMarker) map.panTo(position);
  }, [ready, selectedId, points, visibleIds, openInfoWindow]);

  /* ---------------- missing key ---------------- */
  if (!HAS_GOOGLE_MAPS_KEY) {
    return (
      <div
        className={`grid place-items-center bg-[#060D16] px-6 py-10 text-center ${className ?? ''}`}
      >
        <div className="max-w-sm">
          <p className="text-[13px] font-semibold text-ink-900">Google Maps unavailable</p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-500">
            Configure <code className="font-mono text-ink-700">{GOOGLE_MAPS_KEY_VARIABLE}</code> to
            load the live basemap. The ranked candidates, scores and distances on this page do not
            depend on it and are unaffected.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="h-full w-full bg-[#060D16]"
        role="img"
        aria-label={`Map of ${visibleIds.size} predicted cash-out locations around ${origin.label}. The ranked table beside the map lists the same locations.`}
      />

      {/* Zoom, pan and map type are Google's own controls. This is the one
          affordance the API does not provide and the screen needs: a way back
          to the opening frame after panning off it. */}
      <button
        type="button"
        onClick={() => {
          const map = mapRef.current;
          if (map !== null) frameSearchArea(map);
        }}
        disabled={!ready}
        aria-label="Reset the view to the whole search area"
        title="Reset view"
        className="absolute bottom-3 left-3 grid h-8 w-8 place-items-center rounded-md border border-line bg-[#0A1420]/90 text-ink-700 shadow-lg backdrop-blur transition-colors hover:text-ink-900 disabled:opacity-40"
      >
        <Crosshair className="h-4 w-4" aria-hidden />
      </button>

      {failure !== null && (
        <p className="absolute inset-x-0 bottom-0 bg-[#0A1420]/95 px-3 py-1.5 text-[11px] text-severity-high">
          Map unavailable — {failure}.
        </p>
      )}
    </div>
  );
}
