/**
 * The synthetic transaction ledger the demo complaint joins to.
 *
 * A template describes the *shape* of a layering chain — who paid whom, in what
 * order, over which rail, ending where — and holds each leg as a **fraction of
 * the disputed amount** rather than a rupee figure. That is the whole trick
 * behind requirement "one complaint, one case": the presenter can type any
 * amount into the NCRP form and the trail still adds up, because the amount is
 * supplied by the complaint and only the structure comes from here.
 *
 * Templates are keyed by transaction reference. `TXN001` is the seeded record
 * the demo defaults to; a reference nobody seeded still resolves, to a template
 * chosen deterministically from the reference itself, and `matched` says which
 * of the two happened so the console can state it rather than imply a database
 * hit that did not occur.
 *
 * Every account number, endpoint and timing below is invented. Nothing here
 * describes a real person, account, institution or event
 * (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md).
 */

import type { CashOutChannel } from '@/lib/graph/types';

import { requireEndpoint } from './endpoints';
import { hash32 } from './hash';

/** Slot names a template uses. The victim slot is filled from the complaint. */
export type SlotKey =
  | 'VICTIM'
  | 'MULE_A'
  | 'MULE_B'
  | 'MULE_C'
  | 'MULE_D'
  | 'MULE_E'
  | 'LINKED';

export interface TemplateAccount {
  /** Last four digits, which is what the masked account number is built from. */
  readonly digits: string;
  readonly bank: string;
  readonly role: 'MULE' | 'LINKED';
  readonly kycDistrict: string;
}

export interface TemplateLeg {
  readonly from: SlotKey;
  /** A slot for a transfer, an endpoint id for a withdrawal. */
  readonly to: SlotKey | { readonly endpoint: string };
  /** Share of the disputed amount that moves on this leg, on 0–1. */
  readonly fraction: number;
  /** Minutes after the incident timestamp the presenter entered. */
  readonly minutesAfterIncident: number;
  readonly rail: string;
  readonly depth: number;
}

export interface LedgerTemplate {
  readonly id: string;
  readonly description: string;
  /** Traversal depth ceiling the reconstruction was run under. */
  readonly maxDepth: number;
  readonly accounts: Readonly<Partial<Record<SlotKey, TemplateAccount>>>;
  readonly legs: readonly TemplateLeg[];
  /**
   * Paths, as leg indices. Written out rather than inferred so a template
   * author decides which branch is cut off by the depth ceiling and which
   * genuinely ended at a withdrawal — the two look identical on a canvas and
   * mean opposite things.
   */
  readonly paths: readonly { readonly legs: readonly number[]; readonly truncated: boolean }[];
}

/**
 * `TXN001` — the layering chain the demo script walks through.
 *
 * Two branches from the victim account, three cash-out attempts on two
 * channels, and one branch cut off by the depth ceiling, so `SEARCH_TRUNCATED`
 * sits next to a genuine terminal withdrawal and the two can be compared on
 * screen. The first-hop fractions sum to exactly 1: everything the victim lost
 * leaves the account, and the shrinkage further down is the cut each mule keeps.
 */
const TXN001: LedgerTemplate = {
  id: 'TXN001',
  description: 'Two-branch layering chain ending in ATM and BC-agent withdrawals',
  maxDepth: 3,
  accounts: {
    MULE_A: { digits: '4432', bank: 'Bank A', role: 'MULE', kycDistrict: 'North district' },
    MULE_B: { digits: '9910', bank: 'Bank B', role: 'MULE', kycDistrict: 'Central district' },
    LINKED: { digits: '3621', bank: 'Bank C', role: 'LINKED', kycDistrict: 'South district' },
    MULE_C: { digits: '7788', bank: 'Bank B', role: 'MULE', kycDistrict: 'Central district' },
    MULE_D: { digits: '5561', bank: 'Bank D', role: 'MULE', kycDistrict: 'West district' },
    MULE_E: { digits: '8804', bank: 'Bank A', role: 'MULE', kycDistrict: 'East district' },
  },
  legs: [
    // 0
    { from: 'VICTIM', to: 'MULE_A', fraction: 0.6, minutesAfterIncident: 6, rail: 'UPI', depth: 1 },
    // 1
    { from: 'VICTIM', to: 'MULE_C', fraction: 0.4, minutesAfterIncident: 11, rail: 'IMPS', depth: 1 },
    // 2
    { from: 'MULE_A', to: 'MULE_B', fraction: 0.36, minutesAfterIncident: 42, rail: 'IMPS', depth: 2 },
    // 3
    {
      from: 'MULE_A',
      to: { endpoint: 'EP_DEL_0783' },
      fraction: 0.22,
      minutesAfterIncident: 215,
      rail: 'CARD',
      depth: 2,
    },
    // 4
    { from: 'MULE_B', to: 'LINKED', fraction: 0.22, minutesAfterIncident: 95, rail: 'NEFT', depth: 3 },
    // 5
    {
      from: 'MULE_B',
      to: { endpoint: 'EP_DEL_1092' },
      fraction: 0.12,
      minutesAfterIncident: 168,
      rail: 'AEPS',
      depth: 3,
    },
    // 6
    { from: 'MULE_C', to: 'MULE_D', fraction: 0.37, minutesAfterIncident: 64, rail: 'IMPS', depth: 2 },
    // 7
    { from: 'MULE_D', to: 'MULE_E', fraction: 0.34, minutesAfterIncident: 131, rail: 'IMPS', depth: 3 },
  ],
  paths: [
    { legs: [0, 2, 4], truncated: true },
    { legs: [0, 2, 5], truncated: false },
    { legs: [0, 3], truncated: false },
    { legs: [1, 6, 7], truncated: true },
  ],
};

