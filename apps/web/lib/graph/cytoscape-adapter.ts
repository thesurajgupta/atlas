/**
 * Render adapter: `MoneyTrailGraph` → Cytoscape elements, positions and style.
 *
 * Cytoscape is imported here **for its types only**, so this module never pulls
 * the renderer in and needs no DOM. That is deliberate: the rules worth testing
 * — which part of the trail is visible, where a node sits, what a node's state
 * is — are decided here and can be asserted in a plain Node process. Only
 * `MoneyTrailGraph.tsx` actually loads the library.
 *
 * Font Awesome *is* a runtime import, because node glyphs are rendered to SVG
 * markup at module load. It runs headlessly, so the tests are unaffected.
 *
 * Two things this module refuses to do:
 *
 * **It does not score anything.** No element carries a confidence, risk or
 * likelihood, and no visual channel encodes one. Colour is categorical — what
 * kind of thing this is — never severity, because there is no calibrated number
 * behind a severity and a red node reads as one whether or not it is.
 *
 * **It does not show what has not been asked for.** The visible subgraph is
 * reached from the origin through expanded nodes only. An investigator opening
 * one hop gets one hop, not the whole neighbourhood.
 */

import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { config } from '@fortawesome/fontawesome-svg-core';
import { faBuildingColumns, faStore, faUser } from '@fortawesome/free-solid-svg-icons';
import type { ElementDefinition, LayoutOptions, StylesheetJson } from 'cytoscape';

import { paymentMethodColor, paymentMethodOf } from './payment-method';
import type { EntityId, MoneyTrailEdge, MoneyTrailGraph, MoneyTrailNode } from './types';

/**
 * Horizontal distance between two hop depths, in model units.
 *
 * Wide enough that a two-line node caption and the edge label between two
 * columns do not collide — the layout is fixed, so the spacing has to carry the
 * legibility that a force simulation would otherwise negotiate.
 */
const DEPTH_COLUMN_GAP = 270;
/** Vertical distance between siblings at the same depth. */
const SIBLING_ROW_GAP = 126;

/**
 * The part of the graph an investigator has actually opened.
 *
 * The reducer returns everything it knows and marks each node expanded or
 * collapsed; the filtering happens here, at the view boundary, so that
 * expanding a node is a re-render rather than another reduction.
 */
export interface VisibleSubgraph {
  readonly nodes: readonly MoneyTrailNode[];
  readonly edges: readonly MoneyTrailEdge[];
  /** Outgoing hops that exist but are not drawn, per visible node id. */
  readonly hiddenHopCountById: ReadonlyMap<EntityId, number>;
}

/**
 * Walk out from the origin, following only edges whose source is expanded.
 *
 * A collapsed node is drawn but not traversed — the investigator can see that
 * the trail reaches it without the branch beyond it being dumped on the canvas.
 */
export function selectVisibleSubgraph(graph: MoneyTrailGraph): VisibleSubgraph {
  const outgoingBySource = new Map<EntityId, MoneyTrailEdge[]>();
  for (const edge of graph.edges) {
    const bucket = outgoingBySource.get(edge.source);
    if (bucket === undefined) outgoingBySource.set(edge.source, [edge]);
    else bucket.push(edge);
  }

  const expandedById = new Map(graph.nodes.map((node) => [node.id, node.expansion === 'EXPANDED']));

  const visibleNodeIds = new Set<EntityId>([graph.originEntityId]);
  const visibleEdgeIds = new Set<string>();

  // Breadth-first, index-based rather than `shift()`, so the frontier is walked
  // once and in a fixed order.
  const frontier: EntityId[] = [graph.originEntityId];
  for (let i = 0; i < frontier.length; i += 1) {
    // `noUncheckedIndexedAccess` types this as possibly undefined even though
    // the loop bound guarantees otherwise. Narrowing rather than asserting: the
    // guard costs nothing and survives someone later changing the bound.
    const id = frontier[i];
    if (id === undefined) continue;
    if (expandedById.get(id) !== true) continue;
    for (const edge of outgoingBySource.get(id) ?? []) {
      visibleEdgeIds.add(edge.id);
      if (!visibleNodeIds.has(edge.target)) {
        visibleNodeIds.add(edge.target);
        frontier.push(edge.target);
      }
    }
  }

  // Filter the reducer's already-sorted arrays rather than rebuilding them, so
  // the deterministic ordering established there survives.
  const nodes = graph.nodes.filter((node) => visibleNodeIds.has(node.id));
  const edges = graph.edges.filter((edge) => visibleEdgeIds.has(edge.id));

  const hiddenHopCountById = new Map<EntityId, number>();
  for (const node of nodes) {
    const total = outgoingBySource.get(node.id)?.length ?? 0;
    const shown = (outgoingBySource.get(node.id) ?? []).filter((e) =>
      visibleEdgeIds.has(e.id),
    ).length;
    hiddenHopCountById.set(node.id, total - shown);
  }

  return { nodes, edges, hiddenHopCountById };
}

