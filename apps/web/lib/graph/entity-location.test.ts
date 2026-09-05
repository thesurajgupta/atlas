/**
 * Unit tests for entity location metadata.
 *
 *     npm test -- lib/graph/entity-location.test.ts
 *
 * Every coordinate below is invented (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md).
 */

import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { EntityLocation } from './entity-location';
import { formatCoordinates } from './entity-location';

const at = (latitude: number, longitude: number): EntityLocation => ({
  latitude,
  longitude,
  isSynthetic: true,
});

test('coordinates format at fixed precision, with hemispheres', () => {
  assert.equal(formatCoordinates(at(22.5, 78.5)), '22.5000° N, 78.5000° E');
  assert.equal(formatCoordinates(at(-8.25, -60.125)), '8.2500° S, 60.1250° W');
});

test('precision is fixed, so a coordinate never renders at a different width', () => {
  // Trailing zeros are kept on purpose: 22.5 and 22.5001 must line up in a
  // panel, and a value that changes width as it changes is hard to compare.
  assert.equal(formatCoordinates(at(22.5, 78)), '22.5000° N, 78.0000° E');
  assert.equal(formatCoordinates(at(0, 0)), '0.0000° N, 0.0000° E');
});
