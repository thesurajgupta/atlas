/**
 * One complaint in, one case out.
 *
 * `buildDemoCase` is the only place the demo turns an NCRP submission into
 * something ATLAS can render, and it is a **pure function of the complaint**.
 * Nothing here reads a clock, a random number or a second fixture, which is
 * what makes "the amount on the portal and the amount in the alert are the same
 * number" a property of the code rather than a thing somebody has to remember
 * to keep true.
 *
 * That purity is also why every screen may call it: two pages deriving the same
 * case from the same complaint necessarily agree, so no page needs to cache,
 * pass down, or re-fetch a copy.
 *
 * ## What is real and what is not
 *
 * The *structure* is a real reconstruction: the trail is walked from the
 * victim account, bounded at a stated instant, and every account, hop and
 * amount on screen comes from the ledger legs materialised below.
 *
 * The *ranking* is a stated heuristic over reproducible features, not a trained
 * model. There is no calibrated ranker in this prototype, and `MODEL_VERSION`
 * says so rather than borrowing a plausible-looking model name. Scores are
 * "predicted likelihood" in the sense of an ordering to task against; they are
 * not validated probabilities and nothing in the interface may call them that.
 */

import { destinationPoint } from '@/lib/geo';
import type { EntityLocation, EntityLocationIndex } from '@/lib/graph/entity-location';
import type {
  CashOutChannel,
  TrailHop,
  TrailPath,
} from '@/lib/graph/types';
import type {
  Case,
  ContributingFactor,
  EvidenceSufficiency,
  Prediction,
  PredictionCandidate,
  Typology,
} from '@/lib/types';

import { CASH_OUT_ENDPOINTS, SEARCH_ORIGIN, requireEndpoint, type CashOutEndpoint } from './endpoints';
import { hash32 } from './hash';
import { resolveTemplate, type LedgerTemplate, type SlotKey } from './ledger';
import type {
  CaseFeatures,
  ComplaintType,
  DemoAlert,
  DemoCase,
  LedgerAccount,
  LedgerTransaction,
  NcrpComplaint,
  RankedLocation,
} from './types';

/**
 * Named for what it is. There is no trained ranker here, and a version string
 * shaped like `tier2-lambdamart-…` would imply one exists (CLAUDE.md rule 4).
 */
export const MODEL_VERSION = 'prototype-rank-heuristic-v0 (not a trained model)';
export const HAZARD_VERSION = 'prototype-window-heuristic-v0 (not a trained model)';

/**
 * How many of the ranked endpoints the prediction actually emits as candidates.
 *
 * The whole catalogue is scored — see `locations` in `buildDemoCase` — but a
 * prediction that emitted every endpoint it looked at would be a list, not a
 * recommendation. Screens showing a short list take this many; the map, which
 * draws all of them anyway, uses the full ranking.
 */
export const RANKED_CANDIDATE_LIMIT = 6;

/** The demo runs in IST end to end, and says so rather than shifting silently. */
const IST_OFFSET = '+05:30';

/**
 * NCRP categories mapped onto the ATLAS typology vocabulary.
 *
 * The mapping is total and label-preserving where a category exists on both
 * sides: what the citizen picked is what the investigator reads. A category
 * with no ATLAS counterpart lands on `OTHER` rather than being nudged into the
 * nearest specific typology, because a wrong specific label is worse than an
 * honest generic one.
 */
const TYPOLOGY_BY_COMPLAINT_TYPE: Record<ComplaintType, Typology> = {
  'Online Financial Fraud': 'ONLINE_FINANCIAL_FRAUD',
  'Digital Arrest / Impersonation of Authority': 'DIGITAL_ARREST',
  'Investment / Trading Scam': 'INVESTMENT_SCAM',
  'UPI Collect Request Fraud': 'UPI_COLLECT_FRAUD',
  'Customer Care Number Fraud': 'CUSTOMER_CARE_IMPERSONATION',
  'Loan App Harassment': 'LOAN_APP_EXTORTION',
  'Job / Task-based Fraud': 'JOB_TASK_FRAUD',
  'Other Cyber Crime': 'OTHER',
};

/* ------------------------------------------------------------------ time */