/** Codepoint-order string compare, for a stable tie-break. */
function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Fixed positions: depth on the x axis, siblings stacked on y.
 *
 * A money trail is a directed, depth-ranked thing, so left-to-right by depth is
 * the layout that matches what it is. Positions are computed here rather than
 * left to a force-directed layout because `cose` and its relatives seed from a
 * random number generator: the same trail would settle differently on every
 * render, and an investigator comparing two screenshots of the same case would
 * be looking at two different pictures. `preset` with these positions is the
 * only layout that is deterministic by construction.
 *
 * Within a column, nodes are ordered by the mean y of the nodes that feed them
 * — the barycentre heuristic from layered graph drawing. Ordering by id instead
 * is equally deterministic and much worse to look at: it puts a node directly
 * above the parent of its neighbour, so the two branches swap sides between
 * columns and their edges cross in the gap. Sorting by where the money came
 * from keeps each branch on its own side of the spine, which removes the
 * crossings without any force simulation.
 *
 * `edges` is optional so the function stays callable with nodes alone; without
 * it the ordering falls back to id, which is stable but crossing-prone.
 */
export function computeNodePositions(
  nodes: readonly MoneyTrailNode[],
  edges: readonly MoneyTrailEdge[] = [],
): ReadonlyMap<EntityId, { x: number; y: number }> {
  const byDepth = new Map<number, MoneyTrailNode[]>();
  for (const node of nodes) {
    const bucket = byDepth.get(node.depth);
    if (bucket === undefined) byDepth.set(node.depth, [node]);
    else bucket.push(node);
  }

  const sourcesByTarget = new Map<EntityId, EntityId[]>();
  for (const edge of edges) {
    const bucket = sourcesByTarget.get(edge.target);
    if (bucket === undefined) sourcesByTarget.set(edge.target, [edge.source]);
    else bucket.push(edge.source);
  }

  const positions = new Map<EntityId, { x: number; y: number }>();
  // Shallowest column first, so every barycentre reads already-placed parents.
  for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
    const column = byDepth.get(depth) ?? [];

    const ranked = column.map((node) => {
      const parentYs = (sourcesByTarget.get(node.id) ?? [])
        .map((sourceId) => positions.get(sourceId)?.y)
        .filter((y): y is number => y !== undefined);
      return {
        node,
        // null means "nothing upstream is placed" — ordered last, by id.
        barycentre:
          parentYs.length === 0
            ? null
            : parentYs.reduce((total, y) => total + y, 0) / parentYs.length,
      };
    });

    ranked.sort((a, b) => {
      if (a.barycentre === null && b.barycentre === null) return compareIds(a.node.id, b.node.id);
      if (a.barycentre === null) return 1;
      if (b.barycentre === null) return -1;
      return a.barycentre - b.barycentre || compareIds(a.node.id, b.node.id);
    });

    // Centre each column on y = 0 so the trail reads as a spine.
    const offset = ((ranked.length - 1) * SIBLING_ROW_GAP) / 2;
    ranked.forEach((entry, index) => {
      positions.set(entry.node.id, {
        x: depth * DEPTH_COLUMN_GAP,
        y: index * SIBLING_ROW_GAP - offset,
      });
    });
  }
  return positions;
}


