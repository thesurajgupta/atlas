/**
 * Local search over what this screen already holds.
 *
 * **Entirely client-side.** There is no search endpoint, and nothing here
 * reaches the network. It matches against the trail currently reduced, the
 * entities currently drawn and the synthetic case fixture — nothing else
 * exists in this build to search. It is not querying NCRP, CFCFRMS or any
 * other system, and the UI says so.
 *
 * Pure and dependency-free so the matching rules can be tested without a
 * browser, which is where a substring bug would otherwise hide.
 */

import { paymentMethodOf } from './payment-method';
import type { EntityId, MoneyTrailEdge, MoneyTrailNode } from './types';

export interface SearchTargets {
  readonly nodes: readonly MoneyTrailNode[];
  /** Cash-out channel per entity, so a channel finds the endpoint it reached. */
  readonly channelById: ReadonlyMap<EntityId, string>;
  readonly edges: readonly MoneyTrailEdge[];
  readonly caseFields: readonly string[];
}

export interface SearchResult {
  /** Matching entities, in the order the reducer produced them. */
  readonly entityIds: readonly EntityId[];
  /** Ids of matching hops. */
  readonly hopIds: ReadonlySet<string>;
  readonly matchesCase: boolean;
  /** True when a query was typed and nothing anywhere matched it. */
  readonly isEmpty: boolean;
}

const NO_RESULT: SearchResult = {
  entityIds: [],
  hopIds: new Set(),
  matchesCase: false,
  isEmpty: false,
};

/** Case-insensitive substring, tolerant of the spacing a paste brings along. */
function contains(haystack: string | null | undefined, needle: string): boolean {
  if (haystack === null || haystack === undefined) return false;
  return haystack.toLowerCase().includes(needle);
}

/**
 * Match a query against entities, hops and the case fixture.
 *
 * A blank query is not a search: it returns nothing matched and nothing empty,
 * so the UI shows the trail as it was rather than a "no results" state.
 */
export function searchTrail(query: string, targets: SearchTargets): SearchResult {
  const needle = query.trim().toLowerCase();
  if (needle === '') return NO_RESULT;

  const entityIds = targets.nodes
    .filter(
      (node) =>
        contains(node.label, needle) ||
        contains(node.id, needle) ||
        contains(node.role, needle) ||
        // Role as an investigator would type it, not as the enum spells it.
        contains(node.role.replace(/_/g, '-'), needle) ||
        contains(node.type, needle) ||
        contains(targets.channelById.get(node.id), needle),
    )
    .map((node) => node.id);

  const hopIds = new Set<string>();
  for (const edge of targets.edges) {
    const matched =
      contains(paymentMethodOf(edge), needle) ||
      contains(edge.rail, needle) ||
      contains(edge.channel, needle) ||
      contains(edge.source, needle) ||
      contains(edge.target, needle) ||
      contains(edge.amount, needle) ||
      contains(edge.edgeType, needle);
    if (matched) hopIds.add(edge.id);
  }

  const matchesCase = targets.caseFields.some((field) => contains(field, needle));

  return {
    entityIds,
    hopIds,
    matchesCase,
    isEmpty: entityIds.length === 0 && hopIds.size === 0 && !matchesCase,
  };
}

/**
 * The entity a bare Enter should select.
 *
 * The first entity match in reducer order, which is shallowest-first — the hop
 * closest to the victim, and the one an investigator is most likely to mean.
 * Falls back to the source of a matching hop, so searching a rail still lands
 * somewhere useful.
 */
export function bestMatch(result: SearchResult, edges: readonly MoneyTrailEdge[]): EntityId | null {
  const [firstEntity] = result.entityIds;
  if (firstEntity !== undefined) return firstEntity;
  const firstHop = edges.find((edge) => result.hopIds.has(edge.id));
  return firstHop?.target ?? null;
}
