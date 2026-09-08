/**
 * Reduce reconstructed trail paths into one renderable graph.
 *
 * `reconstruct_trail` returns *paths*, and paths overlap: several trails
 * routinely share a leading account, so the same hop arrives many times. A view
 * that drew them as given would show one transfer four times and imply a
 * fan-out that does not exist. This module collapses them into a set of nodes
 * and a set of edges, keyed by their backend identifiers.
 *
 * Pure by construction — no I/O, no clock, no Cytoscape. Every output is a
 * function of the arguments alone, which is what makes the truncation and
 * de-duplication rules testable without a database or a canvas.
 *
 * Nothing here computes a confidence, probability, risk or likelihood, and
 * nothing derives a proxy for one. Depth and amount are carried through
 * unchanged because they are facts; combining them into a single number would
 * be the uncalibrated score that `TrailPath` deliberately omits.
 */

import type {
  EdgeId,
  EntityId,
  GraphNodeType,
  IsoDateTime,
  MoneyTrailEdge,
  MoneyTrailGraph,
  MoneyTrailNode,
  TrailHop,
  TrailPath,
} from './types';

/**
 * Everything the reducer cannot derive from the paths themselves.
 *
 * `asOf` and `maxDepth` are parameters of the *query*, not properties of the
 * result: a complete trail and one cut off at depth 6 are the same shape, and
 * an empty result carries no origin at all. Requiring them from the caller is
 * what lets the graph state what it was asked, rather than guessing from what
 * came back.
 */
export interface ReduceTrailPathsInput {
  /** The entity the traversal started from — `TrailQuery.origin_entity_id`. */
  readonly originEntityId: EntityId;
  /** The point-in-time bound the traversal ran under — `TrailQuery.as_of`. */
  readonly asOf: IsoDateTime;
  /** The traversal depth ceiling — `TrailQuery.max_depth`. */
  readonly maxDepth: number;
  readonly paths: readonly TrailPath[];
  /**
   * Nodes the investigator has opened, for progressive disclosure.
   *
   * Passed in rather than held here because expansion is view state and this is
   * a pure reduction: the same paths and a different open set are a different
   * render of the same facts. The reducer reports expansion state on each node
   * and does not filter — hiding unexpanded branches is the view's job, and
   * keeping the whole graph available means expanding a node never needs
   * another reduction.
   */
  readonly expandedNodeIds?: ReadonlySet<EntityId>;
}

/** Codepoint-order string compare. Deterministic, unlike `localeCompare`. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * A short, stable handle for an entity: the first eight hex digits of its UUID.
 *
 * Derived from the id and nothing else. The alternative — synthesising
 * something bank-like such as "HDFC ••4821" — would put an invented identity in
 * front of an investigator, and a plausible fake identifier is worse than an
 * opaque real one because it invites belief. All ids here are synthetic
 * (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md); this keeps them legible without
 * dressing them up as something they are not.
 */
export function shortEntityLabel(id: EntityId): string {
  const hex = id.replace(/-/g, '');
  return hex.slice(0, 8).toUpperCase();
}

/**
 * An edge caption: the amount, and how the money moved.
 *
 * The qualifier is the channel for a withdrawal and the rail for a transfer,
 * because that is where each carries its meaning — `channel` is only ever set
 * on a `WITHDREW_AT` hop, and a transfer's interesting fact is the rail it rode.
 *
 * The amount is emitted as the raw decimal string with no currency symbol and
 * no grouping. `TrailHop` carries no currency (the column exists on
 * `graph.transaction_edge` but is not projected into a hop), so stamping a ₹
 * here would assert something the payload does not say; and locale formatting
 * needs a `Number`, which is exactly the conversion `DecimalString` exists to
 * prevent. Presentation belongs to the view, which knows both.
 */
export function edgeCaption(hop: TrailHop): string {
  const qualifier = hop.edge_type === 'WITHDREW_AT' ? hop.channel : hop.rail;
  return qualifier === null ? hop.amount : `${hop.amount} · ${qualifier}`;
}

function toEdge(hop: TrailHop): MoneyTrailEdge {
  return {
    id: hop.edge_id,
    source: hop.from_entity_id,
    target: hop.to_entity_id,
    edgeType: hop.edge_type,
    amount: hop.amount,
    occurredAt: hop.occurred_at,
    channel: hop.channel,
    rail: hop.rail,
    depth: hop.depth,
    label: edgeCaption(hop),
  };
}

