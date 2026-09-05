/**
 * Synthetic case metadata for the money-trail console.
 *
 * **None of this comes from the trail.** `TrailPath` is a reconstruction of
 * where value moved; it carries no case id, no typology, no complaint time and
 * no amount at risk. Those belong to a complaint record, which this build has
 * no connection to, so they are declared here as an explicit fixture and joined
 * to the screen as context — never derived from the graph.
 *
 * That distinction matters more than it looks. "Amount at risk" computed from
 * the shape of a trail would be a number nobody could reproduce and everybody
 * would treat as a finding. It is a field on a complaint, or it is nothing.
 *
 * Every value is invented (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md). Nothing
 * here describes a real complaint, person, account or institution.
 */

export interface SyntheticCaseContext {
  readonly caseId: string;
  readonly typology: string;
  /**
   * Amount reported by the complainant.
   *
   * Carries its own currency, unlike a `TrailHop`, which projects none — which
   * is why this may render a ₹ and an edge caption may not.
   */
  readonly amountAtRisk: string;
  readonly currency: string;
  /** When the complaint was filed, as displayed. */
  readonly complaintTime: string;
  /**
   * Time since the complaint, as recorded on the fixture.
   *
   * Deliberately a fixed string rather than a live countdown: a ticking clock
   * against a fabricated complaint time would imply this console is tracking a
   * real golden hour, which it is not.
   */
  readonly goldenHour: string;
  readonly status: string;
}

export const SYNTHETIC_CASE: SyntheticCaseContext = {
  caseId: 'ATLAS-SYN-1042',
  typology: 'Synthetic Customer Care Fraud',
  amountAtRisk: '284000.00',
  currency: 'INR',
  complaintTime: '14 Jan 2026 · 09:42',
  goldenHour: '42 min elapsed',
  status: 'Investigating',
};
