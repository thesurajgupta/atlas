/**
 * What the reporting portal records.
 *
 * This is the *citizen's* half of the demonstration and nothing more. ATLAS's
 * side of the story — the case, the trail, the ranking, the alert — is built by
 * `lib/run-investigation` against the real API and held in `lib/demo-run`.
 * There is deliberately no second copy of any of it here.
 *
 * What does live here is the handful of fields a complainant supplies that the
 * API has no column for: which bank, which masked account, which disputed
 * transaction reference, which mobile number, which attachment. ATLAS never
 * receives those — it forecasts the cash-out leg of reported fraud and does not
 * score individuals (`docs/NON-GOALS.md`) — but the portal has to be able to
 * show a citizen the complaint they filed, so the portal keeps them.
 *
 * The join between the two halves is `complaint_id`: it is passed to
 * `runInvestigation` as `caseRef`, and every ATLAS screen is keyed on it.
 *
 * Everything here is synthetic and typed by the presenter. This portal is a
 * demonstration interface built for SIH; it is not the National Cybercrime
 * Reporting Portal and is not connected to it.
 */

/** Fraud categories the portal offers, in NCRP's own vocabulary. */
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

export interface NcrpComplaint {
  /**
   * `NCRP/2026/044178`. Minted once, at submission.
   *
   * The only value in the flow that is not derived from something else, and the
   * key everything downstream is keyed on: it becomes `case_ref` on the
   * complaint the API stores, on the trail built for it, and on the alert the
   * policy decides. One reference, one case.
   */
  readonly complaint_id: string;
  readonly complaint_type: ComplaintType;
  /** `YYYY-MM-DD`, as entered. */
  readonly incident_date: string;
  /** `HH:MM` (24h), as entered. */
  readonly incident_time: string;
  /** Whole rupees. Parsed once, here, so no screen re-parses a formatted string. */
  readonly fraud_amount_inr: number;
  readonly victim_bank: string;
  /** Masked account reference as the citizen supplied it, e.g. `XXXX4471`. */
  readonly victim_account: string;
  /** The disputed debit reference, e.g. `TXN001`. */
  readonly transaction_id: string;
  readonly mobile: string;
  readonly description: string;
  readonly state: string;
  readonly district: string;
  /** File *name* only. The demo never reads or uploads file contents. */
  readonly supporting_document: string | null;
  /** When Submit was pressed, ISO 8601. */
  readonly submitted_at: string;
}
