/**
 * Unit tests for the Cytoscape adapter.
 *
 * The adapter imports Cytoscape for types only, so these run in a plain Node
 * process with no DOM and no browser:
 *
 *     npm test -- lib/graph/cytoscape-adapter.test.ts
 *
 * The fixture is the synthetic trail from `./synthetic-trail`. Nothing here
 * describes a real person, account, institution or event
 * (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md).
 */

import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  NODE_GEOMETRY,
  containedGlyphSize,
  MONEY_TRAIL_LAYOUT,
  MONEY_TRAIL_STYLESHEET,
  computeNodePositions,
  selectVisibleSubgraph,
  toCytoscapeElements,
} from './cytoscape-adapter';
import { reduceTrailPaths } from './reducer';
import {
  SYNTHETIC_AS_OF,
  SYNTHETIC_MAX_DEPTH,
  SYNTHETIC_ORIGIN_ENTITY_ID,
  SYNTHETIC_TRAIL_PATHS,
} from './synthetic-trail';
import type { EntityId, MoneyTrailGraph } from './types';

const ORIGIN = SYNTHETIC_ORIGIN_ENTITY_ID;

function build(expandedNodeIds: ReadonlySet<EntityId>): MoneyTrailGraph {
  return reduceTrailPaths({
    originEntityId: ORIGIN,
    asOf: SYNTHETIC_AS_OF,
    maxDepth: SYNTHETIC_MAX_DEPTH,
    paths: SYNTHETIC_TRAIL_PATHS,
    expandedNodeIds,
  });
}

/** The two accounts one hop from the victim in the synthetic trail. */
function firstHopTargets(): readonly EntityId[] {
  const graph = build(new Set([ORIGIN]));
  return graph.edges.filter((edge) => edge.source === ORIGIN).map((edge) => edge.target);
}

test('nothing expanded shows the origin alone', () => {
  const graph = build(new Set());
  const visible = selectVisibleSubgraph(graph);

  assert.deepEqual(
    visible.nodes.map((n) => n.id),
    [ORIGIN],
  );
  assert.equal(visible.edges.length, 0);
});

test('expanding the origin reveals exactly one hop, not the whole trail', () => {
  const graph = build(new Set([ORIGIN]));
  const visible = selectVisibleSubgraph(graph);

  assert.equal(visible.edges.length, 2, 'both first-hop transfers');
  assert.equal(visible.nodes.length, 3, 'origin plus its two immediate targets');
  assert.ok(visible.nodes.every((n) => n.depth <= 1));

  // The reducer knows more than this; the adapter is what withholds it.
  assert.ok(graph.nodes.length > visible.nodes.length, 'the full trail is deeper than one hop');
});

test('expanding a second node reveals only that node’s hops', () => {
  const [firstTarget, secondTarget] = firstHopTargets();
  assert.ok(firstTarget !== undefined && secondTarget !== undefined);

  const before = selectVisibleSubgraph(build(new Set([ORIGIN])));
  const after = selectVisibleSubgraph(build(new Set([ORIGIN, firstTarget])));

  const revealed = after.edges.filter((edge) => !before.edges.some((e) => e.id === edge.id));
  assert.ok(revealed.length > 0);
  assert.ok(
    revealed.every((edge) => edge.source === firstTarget),
    'every newly drawn edge leaves the node that was opened',
  );
  // The sibling branch stays shut.
  assert.ok(!after.edges.some((edge) => edge.source === secondTarget));
});

test('a collapsed node reports how many hops are being withheld', () => {
  const [firstTarget] = firstHopTargets();
  assert.ok(firstTarget !== undefined);

  const visible = selectVisibleSubgraph(build(new Set([ORIGIN])));
  assert.ok(
    (visible.hiddenHopCountById.get(firstTarget) ?? 0) > 0,
    'the affordance needs a count to show',
  );
  assert.equal(visible.hiddenHopCountById.get(ORIGIN), 0, 'an expanded node withholds nothing');
});