/**
 * Collapse `TrailPath[]` into the graph a view can render.
 *
 * Throws on a caller error — a non-positive `maxDepth`, or a path that does not
 * start at `originEntityId`. Both mean the arguments disagree about what was
 * queried, and the honest failure is loud: silently reducing a path from a
 * different origin would produce a disconnected component that looks like a
 * finding.
 */
export function reduceTrailPaths(input: ReduceTrailPathsInput): MoneyTrailGraph {
  const { originEntityId, asOf, maxDepth, paths } = input;
  const expanded = input.expandedNodeIds ?? new Set<EntityId>();

  // Mirrors the backend's own guard in `reconstruct_trail`.
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError(`maxDepth must be an integer of at least 1, received ${maxDepth}`);
  }

  /** Shallowest depth at which each entity was seen. */
  const depthById = new Map<EntityId, number>();
  /** Entities with at least one outgoing hop anywhere in the input. */
  const hasOutgoing = new Set<EntityId>();
  /** Entities reached by a `WITHDREW_AT` hop — value left the system there. */
  const cashOutIds = new Set<EntityId>();
  /** Terminal entities of paths the depth ceiling cut short. */
  const truncatedFrontier = new Set<EntityId>();
  const edgeById = new Map<EdgeId, MoneyTrailEdge>();

  // Shallowest wins. The same account can be reached by a three-hop route and a
  // five-hop one; the shorter is the one an investigator can act on soonest, so
  // it is the depth worth showing.
  const observeDepth = (id: EntityId, depth: number): void => {
    const seen = depthById.get(id);
    if (seen === undefined || depth < seen) depthById.set(id, depth);
  };

  // The origin is on the graph even when nothing was found. "This account has no
  // onward trail as of this instant" is an answer; an empty canvas is not.
  observeDepth(originEntityId, 0);

  for (const path of paths) {
    const firstHop = path.hops[0];
    if (firstHop.from_entity_id !== originEntityId) {
      throw new Error(
        `path does not start at the stated origin: expected ${originEntityId}, ` +
          `got ${firstHop.from_entity_id}`,
      );
    }

    for (const hop of path.hops) {
      // `depth` is 1-based on hops, so the hop's source sits one level above it.
      observeDepth(hop.from_entity_id, hop.depth - 1);
      observeDepth(hop.to_entity_id, hop.depth);

      hasOutgoing.add(hop.from_entity_id);
      if (hop.edge_type === 'WITHDREW_AT') cashOutIds.add(hop.to_entity_id);

      // One edge can sit at different depths on different paths — two routes of
      // unequal length can converge on its source entity. Every other field is
      // a column of the same row and cannot differ, so keeping the shallowest
      // occurrence is enough to make de-duplication order-independent.
      const existing = edgeById.get(hop.edge_id);
      if (existing === undefined || hop.depth < existing.depth) {
        edgeById.set(hop.edge_id, toEdge(hop));
      }
    }

    if (path.truncated) {
      // `hops` is a non-empty tuple, so a last element always exists — but the
      // index is computed, which `noUncheckedIndexedAccess` cannot see through.
      // `.at(-1)` states "the last one" directly and narrows cleanly.
      const terminalHop = path.hops.at(-1);
      if (terminalHop !== undefined) truncatedFrontier.add(terminalHop.to_entity_id);
    }
  }

  const nodes: MoneyTrailNode[] = [];
  for (const [id, depth] of depthById) {
    const isCashOut = cashOutIds.has(id);

    // The only node kind a trail can establish on its own. A `WITHDREW_AT` hop
    // means value left the traceable system at its target, which is what
    // `CASH_OUT_ENDPOINT` denotes. The kind is deliberately not refined by
    // channel — an `AEPS_BC` withdrawal happens at a business correspondent, but
    // whether the graph models that node as `BC_AGENT` or as an endpoint with a
    // channel is the backend's decision, and guessing it here would be a
    // frontend inventing a fact about the domain. Every other node stays null
    // rather than defaulting to `ACCOUNT`.
    const type: GraphNodeType | null = isCashOut ? 'CASH_OUT_ENDPOINT' : null;

    // `ORIGIN` wins a tie by convention only; the backend's cycle guard seeds
    // `visited` with the origin, so the origin can never be a hop target and the
    // conflict is unreachable.
    const role: MoneyTrailNode['role'] =
      id === originEntityId ? 'ORIGIN' : isCashOut ? 'CASH_OUT' : 'INTERMEDIARY';

    // A node with onward hops is expandable; one without is an endpoint, and
    // which kind of endpoint is the distinction that matters. `TERMINAL` and
    // `SEARCH_TRUNCATED` look identical on a canvas and mean opposite things —
    // the money stopped, versus the search stopped — so they are decided here
    // rather than left to the view to infer.
    //
    // Truncation is checked only for nodes with no onward hops: a path cut off
    // at an account that another, shorter path continued through is not a
    // frontier, because the graph does know what came next.
    let expansion: MoneyTrailNode['expansion'];
    if (!hasOutgoing.has(id)) {
      expansion = truncatedFrontier.has(id) ? 'SEARCH_TRUNCATED' : 'TERMINAL';
    } else {
      expansion = expanded.has(id) ? 'EXPANDED' : 'COLLAPSED';
    }

    nodes.push({ id, type, depth, role, expansion, label: shortEntityLabel(id) });
  }

  // Sorted rather than left in encounter order so the output is a function of
  // the input set and not of the order the backend happened to return paths in.
  // That is what lets a test assert on the whole array, and what stops a layout
  // from reshuffling between two renders of identical data.
  nodes.sort((a, b) => a.depth - b.depth || compareStrings(a.id, b.id));

  const edges = [...edgeById.values()].sort(
    (a, b) =>
      a.depth - b.depth ||
      // Parsed, not compared as strings: two ISO-8601 instants at different UTC
      // offsets can be the same moment while sorting differently as text.
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      compareStrings(a.id, b.id),
  );

  return {
    originEntityId,
    asOf,
    maxDepth,
    nodes,
    edges,
    truncated: paths.some((path) => path.truncated),
  };
}