/**
 * Node glyphs, as Font Awesome icons converted to SVG data URIs.
 *
 * Cytoscape draws to a canvas, so a node cannot contain DOM — a React
 * `<FontAwesomeIcon>` has nothing to mount into. The glyph has to arrive as an
 * image, so each Font Awesome definition is wrapped in a standalone SVG
 * document and handed to Cytoscape as a `background-image`.
 *
 * The SVG is assembled from the definition's own path data rather than from
 * `icon()`'s markup. `icon()` emits an element meant for inline use: it has no
 * `xmlns`, which a `data:` URI needs to parse at all, and its viewBox is the
 * glyph's native non-square aspect, which is what has to change here. Patching
 * that markup by string replacement worked until the node styling needed an
 * exact pixel size, and then it did not; building the document is both shorter
 * and honest about what it produces.
 *
 * The canvas is the icon's own scale (448×512 and similar), which is far larger
 * than the 15-18px a node draws it at. Cytoscape rasterises an image at its
 * intrinsic size, so the oversized source is what keeps the glyph sharp when an
 * investigator zooms in. The path is re-centred on a square canvas so that an
 * exact pixel size can be asked for without distorting a non-square glyph.
 *
 * A note on the intermediary glyph: the columns mark reads as "financial
 * institution", which is more than the trail actually establishes — a hop only
 * says value moved between two entity ids. The *label* under the node stays
 * `INTERMEDIARY` for that reason, so the text remains accurate even where the
 * icon generalises.
 */

// Font Awesome injects a stylesheet into `document` on import unless told not
// to. This module is imported during the server render, where there is no
// document, and the CSS is irrelevant anyway because nothing here mounts.
config.autoAddCss = false;

/** Glyphs are white; the role colour is carried by the node behind them. */
const GLYPH_COLOR = '#ffffff';

/**
 * Node geometry, and the glyph size derived from it.
 *
 * The sizes below are computed rather than chosen, because "does the icon fit
 * inside the outline" is a geometry question and hand-picked numbers only
 * answer it by luck — change a node's diameter and a literal glyph size
 * silently starts overlapping the border.
 *
 * Two cases, and the circle is the one that catches people out. A square glyph
 * centred in a circle touches the stroke when its *diagonal* reaches the inner
 * diameter, so the widest it may be is `inner / √2`, not `inner`. A rounded
 * rectangle is bounded by its shorter inner side instead.
 *
 * `GLYPH_INSET` is clear space between border and glyph; `GLYPH_SCALE` then
 * backs off from the maximum so the icon looks placed rather than crammed.
 * Both are applied to every role, which is what keeps the three nodes looking
 * like one system. `cytoscape-adapter.test.ts` asserts the containment holds.
 */
const GLYPH_INSET = 4;
const GLYPH_SCALE = 0.8;

interface NodeGeometry {
  readonly width: number;
  readonly height: number;
  readonly border: number;
  readonly round: boolean;
}

export const NODE_GEOMETRY = {
  origin: { width: 52, height: 52, border: 2, round: true },
  intermediary: { width: 42, height: 42, border: 1.5, round: true },
  cashOut: { width: 58, height: 44, border: 2, round: false },
} as const satisfies Record<string, NodeGeometry>;

/** The largest square glyph that sits wholly inside a node, times the scale. */
export function containedGlyphSize(geometry: NodeGeometry): number {
  const innerWidth = geometry.width - 2 * geometry.border - 2 * GLYPH_INSET;
  const innerHeight = geometry.height - 2 * geometry.border - 2 * GLYPH_INSET;
  const shortestInnerSide = Math.min(innerWidth, innerHeight);
  const largestSquare = geometry.round ? shortestInnerSide / Math.SQRT2 : shortestInnerSide;
  return Math.round(largestSquare * GLYPH_SCALE * 10) / 10;
}