test('positions are deterministic: depth on x, siblings stacked and centred on y', () => {
  const graph = build(new Set([ORIGIN]));
  const visible = selectVisibleSubgraph(graph);

  const first = computeNodePositions(visible.nodes);
  const second = computeNodePositions(visible.nodes);
  assert.deepEqual([...first.entries()], [...second.entries()], 'same input, same positions');

  assert.deepEqual(first.get(ORIGIN), { x: 0, y: 0 }, 'the origin anchors the layout');

  const depthOne = visible.nodes.filter((n) => n.depth === 1);
  const xs = new Set(depthOne.map((n) => first.get(n.id)?.x));
  assert.equal(xs.size, 1, 'one column per depth');
  assert.notEqual([...xs][0], 0, 'depth 1 is not on top of depth 0');

  const ys = depthOne.map((n) => first.get(n.id)?.y ?? 0);
  assert.equal(
    ys.reduce((a, b) => a + b, 0),
    0,
    'a column is centred on the spine',
  );
});

test('the layout is preset and never a randomised force simulation', () => {
  assert.equal(MONEY_TRAIL_LAYOUT.name, 'preset');
  const randomised = /^(cose|cose-bilkent|random|fcose|spread|cola)$/;
  assert.ok(!randomised.test(MONEY_TRAIL_LAYOUT.name));
});

test('elements carry the hop facts unchanged and mark direction', () => {
  const graph = build(new Set([ORIGIN]));
  const elements = toCytoscapeElements(graph);
  const visible = selectVisibleSubgraph(graph);

  const edge = visible.edges[0];
  assert.ok(edge);
  const element = elements.find((el) => el.data.id === edge.id);
  assert.ok(element);
  assert.equal(element.group, 'edges');
  assert.equal(element.data.source, edge.source, 'from_entity_id remains the source');
  assert.equal(element.data.target, edge.target, 'to_entity_id remains the target');
  assert.equal(element.data.amount, edge.amount, 'the decimal string is passed through verbatim');
  assert.equal(element.data.label, edge.label);
  assert.equal(element.data.edgeType, edge.edgeType);

  // Every node element is positioned, so nothing falls back to a random placement.
  const nodeElements = elements.filter((el) => el.group === 'nodes');
  assert.equal(nodeElements.length, visible.nodes.length);
  assert.ok(nodeElements.every((el) => typeof el.position?.x === 'number'));
});

test('a terminal node and a search-truncated node are separable by class and by data', () => {
  // Open the whole synthetic trail so both endpoint kinds are on the canvas.
  const graph = build(new Set(build(new Set()).nodes.map((n) => n.id).concat(ORIGIN)));
  const everything = build(new Set(graph.nodes.map((n) => n.id)));
  const elements = toCytoscapeElements(everything);

  const truncated = elements.filter((el) => el.data.expansion === 'SEARCH_TRUNCATED');
  const terminal = elements.filter((el) => el.data.expansion === 'TERMINAL');
  assert.ok(truncated.length > 0, 'the fixture contains a truncated frontier');
  assert.ok(terminal.length > 0, 'and a genuine terminal');

  assert.ok(truncated.every((el) => String(el.classes).includes('state-search-truncated')));
  assert.ok(terminal.every((el) => String(el.classes).includes('state-terminal')));

  // The stylesheet has to actually distinguish them, or the class is decoration.
  const selectors = MONEY_TRAIL_STYLESHEET.map((rule) => rule.selector);
  assert.ok(selectors.includes('node.state-search-truncated'));
});

test('cash-out endpoints are typed from the data, other nodes are not guessed', () => {
  const everything = build(new Set(build(new Set()).nodes.map((n) => n.id)));
  const full = build(new Set(everything.nodes.map((n) => n.id)));
  const elements = toCytoscapeElements(full).filter((el) => el.group === 'nodes');

  const cashOuts = elements.filter((el) => el.data.role === 'CASH_OUT');
  assert.ok(cashOuts.length > 0);
  assert.ok(cashOuts.every((el) => el.data.nodeType === 'CASH_OUT_ENDPOINT'));

  const intermediaries = elements.filter((el) => el.data.role === 'INTERMEDIARY');
  assert.ok(intermediaries.length > 0);
  assert.ok(
    intermediaries.every((el) => el.data.nodeType === 'UNKNOWN'),
    'an intermediary’s kind is not carried by a trail, so it is not invented',
  );
});

test('no element and no style rule encodes a score, risk or confidence', () => {
  const full = build(new Set(build(new Set()).nodes.map((n) => n.id)));
  const elements = toCytoscapeElements(full);

  const banned = /confidence|probabilit|likelihood|risk|score|certaint|severity/i;
  assert.ok(!banned.test(JSON.stringify(elements)), 'no scored field on any element');
  assert.ok(!banned.test(JSON.stringify(MONEY_TRAIL_STYLESHEET)), 'no scored selector in the style');

});

