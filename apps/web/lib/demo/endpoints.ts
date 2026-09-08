/**
 * The cash-out endpoint catalogue — one list, read by every screen that ranks,
 * maps or alerts on an endpoint.
 *
 * It was previously declared inside `app/(dashboard)/map/page.tsx`. It moved
 * here unchanged so that the map, the ranked-locations page, the prediction and
 * the alert cannot name different places for the same case: a judge comparing
 * two tabs is exactly the reader who notices.
 *
 * Every endpoint is synthetic. The geography is real — the map draws real
 * satellite imagery and the distances are true distances — but no premises,
 * operator or ward described below exists, and nothing here was derived from
 * real data (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md).
 *
 * Two fields carry the prediction inputs:
 *
 * - `priorUtilisation` — how often this endpoint terminated a trail in the
 *   synthetic corpus, on 0–1. A property of the fixture, stated rather than
 *   learned; there is no trained ranker in this prototype.
 * - `baselineScore` — what the map showed before any case was loaded, kept so
 *   the page still renders with nothing selected. A case-derived score always
 *   overrides it.
 */

import type { CashOutChannel } from '@/lib/graph/types';

export interface CashOutEndpoint {
  readonly id: string;
  /**
   * The graph handle for this endpoint, exactly eight characters.
   *
   * `shortEntityLabel` renders the first eight characters of an entity id as
   * the node label, so a longer id truncates into something unreadable on the
   * canvas. Kept separate from `id` rather than shortening `id`, because `id`
   * is what the map, the ranked table and the alert all quote.
   */
  readonly entityId: string;
  readonly ref: string;
  readonly kind: 'ATM' | 'Branch';
  readonly channel: CashOutChannel;
  readonly operator: string;
  readonly area: string;
  readonly district: string;
  readonly distanceKm: number;
  /** Bearing from the last confirmed hop, clockwise from true north. */
  readonly bearing: number;
  readonly priorUtilisation: number;
  /** Typical single-visit withdrawal ceiling, in rupees. */
  readonly withdrawalCeilingInr: number;
  readonly baselineScore: number;
  readonly priority: 'high' | 'medium' | 'low';
  readonly factors: readonly { readonly label: string; readonly weight: number }[];
  /** Prior activity recorded *at the endpoint*. Never case data. */
  readonly activity: readonly {
    readonly at: string;
    readonly amount: string;
    readonly account: string;
    readonly status: string;
  }[];
}

/**
 * The last confirmed hop: the centre of the search, and the point every
 * distance in this catalogue is measured from.
 *
 * A synthetic location at a real coordinate in the Delhi NCR region. Real, so
 * the scale bar and the distance column mean something against the ground under
 * them; synthetic in that no complaint put it there.
 */
export const SEARCH_ORIGIN = {
  latitude: 28.664,
  longitude: 77.312,
  label: 'the last confirmed hop',
} as const;

/** Search-radius rings, in kilometres. */
export const RING_RADII_KM = [2, 5, 10] as const;

