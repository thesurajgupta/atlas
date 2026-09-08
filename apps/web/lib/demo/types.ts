/**
 * The single data contract shared by the NCRP portal and ATLAS.
 *
 * One complaint, one case, one derivation. Everything ATLAS shows about the
 * demo case — the trail, the network, the ranked endpoints, the alert — is a
 * *pure function* of the `NcrpComplaint` the presenter typed, computed by
 * `buildDemoCase`. Nothing downstream stores its own copy of an amount, an
 * account or a reference, which is what makes it impossible for the portal and
 * the console to disagree.
 *
 * Everything here is synthetic (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md). The
 * NCRP portal in this repository is a demonstration interface built for SIH; it
 * is not the National Cybercrime Reporting Portal and is not connected to it.
 */

import type { EntityLocationIndex } from '@/lib/graph/entity-location';
import type { CashOutChannel, TrailPath } from '@/lib/graph/types';
import type { Case, EvidenceSufficiency, Prediction } from '@/lib/types';

/** Fraud categories the demo portal offers, mapped to the ATLAS typology set. */
export const COMPLAINT_TYPES = [
  'Online Financial Fraud',
  'Digital Arrest / Impersonation of Authority',
  'Investment / Trading Scam',
  'UPI Collect Request Fraud',
  'Customer Care Number Fraud',
  'Loan App Harassment',
  'Job / Task-based Fraud',
  'Other Cyber Crime',
] as const;

export type ComplaintType = (typeof COMPLAINT_TYPES)[number];

/**
 * What the citizen filed. Every field is typed by the presenter, and every one
 * of them reaches ATLAS unchanged.
 *
 * `complaint_id` is minted at submission and is the join key for the whole
 * demo: the case, the prediction and the alert all carry it.
 */
export interface NcrpComplaint {
  /** `NCRP/2026/044178`. Minted once, at submission, and never regenerated. */
  readonly complaint_id: string;
  readonly complaint_type: ComplaintType;
  /** `YYYY-MM-DD`, as entered. */
  readonly incident_date: string;
  /** `HH:MM` (24h), as entered. */
  readonly incident_time: string;
  /** Whole rupees. Parsed once, here, so no page re-parses a formatted string. */
  readonly fraud_amount_inr: number;
  readonly victim_bank: string;
  /** Masked account reference as the citizen supplied it, e.g. `XXXX4471`. */
  readonly victim_account: string;
  /** The disputed debit reference, e.g. `TXN001`. Joins to the synthetic ledger. */
  readonly transaction_id: string;
  readonly mobile: string;
  readonly description: string;
  readonly state: string;
  readonly district: string;
  /** File *name* only. The demo never uploads or stores file contents. */
  readonly supporting_document: string | null;
  /** When Submit was pressed, ISO 8601. */
  readonly submitted_at: string;
}

/**
 * One row of the synthetic transaction ledger, materialised for a case.
 *
 * This is the record the "Source data" panel shows a judge who asks where the
 * prediction came from. Every field is either copied from the complaint or
 * derived from the ledger template by `buildDemoCase`.
 */
export interface LedgerTransaction {
  /** `TXN001`, `TXN001-02`, … The first leg carries the submitted reference verbatim. */
  readonly txn_ref: string;
  readonly from_entity_id: string;
  readonly from_account: string;
  readonly from_label: string;
  readonly to_entity_id: string;
  readonly to_account: string;
  readonly to_label: string;
  /** Whole rupees. */
  readonly amount_inr: number;
  /** ISO 8601 with +05:30 offset — the demo is stated in IST throughout. */
  readonly occurred_at: string;
  readonly rail: string;
  readonly type: 'TRANSFER' | 'CASH_WITHDRAWAL';
  readonly channel: CashOutChannel | null;
  /** Where the money left the traceable system; `null` for a transfer. */
  readonly location: string | null;
  /** 1-based hop count from the victim account. */
  readonly depth: number;
}

/** An account on the reconstructed trail. */
export interface LedgerAccount {
  readonly entity_id: string;
  readonly account_number: string;
  readonly bank: string;
  readonly label: string;
  readonly role: 'VICTIM' | 'MULE' | 'LINKED';
  readonly kyc_district: string;
}

/**
 * A ranked cash-out candidate, joined to its catalogue entry.
 *
 * `score` is a prototype heuristic over reproducible features — not a
 * calibrated probability. `features` carries the exact inputs so the ranking
 * can be shown, not just asserted.
 */
export interface RankedLocation {
  readonly rank: number;
  readonly endpoint_id: string;
  readonly entity_id: string;
  readonly name: string;
  readonly kind: 'ATM' | 'Branch';
  readonly operator: string;
  readonly area: string;
  readonly channel: CashOutChannel;
  readonly distance_km: number;
  readonly score: number;
  readonly risk: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Predicted cash-out window, ISO 8601. */
  readonly window_start: string;
  readonly window_end: string;
  /** Whether a trail account was actually observed withdrawing here. */
  readonly observed_on_trail: boolean;
  readonly features: readonly { readonly name: string; readonly value: number; readonly weight: number }[];
  readonly reasons: readonly string[];
}

/** The alert the policy raised for this case. */
export interface DemoAlert {
  readonly alert_id: string;
  readonly case_id: string;
  readonly complaint_id: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly amount_inr: number;
  readonly endpoint_id: string;
  readonly endpoint_name: string;
  readonly score: number;
  readonly window_start: string;
  readonly window_end: string;
  readonly issued_at: string;
  /** Composed once, carrying quantity and window, and rendered whole. */
  readonly reason: string;
}

/** The reproducible inputs the ranker saw. Shown on the pipeline page. */
export interface CaseFeatures {
  readonly amount_at_risk_inr: number;
  readonly hop_count: number;
  readonly account_count: number;
  readonly max_depth: number;
  readonly layering_span_minutes: number;
  readonly observed_cash_outs: number;
  readonly observed_channels: readonly CashOutChannel[];
  readonly retained_fraction: number;
  readonly truncated_paths: number;
  readonly golden_hour_minutes: number;
}

/**
 * Everything ATLAS knows about the demo case, derived in one place.
 *
 * Held as a single value so a page cannot pick up half of it: if a screen shows
 * `case_id` it is showing this object's `case_id`, and there is no second
 * source to drift from.
 */
export interface DemoCase {
  readonly complaint: NcrpComplaint;
  readonly case_id: string;
  readonly created_at: string;
  /** Whether the submitted transaction reference matched a seeded ledger record. */
  readonly ledger_match: boolean;
  readonly ledger_template: string;
  readonly accounts: readonly LedgerAccount[];
  readonly transactions: readonly LedgerTransaction[];
  readonly trail_paths: readonly TrailPath[];
  readonly entity_locations: EntityLocationIndex;
  readonly origin_entity_id: string;
  readonly max_depth: number;
  readonly as_of: string;
  readonly features: CaseFeatures;
  readonly evidence_sufficiency: EvidenceSufficiency;
  readonly locations: readonly RankedLocation[];
  readonly prediction: Prediction;
  /** The same case in the shape every existing ATLAS page already renders. */
  readonly atlas_case: Case;
  readonly alert: DemoAlert;
}