const ORIGIN_GLYPH_SIZE = containedGlyphSize(NODE_GEOMETRY.origin);
const INTERMEDIARY_GLYPH_SIZE = containedGlyphSize(NODE_GEOMETRY.intermediary);
const CASH_OUT_GLYPH_SIZE = containedGlyphSize(NODE_GEOMETRY.cashOut);

/**
 * The cash-out semantic colour.
 *
 * Red is used here, and only here, and the distinction it draws is worth being
 * exact about. It marks a **category the payload states outright** — the target
 * of a `WITHDREW_AT` hop, where value left the traceable system — not a score
 * attached to the account sitting there. No entity on this canvas is ranked,
 * and nothing red means "this one is worse than that one".
 *
 * It is deliberately not reachable by anything else. Payment rails keep their
 * own categorical palette in `payment-method.ts`, none of which is red, so an
 * ATM withdrawal is amber *as a channel* while its destination is red *as a
 * cash-out*. Those are two different facts about one hop and they are allowed
 * to disagree in colour.
 */
const CASH_OUT_SEMANTIC = '#dc2626';

function faDataUri(definition: IconDefinition): string {
  const [width, height, , , pathData] = definition.icon;
  const d = Array.isArray(pathData) ? pathData.join(' ') : pathData;

  // Font Awesome glyphs are not square — `faUser` is 448×512. The path is
  // centred on a square canvas so Cytoscape can draw it at an exact pixel size
  // without distorting it: `background-fit: none` honours background-width and
  // background-height literally, and a non-square source given equal values
  // would be squashed.
  const side = Math.max(width, height);
  const offsetX = (side - width) / 2;
  const offsetY = (side - height) / 2;

  // The fill is a literal colour rather than `currentColor`. A data URI is
  // rasterised as a standalone document with no inherited `color`, so
  // `currentColor` is not reliably resolvable there.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" ` +
    `viewBox="0 0 ${side} ${side}">` +
    `<path fill="${GLYPH_COLOR}" transform="translate(${offsetX} ${offsetY})" d="${d}"/>` +
    `</svg>`;

  // `encodeURIComponent` is what makes the `#` in a colour safe inside a URI.
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * The three style properties that keep a glyph inside its node.
 *
 * `background-fit: 'none'` is load-bearing. Cytoscape's `contain` means "fit
 * inside the node" and *ignores* background-width/height, so it scaled a
 * 448×512 glyph across the entire node box; combined with
 * `background-image-containment: 'over'`, which draws the image over the node
 * rather than within it, the result was a rectangle spilling out of a circular
 * node. `none` draws at the size asked for, `inside` clips to the node shape,
 * and `background-clip: 'node'` is the belt to that braces.
 *
 * Sizes stay in model units, so a glyph scales with its node under zoom and
 * `fit()` — and because every node declares an explicit width and height, the
 * image can never influence node size.
 */
const GLYPH_CONTAINMENT = {
  'background-fit': 'none',
  'background-image-containment': 'inside',
  'background-clip': 'node',
  'background-position-x': '50%',
  'background-position-y': '50%',
  'background-image-opacity': 1,
} as const;

/** The account the complaint was filed about. */
const ORIGIN_GLYPH = faDataUri(faUser);

/** An entity the money passed through. See the note above on what this claims. */
const INTERMEDIARY_GLYPH = faDataUri(faBuildingColumns);

/**
 * Where value left the traceable system: a shop front.
 *
 * Drawn from the Font Awesome definition like the other two roles, so all
 * three glyphs share one pipeline, one square canvas and one containment rule.
 * The cash-out semantic is carried by the red border, fill and outline around
 * it — the glyph itself stays white.
 */
const CASH_OUT_GLYPH = faDataUri(faStore);

/**
 * The second line of a node's caption.
 *
 * Deliberately a *role*, not a node kind. A trail cannot tell us what kind of
 * thing an intermediary is, so it says "INTERMEDIARY" — labelling it "ACCOUNT"
 * would put a fact on the canvas that the payload does not carry. A cash-out
 * names its channel because the withdrawal hop states it outright.
 */
function nodeTypeLabel(node: MoneyTrailNode, channel: string | undefined): string {
  // "Victim" holds because this screen only ever seeds a traversal from the
  // account a complaint names. If the console later lets an investigator trace
  // from an arbitrary entity, this has to fall back to "ORIGIN" alone.
  if (node.role === 'ORIGIN') return 'VICTIM · ORIGIN';
  if (node.role === 'CASH_OUT') return channel === undefined ? 'CASH-OUT' : `CASH-OUT · ${channel}`;
  return 'INTERMEDIARY';
}

/** Cytoscape classes are the styling channel; the data carries the facts. */
function nodeClasses(node: MoneyTrailNode): string {
  const classes = [`role-${node.role.toLowerCase().replace(/_/g, '-')}`];
  classes.push(`state-${node.expansion.toLowerCase().replace(/_/g, '-')}`);
  if (node.type !== null) classes.push(`kind-${node.type.toLowerCase().replace(/_/g, '-')}`);
  return classes.join(' ');
}

/**
 * Build the element list for the currently visible part of the trail.
 *
 * Every field on the element data comes from the payload unchanged. Nothing is
 * combined, weighted or normalised — a view that derived "0.82" from depth and
 * amount would be inventing the score the backend deliberately withholds.
 */
export function toCytoscapeElements(graph: MoneyTrailGraph): ElementDefinition[] {
  const { nodes, edges, hiddenHopCountById } = selectVisibleSubgraph(graph);
  const positions = computeNodePositions(nodes, edges);

  // Where a node's cash-out channel comes from: the withdrawal hop that reaches
  // it. Read off the edge rather than stored on the node, because that is the
  // only place the payload states it.
  const cashOutChannelById = new Map<EntityId, string>();
  for (const edge of graph.edges) {
    if (edge.edgeType === 'WITHDREW_AT' && edge.channel !== null) {
      cashOutChannelById.set(edge.target, edge.channel);
    }
  }

  const nodeElements: ElementDefinition[] = nodes.map((node) => {
    const typeLabel = nodeTypeLabel(node, cashOutChannelById.get(node.id));
    return {
    group: 'nodes',
    data: {
      id: node.id,
      label: node.label,
      typeLabel,
      // Two lines: the short synthetic id, then what the node is. Rendered as
      // one wrapped Cytoscape label because an element carries only one.
      caption: `${node.label}\n${typeLabel}`,
      role: node.role,
      expansion: node.expansion,
      depth: node.depth,
      // `null` would disappear from a Cytoscape selector; the string keeps the
      // "we do not know this node's kind" case addressable and visible.
      nodeType: node.type ?? 'UNKNOWN',
      channel: cashOutChannelById.get(node.id) ?? '',
      hiddenHops: hiddenHopCountById.get(node.id) ?? 0,
    },
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    classes: nodeClasses(node),
    selectable: true,
    grabbable: false,
    };
  });

  const edgeElements: ElementDefinition[] = edges.map((edge) => ({
    group: 'edges',
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      edgeType: edge.edgeType,
      amount: edge.amount,
      occurredAt: edge.occurredAt,
      channel: edge.channel ?? '',
      rail: edge.rail ?? '',
      depth: edge.depth,
      // Categorical colour for the rail or channel this hop moved over, carried
      // on the element so one style rule serves every method. Payment method,
      // never severity.
      paymentMethod: paymentMethodOf(edge) ?? '',
      paymentColor: paymentMethodColor(paymentMethodOf(edge)),
    },
    classes: `edge-${edge.edgeType.toLowerCase().replace(/_/g, '-')}`,
    selectable: false,
  }));

  return [...nodeElements, ...edgeElements];
}