export const CASH_OUT_ENDPOINTS: readonly CashOutEndpoint[] = [
  {
    id: 'EP_DEL_0783',
    entityId: 'ATM_0783',
    ref: 'Bank A ATM – Sector 12',
    kind: 'ATM',
    channel: 'ATM',
    operator: 'Bank A',
    area: 'Ward 3, North district',
    district: 'North district',
    distanceKm: 2.4,
    bearing: 34,
    priorUtilisation: 0.88,
    withdrawalCeilingInr: 400000,
    baselineScore: 92,
    priority: 'high',
    factors: [
      { label: 'Multiple mule accounts linked', weight: 25 },
      { label: 'High-value cash withdrawals', weight: 20 },
      { label: 'Transactions in short time frame', weight: 18 },
      { label: 'Matches known mule pattern', weight: 15 },
      { label: 'Proximity to other flagged endpoints', weight: 14 },
    ],
    activity: [
      { at: '05 Sep, 10:24', amount: '₹40,000', account: 'XXXX6789', status: 'Flagged' },
      { at: '05 Sep, 09:18', amount: '₹25,000', account: 'XXXX4321', status: 'Flagged' },
      { at: '04 Sep, 19:11', amount: '₹50,000', account: 'XXXX9876', status: 'Under review' },
      { at: '04 Sep, 18:33', amount: '₹20,000', account: 'XXXX3456', status: 'Normal' },
      { at: '03 Sep, 11:12', amount: '₹30,000', account: 'XXXX7890', status: 'Flagged' },
    ],
  },
  {
    id: 'EP_DEL_1092',
    entityId: 'BCA_1092',
    ref: 'Bank B BC agent – Ward 4',
    kind: 'Branch',
    channel: 'AEPS_BC',
    operator: 'Bank B',
    area: 'Ward 4, Central district',
    district: 'Central district',
    distanceKm: 4.8,
    bearing: 118,
    priorUtilisation: 0.7,
    withdrawalCeilingInr: 250000,
    baselineScore: 78,
    priority: 'high',
    factors: [
      { label: 'Two trail accounts withdrew here', weight: 22 },
      { label: 'Night-window volume above median', weight: 19 },
      { label: 'Shared operator device fingerprint', weight: 16 },
    ],
    activity: [
      { at: '05 Sep, 08:02', amount: '₹35,000', account: 'XXXX1122', status: 'Flagged' },
      { at: '04 Sep, 22:47', amount: '₹45,000', account: 'XXXX7788', status: 'Under review' },
    ],
  },
  {
    id: 'EP_DEL_2210',
    entityId: 'BRN_2210',
    ref: 'Bank C Branch – Ward 9',
    kind: 'Branch',
    channel: 'BANK_BRANCH',
    operator: 'Bank C',
    area: 'Ward 9, South district',
    district: 'South district',
    distanceKm: 6.1,
    bearing: 205,
    priorUtilisation: 0.62,
    withdrawalCeilingInr: 500000,
    baselineScore: 64,
    priority: 'medium',
    factors: [
      { label: 'One trail account holds an account here', weight: 20 },
      { label: 'Counter withdrawals rising over 14 days', weight: 14 },
    ],
    activity: [
      { at: '03 Sep, 11:12', amount: '₹30,000', account: 'XXXX7890', status: 'Flagged' },
    ],
  },
  {
    id: 'EP_DEL_3341',
    entityId: 'BCA_3341',
    ref: 'Bank A BC agent – Ward 7',
    kind: 'Branch',
    channel: 'AEPS_BC',
    operator: 'Bank A',
    area: 'Ward 7, North district',
    district: 'North district',
    distanceKm: 9.3,
    bearing: 302,
    priorUtilisation: 0.44,
    withdrawalCeilingInr: 200000,
    baselineScore: 52,
    priority: 'medium',
    factors: [
      { label: 'AePS volume above agent median', weight: 17 },
      { label: 'Proximity only — no trail account seen', weight: 9 },
    ],
    activity: [],
  },
  {
    id: 'EP_DEL_4408',
    entityId: 'ATM_4408',
    ref: 'Bank D ATM – Ward 12',
    kind: 'ATM',
    channel: 'ATM',
    operator: 'Bank D',
    area: 'Ward 12, West district',
    district: 'West district',
    distanceKm: 12.7,
    bearing: 248,
    priorUtilisation: 0.24,
    withdrawalCeilingInr: 100000,
    baselineScore: 31,
    priority: 'low',
    factors: [{ label: 'Within outer search radius only', weight: 8 }],
    activity: [],
  },
  {
    id: 'EP_DEL_5127',
    entityId: 'BRN_5127',
    ref: 'Bank B Branch – Ward 5',
    kind: 'Branch',
    channel: 'BANK_BRANCH',
    operator: 'Bank B',
    area: 'Ward 5, East district',
    district: 'East district',
    distanceKm: 14.2,
    bearing: 76,
    priorUtilisation: 0.2,
    withdrawalCeilingInr: 300000,
    baselineScore: 26,
    priority: 'low',
    factors: [{ label: 'Within outer search radius only', weight: 7 }],
    activity: [],
  },

  /* --- out-of-district candidates ---------------------------------------
   *
   * A cash-out is not bounded by the district the complaint was filed in.
   * Mule networks move value between states precisely because that is where a
   * jurisdiction boundary sits, so a screen that only ever drew the local ring
   * would hide a case's most interesting candidates.
   */
  {
    id: 'EP_MUM_2841',
    entityId: 'ATM_2841',
    ref: 'Bank B ATM – Ward 2',
    kind: 'ATM',
    channel: 'ATM',
    operator: 'Bank B',
    area: 'Ward 2, Maharashtra region',
    district: 'Maharashtra region',
    distanceKm: 1149,
    bearing: 203.8,
    priorUtilisation: 0.66,
    withdrawalCeilingInr: 300000,
    baselineScore: 71,
    priority: 'high',
    factors: [
      { label: 'Trail account opened in this circle', weight: 21 },
      { label: 'Operator seen in two earlier cases', weight: 18 },
      { label: 'Withdrawal window matches the pattern', weight: 15 },
    ],
    activity: [
      { at: '05 Sep, 07:41', amount: '₹48,000', account: 'XXXX2244', status: 'Flagged' },
      { at: '04 Sep, 21:05', amount: '₹42,000', account: 'XXXX9911', status: 'Under review' },
    ],
  },
  {
    id: 'EP_LKO_3390',
    entityId: 'ATM_3390',
    ref: 'Bank C ATM – Ward 8',
    kind: 'ATM',
    channel: 'ATM',
    operator: 'Bank C',
    area: 'Ward 8, Uttar Pradesh region',
    district: 'Uttar Pradesh region',
    distanceKm: 412.7,
    bearing: 117.3,
    priorUtilisation: 0.52,
    withdrawalCeilingInr: 200000,
    baselineScore: 58,
    priority: 'medium',
    factors: [
      { label: 'One trail account withdrew in this circle', weight: 19 },
      { label: 'Volume above circle median', weight: 12 },
    ],
    activity: [
      { at: '04 Sep, 16:22', amount: '₹28,000', account: 'XXXX5510', status: 'Under review' },
    ],
  },
  {
    id: 'EP_JAI_4712',
    entityId: 'BRN_4712',
    ref: 'Bank A Branch – Ward 1',
    kind: 'Branch',
    channel: 'BANK_BRANCH',
    operator: 'Bank A',
    area: 'Ward 1, Rajasthan region',
    district: 'Rajasthan region',
    distanceKm: 244.1,
    bearing: 220.3,
    priorUtilisation: 0.49,
    withdrawalCeilingInr: 400000,
    baselineScore: 55,
    priority: 'medium',
    factors: [
      { label: 'Counter withdrawals rising over 14 days', weight: 16 },
      { label: 'Shared operator device fingerprint', weight: 13 },
    ],
    activity: [],
  },
  {
    id: 'EP_KOL_5508',
    entityId: 'ATM_5508',
    ref: 'Bank D ATM – Ward 11',
    kind: 'ATM',
    channel: 'ATM',
    operator: 'Bank D',
    area: 'Ward 11, West Bengal region',
    district: 'West Bengal region',
    distanceKm: 1299,
    bearing: 118.6,
    priorUtilisation: 0.4,
    withdrawalCeilingInr: 150000,
    baselineScore: 47,
    priority: 'medium',
    factors: [{ label: 'AePS volume above agent median', weight: 15 }],
    activity: [],
  },
  {
    id: 'EP_PAT_6134',
    entityId: 'BCA_6134',
    ref: 'Bank C BC agent – Ward 14',
    kind: 'Branch',
    channel: 'AEPS_BC',
    operator: 'Bank C',
    area: 'Ward 14, Bihar region',
    district: 'Bihar region',
    distanceKm: 846.3,
    bearing: 111.2,
    priorUtilisation: 0.31,
    withdrawalCeilingInr: 100000,
    baselineScore: 38,
    priority: 'low',
    factors: [{ label: 'AePS volume above agent median', weight: 11 }],
    activity: [],
  },
  {
    id: 'EP_NAG_6820',
    entityId: 'ATM_6820',
    ref: 'Bank A ATM – Ward 6',
    kind: 'ATM',
    channel: 'ATM',
    operator: 'Bank A',
    area: 'Ward 6, Madhya Pradesh region',
    district: 'Madhya Pradesh region',
    distanceKm: 849.3,
    bearing: 167,
    priorUtilisation: 0.27,
    withdrawalCeilingInr: 100000,
    baselineScore: 34,
    priority: 'low',
    factors: [{ label: 'Corridor endpoint only — no trail account seen', weight: 9 }],
    activity: [],
  },
  {
    id: 'EP_HYD_7266',
    entityId: 'BRN_7266',
    ref: 'Bank B Branch – Ward 10',
    kind: 'Branch',
    channel: 'BANK_BRANCH',
    operator: 'Bank B',
    area: 'Ward 10, Telangana region',
    district: 'Telangana region',
    distanceKm: 1252.1,
    bearing: 174,
    priorUtilisation: 0.22,
    withdrawalCeilingInr: 250000,
    baselineScore: 29,
    priority: 'low',
    factors: [{ label: 'Corridor endpoint only — no trail account seen', weight: 8 }],
    activity: [],
  },
  {
    id: 'EP_BLR_8093',
    entityId: 'ATM_8093',
    ref: 'Bank D ATM – Ward 13',
    kind: 'ATM',
    channel: 'ATM',
    operator: 'Bank D',
    area: 'Ward 13, Karnataka region',
    district: 'Karnataka region',
    distanceKm: 1738.8,
    bearing: 178.8,
    priorUtilisation: 0.18,
    withdrawalCeilingInr: 100000,
    baselineScore: 24,
    priority: 'low',
    factors: [{ label: 'Corridor endpoint only — no trail account seen', weight: 7 }],
    activity: [],
  },
];

const BY_ID = new Map(CASH_OUT_ENDPOINTS.map((endpoint) => [endpoint.id, endpoint]));

export function endpointById(id: string): CashOutEndpoint | undefined {
  return BY_ID.get(id);
}

/**
 * Look an endpoint up, and fail loudly if it is missing.
 *
 * The ledger templates name endpoints by id, so a typo there would otherwise
 * surface as a node with no location halfway down a money trail rather than at
 * the line that has the mistake in it.
 */
export function requireEndpoint(id: string): CashOutEndpoint {
  const endpoint = BY_ID.get(id);
  if (endpoint === undefined) {
    throw new Error(`Unknown cash-out endpoint '${id}' — check lib/demo/endpoints.ts`);
  }
  return endpoint;
}
