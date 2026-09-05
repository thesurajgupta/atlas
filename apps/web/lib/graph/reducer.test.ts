/**
 * Unit tests for the hop-to-graph reducer.
 *
 * Run with the project's configured runner:
 *
 *
 *     npm test -- lib/graph/reducer.test.ts
 *
 * Every identifier below is a hand-written synthetic UUID. Nothing here
 * describes a real person, account, institution or event
 * (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md).
 */

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { edgeCaption, reduceTrailPaths, shortEntityLabel } from './reducer';
import type { CashOutChannel, MoneyEdgeType, TrailHop, TrailPath } from './types';

/** Synthetic entity ids. The trailing digit is the only thing that varies. */
const VICTIM = '00000000-0000-4000-8000-000000000001';
const MULE_A = '00000000-0000-4000-8000-000000000002';
const MULE_B = '00000000-0000-4000-8000-000000000003';
const MULE_C = '00000000-0000-4000-8000-000000000004';
const ENDPOINT = '00000000-0000-4000-8000-000000000009';

const EDGE_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const EDGE_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const EDGE_3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const EDGE_4 = 'aaaaaaaa-0000-4000-8000-000000000004';

interface HopSpec {
  readonly edge: string;
  readonly from: string;
  readonly to: string;
  readonly depth: number;
  readonly edgeType?: MoneyEdgeType;
  readonly amount?: string;
  readonly occurredAt?: string;
  readonly channel?: CashOutChannel | null;
  readonly rail?: string | null;
}

function hop(spec: HopSpec): TrailHop {
  return {
    edge_id: spec.edge,
    from_entity_id: spec.from,
    to_entity_id: spec.to,
    edge_type: spec.edgeType ?? 'TRANSFERRED_TO',
    amount: spec.amount ?? '100000.00',
    occurred_at: spec.occurredAt ?? '2026-03-14T09:00:00+05:30',
    channel: spec.channel ?? null,
    rail: spec.rail === undefined ? 'IMPS' : spec.rail,
    depth: spec.depth,
  };
}

function trail(hops: readonly [TrailHop, ...TrailHop[]], truncated = false): TrailPath {
  return { hops, truncated };
}

const BASE = { originEntityId: VICTIM, asOf: '2026-03-20T00:00:00+05:30', maxDepth: 6 };

test('an empty result still carries the origin, as a terminal node', () => {
  const graph = reduceTrailPaths({ ...BASE, paths: [] });

  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.edges.length, 0);
  assert.deepEqual(graph.nodes[0], {
    id: VICTIM,
    type: null,
    depth: 0,
    role: 'ORIGIN',
    expansion: 'TERMINAL',
    label: shortEntityLabel(VICTIM),
  });
  assert.equal(graph.truncated, false);
  // Query parameters are echoed, not inferred from the (absent) result.
  assert.equal(graph.asOf, BASE.asOf);
  assert.equal(graph.maxDepth, 6);
});

test('every TrailHop field survives the conversion to an edge', () => {
  const withdrawal = hop({
    edge: EDGE_2,
    from: MULE_A,
    to: ENDPOINT,
    depth: 2,
    edgeType: 'WITHDREW_AT',
    amount: '182500.55',
    occurredAt: '2026-03-15T11:42:00+05:30',
    channel: 'AEPS_BC',
    rail: 'AEPS',
  });
  const graph = reduceTrailPaths({
    ...BASE,
    paths: [trail([hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1 }), withdrawal])],
  });

  const edge = graph.edges.find((e) => e.id === EDGE_2);
  assert.ok(edge);
  assert.equal(edge.source, MULE_A, 'from_entity_id becomes source');
  assert.equal(edge.target, ENDPOINT, 'to_entity_id becomes target');
  assert.equal(edge.edgeType, 'WITHDREW_AT');
  assert.equal(edge.occurredAt, '2026-03-15T11:42:00+05:30');
  assert.equal(edge.channel, 'AEPS_BC');
  assert.equal(edge.rail, 'AEPS');
  assert.equal(edge.depth, 2);

  // The exact decimal string, not a number: 182500.55 through a float and back
  // is where rupees start disagreeing with the ledger.
  assert.equal(edge.amount, '182500.55');
  assert.equal(typeof edge.amount, 'string');
});

test('a cash-out target is typed and marked terminal; a transfer target is not', () => {
  const graph = reduceTrailPaths({
    ...BASE,
    paths: [
      trail([
        hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1 }),
        hop({
          edge: EDGE_2,
          from: MULE_A,
          to: ENDPOINT,
          depth: 2,
          edgeType: 'WITHDREW_AT',
          channel: 'ATM',
        }),
      ]),
    ],
  });

  const endpoint = graph.nodes.find((n) => n.id === ENDPOINT);
  assert.ok(endpoint);
  assert.equal(endpoint.type, 'CASH_OUT_ENDPOINT');
  assert.equal(endpoint.role, 'CASH_OUT');
  assert.equal(endpoint.expansion, 'TERMINAL');
  assert.equal(endpoint.depth, 2);

  // An intermediary's kind is not knowable from a trail, so it stays null
  // rather than being defaulted to ACCOUNT.
  const mule = graph.nodes.find((n) => n.id === MULE_A);
  assert.ok(mule);
  assert.equal(mule.type, null);
  assert.equal(mule.role, 'INTERMEDIARY');
  assert.equal(mule.expansion, 'COLLAPSED');
  assert.equal(mule.depth, 1);
});