/**
 * The dash a hop is drawn with, and the distance one full cycle covers.
 *
 * A short mark and a long gap, so what travels the edge reads as a discrete
 * pulse of value rather than as marching ants.  walks
 *  across  to move it; the two constants
 * live together because the animation is only seamless while they match.
 */
export const EDGE_DASH_PATTERN: number[] = [5, 13];
export const EDGE_DASH_CYCLE = 18;

/** Deterministic by construction — see `computeNodePositions`. */
export const MONEY_TRAIL_LAYOUT: LayoutOptions = {
  name: 'preset',
  fit: true,
  padding: 56,
  animate: false,
};

/**
 * Console styling for a dark investigation workspace.
 *
 * Three rules govern the palette.
 *
 * **Colour is categorical, never severity.** Amber marks a cash-out — the point
 * where value left the traceable system, which the payload states outright. It
 * is not a rating of the account. Nothing is red, because red reads as a
 * severity and this view has no calibrated number behind one.
 *
 * **Every distinction is carried twice.** Shape and border style repeat what
 * hue says, so the graph survives greyscale printing and low colour
 * perception: the origin is a diamond, a cash-out is a rounded rectangle, an
 * intermediary is a small ellipse, and a truncated frontier is dashed.
 *
 * **Labels sit on an outline, not a box.** Text is drawn with a dark outline
 * matching the canvas rather than an opaque plate behind it, so edge captions
 * stay readable without the white rectangles that used to dominate the graph.
 */
