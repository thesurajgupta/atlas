/**
 * Unit tests for local search, exact decimal totals and payment colours.
 *
 *     npm test -- lib/graph/search.test.ts
 *
 * Runs against the synthetic fixture; nothing here touches a network
 * (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md).
 */

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { formatCurrencyAmount, groupIndianDigits, sumDecimalStrings } from './decimal';
import { PAYMENT_METHOD_COLOR, PAYMENT_METHOD_ORDER, paymentMethodColor } from './payment-method';
import { reduceTrailPaths } from './reducer';
import { bestMatch, searchTrail } from './search';
import { SYNTHETIC_CASE } from './synthetic-case';
import {
  SYNTHETIC_AS_OF,
  SYNTHETIC_MAX_DEPTH,
  SYNTHETIC_ORIGIN_ENTITY_ID,
  SYNTHETIC_TRAIL_PATHS,
} from './synthetic-trail';
import type { EntityId } from './types';

const everything = reduceTrailPaths({
  originEntityId: SYNTHETIC_ORIGIN_ENTITY_ID,
  asOf: SYNTHETIC_AS_OF,
  maxDepth: SYNTHETIC_MAX_DEPTH,
  paths: SYNTHETIC_TRAIL_PATHS,
  expandedNodeIds: new Set(
    reduceTrailPaths({
      originEntityId: SYNTHETIC_ORIGIN_ENTITY_ID,
      asOf: SYNTHETIC_AS_OF,
      maxDepth: SYNTHETIC_MAX_DEPTH,
      paths: SYNTHETIC_TRAIL_PATHS,
      expandedNodeIds: new Set(),
    }).nodes.map((node) => node.id),
  ),
});

const channelById = new Map<EntityId, string>();
for (const edge of everything.edges) {
  if (edge.edgeType === 'WITHDREW_AT' && edge.channel !== null) {
    channelById.set(edge.target, edge.channel);
  }
}

const targets = {
  nodes: everything.nodes,
  channelById,
  edges: everything.edges,
  caseFields: [SYNTHETIC_CASE.caseId, SYNTHETIC_CASE.typology, SYNTHETIC_CASE.status],
};

test('a blank query is not a search', () => {
  const result = searchTrail('   ', targets);
  assert.equal(result.entityIds.length, 0);
  assert.equal(result.isEmpty, false, 'blank must not render a no-results state');
});

test('a short entity id finds its entity', () => {
  const result = searchTrail('FACADE01', targets);
  assert.equal(result.entityIds.length, 1);
  assert.equal(result.entityIds[0], SYNTHETIC_ORIGIN_ENTITY_ID);
  assert.equal(bestMatch(result, everything.edges), SYNTHETIC_ORIGIN_ENTITY_ID);
});

test('search is case-insensitive', () => {
  assert.deepEqual(
    searchTrail('facade01', targets).entityIds,
    searchTrail('FACADE01', targets).entityIds,
  );
});

test('a full uuid finds its entity', () => {
  const result = searchTrail(SYNTHETIC_ORIGIN_ENTITY_ID, targets);
  assert.deepEqual(result.entityIds, [SYNTHETIC_ORIGIN_ENTITY_ID]);
});

test('a channel finds the endpoint it reached and the hop that reached it', () => {
  const result = searchTrail('AEPS_BC', targets);
  assert.equal(result.entityIds.length, 1, 'the business-correspondent endpoint');
  assert.ok(result.hopIds.size > 0, 'and the withdrawal hop itself');
  assert.equal(result.isEmpty, false);
});

test('a rail finds hops without claiming entities', () => {
  const result = searchTrail('UPI', targets);
  assert.ok(result.hopIds.size > 0);
  // Enter still lands somewhere useful: the far end of the first matching hop.
  assert.notEqual(bestMatch(result, everything.edges), null);
});

test('a role finds every entity in it', () => {
  const result = searchTrail('CASH_OUT', targets);
  assert.equal(result.entityIds.length, 2, 'both synthetic endpoints');
});

test('the case id matches the case, not an entity', () => {
  const result = searchTrail('ATLAS-SYN-1042', targets);
  assert.equal(result.matchesCase, true);
  assert.equal(result.entityIds.length, 0);
  assert.equal(result.isEmpty, false);
});

test('an unmatched query reports empty, so the UI can say so', () => {
  const result = searchTrail('zzzz-no-such-thing', targets);
  assert.equal(result.isEmpty, true);
  assert.equal(bestMatch(result, everything.edges), null);
});

test('decimal totals are exact, not floating point', () => {
  // The canonical demonstration: 0.1 + 0.2 must not be 0.30000000000000004.
  assert.equal(sumDecimalStrings(['0.1', '0.2']), '0.3');
  assert.equal(sumDecimalStrings(['200000.00', '150000.00']), '350000.00');
  assert.equal(sumDecimalStrings(['112500.55', '80000.45']), '192501.00');
  assert.equal(sumDecimalStrings([]), '0');
  // Mixed scales widen to the longest fraction rather than truncating.
  assert.equal(sumDecimalStrings(['1.5', '2.25']), '3.75');
});

test('amounts group the Indian way, not in thousands', () => {
  assert.equal(groupIndianDigits('284000'), '2,84,000');
  assert.equal(groupIndianDigits('100'), '100');
  assert.equal(groupIndianDigits('10000000'), '1,00,00,000');
});

test('a stated currency renders its symbol; whole amounts drop a dead .00', () => {
  assert.equal(formatCurrencyAmount('284000.00', 'INR'), '₹2,84,000');
  assert.equal(formatCurrencyAmount('112500.55', 'INR'), '₹1,12,500.55');
});

test('every payment method has its own colour, and none of them is red', () => {
  const colours = PAYMENT_METHOD_ORDER.map((method) => PAYMENT_METHOD_COLOR[method]);
  assert.equal(new Set(colours).size, colours.length, 'colours must be distinguishable');
  for (const colour of colours) {
    assert.ok(!/^#(ef4444|dc2626|b91c1c|f87171)$/i.test(colour), `${colour} must not be red`);
  }
  // An unseen rail is displayable rather than rejected.
  assert.equal(paymentMethodColor('SOME_NEW_RAIL'), paymentMethodColor(null));
});
