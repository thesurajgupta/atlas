/**
 * Opening values for the NCRP complaint form.
 *
 * They are defaults, not fixtures: every field on the form is editable, and the
 * case ATLAS builds uses whatever the presenter actually typed. This module
 * exists so a demo can be started in one click without anybody memorising an
 * account number under stage lights.
 *
 * ## Why the incident time is relative
 *
 * The synthetic ledger lays its legs out at fixed offsets from the incident —
 * the last one three and a half hours later — and a trail may only be walked
 * over movements that were observable when it was reconstructed. Defaulting the
 * incident to five hours ago puts every leg behind the filing instant and every
 * predicted window ahead of it, which is the case the product is actually for:
 * the layering has happened, the cash-out has not.
 *
 * A fixed calendar date would drift out of that relationship the day after it
 * was written, so it is computed instead. It must be computed **on the client**
 * — see `NcrpComplaintForm`, which fills these in from an effect. A wall-clock
 * value in a render pass would differ between the server pass and the browser
 * and React would discard the tree.
 */

import { COMPLAINT_TYPES, type ComplaintType } from './types';

export interface ComplaintDraft {
  complaint_type: ComplaintType;
  incident_date: string;
  incident_time: string;
  /** Free text so a presenter can type `18,40,000`; parsed once at submission. */
  fraud_amount: string;
  victim_bank: string;
  victim_account: string;
  transaction_id: string;
  mobile: string;
  state: string;
  district: string;
  description: string;
  supporting_document: string | null;
}

/** How far before filing the default incident sits. See the module docstring. */
const DEFAULT_INCIDENT_LAG_HOURS = 5;

const pad = (n: number) => String(n).padStart(2, '0');

export function defaultComplaintDraft(now: Date = new Date()): ComplaintDraft {
  const incident = new Date(now.getTime() - DEFAULT_INCIDENT_LAG_HOURS * 60 * 60_000);
  // Rounded to five minutes so the timestamps on screen read like something a
  // person reported rather than a machine stamped.
  incident.setMinutes(Math.floor(incident.getMinutes() / 5) * 5, 0, 0);

  return {
    complaint_type: COMPLAINT_TYPES[0],
    incident_date: `${incident.getFullYear()}-${pad(incident.getMonth() + 1)}-${pad(incident.getDate())}`,
    incident_time: `${pad(incident.getHours())}:${pad(incident.getMinutes())}`,
    fraud_amount: '1840000',
    victim_bank: 'Example Bank',
    victim_account: 'XXXX4471',
    transaction_id: 'TXN001',
    mobile: '98XXXXXX21',
    state: 'Delhi',
    district: 'North district',
    description:
      'Received a call from a person claiming to be from the bank fraud department. ' +
      'They asked me to verify a blocked transaction and read out an OTP. ' +
      'Money left my account in two transfers within a few minutes.',
    supporting_document: null,
  };
}

/**
 * Parse an amount the way a person types one: `18,40,000`, `₹18,40,000`,
 * `1840000.00` all mean the same thing.
 *
 * Returns `null` rather than `NaN` or `0` for something unparseable, so the
 * form can refuse to submit instead of filing a complaint for nothing.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/** `1840000` → `18,40,000` — Indian grouping, which `Intl` does not do by default. */
export function groupIndian(value: number): string {
  const digits = Math.abs(Math.round(value)).toString();
  if (digits.length <= 3) return (value < 0 ? '-' : '') + digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${value < 0 ? '-' : ''}${rest},${last3}`;
}

/** `₹18,40,000`. */
export const rupees = (value: number): string => `₹${groupIndian(value)}`;

/**
 * Compact rupees for a dense strip: `₹18.40 L`, `₹1.24 Cr`.
 *
 * Only used where a full figure would not fit. Anywhere the exact amount
 * matters — the fact strip, the alert, the source-data panel — shows `rupees`.
 */
export function rupeesShort(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)} L`;
  return rupees(value);
}
