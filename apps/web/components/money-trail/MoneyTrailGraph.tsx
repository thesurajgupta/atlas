'use client';

/**
 * The Money Trail screen of the ATLAS console.
 *
 * A Client Component because Cytoscape measures and draws into a real DOM
 * element. The library is loaded with a dynamic `import()` inside the effect
 * rather than at module scope, so it is never evaluated during the server pass
 * that produces the initial HTML.
 *
 * This file owns the state — which nodes are open, which is selected — and
 * hands everything else to presentational components in this folder. The graph
 * pipeline underneath is unchanged: `reduceTrailPaths` decides what the trail
 * *is*, `toCytoscapeElements` decides what is drawn, and expanding a node is a
 * re-render rather than another reduction.
 *
 * Nothing on this screen is a confidence, probability or rating, and no visual
 * channel stands in for one. Every number shown is a count the graph supports
 * or an amount the payload already carries.
 */

import type { Core } from 'cytoscape';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  EDGE_DASH_CYCLE,
  MONEY_TRAIL_LAYOUT,
  MONEY_TRAIL_STYLESHEET,
  selectVisibleSubgraph,
  toCytoscapeElements,
} from '@/lib/graph/cytoscape-adapter';
import type { EntityLocationIndex } from '@/lib/graph/entity-location';
import { PAYMENT_METHOD_COLOR, PAYMENT_METHOD_ORDER } from '@/lib/graph/payment-method';
import { reduceTrailPaths } from '@/lib/graph/reducer';
import { bestMatch, searchTrail } from '@/lib/graph/search';
import type { SyntheticCaseContext } from '@/lib/graph/synthetic-case';
import type { CashOutChannel, EntityId, IsoDateTime, TrailPath } from '@/lib/graph/types';

import CaseContext from './CaseContext';
import ConsoleHeader from './ConsoleHeader';
import EntityList from './EntityList';
import EntityPanel from './EntityPanel';
import EvidenceTable from './EvidenceTable';
import NavigationRail from './NavigationRail';
import { isoClock, isoDay, shortId } from './format';

export interface MoneyTrailGraphProps {
  /** The entity the complaint names — where the traversal started. */
  readonly originEntityId: EntityId;
  /** The point-in-time bound the trail was reconstructed under. */
  readonly asOf: IsoDateTime;
  /** The traversal depth ceiling the backend was given. */
  readonly maxDepth: number;
  readonly paths: readonly TrailPath[];
  /** Optional geographic annotations, joined to nodes by entity id. Sparse:
   *  a trail carries no coordinates, so most entities have no entry. */
  readonly entityLocations?: EntityLocationIndex;
  /** Complaint-level context. Synthetic fixture data, never derived from the
   *  trail — a reconstruction carries no case id, typology or reported amount. */
  readonly caseContext: SyntheticCaseContext;
}

