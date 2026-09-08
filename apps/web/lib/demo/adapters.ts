/**
 * Adapters from the demo case into the shapes the existing ATLAS components
 * already render.
 *
 * They exist so no screen has to be rewritten to show a referred complaint. The
 * money-trail canvas, the network graph and the prediction panel were built
 * against `TrailPath`, `SyntheticCaseContext` and `Prediction`; `buildDemoCase`
 * produces exactly those, and everything below is the small amount of
 * relabelling left over.
 *
 * Nothing here computes a fact. If a value appears in an adapter it was already
 * on the case.
 */

import { formatCurrencyAmount } from '@/lib/graph/decimal';
import type { SyntheticCaseContext } from '@/lib/graph/synthetic-case';

import { groupIndian } from './defaults';
import type { DemoCase } from './types';

/** `2026-09-08T14:05:00+05:30` → `08 Sep 2026 · 14:05`. */
function displayInstant(iso: string): string {
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  // Sliced out of the string rather than formatted through `Intl`: the console
  // quotes hop times to the minute, and a locale-formatted instant would render
  // differently on the server and the client and shift the times under the
  // investigator.
  const [date = '', time = ''] = iso.split('T');
  const [year = '', month = '01', day = '01'] = date.split('-');
  return `${day} ${MONTHS[Number(month) - 1] ?? month} ${year} · ${time.slice(0, 5)}`;
}

/**
 * The case strip above the money-trail canvas.
 *
 * `amountAtRisk` is the complaint's figure and carries its own currency, which
 * is what entitles the strip to print a ₹ next to it. The canvas's own "visible
 * flow" total stays a bare number for the opposite reason — a hop projects no
 * currency — and the two must not be made to look like one figure.
 */
export function caseContextFor(demoCase: DemoCase): SyntheticCaseContext {
  const { complaint, features } = demoCase;
  return {
    caseId: demoCase.case_id,
    complaintRef: complaint.complaint_id,
    typology: complaint.complaint_type,
    amountAtRisk: `${complaint.fraud_amount_inr}.00`,
    currency: 'INR',
    complaintTime: displayInstant(complaint.submitted_at),
    goldenHour: `${features.golden_hour_minutes} min elapsed at filing`,
    status: demoCase.atlas_case.status.replace(/_/g, ' ').toLowerCase(),
  };
}

/** `₹18,40,000` from the case, without re-parsing the amount anywhere else. */
export const caseAmountLabel = (demoCase: DemoCase): string =>
  formatCurrencyAmount(`${demoCase.complaint.fraud_amount_inr}.00`, 'INR');

/** `18,40,000` — grouped digits with no symbol, for a dense column. */
export const caseAmountDigits = (demoCase: DemoCase): string =>
  groupIndian(demoCase.complaint.fraud_amount_inr);