/**
 * How many entities a trail may draw before it stops opening itself.
 *
 * Not a guess at what fits on screen — a canvas can be panned. It is the point
 * past which a node-link diagram stops being readable at all and becomes the
 * hairball that progressive disclosure exists to prevent. Reconstructions from
 * the real graph run to thousands of accounts; the demo trails run to eight.
 */
export const DEFAULT_EXPANSION_BUDGET = 60;

/**
 * The expansion set a trail should open with.
 *
 * The console used to open on the origin alone, leaving an investigator to
 * click out every hop before seeing the shape of the case. For a trail this
 * size that is friction with nothing behind it — the reconstruction is already
 * in the payload, and hiding it does not make it smaller.
 *
 * So a trail opens itself as far as it can. Breadth-first from the origin, a
 * hop at a time, stopping at the first hop that would push the canvas past
 * `budget`; everything past that stays collapsed and stays clickable. Large
 * trails therefore still never render whole, which is the guarantee
 * progressive disclosure was built for — they just start further along.
 *
 * The budget is checked *before* a hop opens rather than trimmed after. A hop
 * opened halfway would show some of an entity's onward transfers and not the
 * rest, which reads as "the money stopped here" — a finding — when it is only
 * a display limit.
 */
export function defaultExpandedNodeIds({
  originEntityId,
  paths,
  budget = DEFAULT_EXPANSION_BUDGET,
}: {
  readonly originEntityId: EntityId;
  readonly paths: readonly TrailPath[];
  readonly budget?: number;
}): Set<EntityId> {
  const outgoing = new Map<EntityId, Set<EntityId>>();
  for (const path of paths) {
    for (const hop of path.hops) {
      const bucket = outgoing.get(hop.from_entity_id);
      if (bucket === undefined) outgoing.set(hop.from_entity_id, new Set([hop.to_entity_id]));
      else bucket.add(hop.to_entity_id);
    }
  }

  const expanded = new Set<EntityId>();
  const drawn = new Set<EntityId>([originEntityId]);
  const frontier: EntityId[] = [originEntityId];

  for (let i = 0; i < frontier.length; i += 1) {
    const id = frontier[i];
    if (id === undefined) continue;

    // Sorted, so the set is a function of the trail rather than of the order
    // the backend happened to return paths in — the same property the reducer's
    // own sorts exist for. Without it, a trail at the budget could open to a
    // different subgraph on two renders of identical data.
    const targets = [...(outgoing.get(id) ?? [])].sort(compareStrings);
    if (targets.length === 0) continue;

    const added = targets.filter((target) => !drawn.has(target));
    if (drawn.size + added.length > budget) continue;

    expanded.add(id);
    for (const target of added) {
      drawn.add(target);
      frontier.push(target);
    }
  }

  return expanded;
}
