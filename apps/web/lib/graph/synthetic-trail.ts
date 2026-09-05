/**
 * A synthetic money trail, for developing and demonstrating the graph view.
 *
 * Every identifier, amount and timestamp below is invented. Nothing here
 * describes a real person, account, institution or event, and no part of it is
 * derived from real data (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md). It exists so
 * the view can be exercised without a database, and it should be replaced by a
 * real query — never extended into a fixture that anybody mistakes for a case.
 *
 * The shape is chosen to exercise the cases that are easy to get wrong:
 *
 * - two branches from the victim account, so de-duplication has something to do
 * - two cash-outs on different channels, one ATM and one business correspondent
 * - one path cut off by the depth ceiling, so `SEARCH_TRUNCATED` is reachable
 *   next to a genuine `TERMINAL` and the two can be compared on screen
 */

import type { EntityLocationIndex } from './entity-location';
import type { TrailHop, TrailPath } from './types';

// Node labels are the first eight hex digits of the entity id, so these must
// differ in their *first* block — an earlier version varied only the last one
// and every node on the canvas rendered as the same string. Random v4 ids from
// the backend do not have this problem; hand-written fixtures do.
export const SYNTHETIC_ORIGIN_ENTITY_ID = 'facade01-5eed-4000-8a75-000000000001';
export const SYNTHETIC_AS_OF = '2026-03-20T18:00:00+05:30';
export const SYNTHETIC_MAX_DEPTH = 3;

const MULE_A = 'dec0de11-5eed-4000-8a75-000000000002';
const MULE_B = 'c0ffee21-5eed-4000-8a75-000000000003';
const MULE_C = 'da7aba31-5eed-4000-8a75-000000000004';
const MULE_D = 'fa15e041-5eed-4000-8a75-000000000005';
const MULE_E = 'b0bb1e51-5eed-4000-8a75-000000000006';
const ATM_ENDPOINT = 'a70f00d1-5eed-4000-8a75-000000000007';
const BC_ENDPOINT = 'bc5eed11-5eed-4000-8a75-000000000008';

const VICTIM_TO_A: TrailHop = {
  edge_id: '22222222-0000-4000-8000-000000000001',
  from_entity_id: SYNTHETIC_ORIGIN_ENTITY_ID,
  to_entity_id: MULE_A,
  edge_type: 'TRANSFERRED_TO',
  amount: '200000.00',
  occurred_at: '2026-03-18T10:04:00+05:30',
  channel: null,
  rail: 'UPI',
  depth: 1,
};

const VICTIM_TO_B: TrailHop = {
  edge_id: '22222222-0000-4000-8000-000000000002',
  from_entity_id: SYNTHETIC_ORIGIN_ENTITY_ID,
  to_entity_id: MULE_B,
  edge_type: 'TRANSFERRED_TO',
  amount: '150000.00',
  occurred_at: '2026-03-18T10:11:00+05:30',
  channel: null,
  rail: 'IMPS',
  depth: 1,
};

const A_TO_C: TrailHop = {
  edge_id: '22222222-0000-4000-8000-000000000003',
  from_entity_id: MULE_A,
  to_entity_id: MULE_C,
  edge_type: 'TRANSFERRED_TO',
  amount: '118000.00',
  occurred_at: '2026-03-18T12:40:00+05:30',
  channel: null,
  rail: 'IMPS',
  depth: 2,
};

const A_TO_ATM: TrailHop = {
  edge_id: '22222222-0000-4000-8000-000000000004',
  from_entity_id: MULE_A,
  to_entity_id: ATM_ENDPOINT,
  edge_type: 'WITHDREW_AT',
  amount: '80000.00',
  occurred_at: '2026-03-18T13:05:00+05:30',
  channel: 'ATM',
  rail: 'CARD',
  depth: 2,
};

const C_TO_BC: TrailHop = {
  edge_id: '22222222-0000-4000-8000-000000000005',
  from_entity_id: MULE_C,
  to_entity_id: BC_ENDPOINT,
  edge_type: 'WITHDREW_AT',
  amount: '112500.00',
  occurred_at: '2026-03-19T09:22:00+05:30',
  channel: 'AEPS_BC',
  rail: 'AEPS',
  depth: 3,
};

const B_TO_D: TrailHop = {
  edge_id: '22222222-0000-4000-8000-000000000006',
  from_entity_id: MULE_B,
  to_entity_id: MULE_D,
  edge_type: 'TRANSFERRED_TO',
  amount: '145000.00',
  occurred_at: '2026-03-18T15:18:00+05:30',
  channel: null,
  rail: 'NEFT',
  depth: 2,
};

const D_TO_E: TrailHop = {
  edge_id: '22222222-0000-4000-8000-000000000007',
  from_entity_id: MULE_D,
  to_entity_id: MULE_E,
  edge_type: 'TRANSFERRED_TO',
  amount: '140000.00',
  occurred_at: '2026-03-19T11:47:00+05:30',
  channel: null,
  rail: 'IMPS',
  depth: 3,
};

/**
 * Three maximal paths, as `assemble_paths` would return them.
 *
 * The third is `truncated`: it reached the depth ceiling still moving between
 * accounts, so whether the money went further is unknown — as opposed to the
 * first two, which end at a withdrawal because that is where the money left.
 */
export const SYNTHETIC_TRAIL_PATHS: readonly TrailPath[] = [
  { hops: [VICTIM_TO_A, A_TO_C, C_TO_BC], truncated: false },
  { hops: [VICTIM_TO_A, A_TO_ATM], truncated: false },
  { hops: [VICTIM_TO_B, B_TO_D, D_TO_E], truncated: true },
];

/**
 * Synthetic locations for the two cash-out endpoints.
 *
 * The coordinates are fabricated, and chosen to look it: whole and quarter
 * degrees, which no survey would ever produce. They are here so the entity
 * panel has something to draw, and they describe no real branch, agent, ATM or
 * premises. Every one is flagged `isSynthetic`, and the panel is required to
 * say so on screen.
 *
 * Only the endpoints are located. The origin and the intermediaries have no
 * entry, which exercises the "location not available" path — the normal state
 * for a trail, since a hop carries no geography at all.
 */
export const SYNTHETIC_ENTITY_LOCATIONS: EntityLocationIndex = new Map([
  [
    ATM_ENDPOINT,
    {
      latitude: 22.5,
      longitude: 78.5,
      displayLabel: 'Synthetic locality ALPHA',
      isSynthetic: true,
    },
  ],
  [
    BC_ENDPOINT,
    {
      latitude: 21.75,
      longitude: 79.25,
      displayLabel: 'Synthetic locality BRAVO',
      isSynthetic: true,
    },
  ],
]);