export const MONEY_TRAIL_STYLESHEET: StylesheetJson = [
  {
    // An intermediary account: small, quiet, and deliberately not the same
    // weight as the endpoints that an investigator is actually looking for.
    selector: 'node',
    style: {
      shape: 'ellipse',
      // Large enough to carry a glyph legibly, small enough that a wide trail
      // still fits the workspace without the columns colliding.
      width: NODE_GEOMETRY.intermediary.width,
      height: NODE_GEOMETRY.intermediary.height,
      'background-color': '#1e2a3d',
      'border-color': '#64748b',
      'border-width': 1.5,
      'background-image': INTERMEDIARY_GLYPH,
      'background-width': INTERMEDIARY_GLYPH_SIZE,
      'background-height': INTERMEDIARY_GLYPH_SIZE,
      ...GLYPH_CONTAINMENT,
      label: 'data(caption)',
      'text-wrap': 'wrap',
      'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-size': 11.5,
      'line-height': 1.45,
      color: '#e2e8f0',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 8,
      // The canvas colour, so the caption reads over an edge that passes behind it.
      'text-outline-color': '#020617',
      'text-outline-width': 3,
      'text-outline-opacity': 1,
    },
  },
  {
    // The account named by the complaint: a cyan disc carrying a person glyph.
    // The ring is an `outline`, not a second border, so it sits outside the
    // node edge and reads as emphasis rather than as a thicker stroke.
    selector: 'node.role-origin',
    style: {
      shape: 'ellipse',
      width: NODE_GEOMETRY.origin.width,
      height: NODE_GEOMETRY.origin.height,
      'background-color': '#0c4a6e',
      'border-color': '#7dd3fc',
      'border-width': 2,
      'outline-color': '#38bdf8',
      'outline-width': 2.5,
      'outline-offset': 2,
      'outline-opacity': 0.14,
      'background-image': ORIGIN_GLYPH,
      'background-width': ORIGIN_GLYPH_SIZE,
      'background-height': ORIGIN_GLYPH_SIZE,
      ...GLYPH_CONTAINMENT,
      color: '#f1f5f9',
      'font-size': 12.5,
    },
  },
  {
    // Value left the traceable system here: an amber slab carrying a banknote.
    // The glyph is what makes this legible without colour — a greyscale print
    // still shows cash leaving, which a hue alone would not survive.
    selector: 'node.role-cash-out',
    style: {
      shape: 'round-rectangle',
      width: NODE_GEOMETRY.cashOut.width,
      height: NODE_GEOMETRY.cashOut.height,
      'background-color': '#450a0a',
      'border-color': CASH_OUT_SEMANTIC,
      'border-width': 2,
      'outline-color': CASH_OUT_SEMANTIC,
      'outline-width': 2.5,
      'outline-offset': 2,
      'outline-opacity': 0.16,
      'background-image': CASH_OUT_GLYPH,
      'background-width': CASH_OUT_GLYPH_SIZE,
      'background-height': CASH_OUT_GLYPH_SIZE,
      ...GLYPH_CONTAINMENT,
      color: '#fecaca',
    },
  },
  {
    // Onward hops are known and not drawn yet — the affordance to expand.
    selector: 'node.state-collapsed',
    style: {
      'border-width': 3,
      'border-color': '#94a3b8',
      'border-style': 'double',
    },
  },
  {
    // The traversal hit its depth ceiling. Whether the money went further is
    // unknown, which is not the same as knowing it stopped — hence a dashed
    // outline and a muted fill rather than a solid endpoint.
    selector: 'node.state-search-truncated',
    style: {
      shape: 'ellipse',
      width: 40,
      height: 40,
      'border-style': 'dashed',
      'border-width': 2.5,
      'border-color': '#cbd5e1',
      'background-color': '#0f172a',
      'background-opacity': 0.55,
      color: '#e2e8f0',
    },
  },
  {
    selector: 'node.is-selected',
    style: {
      'border-color': '#38bdf8',
      'border-width': 4,
      'border-style': 'solid',
      color: '#f8fafc',
      'overlay-color': '#38bdf8',
      'overlay-opacity': 0.12,
      'overlay-padding': 8,
    },
  },
  {
    // Declared *after* the generic selected rule, because Cytoscape applies
    // equally specific rules in order and the last one wins. A selected
    // cash-out keeps its semantic: selection is a second signal, not a
    // replacement for what the node is.
    selector: 'node.role-cash-out.is-selected',
    style: {
      'border-color': '#fca5a5',
      'border-width': 4,
      'overlay-color': CASH_OUT_SEMANTIC,
      'overlay-opacity': 0.2,
      'overlay-padding': 8,
      color: '#fee2e2',
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      // Fans hops that share a pair of endpoints apart instead of stacking them
      // on one line, so a converging bundle reads as separate movements.
      'control-point-step-size': 52,
      width: 1.4,
      // Dashed so the flow marker has something to travel along; the dash keeps
      // the rail's own colour, so payment identity survives the animation.
      'line-style': 'dashed',
      'line-dash-pattern': EDGE_DASH_PATTERN,
      'line-color': 'data(paymentColor)',
      'target-arrow-color': 'data(paymentColor)',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      // Keeps the arrowhead off the node border, so a converging arrow does not
      // sit on top of the caption of the node it points at.
      'target-distance-from-node': 4,
      'source-distance-from-node': 2,
      label: 'data(label)',
      'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-size': 9.5,
      color: 'data(paymentColor)',
      // Horizontal rather than following the line: a steeply angled hop would
      // otherwise print its amount on a slant that is hard to read quickly.
      'text-rotation': 'none',
      'text-margin-y': -9,
      // No plate behind the text: an outline in the canvas colour keeps the
      // caption legible while leaving the graph visible through it.
      'text-outline-color': '#020617',
      'text-outline-width': 2.5,
      'text-outline-opacity': 1,
    },
  },
  {
    // A withdrawal is drawn heavier than a transfer; its colour still comes from
    // the channel, so ATM and AEPS_BC stay distinguishable from each other.
    selector: 'edge.edge-withdrew-at',
    style: { width: 2.4 },
  },
  {
    // A search hit. Ringed rather than recoloured, so the role palette survives.
    selector: 'node.is-search-match',
    style: {
      'outline-color': '#f0abfc',
      'outline-width': 4,
      'outline-offset': 2,
      'outline-opacity': 0.55,
    },
  },
];