test('overlapping paths contribute each entity and each edge exactly once', () => {
  const shared = hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1 });
  const graph = reduceTrailPaths({
    ...BASE,
    paths: [
      trail([shared, hop({ edge: EDGE_2, from: MULE_A, to: MULE_B, depth: 2 })]),
      trail([shared, hop({ edge: EDGE_3, from: MULE_A, to: MULE_C, depth: 2 })]),
    ],
  });

  assert.equal(graph.edges.filter((e) => e.id === EDGE_1).length, 1, 'shared hop drawn once');
  assert.equal(graph.edges.length, 3);
  assert.deepEqual(
    graph.nodes.map((n) => n.id),
    [VICTIM, MULE_A, MULE_B, MULE_C],
    'four distinct entities, ordered by depth then id',
  );
});

test('an edge reached by two routes of unequal length keeps its shallowest depth', () => {
  // VICTIM -> A -> C  and  VICTIM -> B -> A -> C. The A->C edge is depth 2 on
  // the first path and depth 3 on the second.
  const shortRouteHop = hop({ edge: EDGE_3, from: MULE_A, to: MULE_C, depth: 2 });
  const longRouteHop = hop({ edge: EDGE_3, from: MULE_A, to: MULE_C, depth: 3 });

  const deepFirst = reduceTrailPaths({
    ...BASE,
    paths: [
      trail([
        hop({ edge: EDGE_1, from: VICTIM, to: MULE_B, depth: 1 }),
        hop({ edge: EDGE_2, from: MULE_B, to: MULE_A, depth: 2 }),
        longRouteHop,
      ]),
      trail([hop({ edge: EDGE_4, from: VICTIM, to: MULE_A, depth: 1 }), shortRouteHop]),
    ],
  });

  assert.equal(deepFirst.edges.find((e) => e.id === EDGE_3)?.depth, 2);
  assert.equal(deepFirst.nodes.find((n) => n.id === MULE_A)?.depth, 1);
  assert.equal(deepFirst.nodes.find((n) => n.id === MULE_C)?.depth, 2);
});

test('a truncated search is distinguishable from money that stopped', () => {
  const graph = reduceTrailPaths({
    ...BASE,
    maxDepth: 2,
    paths: [
      trail(
        [
          hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1 }),
          hop({ edge: EDGE_2, from: MULE_A, to: MULE_B, depth: 2 }),
        ],
        true,
      ),
      trail([
        hop({ edge: EDGE_3, from: VICTIM, to: MULE_C, depth: 1 }),
        hop({
          edge: EDGE_4,
          from: MULE_C,
          to: ENDPOINT,
          depth: 2,
          edgeType: 'WITHDREW_AT',
          channel: 'ATM',
        }),
      ]),
    ],
  });

  assert.equal(graph.truncated, true, 'TrailPath.truncated reaches the graph');
  // Both nodes have no onward hops and would look identical on a canvas.
  assert.equal(graph.nodes.find((n) => n.id === MULE_B)?.expansion, 'SEARCH_TRUNCATED');
  assert.equal(graph.nodes.find((n) => n.id === ENDPOINT)?.expansion, 'TERMINAL');
});

test('a truncated frontier that another path continued through is not a frontier', () => {
  // One path stops at MULE_B because the ceiling was reached; another path knows
  // what came next. The graph is not missing anything at MULE_B, so calling it
  // SEARCH_TRUNCATED would overstate the uncertainty.
  const graph = reduceTrailPaths({
    ...BASE,
    maxDepth: 2,
    paths: [
      trail(
        [
          hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1 }),
          hop({ edge: EDGE_2, from: MULE_A, to: MULE_B, depth: 2 }),
        ],
        true,
      ),
      trail([
        hop({ edge: EDGE_3, from: VICTIM, to: MULE_B, depth: 1 }),
        hop({ edge: EDGE_4, from: MULE_B, to: MULE_C, depth: 2 }),
      ]),
    ],
  });

  assert.equal(graph.nodes.find((n) => n.id === MULE_B)?.expansion, 'COLLAPSED');
  assert.equal(graph.truncated, true, 'the graph as a whole is still flagged');
});