/**
 * `TXN002` — a single-corridor chain that leaves the filing district.
 *
 * Deliberately a different shape: one branch, deeper, and its only observed
 * withdrawal is 1,149 km from the complaint. Selecting this template on the
 * NCRP form is what shows that the ranking follows the trail rather than the
 * map's default ordering.
 */
const TXN002: LedgerTemplate = {
  id: 'TXN002',
  description: 'Single-corridor chain with an out-of-state cash-out',
  maxDepth: 3,
  accounts: {
    MULE_A: { digits: '2244', bank: 'Bank B', role: 'MULE', kycDistrict: 'Maharashtra region' },
    MULE_B: { digits: '9911', bank: 'Bank B', role: 'MULE', kycDistrict: 'Maharashtra region' },
    LINKED: { digits: '5510', bank: 'Bank C', role: 'LINKED', kycDistrict: 'Uttar Pradesh region' },
  },
  legs: [
    { from: 'VICTIM', to: 'MULE_A', fraction: 1.0, minutesAfterIncident: 4, rail: 'IMPS', depth: 1 },
    { from: 'MULE_A', to: 'MULE_B', fraction: 0.71, minutesAfterIncident: 38, rail: 'UPI', depth: 2 },
    { from: 'MULE_A', to: 'LINKED', fraction: 0.26, minutesAfterIncident: 51, rail: 'NEFT', depth: 2 },
    {
      from: 'MULE_B',
      to: { endpoint: 'EP_MUM_2841' },
      fraction: 0.62,
      minutesAfterIncident: 190,
      rail: 'CARD',
      depth: 3,
    },
  ],
  paths: [
    { legs: [0, 1, 3], truncated: false },
    { legs: [0, 2], truncated: true },
  ],
};

/**
 * `TXN003` — a shallow chain with no observed cash-out.
 *
 * Present so the evidence bands are reachable from the portal: a trail that
 * reconstructs but never reaches a withdrawal is weaker evidence than one that
 * does, and the console has to be able to say so with a real case rather than a
 * hand-set flag.
 */
const TXN003: LedgerTemplate = {
  id: 'TXN003',
  description: 'Shallow chain, no cash-out observed inside the depth ceiling',
  maxDepth: 2,
  accounts: {
    MULE_A: { digits: '6072', bank: 'Bank D', role: 'MULE', kycDistrict: 'East district' },
    MULE_B: { digits: '1184', bank: 'Bank A', role: 'MULE', kycDistrict: 'West district' },
  },
  legs: [
    { from: 'VICTIM', to: 'MULE_A', fraction: 0.55, minutesAfterIncident: 9, rail: 'UPI', depth: 1 },
    { from: 'VICTIM', to: 'MULE_B', fraction: 0.45, minutesAfterIncident: 16, rail: 'UPI', depth: 1 },
    { from: 'MULE_A', to: 'MULE_B', fraction: 0.5, minutesAfterIncident: 73, rail: 'IMPS', depth: 2 },
  ],
  paths: [
    { legs: [0, 2], truncated: true },
    { legs: [1], truncated: true },
  ],
};

export const LEDGER_TEMPLATES: readonly LedgerTemplate[] = [TXN001, TXN002, TXN003];

/**
 * Seeded transaction references, in the order the NCRP form offers them.
 *
 * These are the references that "exist" in the synthetic ledger. Anything else
 * the presenter types still works — see `resolveTemplate`.
 */
export const SEEDED_TRANSACTION_REFS = LEDGER_TEMPLATES.map((template) => template.id);

const BY_REF = new Map(LEDGER_TEMPLATES.map((template) => [template.id, template]));

export interface TemplateResolution {
  readonly template: LedgerTemplate;
  /** True when the reference named a seeded record rather than being hashed to one. */
  readonly matched: boolean;
}

/**
 * Resolve a transaction reference to a ledger template.
 *
 * An unmatched reference is not an error and not an empty state. It picks a
 * template by hashing the reference, so the same typed reference always yields
 * the same trail — a presenter who retypes `TXN777` after a reset sees the case
 * they saw before. `matched: false` travels with it so every screen that shows
 * the trail can say the reference was not in the ledger.
 */
export function resolveTemplate(transactionRef: string): TemplateResolution {
  const key = transactionRef.trim().toUpperCase();
  const seeded = BY_REF.get(key);
  if (seeded !== undefined) return { template: seeded, matched: true };

  const index = hash32(key) % LEDGER_TEMPLATES.length;
  // Non-null: `index` is a modulus of a non-empty array's length.
  return { template: LEDGER_TEMPLATES[index]!, matched: false };
}

/** Every endpoint a template can terminate at, resolved once. */
export function templateEndpointIds(template: LedgerTemplate): readonly string[] {
  const ids: string[] = [];
  for (const leg of template.legs) {
    if (typeof leg.to === 'object') {
      const id = requireEndpoint(leg.to.endpoint).id;
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/** The cash-out channels a template actually reaches. */
export function templateChannels(template: LedgerTemplate): readonly CashOutChannel[] {
  const channels: CashOutChannel[] = [];
  for (const id of templateEndpointIds(template)) {
    const channel = requireEndpoint(id).channel;
    if (!channels.includes(channel)) channels.push(channel);
  }
  return channels;
}
