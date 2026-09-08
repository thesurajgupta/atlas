/**
 * The one thing about the portal's defaults that cannot be allowed to drift.
 *
 * Run with the project's configured runner:
 *
 *     npm test -- lib/demo/defaults.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { defaultComplaintDraft, groupIndian, parseAmount } from './defaults';

/** Mirrors the ceiling in `atlas.alerts.policy`. */
const GOLDEN_HOUR_MINUTES = 60;

test('the default incident sits inside the golden hour', () => {
  const now = new Date('2026-09-08T18:43:00+05:30');
  const draft = defaultComplaintDraft(now);

  const incident = new Date(`${draft.incident_date}T${draft.incident_time}:00+05:30`);
  const elapsed = (now.getTime() - incident.getTime()) / 60_000;

  assert.ok(elapsed > 0, 'the incident is before the filing, not after it');
  // Past the hour the alert policy correctly refuses to raise, and the
  // demonstration ends one stage early on what looks like a failure. The
  // margin is deliberate: the five-minute rounding in `defaultComplaintDraft`
  // pushes the incident further back, never nearer.
  assert.ok(
    elapsed < GOLDEN_HOUR_MINUTES,
    `default incident is ${elapsed} minutes back; the alert policy suppresses past ${GOLDEN_HOUR_MINUTES}`,
  );
});

test('an amount is parsed the way a person types one', () => {
  assert.equal(parseAmount('₹6,50,000'), 650000);
  assert.equal(parseAmount('650000.00'), 650000);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('nothing'), null);
  assert.equal(parseAmount('-5'), null, 'a complaint for a negative amount is not a complaint');
});

test('amounts are grouped the Indian way', () => {
  assert.equal(groupIndian(1840000), '18,40,000');
  assert.equal(groupIndian(650000), '6,50,000');
  assert.equal(groupIndian(999), '999');
});