test('expandedNodeIds drives progressive disclosure without filtering the graph', () => {
  const paths = [
    trail([
      hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1 }),
      hop({ edge: EDGE_2, from: MULE_A, to: MULE_B, depth: 2 }),
    ]),
  ];

  const collapsed = reduceTrailPaths({ ...BASE, paths });
  const expanded = reduceTrailPaths({
    ...BASE,
    paths,
    expandedNodeIds: new Set([VICTIM, MULE_A]),
  });

  assert.equal(collapsed.nodes.find((n) => n.id === MULE_A)?.expansion, 'COLLAPSED');
  assert.equal(expanded.nodes.find((n) => n.id === MULE_A)?.expansion, 'EXPANDED');
  assert.equal(expanded.nodes.find((n) => n.id === VICTIM)?.expansion, 'EXPANDED');
  // Expanding changes labelling, not membership — the view hides, the reducer does not.
  assert.equal(collapsed.edges.length, expanded.edges.length);
  assert.equal(collapsed.nodes.length, expanded.nodes.length);
});

test('output is independent of the order paths arrive in', () => {
  const first = trail([
    hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1 }),
    hop({ edge: EDGE_2, from: MULE_A, to: MULE_B, depth: 2 }),
  ]);
  const second = trail([hop({ edge: EDGE_3, from: VICTIM, to: MULE_C, depth: 1 })]);

  assert.deepEqual(
    reduceTrailPaths({ ...BASE, paths: [first, second] }),
    reduceTrailPaths({ ...BASE, paths: [second, first] }),
  );
});

test('edges at equal depth order by instant, not by the text of the timestamp', () => {
  // Same moment, different offsets: as strings "09:00+05:30" sorts after
  // "04:00+00:00", and they are the same instant. The earlier one here is
  // genuinely earlier by half an hour.
  const graph = reduceTrailPaths({
    ...BASE,
    paths: [
      trail([
        hop({
          edge: EDGE_1,
          from: VICTIM,
          to: MULE_A,
          depth: 1,
          occurredAt: '2026-03-14T09:00:00+05:30',
        }),
      ]),
      trail([
        hop({
          edge: EDGE_2,
          from: VICTIM,
          to: MULE_B,
          depth: 1,
          occurredAt: '2026-03-14T03:00:00+00:00',
        }),
      ]),
    ],
  });

  assert.deepEqual(
    graph.edges.map((e) => e.id),
    [EDGE_2, EDGE_1],
  );
});

test('captions are deterministic and free of invented identity', () => {
  assert.equal(shortEntityLabel(MULE_A), '00000000');
  assert.equal(shortEntityLabel('3f2a91c4-dead-4000-8000-000000000001'), '3F2A91C4');

  // Withdrawals caption by channel, transfers by rail.
  assert.equal(
    edgeCaption(
      hop({
        edge: EDGE_1,
        from: MULE_A,
        to: ENDPOINT,
        depth: 1,
        edgeType: 'WITHDREW_AT',
        amount: '50000.00',
        channel: 'ATM',
        rail: 'CARD',
      }),
    ),
    '50000.00 · ATM',
  );
  assert.equal(
    edgeCaption(
      hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1, amount: '50000.00', rail: 'UPI' }),
    ),
    '50000.00 · UPI',
  );
  // No rail on the hop means no invented one.
  assert.equal(
    edgeCaption(
      hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1, amount: '50000.00', rail: null }),
    ),
    '50000.00',
  );
  // No currency symbol: TrailHop does not project a currency.
  assert.ok(!edgeCaption(hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1 })).includes('₹'));
});

test('no node or edge carries a score, confidence or likelihood field', () => {
  const graph = reduceTrailPaths({
    ...BASE,
    paths: [
      trail([
        hop({ edge: EDGE_1, from: VICTIM, to: MULE_A, depth: 1 }),
        hop({
          edge: EDGE_2,
          from: MULE_A,
          to: ENDPOINT,
          depth: 2,
          edgeType: 'WITHDREW_AT',
          channel: 'ATM',
        }),
      ]),
    ],
  });

  // Exact key sets, so a field added later has to be considered here first.
  const [firstNode] = graph.nodes;
  const [firstEdge] = graph.edges;
  assert.ok(firstNode !== undefined && firstEdge !== undefined, 'the fixture draws a trail');

  assert.deepEqual(Object.keys(firstNode).sort(), [
    'depth',
    'expansion',
    'id',
    'label',
    'role',
    'type',
  ]);
  assert.deepEqual(Object.keys(firstEdge).sort(), [
    'amount',
    'channel',
    'depth',
    'edgeType',
    'id',
    'label',
    'occurredAt',
    'rail',
    'source',
    'target',
  ]);

  const banned = /confidence|probabilit|likelihood|risk|score|certaint/i;
  assert.ok(!banned.test(JSON.stringify(graph)), 'no scored field anywhere in the payload');
});

test('arguments that disagree about what was queried fail loudly', () => {
  assert.throws(
    () =>
      reduceTrailPaths({
        ...BASE,
        paths: [trail([hop({ edge: EDGE_1, from: MULE_C, to: MULE_A, depth: 1 })])],
      }),
    /does not start at the stated origin/,
  );

  assert.throws(() => reduceTrailPaths({ ...BASE, maxDepth: 0, paths: [] }), RangeError);
  assert.throws(() => reduceTrailPaths({ ...BASE, maxDepth: 1.5, paths: [] }), RangeError);
});