test('red is confined to the cash-out role and reaches nothing else', () => {
  // This assertion used to be "no red anywhere". It was narrowed, not dropped,
  // when cash-out took the red semantic: red now marks one category the payload
  // states outright — the target of a WITHDREW_AT hop — and the rule worth
  // enforcing is that it cannot leak onto anything that *would* read as a
  // severity. Origin, intermediary, truncation and every edge must stay clear
  // of it, or the colour stops meaning one specific thing.
  const REDS = ['#ef4444', '#dc2626', '#b91c1c', '#f87171', '#fca5a5', '#450a0a'];
  const usesRed = (rule: (typeof MONEY_TRAIL_STYLESHEET)[number]) => {
    const serialised = JSON.stringify(rule).toLowerCase();
    return REDS.some((red) => serialised.includes(red));
  };

  const reddened = MONEY_TRAIL_STYLESHEET.filter(usesRed).map((rule) => rule.selector);
  assert.ok(reddened.length > 0, 'cash-out is expected to carry the semantic');
  for (const selector of reddened) {
    assert.ok(
      selector.includes('role-cash-out'),
      `only the cash-out role may use red; found it on "${selector}"`,
    );
  }

  // And the roles that must never be mistaken for it.
  for (const selector of ['node.role-origin', 'node', 'edge', 'node.state-search-truncated']) {
    const rule = MONEY_TRAIL_STYLESHEET.find((entry) => entry.selector === selector);
    assert.ok(rule, `expected a rule for ${selector}`);
    assert.ok(!usesRed(rule), `${selector} must not use the cash-out semantic`);
  }
});

test('every glyph sits wholly inside its node outline', () => {
  // Containment is geometry, not taste, so it is asserted rather than eyeballed.
  // The circle is the case that catches people out: a square centred in a circle
  // touches the stroke when its *diagonal* reaches the inner diameter, so the
  // limit is `inner / √2` and not `inner`.
  const roles = [
    { name: 'origin', selector: 'node.role-origin', geometry: NODE_GEOMETRY.origin },
    { name: 'intermediary', selector: 'node', geometry: NODE_GEOMETRY.intermediary },
    { name: 'cash-out', selector: 'node.role-cash-out', geometry: NODE_GEOMETRY.cashOut },
  ];

  for (const role of roles) {
    const rule = MONEY_TRAIL_STYLESHEET.find((entry) => entry.selector === role.selector);
    assert.ok(rule, `expected a rule for ${role.selector}`);
    const style = (rule as unknown as { style: Record<string, unknown> }).style;

    const glyph = style['background-width'];
    assert.equal(glyph, style['background-height'], `${role.name} glyph must stay square`);
    assert.equal(typeof glyph, 'number');

    const innerWidth = role.geometry.width - 2 * role.geometry.border;
    const innerHeight = role.geometry.height - 2 * role.geometry.border;
    const limit = role.geometry.round
      ? Math.min(innerWidth, innerHeight) / Math.SQRT2
      : Math.min(innerWidth, innerHeight);

    assert.ok(
      (glyph as number) < limit,
      `${role.name}: glyph ${String(glyph)} must be under ${limit.toFixed(1)} to clear the border`,
    );
    // And it has to remain a legible icon rather than a dot.
    assert.ok((glyph as number) > limit * 0.5, `${role.name}: glyph is too small to read`);
  }
});

test('the containment rule scales with the node rather than being hardcoded', () => {
  // Growing a node must grow its glyph; that is the whole reason the size is
  // derived. A literal would silently stop fitting the day a diameter changes.
  const small = containedGlyphSize({ width: 40, height: 40, border: 2, round: true });
  const large = containedGlyphSize({ width: 80, height: 80, border: 2, round: true });
  assert.ok(large > small * 1.5, 'glyph size must track node size');

  // A round node gets a smaller glyph than a rectangle of identical bounds,
  // because the inscribed square is smaller.
  const round = containedGlyphSize({ width: 50, height: 50, border: 2, round: true });
  const square = containedGlyphSize({ width: 50, height: 50, border: 2, round: false });
  assert.ok(round < square, 'a circle must inscribe a smaller square than a rectangle');
});