/** One cell of the context strip. Label above, value below, tabular figures. */
function ContextField({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone?: 'amber' | 'mono';
  title?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" title={title}>
      <span className="text-micro font-medium uppercase tracking-[0.12em] whitespace-nowrap text-slate-500">
        {label}
      </span>
      <span
        className={`truncate text-ui-primary leading-none tabular-nums ${
          tone === 'amber'
            ? 'font-semibold text-amber-300'
            : tone === 'mono'
              ? 'font-mono text-slate-200'
              : 'font-semibold text-slate-100'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Tight cluster of related context fields. */
function ContextGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-x-4">{children}</div>;
}

/** Hairline between context groups. */
function Divider() {
  return <span aria-hidden className="hidden h-6 w-px bg-slate-800 sm:block" />;
}

/**
 * A faint square grid behind the canvas.
 *
 * Drawn in CSS on the container rather than by Cytoscape: the canvas is
 * transparent, so the grid shows through without becoming graph elements that
 * the layout or a selector would have to account for.
 */
const GRID_BACKGROUND = {
  backgroundColor: '#020617',
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.055) 1px, transparent 1px),' +
    'linear-gradient(90deg, rgba(148,163,184,0.055) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
} as const;

export default function MoneyTrailGraph({
  originEntityId,
  asOf,
  maxDepth,
  paths,
  entityLocations,
  caseContext,
}: MoneyTrailGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [cyReady, setCyReady] = useState(false);
  const [expandedNodeIds, setExpandedNodeIds] = useState<ReadonlySet<EntityId>>(
    () => new Set([originEntityId]),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<EntityId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // A different origin is a different investigation; no expansion or selection
  // from the previous one is meaningful against it. Adjusted during render
  // rather than in an effect: an effect would paint the new trail once with the
  // old expansion set before correcting itself, and React discards this render
  // instead (https://react.dev/reference/react/useState — adjusting state when
  // a prop changes).
  const [renderedOrigin, setRenderedOrigin] = useState(originEntityId);
  if (renderedOrigin !== originEntityId) {
    setRenderedOrigin(originEntityId);
    setExpandedNodeIds(new Set([originEntityId]));
    setSelectedNodeId(null);
  }

  const graph = useMemo(
    () => reduceTrailPaths({ originEntityId, asOf, maxDepth, paths, expandedNodeIds }),
    [originEntityId, asOf, maxDepth, paths, expandedNodeIds],
  );
  const visible = useMemo(() => selectVisibleSubgraph(graph), [graph]);
  const elements = useMemo(() => toCytoscapeElements(graph), [graph]);

  // Facts about what is currently drawn. Counts and maxima only — nothing here
  // is weighted, combined or turned into a rating.
  const summary = useMemo(() => {
    const depths = visible.edges.map((edge) => edge.depth);
    return {
      nodeCount: visible.nodes.length,
      edgeCount: visible.edges.length,
      // The deepest hop currently drawn, which is not the ceiling — that is
      // `maxDepth`, reported separately. Two numbers that both read as "depth".
      hopDepth: depths.length === 0 ? 0 : Math.max(...depths),
      cashOutCount: visible.nodes.filter((node) => node.role === 'CASH_OUT').length,
      truncatedCount: visible.nodes.filter((node) => node.expansion === 'SEARCH_TRUNCATED').length,
    };
  }, [visible]);

  // Cash-out channel per entity, read off the withdrawal hop that reaches it —
  // the only place the payload states it. Computed once so the entity list and
  // the detail panel cannot disagree about a node's channel.
  const cashOutChannelById = useMemo(() => {
    const byId = new Map<EntityId, CashOutChannel>();
    for (const edge of visible.edges) {
      if (edge.edgeType === 'WITHDREW_AT' && edge.channel !== null) {
        byId.set(edge.target, edge.channel);
      }
    }
    return byId;
  }, [visible.edges]);

  // Local search over what this screen already holds. No request is made: there
  // is no search endpoint, and this is not querying NCRP or CFCFRMS.
  const searchResult = useMemo(
    () =>
      searchTrail(searchQuery, {
        nodes: visible.nodes,
        channelById: cashOutChannelById,
        edges: visible.edges,
        caseFields: [caseContext.caseId, caseContext.typology, caseContext.status],
      }),
    [searchQuery, visible.nodes, visible.edges, cashOutChannelById, caseContext],
  );
  const searchSummary =
    searchQuery.trim() === '' || searchResult.isEmpty
      ? null
      : [
          searchResult.entityIds.length > 0
            ? `${searchResult.entityIds.length} entit${searchResult.entityIds.length === 1 ? 'y' : 'ies'}`
            : null,
          searchResult.hopIds.size > 0
            ? `${searchResult.hopIds.size} hop${searchResult.hopIds.size === 1 ? '' : 's'}`
            : null,
          searchResult.matchesCase ? 'the case' : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' · ');

  const submitSearch = useCallback(() => {
    const match = bestMatch(searchResult, visible.edges);
    if (match !== null) setSelectedNodeId(match);
  }, [searchResult, visible.edges]);
  const clearSearch = useCallback(() => setSearchQuery(''), []);

  // Ordered by when the money moved. Parsed rather than string-compared,
  // because two ISO instants at different offsets sort differently as text.
  const hopsInTime = useMemo(
    () => [...visible.edges].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)),
    [visible.edges],
  );

  // Create the instance once. The async import means the effect can be torn
  // down before the module resolves, so the cleanup has to be able to cancel a
  // creation that has not happened yet as well as destroy one that has.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let cancelled = false;
    let instance: Core | null = null;
    let observer: ResizeObserver | null = null;

    void (async () => {
      const { default: cytoscape } = await import('cytoscape');
      if (cancelled) return;

      instance = cytoscape({
        container,
        elements: [],
        style: MONEY_TRAIL_STYLESHEET,
        layout: MONEY_TRAIL_LAYOUT,
        autounselectify: true,
        boxSelectionEnabled: false,
        minZoom: 0.25,
        maxZoom: 2.5,
        wheelSensitivity: 0.2,
      });

      instance.on('tap', 'node', (event) => {
        setSelectedNodeId(String(event.target.id()));
      });
      instance.on('tap', (event) => {
        // A tap that lands on the background, not on an element, deselects.
        if (event.target === instance) setSelectedNodeId(null);
      });

      // Keep the trail framed when the workspace changes size — the panel
      // collapsing on a narrow window is exactly when the graph would otherwise
      // end up half off-screen.
      const cy = instance;
      observer = new ResizeObserver(() => {
        cy.resize();
        cy.fit(undefined, 48);
      });
      observer.observe(container);

      cyRef.current = instance;
      setCyReady(true);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.destroy();
      cyRef.current = null;
      setCyReady(false);
    };
  }, []);

  // Replace the drawn elements whenever the visible subgraph changes. Positions
  // are preset, so the layout run is a placement pass, not a simulation.
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null || !cyReady) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    cy.layout(MONEY_TRAIL_LAYOUT).run();
  }, [elements, cyReady]);

  // Selection is React state; Cytoscape only reflects it. Re-applied when the
  // elements change too, because the class is lost with the removed element.
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null || !cyReady) return;
    cy.nodes().removeClass('is-selected');
    if (selectedNodeId !== null) cy.getElementById(selectedNodeId).addClass('is-selected');
  }, [selectedNodeId, elements, cyReady]);

  // Directional flow along each hop.
  //
  // Cytoscape draws to a canvas, so CSS cannot reach an edge — the dash offset
  // has to be stepped in a frame loop instead. Walking it *negative* slides the
  // pattern from source towards target, which is what makes the motion read as
  // direction rather than as a symmetric shimmer. (If it ever reads backwards,
  // flipping `FLOW_DIRECTION` is the whole fix.)
  //
  // Edges are updated in three phase buckets rather than one at a time: the
  // stagger stops the whole graph pulsing in unison, and it caps the work at
  // three style writes per frame however many hops are drawn.
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null || !cyReady) return;

    const FLOW_DIRECTION = -1;
    const CYCLE_MS = 2000;
    const BUCKETS = 3;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let frame = 0;
    const stop = () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
    };

    const start = () => {
      const startedAt = performance.now();
      const step = (now: number) => {
        const phase = ((now - startedAt) % CYCLE_MS) / CYCLE_MS;
        cy.batch(() => {
          for (let bucket = 0; bucket < BUCKETS; bucket += 1) {
            const offset =
              FLOW_DIRECTION * ((phase + bucket / BUCKETS) % 1) * EDGE_DASH_CYCLE;
            cy.edges()
              .filter((_edge, index) => index % BUCKETS === bucket)
              .style('line-dash-offset', offset);
          }
        });
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const apply = () => {
      stop();
      if (reduceMotion.matches) {
        // Not a paused animation: a solid line, so the resting state looks
        // finished rather than broken.
        cy.batch(() => {
          cy.edges().style({ 'line-style': 'solid', 'line-dash-offset': 0 });
        });
        return;
      }
      cy.batch(() => {
        cy.edges().style('line-style', 'dashed');
      });
      start();
    };

    apply();
    reduceMotion.addEventListener('change', apply);
    return () => {
      stop();
      reduceMotion.removeEventListener('change', apply);
    };
  }, [elements, cyReady]);

  // Search hits are a second, independent highlight: a node can be both the
  // selection and a match, and the two rings read differently on purpose.
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null || !cyReady) return;
    cy.nodes().removeClass('is-search-match');
    for (const id of searchResult.entityIds) cy.getElementById(id).addClass('is-search-match');
  }, [searchResult, elements, cyReady]);

  // Viewport controls. Zoom is anchored on the centre of the canvas rather than
  // the pointer, so repeated presses stay on the part of the trail in view.
  const zoomBy = useCallback((factor: number) => {
    const cy = cyRef.current;
    if (cy === null) return;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  }, []);
  const fitView = useCallback(() => cyRef.current?.fit(undefined, 48), []);

  const toggleExpansion = useCallback((id: EntityId) => {
    setExpandedNodeIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedNodeId(null), []);

  const selectedNode = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );
  const hiddenHops =
    selectedNode === null ? 0 : (visible.hiddenHopCountById.get(selectedNode.id) ?? 0);

  // Location is joined to the selected node by id, here at the view boundary —
  // it never enters the reduction and never rides on a hop. The frame spans
  // every known location so two endpoints sit at different points in it.
  const selectedLocation =
    selectedNode === null ? null : (entityLocations?.get(selectedNode.id) ?? null);
  const incomingEdges = useMemo(
    () =>
      selectedNode === null ? [] : visible.edges.filter((edge) => edge.target === selectedNode.id),
    [visible.edges, selectedNode],
  );
  const outgoingEdges = useMemo(
    () =>
      selectedNode === null ? [] : visible.edges.filter((edge) => edge.source === selectedNode.id),
    [visible.edges, selectedNode],
  );

  return (
    // `overflow-hidden` at the root is what guarantees the console never gains
    // a page-level scrollbar; every inner region that can overflow owns it.
    <div className="flex h-dvh w-full overflow-hidden bg-slate-950 text-slate-200">
      <NavigationRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={submitSearch}
          onSearchClear={clearSearch}
          resultSummary={searchSummary}
          noMatches={searchResult.isEmpty}
        />

        <CaseContext caseContext={caseContext} visibleHops={visible.edges} />

        {/* Trail context. Grouped: what was queried · what is drawn · where the
            money left · what the search bounds were. Only facts the graph supports. */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-900/30 px-3 py-1.5">
          <ContextGroup>
            <ContextField
              label="Origin"
              value={shortId(originEntityId)}
              tone="mono"
              title={originEntityId}
            />
          </ContextGroup>
          <Divider />
          <ContextGroup>
            <ContextField label="Entities shown" value={String(summary.nodeCount)} />
            <ContextField label="Hops shown" value={String(summary.edgeCount)} />
            <ContextField label="Deepest hop shown" value={String(summary.hopDepth)} />
          </ContextGroup>
          <Divider />
          <ContextGroup>
            <ContextField
              label={summary.cashOutCount === 1 ? 'Cash-out' : 'Cash-outs'}
              value={String(summary.cashOutCount)}
              tone="amber"
            />
            <ContextField
              label="Truncated branches"
              value={String(summary.truncatedCount)}
              title={
                graph.truncated
                  ? 'A branch reached the depth ceiling while the money was still moving. The search stopped there; the money may not have.'
                  : 'No branch was cut short by the depth ceiling.'
              }
            />
          </ContextGroup>
          <Divider />
          <ContextGroup>
            <ContextField label="Max depth" value={String(maxDepth)} />
            <ContextField label="As of" value={`${isoDay(asOf)} ${isoClock(asOf)}`} tone="mono" />
          </ContextGroup>
          <span className="ml-auto text-ui-secondary whitespace-nowrap text-slate-500">
            {summary.nodeCount} of {graph.nodes.length} known entities drawn
          </span>
        </div>

        {/* Workspace: canvas plus entity panel, then the evidence strip. */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              ref={containerRef}
              style={GRID_BACKGROUND}
              className="min-h-[240px] flex-1"
              role="img"
              aria-label={`Money trail from entity ${shortId(originEntityId)}: ${summary.nodeCount} entities and ${summary.edgeCount} hops currently shown`}
            />

            {/* Viewport controls. They move the camera only — they never change
                what is drawn, which stays the investigator's explicit choice. */}
            <div className="absolute top-2 right-2 flex flex-col overflow-hidden rounded-sm border border-slate-700 bg-slate-900/90 shadow-lg">
              <button
                type="button"
                onClick={() => zoomBy(1.25)}
                aria-label="Zoom in"
                title="Zoom in"
                className="flex h-7 w-7 items-center justify-center border-b border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-sky-300"
              >
                <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
                  <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => zoomBy(0.8)}
                aria-label="Zoom out"
                title="Zoom out"
                className="flex h-7 w-7 items-center justify-center border-b border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-sky-300"
              >
                <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
                  <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={fitView}
                aria-label="Fit trail to view"
                title="Fit / reset view"
                className="flex h-7 w-7 items-center justify-center text-slate-300 hover:bg-slate-800 hover:text-sky-300"
              >
                <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
                  <path
                    d="M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* Legend floats over the canvas so it costs no vertical space. */}
            <ul className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-800/80 bg-slate-950/85 px-2 py-1.5 text-micro text-slate-400">
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full border border-sky-300 bg-sky-900 ring-1 ring-sky-400/30"
                />
                Victim / origin
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full border border-slate-500 bg-slate-800"
                />
                Intermediary
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-4 rounded-[2px] border border-red-600 bg-red-950"
                />
                Cash-out
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-slate-300"
                />
                Search truncated
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full border-2 border-double border-slate-300"
                />
                Collapsed
              </li>

              {/* Payment method, on its own row. Categorical — which rail the
                  money moved over, never how dangerous the hop is. */}
              <li className="flex w-full items-center gap-3 border-t border-slate-800/80 pt-1">
                <span className="text-micro font-semibold tracking-[0.14em] text-slate-500 uppercase">
                  Payment
                </span>
                <span className="flex flex-wrap gap-x-2.5 gap-y-1">
                  {PAYMENT_METHOD_ORDER.map((method) => (
                    <span key={method} className="flex items-center gap-1">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: PAYMENT_METHOD_COLOR[method] }}
                      />
                      {method}
                    </span>
                  ))}
                </span>
              </li>
            </ul>
          </main>

          <EntityPanel
            node={selectedNode}
            incomingEdges={incomingEdges}
            outgoingEdges={outgoingEdges}
            hiddenHops={hiddenHops}
            location={selectedLocation}
            onToggleExpansion={toggleExpansion}
            onClose={clearSelection}
          />
        </div>

        {/* Bottom: evidence and the entity list, side by side. Both own their
            own overflow, so neither can lengthen the console. */}
        <div className="flex h-[196px] shrink-0 flex-col border-t border-slate-800 lg:flex-row">
          <EvidenceTable
            hops={hopsInTime}
            selectedNodeId={selectedNodeId}
            matchedHopIds={searchResult.hopIds}
          />
          <EntityList
            nodes={visible.nodes}
            channelById={cashOutChannelById}
            selectedNodeId={selectedNodeId}
            matchedEntityIds={searchResult.entityIds}
            onSelect={setSelectedNodeId}
          />
        </div>
      </div>
    </div>
  );
}