/** `2026-09-04` + `19:04` → `2026-09-04T19:04:00+05:30`. */
export function istInstant(date: string, time: string): string {
  return `${date}T${time.length === 5 ? time : time.slice(0, 5)}:00${IST_OFFSET}`;
}

function addMinutes(iso: string, minutes: number): string {
  const shifted = new Date(Date.parse(iso) + minutes * 60_000);
  return toIstIso(shifted);
}

/**
 * An instant with its UTC fields shifted to read as the IST wall clock.
 *
 * The shift is what lets the rest of this module do calendar arithmetic — floor
 * to the hour, read off a date — in the zone the demo is stated in, using the
 * `getUTC*` accessors, which are the only ones that do not depend on the
 * machine's own zone.
 */
const asIstFields = (instant: Date): Date => new Date(instant.getTime() + 5.5 * 60 * 60_000);

/**
 * Render a shifted instant with an explicit `+05:30`.
 *
 * Built by hand rather than with `toLocaleString`, so the string is identical
 * on the server and in the browser. A locale-formatted timestamp here would
 * hydrate differently on a machine in another zone, and the hop times on the
 * money-trail canvas would shift under the investigator.
 */
function formatIstFields(ist: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}` +
    `T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}${IST_OFFSET}`
  );
}

const toIstIso = (instant: Date): string => formatIstFields(asIstFields(instant));

/**
 * Round an instant down to the hour **in IST** — predicted windows are stated
 * in whole hours, and an operator reads them off a wall clock in Delhi.
 *
 * Flooring the underlying UTC instant instead is the obvious mistake and lands
 * every window on `:30`, because the offset is not a whole number of hours.
 */
function floorToHour(iso: string): string {
  const ist = asIstFields(new Date(Date.parse(iso)));
  ist.setUTCMinutes(0, 0, 0);
  return formatIstFields(ist);
}

const minutesBetween = (from: string, to: string): number =>
  Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));

/* --------------------------------------------------------------- helpers */

/** The last four alphanumeric characters of an account reference, padded. */
function tail4(account: string): string {
  const cleaned = account.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.slice(-4).padStart(4, '0');
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Two decimal places, never more — §15.5 forbids unsupported precision. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/* ------------------------------------------------------- case identifiers */

/**
 * `NCRP/2026/044178` → `CASE-2026-044178`.
 *
 * Derived rather than minted so the complaint reference is legible inside the
 * case id. An investigator holding one can name the other without a lookup, and
 * a judge comparing two screens can see they are the same thing.
 */
export function caseIdForComplaint(complaintId: string): string {
  const parts = complaintId.split('/').filter((part) => part.length > 0);
  const serial = parts[parts.length - 1] ?? String(hash32(complaintId) % 1000000);
  const year = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  return `CASE-${year ?? '0000'}-${serial}`;
}

/* ------------------------------------------------------ ledger → the trail */

interface MaterialisedLeg {
  readonly index: number;
  readonly txn: LedgerTransaction;
  readonly hop: TrailHop;
  readonly observed: boolean;
}

function accountsFor(
  template: LedgerTemplate,
  complaint: NcrpComplaint,
): { victim: LedgerAccount; bySlot: Map<SlotKey, LedgerAccount> } {
  const victim: LedgerAccount = {
    entity_id: `VIC_${tail4(complaint.victim_account)}`,
    account_number: complaint.victim_account,
    bank: complaint.victim_bank,
    label: 'Victim account',
    role: 'VICTIM',
    kyc_district: complaint.district,
  };

  const bySlot = new Map<SlotKey, LedgerAccount>([['VICTIM', victim]]);
  // Counted over mule slots only. Incrementing on every account lets a linked
  // account consume a letter, and the chain reads "Mule A, Mule B, Mule D" —
  // which looks like a mule is missing from the trail.
  let muleIndex = 0;
  for (const [slot, account] of Object.entries(template.accounts) as [
    SlotKey,
    NonNullable<LedgerTemplate['accounts'][SlotKey]>,
  ][]) {
    let label: string;
    if (account.role === 'LINKED') {
      label = 'Linked account';
    } else {
      muleIndex += 1;
      label = `Mule ${String.fromCharCode(64 + muleIndex)}`;
    }
    bySlot.set(slot, {
      entity_id: `ACC_${account.digits}`,
      account_number: `XXXX${account.digits}`,
      bank: account.bank,
      label,
      role: account.role,
      kyc_district: account.kycDistrict,
    });
  }
  return { victim, bySlot };
}

/**
 * Turn template legs into ledger rows and trail hops.
 *
 * Rupee amounts are computed here and nowhere else. The depth-1 legs are
 * reconciled to the complaint amount exactly — the last one absorbs the
 * rounding residue — so "everything the victim lost left the account" is true
 * to the rupee rather than approximately true. Deeper legs are allowed to be
 * smaller than their inflow: that shrinkage is the cut each mule keeps, and it
 * is what `retained_fraction` reports.
 */
function materialiseLegs(
  template: LedgerTemplate,
  complaint: NcrpComplaint,
  bySlot: Map<SlotKey, LedgerAccount>,
  incidentAt: string,
  cutoff: string,
): readonly MaterialisedLeg[] {
  const amounts = template.legs.map((leg) => Math.round(leg.fraction * complaint.fraud_amount_inr));

  const firstHopIndices = template.legs
    .map((leg, index) => (leg.depth === 1 ? index : -1))
    .filter((index) => index >= 0);
  const firstHopTotal = firstHopIndices.reduce((sum, index) => sum + (amounts[index] ?? 0), 0);
  const lastFirstHop = firstHopIndices[firstHopIndices.length - 1];
  if (lastFirstHop !== undefined) {
    amounts[lastFirstHop] =
      (amounts[lastFirstHop] ?? 0) + (complaint.fraud_amount_inr - firstHopTotal);
  }

  const base = complaint.transaction_id.trim().toUpperCase();

  return template.legs.map((leg, index) => {
    const from = bySlot.get(leg.from);
    if (from === undefined) {
      throw new Error(`Ledger template '${template.id}' references undeclared slot '${leg.from}'`);
    }

    const isWithdrawal = typeof leg.to === 'object';
    const endpoint = isWithdrawal ? requireEndpoint((leg.to as { endpoint: string }).endpoint) : null;
    const toAccount = isWithdrawal ? null : bySlot.get(leg.to as SlotKey);
    if (!isWithdrawal && toAccount === undefined) {
      throw new Error(`Ledger template '${template.id}' references undeclared slot '${String(leg.to)}'`);
    }

    const amount = amounts[index] ?? 0;
    const occurredAt = addMinutes(incidentAt, leg.minutesAfterIncident);
    // The submitted reference names the first leg verbatim — that is the debit
    // the citizen actually disputed. Everything downstream is derived from it,
    // so a reference quoted anywhere in ATLAS traces back to the form.
    const txnRef = index === 0 ? base : `${base}-${String(index + 1).padStart(2, '0')}`;

    const txn: LedgerTransaction = {
      txn_ref: txnRef,
      from_entity_id: from.entity_id,
      from_account: from.account_number,
      from_label: from.label,
      to_entity_id: endpoint?.entityId ?? toAccount!.entity_id,
      to_account: endpoint?.id ?? toAccount!.account_number,
      to_label: endpoint?.ref ?? toAccount!.label,
      amount_inr: amount,
      occurred_at: occurredAt,
      rail: leg.rail,
      type: isWithdrawal ? 'CASH_WITHDRAWAL' : 'TRANSFER',
      channel: endpoint?.channel ?? null,
      location: endpoint?.area ?? null,
      depth: leg.depth,
    };

    const hop: TrailHop = {
      // A stable, legible edge id. The canvas maps an edge back to exactly one
      // ledger row, and the row is the one the Source data panel lists.
      edge_id: `EDGE-${txnRef}`,
      from_entity_id: txn.from_entity_id,
      to_entity_id: txn.to_entity_id,
      edge_type: isWithdrawal ? 'WITHDREW_AT' : 'TRANSFERRED_TO',
      amount: `${amount}.00`,
      occurred_at: occurredAt,
      channel: endpoint?.channel ?? null,
      rail: leg.rail,
      depth: leg.depth,
    };

    return { index, txn, hop, observed: Date.parse(occurredAt) <= Date.parse(cutoff) };
  });
}

/* ------------------------------------------------------------- prediction */

interface ScoredEndpoint {
  readonly endpoint: CashOutEndpoint;
  readonly score: number;
  readonly features: readonly { name: string; value: number; weight: number }[];
  readonly observedOnTrail: boolean;
  readonly districtMatch: boolean;
}

/**
 * Feature weights for the candidate ranker.
 *
 * Stated constants, not learned parameters. They sum to 1 so a score is a
 * weighted mean of five features each on 0–1, which is why a score can be read
 * as "how much of the available evidence points here" and must not be read as a
 * probability of a withdrawal occurring.
 */
const WEIGHTS = {
  prior_utilisation: 0.34,
  trail_linkage: 0.26,
  proximity: 0.18,
  channel_match: 0.12,
  amount_capacity: 0.1,
} as const;

function scoreEndpoints(
  complaint: NcrpComplaint,
  observedEndpointIds: ReadonlySet<string>,
  trailDistricts: ReadonlySet<string>,
  observedChannels: readonly CashOutChannel[],
): readonly ScoredEndpoint[] {
  // What one visit could plausibly take out: a quarter of the disputed amount.
  // A stated assumption, used only to prefer endpoints that could absorb this
  // case's residual over ones that structurally could not.
  const perVisit = Math.max(1, complaint.fraud_amount_inr * 0.25);

  return CASH_OUT_ENDPOINTS.map((endpoint) => {
    const observedOnTrail = observedEndpointIds.has(endpoint.id);
    const districtMatch = trailDistricts.has(endpoint.district);

    const trailLinkage = observedOnTrail ? 1 : districtMatch ? 0.55 : 0.15;
    // Decays with distance from the last confirmed hop. 40 km is the scale at
    // which a candidate stops being somewhere a local team can cover today.
    const proximity = Math.exp(-endpoint.distanceKm / 40);
    const channelMatch = observedChannels.includes(endpoint.channel) ? 1 : 0.45;
    const capacity = clamp01(endpoint.withdrawalCeilingInr / perVisit);

    const features = [
      { name: 'prior_utilisation', value: endpoint.priorUtilisation, weight: WEIGHTS.prior_utilisation },
      { name: 'trail_linkage', value: trailLinkage, weight: WEIGHTS.trail_linkage },
      { name: 'proximity_to_last_hop', value: proximity, weight: WEIGHTS.proximity },
      { name: 'channel_match', value: channelMatch, weight: WEIGHTS.channel_match },
      { name: 'amount_capacity_fit', value: capacity, weight: WEIGHTS.amount_capacity },
    ];

    const score = features.reduce((sum, f) => sum + f.value * f.weight, 0);
    return { endpoint, score: round2(score), features, observedOnTrail, districtMatch };
  })
    .slice()
    .sort((a, b) =>
      // Ties break on endpoint id, so the ordering is a function of the data and
      // not of array order — a list that reshuffles between two renders of the
      // same case cannot be screenshotted or cited.
      b.score - a.score || a.endpoint.id.localeCompare(b.endpoint.id),
    );
}

const riskOf = (score: number): 'HIGH' | 'MEDIUM' | 'LOW' =>
  score >= 0.75 ? 'HIGH' : score >= 0.5 ? 'MEDIUM' : 'LOW';

/**
 * The predicted cash-out window for a channel, anchored on the last observed
 * movement.
 *
 * Lag and span are stated per channel because they differ for real reasons: an
 * ATM is available all night and a bank counter is not. Both are assumptions of
 * this prototype, not measured hazard rates.
 */
const WINDOW_BY_CHANNEL: Record<CashOutChannel, { lagHours: number; spanHours: number }> = {
  ATM: { lagHours: 2, spanHours: 4 },
  AEPS_BC: { lagHours: 3, spanHours: 5 },
  BANK_BRANCH: { lagHours: 12, spanHours: 6 },
  POS_CASHBACK: { lagHours: 4, spanHours: 6 },
  MERCHANT_QR: { lagHours: 3, spanHours: 6 },
  PREPAID_GIFT: { lagHours: 5, spanHours: 8 },
  CRYPTO_P2P: { lagHours: 1, spanHours: 3 },
};

function windowFor(channel: CashOutChannel, lastMovementAt: string): { start: string; end: string } {
  const shape = WINDOW_BY_CHANNEL[channel];
  const start = floorToHour(addMinutes(lastMovementAt, shape.lagHours * 60));
  return { start, end: addMinutes(start, shape.spanHours * 60) };
}

/* ----------------------------------------------------------------- build */

export function buildDemoCase(complaint: NcrpComplaint): DemoCase {
  const { template, matched } = resolveTemplate(complaint.transaction_id);
  const incidentAt = istInstant(complaint.incident_date, complaint.incident_time);
  const { victim, bySlot } = accountsFor(template, complaint);

  /* --- point-in-time bound ------------------------------------------------
   *
   * A trail may only be walked over movements that were observable when it was
   * reconstructed, so the bound is the moment the complaint was filed.
   *
   * The guard exists because the presenter chooses the incident time. If they
   * report something that happened minutes ago, most of the synthetic chain has
   * not happened yet and the honest reconstruction is nearly empty — correct,
   * and useless to stand in front of. Rather than pretend, the horizon moves to
   * the end of the ledger chain and `horizon_extended` says it moved, so the
   * console can state that the ledger runs ahead of the filing instead of
   * quietly implying those hops were known at filing time.
   */
  const legTimes = template.legs.map((leg) => addMinutes(incidentAt, leg.minutesAfterIncident));
  const lastLegAt = legTimes.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest), incidentAt);
  const observableAtFiling = legTimes.filter(
    (at) => Date.parse(at) <= Date.parse(complaint.submitted_at),
  ).length;
  const horizonExtended = observableAtFiling < 2;
  const asOf = horizonExtended ? lastLegAt : complaint.submitted_at;

  const legs = materialiseLegs(template, complaint, bySlot, incidentAt, asOf);
  const observedLegs = legs.filter((leg) => leg.observed);

  /* --- paths --------------------------------------------------------------
   *
   * A path is cut at its first unobserved leg. `truncated` then carries both
   * reasons a path can stop early — the depth ceiling, or the point-in-time
   * bound — and both mean the same thing to an investigator: whether the money
   * went further is unknown. What must never happen is a path that stops
   * rendering like one that reached a withdrawal.
   */
  const legByIndex = new Map(legs.map((leg) => [leg.index, leg]));
  const trailPaths: TrailPath[] = [];
  for (const path of template.paths) {
    const hops: TrailHop[] = [];
    let cut = false;
    for (const index of path.legs) {
      const leg = legByIndex.get(index);
      if (leg === undefined || !leg.observed) {
        cut = true;
        break;
      }
      hops.push(leg.hop);
    }
    const [head, ...rest] = hops;
    if (head === undefined) continue;
    trailPaths.push({ hops: [head, ...rest], truncated: path.truncated || cut });
  }

  /* --- entities on the observed trail ------------------------------------ */

  const entityIdsOnTrail = new Set<string>();
  for (const leg of observedLegs) {
    entityIdsOnTrail.add(leg.hop.from_entity_id);
    entityIdsOnTrail.add(leg.hop.to_entity_id);
  }

  const accounts = [victim, ...[...bySlot.values()].filter((a) => a.role !== 'VICTIM')].filter((a) =>
    entityIdsOnTrail.has(a.entity_id),
  );
  // The victim account is on the case whether or not a hop was observed from
  // it — it is the complaint's subject, not a graph finding.
  if (!accounts.some((a) => a.entity_id === victim.entity_id)) accounts.unshift(victim);

  const observedEndpointIds = new Set(
    observedLegs
      .filter((leg) => leg.txn.type === 'CASH_WITHDRAWAL')
      .map((leg) => leg.txn.to_account),
  );
  const observedChannels: CashOutChannel[] = [];
  for (const leg of observedLegs) {
    const channel = leg.hop.channel;
    if (channel !== null && !observedChannels.includes(channel)) observedChannels.push(channel);
  }

  const trailDistricts = new Set(accounts.map((account) => account.kyc_district));

  /* --- endpoint locations, for the canvas --------------------------------- */

  const entityLocations: Map<string, EntityLocation> = new Map();
  for (const endpointId of observedEndpointIds) {
    const endpoint = requireEndpoint(endpointId);
    const point = destinationPoint(SEARCH_ORIGIN, endpoint.bearing, endpoint.distanceKm);
    entityLocations.set(endpoint.entityId, {
      latitude: point.latitude,
      longitude: point.longitude,
      displayLabel: endpoint.ref,
      isSynthetic: true,
    });
  }

  /* --- features ----------------------------------------------------------- */

  const hopTimes = observedLegs.map((leg) => leg.hop.occurred_at).sort();
  const firstHopAt = hopTimes[0] ?? incidentAt;
  const lastHopAt = hopTimes[hopTimes.length - 1] ?? incidentAt;

  const withdrawnTotal = observedLegs
    .filter((leg) => leg.txn.type === 'CASH_WITHDRAWAL')
    .reduce((sum, leg) => sum + leg.txn.amount_inr, 0);
  const depth1Total = observedLegs
    .filter((leg) => leg.hop.depth === 1)
    .reduce((sum, leg) => sum + leg.txn.amount_inr, 0);

  const features: CaseFeatures = {
    amount_at_risk_inr: complaint.fraud_amount_inr,
    hop_count: observedLegs.length,
    account_count: accounts.length,
    max_depth: observedLegs.reduce((peak, leg) => Math.max(peak, leg.hop.depth), 0),
    layering_span_minutes: minutesBetween(firstHopAt, lastHopAt),
    observed_cash_outs: observedEndpointIds.size,
    observed_channels: observedChannels,
    // What did not leave as cash, of what left the victim account. Zero
    // withdrawals means the whole amount is still inside the banking system as
    // far as this reconstruction can see — which is the actionable case.
    retained_fraction: depth1Total === 0 ? 1 : round2(1 - withdrawnTotal / depth1Total),
    truncated_paths: trailPaths.filter((path) => path.truncated).length,
    golden_hour_minutes: minutesBetween(incidentAt, complaint.submitted_at),
  };

  /* --- evidence band ------------------------------------------------------
   *
   * §16.2: the band is a statement about what the case actually contains, and
   * §25.3 requires the four bands to render differently. An unmatched
   * transaction reference costs one band: the trail below it is a plausible
   * reconstruction of a reference nothing in the ledger has ever seen, and that
   * is weaker evidence than the same shape backed by a record.
   */
  let band: EvidenceSufficiency =
    features.observed_cash_outs >= 2 && features.hop_count >= 5
      ? 'STRONG'
      : features.observed_cash_outs >= 1
        ? 'MODERATE'
        : features.hop_count >= 2
          ? 'WEAK'
          : 'INSUFFICIENT';
  if (!matched) {
    band = band === 'STRONG' ? 'MODERATE' : band === 'MODERATE' ? 'WEAK' : band;
  }

  /* --- ranked candidates --------------------------------------------------- */

  const scored = scoreEndpoints(complaint, observedEndpointIds, trailDistricts, observedChannels);

  /**
   * **Every endpoint in the catalogue is ranked, not just the top few.**
   *
   * The map draws all of them, and if only the leaders carried a case score the
   * rest would fall back to their catalogue baseline — which is a *different*
   * ordering. The map's third row would then not be the ranked list's third
   * row, on the one screen pair a reader is most likely to compare. So the
   * ranking is complete here, and the screens that show a short list take the
   * head of it (`RANKED_CANDIDATE_LIMIT`).
   */
  const locations: RankedLocation[] = scored.map((entry, index) => {
    const { endpoint } = entry;
    const predicted = windowFor(endpoint.channel, lastHopAt);
    const reasons: string[] = [];
    if (entry.observedOnTrail) {
      const withdrawal = observedLegs.find((leg) => leg.txn.to_account === endpoint.id);
      reasons.push(
        withdrawal
          ? `A trail account withdrew ₹${withdrawal.txn.amount_inr.toLocaleString('en-IN')} here at ${withdrawal.txn.occurred_at.slice(11, 16)} on ${withdrawal.txn.occurred_at.slice(0, 10)}.`
          : 'A trail account withdrew here inside the reconstruction window.',
      );
    } else if (entry.districtMatch) {
      reasons.push(
        `Sits in ${endpoint.district}, the KYC district of an account on this trail — no withdrawal has been seen here on this case.`,
      );
    } else {
      reasons.push(
        'Reached only through the corridor rung: no account on this trail has been seen here or registered in this district.',
      );
    }
    reasons.push(
      `${endpoint.distanceKm < 100 ? `${endpoint.distanceKm.toFixed(1)} km` : `${Math.round(endpoint.distanceKm).toLocaleString('en-IN')} km`} from the last confirmed hop.`,
    );
    reasons.push(
      observedChannels.includes(endpoint.channel)
        ? `Cash left this case through ${endpoint.channel.replace(/_/g, ' ')} already.`
        : `No ${endpoint.channel.replace(/_/g, ' ')} withdrawal has been seen on this case.`,
    );

    return {
      rank: index + 1,
      endpoint_id: endpoint.id,
      entity_id: endpoint.entityId,
      name: endpoint.ref,
      kind: endpoint.kind,
      operator: endpoint.operator,
      area: endpoint.area,
      channel: endpoint.channel,
      distance_km: endpoint.distanceKm,
      score: entry.score,
      risk: riskOf(entry.score),
      window_start: predicted.start,
      window_end: predicted.end,
      observed_on_trail: entry.observedOnTrail,
      features: entry.features,
      reasons,
    };
  });

  /* --- prediction, in the shape the existing ATLAS components render ------- */

  const factorsFor = (location: RankedLocation): ContributingFactor[] => {
    const named = new Map(location.features.map((f) => [f.name, f]));
    const linkage = named.get('trail_linkage');
    const prior = named.get('prior_utilisation');
    const proximity = named.get('proximity_to_last_hop');

    const factors: ContributingFactor[] = [];
    if (linkage !== undefined) {
      factors.push({
        feature: 'trail_linkage',
        contribution: round2(linkage.value * linkage.weight),
        direction: '+',
        // §25.4: a sentence carrying a quantity and a window, never a raw score.
        sentence: `₹${complaint.fraud_amount_inr.toLocaleString('en-IN')} moved through ${features.account_count} accounts in ${Math.floor(features.layering_span_minutes / 60)}h ${features.layering_span_minutes % 60}m. ${location.reasons[0] ?? ''}`,
      });
    }
    if (prior !== undefined) {
      factors.push({
        feature: 'prior_utilisation',
        contribution: round2(prior.value * prior.weight),
        direction: '+',
        sentence: `This endpoint terminated ${Math.round(prior.value * 100)}% of comparable trails in the synthetic corpus.`,
      });
    }
    if (proximity !== undefined) {
      factors.push({
        feature: 'proximity_to_last_hop',
        contribution: round2(proximity.value * proximity.weight),
        direction: '+',
        sentence: location.reasons[1] ?? '',
      });
    }
    return factors;
  };

  const candidates: PredictionCandidate[] = (
    band === 'INSUFFICIENT' ? [] : locations.slice(0, RANKED_CANDIDATE_LIMIT)
  ).map((location) => ({
      rank: location.rank,
      endpoint_id: location.endpoint_id,
      channel: location.channel,
      // No H3 index is computed in this prototype. A plausible-looking cell id
      // would be a fabricated fact on an audited field, so the value states
      // what it is instead.
      h3_cell: `synthetic:${location.entity_id}`,
      probability: location.score,
      confidence: location.score >= 0.75 ? 'HIGH' : location.score >= 0.5 ? 'MEDIUM' : 'LOW',
      predicted_window: {
        start: location.window_start,
        end: location.window_end,
        hazard_model_version: HAZARD_VERSION,
      },
    contributing_factors: factorsFor(location),
  }));

  const rungs: number[] = [];
  if (locations.some((l) => l.observed_on_trail)) rungs.push(1);
  if (scored.some((s) => s.districtMatch)) rungs.push(2);
  if (locations.some((l) => !l.observed_on_trail)) rungs.push(3);

  const caseId = caseIdForComplaint(complaint.complaint_id);
  const top = candidates[0] ?? null;

  const prediction: Prediction = {
    prediction_id: `PRED-${caseId.slice(5)}`,
    case_id: caseId,
    as_of: asOf,
    tier: band === 'INSUFFICIENT' ? 1 : 2,
    evidence_sufficiency: band,
    candidates,
    candidate_set_size: CASH_OUT_ENDPOINTS.length,
    recall_stage_rungs_used: rungs,
    model_version: MODEL_VERSION,
    feature_snapshot_id: `FS-${hash32(`${complaint.complaint_id}|${asOf}`).toString(16).toUpperCase()}`,
  };

  const atlasCase: Case = {
    case_id: caseId,
    status: band === 'INSUFFICIENT' ? 'TRIAGED' : 'ACTION_RECOMMENDED',
    fact_strip: {
      case_id: caseId,
      typology: TYPOLOGY_BY_COMPLAINT_TYPE[complaint.complaint_type],
      complaint_time: complaint.submitted_at,
      amount_at_risk_inr: complaint.fraud_amount_inr,
      golden_hour_position_minutes: features.golden_hour_minutes,
      predicted_window_start: top?.predicted_window.start ?? null,
      predicted_window_end: top?.predicted_window.end ?? null,
      top_candidate_endpoint_id: top?.endpoint_id ?? null,
      evidence_sufficiency: band,
      model_version: MODEL_VERSION,
    },
    prediction,
  };

  /* --- alert --------------------------------------------------------------
   *
   * The reason string carries the quantity and the window and is rendered
   * whole. It is the only place the amount, typology, evidence band and
   * endpoint appear together, so summarising it to "High risk" would discard
   * the content rather than shorten it.
   */
  const topLocation = locations[0];
  const severity: DemoAlert['severity'] =
    topLocation === undefined || band === 'INSUFFICIENT'
      ? 'LOW'
      : topLocation.score >= 0.75 && complaint.fraud_amount_inr >= 5000000
        ? 'CRITICAL'
        : topLocation.score >= 0.75
          ? 'HIGH'
          : topLocation.score >= 0.5
            ? 'MEDIUM'
            : 'LOW';

  const alert: DemoAlert = {
    alert_id: `ALERT-${caseId.slice(5)}`,
    case_id: caseId,
    complaint_id: complaint.complaint_id,
    severity,
    amount_inr: complaint.fraud_amount_inr,
    endpoint_id: topLocation?.endpoint_id ?? '—',
    endpoint_name: topLocation?.name ?? 'no ranked candidate',
    score: topLocation?.score ?? 0,
    window_start: topLocation?.window_start ?? asOf,
    window_end: topLocation?.window_end ?? asOf,
    issued_at: asOf,
    reason:
      topLocation === undefined
        ? `${complaint.complaint_type.toLowerCase()} · ₹${complaint.fraud_amount_inr.toLocaleString('en-IN')} at risk · ${features.golden_hour_minutes} minutes since the incident · ${band.toLowerCase()} evidence · no ranked candidate emitted at this evidence level`
        : `${complaint.complaint_type.toLowerCase()} · ₹${complaint.fraud_amount_inr.toLocaleString('en-IN')} at risk · ${features.golden_hour_minutes} minutes since the incident · ${band.toLowerCase()} evidence · top candidate ${topLocation.endpoint_id} (${topLocation.name}), score ${topLocation.score.toFixed(2)}, window ${topLocation.window_start.slice(11, 16)}–${topLocation.window_end.slice(11, 16)}`,
  };

  return {
    complaint,
    case_id: caseId,
    created_at: complaint.submitted_at,
    ledger_match: matched,
    ledger_template: template.id,
    accounts,
    transactions: legs.filter((leg) => leg.observed).map((leg) => leg.txn),
    trail_paths: trailPaths,
    entity_locations: entityLocations as EntityLocationIndex,
    origin_entity_id: victim.entity_id,
    max_depth: template.maxDepth,
    as_of: asOf,
    features,
    evidence_sufficiency: band,
    locations,
    prediction,
    atlas_case: atlasCase,
    alert,
  };
}

/** Whether the reconstruction horizon ran ahead of the filing instant. */
export function horizonRanAhead(demoCase: DemoCase): boolean {
  return Date.parse(demoCase.as_of) > Date.parse(demoCase.complaint.submitted_at);
}
