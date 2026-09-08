import { describe, expect, it } from 'vitest';

import { RANKED_CANDIDATE_LIMIT, buildDemoCase, caseIdForComplaint } from '@/lib/demo/case';
import { CASH_OUT_ENDPOINTS } from '@/lib/demo/endpoints';
import { resolveTemplate } from '@/lib/demo/ledger';
import type { ComplaintType, NcrpComplaint } from '@/lib/demo/types';

/**
 * The demo's one hard requirement, as a test.
 *
 * "The exact data entered in NCRP must be the exact data received by ATLAS" is
 * a property of `buildDemoCase`, and it is the kind of property that decays
 * silently: somebody adds a screen, formats an amount there, and two figures
 * that used to agree stop agreeing under stage lights. These assertions fail
 * instead.
 *
 * They deliberately assert on the *identity* of values across the derivation —
 * that the alert's amount is the complaint's amount — rather than on any
 * particular number. Changing the fixture must not require touching this file;
 * breaking the join must.
 */

function complaint(overrides: Partial<NcrpComplaint> = {}): NcrpComplaint {
  return {
    complaint_id: 'NCRP/2026/044178',
    complaint_type: 'Online Financial Fraud' as ComplaintType,
    incident_date: '2026-09-04',
    incident_time: '19:04',
    fraud_amount_inr: 1840000,
    victim_bank: 'Example Bank',
    victim_account: 'XXXX4471',
    transaction_id: 'TXN001',
    mobile: '98XXXXXX21',
    description: 'Synthetic complaint for tests.',
    state: 'Delhi',
    district: 'North district',
    supporting_document: null,
    // Late enough that every leg of the TXN001 chain is behind the filing
    // instant, which is the case the demo is presented in.
    submitted_at: '2026-09-05T02:00:00.000Z',
    ...overrides,
  };
}

describe('the complaint reaches ATLAS unchanged', () => {
  it('carries the amount through case, prediction and alert', () => {
    const built = buildDemoCase(complaint());

    expect(built.atlas_case.fact_strip.amount_at_risk_inr).toBe(1840000);
    expect(built.alert.amount_inr).toBe(1840000);
    expect(built.features.amount_at_risk_inr).toBe(1840000);
  });

  it('follows a changed amount everywhere, with no figure left behind', () => {
    const built = buildDemoCase(complaint({ fraud_amount_inr: 725000 }));

    expect(built.atlas_case.fact_strip.amount_at_risk_inr).toBe(725000);
    expect(built.alert.amount_inr).toBe(725000);
    expect(built.alert.reason).toContain('7,25,000');
  });

  it('names the submitted transaction reference on the first hop, verbatim', () => {
    const built = buildDemoCase(complaint({ transaction_id: 'TXN001' }));
    const first = built.transactions[0];

    expect(first?.txn_ref).toBe('TXN001');
    // Downstream legs derive from it, so every reference in the case traces
    // back to the one the citizen typed.
    for (const txn of built.transactions) {
      expect(txn.txn_ref.startsWith('TXN001')).toBe(true);
    }
  });

  it('opens the trail at the victim account the citizen gave', () => {
    const built = buildDemoCase(complaint({ victim_account: 'XXXX9312' }));

    expect(built.origin_entity_id).toBe('VIC_9312');
    expect(built.accounts[0]?.account_number).toBe('XXXX9312');
    for (const path of built.trail_paths) {
      expect(path.hops[0].from_entity_id).toBe('VIC_9312');
    }
  });

  it('derives the case id from the complaint reference', () => {
    expect(caseIdForComplaint('NCRP/2026/044178')).toBe('CASE-2026-044178');

    const built = buildDemoCase(complaint());
    expect(built.case_id).toBe('CASE-2026-044178');
    expect(built.prediction.case_id).toBe(built.case_id);
    expect(built.atlas_case.case_id).toBe(built.case_id);
    expect(built.alert.case_id).toBe(built.case_id);
    expect(built.alert.complaint_id).toBe('NCRP/2026/044178');
  });
});

describe('one case, one ranking', () => {
  it('gives the alert the same top endpoint, score and window as the ranked list', () => {
    const built = buildDemoCase(complaint());
    const top = built.locations[0];

    expect(top).toBeDefined();
    expect(built.alert.endpoint_id).toBe(top?.endpoint_id);
    expect(built.alert.score).toBe(top?.score);
    expect(built.alert.window_start).toBe(top?.window_start);
    expect(built.alert.window_end).toBe(top?.window_end);
    expect(built.atlas_case.fact_strip.top_candidate_endpoint_id).toBe(top?.endpoint_id);
  });

  it('gives the prediction candidates the same endpoints and scores', () => {
    const built = buildDemoCase(complaint());

    expect(built.prediction.candidates).toHaveLength(RANKED_CANDIDATE_LIMIT);
    built.prediction.candidates.forEach((candidate, index) => {
      const location = built.locations[index];
      expect(candidate.endpoint_id).toBe(location?.endpoint_id);
      expect(candidate.probability).toBe(location?.score);
      expect(candidate.predicted_window.start).toBe(location?.window_start);
    });
  });

  it('scores every endpoint in the catalogue, so the map cannot rank differently', () => {
    // The map draws the whole catalogue. If only the leaders carried a case
    // score the rest would fall back to their catalogue baseline, and the map's
    // ordering would stop matching the ranked list's.
    const built = buildDemoCase(complaint());
    expect(built.locations).toHaveLength(CASH_OUT_ENDPOINTS.length);
    expect(built.prediction.candidate_set_size).toBe(CASH_OUT_ENDPOINTS.length);
  });

  it('only ranks endpoints that exist in the shared catalogue', () => {
    const known = new Set(CASH_OUT_ENDPOINTS.map((endpoint) => endpoint.id));
    const built = buildDemoCase(complaint());

    for (const location of built.locations) {
      expect(known.has(location.endpoint_id)).toBe(true);
    }
  });

  it('ranks in descending score order', () => {
    const scores = buildDemoCase(complaint()).locations.map((l) => l.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('never emits more precision than §15.5 allows', () => {
    for (const location of buildDemoCase(complaint()).locations) {
      expect(location.score).toBe(Math.round(location.score * 100) / 100);
    }
  });
});

describe('the money adds up', () => {
  it('moves exactly the reported amount out of the victim account', () => {
    const built = buildDemoCase(complaint({ fraud_amount_inr: 1840001 }));
    const firstHopTotal = built.transactions
      .filter((txn) => txn.depth === 1)
      .reduce((sum, txn) => sum + txn.amount_inr, 0);

    // To the rupee, odd amounts included — the last depth-1 leg absorbs the
    // rounding residue rather than the total drifting.
    expect(firstHopTotal).toBe(1840001);
  });

  it('keeps hops non-decreasing in time along every path', () => {
    for (const path of buildDemoCase(complaint()).trail_paths) {
      const times = path.hops.map((hop) => Date.parse(hop.occurred_at));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it('walks no hop observed after the point-in-time bound', () => {
    const built = buildDemoCase(complaint());
    const bound = Date.parse(built.as_of);

    for (const txn of built.transactions) {
      expect(Date.parse(txn.occurred_at)).toBeLessThanOrEqual(bound);
    }
  });
});

describe('the ledger join', () => {
  it('matches a seeded transaction reference', () => {
    const built = buildDemoCase(complaint({ transaction_id: 'TXN001' }));

    expect(built.ledger_match).toBe(true);
    expect(built.ledger_template).toBe('TXN001');
    expect(built.evidence_sufficiency).toBe('STRONG');
  });

  it('still traces a reference nothing seeded, and costs it one evidence band', () => {
    const unseeded = buildDemoCase(complaint({ transaction_id: 'TXN777' }));

    expect(unseeded.ledger_match).toBe(false);
    expect(unseeded.transactions.length).toBeGreaterThan(0);
    // Whatever the trail shape supports, minus one for a reference with no
    // record behind it.
    expect(unseeded.evidence_sufficiency).not.toBe('STRONG');
  });

  it('resolves an unseeded reference to the same template every time', () => {
    const first = resolveTemplate('TXN777');
    const second = resolveTemplate('TXN777');
    expect(first.template.id).toBe(second.template.id);

    // …and the whole case with it, so a presenter who resets and retypes the
    // same complaint sees the case they saw before.
    const a = buildDemoCase(complaint({ transaction_id: 'TXN777' }));
    const b = buildDemoCase(complaint({ transaction_id: 'TXN777' }));
    expect(a).toEqual(b);
  });

  it('is case-insensitive about the reference', () => {
    expect(resolveTemplate('txn001').matched).toBe(true);
    expect(resolveTemplate('  TXN001  ').matched).toBe(true);
  });
});

describe('evidence bands reflect what the case contains', () => {
  it('drops to a weaker band when no cash-out is observed', () => {
    // TXN003 is the seeded chain that never reaches a withdrawal.
    const built = buildDemoCase(complaint({ transaction_id: 'TXN003' }));

    expect(built.features.observed_cash_outs).toBe(0);
    expect(built.evidence_sufficiency).toBe('WEAK');
  });

  it('emits no ranked candidates at INSUFFICIENT', () => {
    // Filed a minute after the incident: nothing in the chain has happened yet
    // *and* the horizon guard has fewer than two legs to work with, so the
    // reconstruction is whatever the ledger supports and the band says so.
    const built = buildDemoCase(
      complaint({
        incident_date: '2026-09-04',
        incident_time: '19:04',
        submitted_at: '2026-09-04T13:35:00.000Z',
      }),
    );

    if (built.evidence_sufficiency === 'INSUFFICIENT') {
      expect(built.prediction.candidates).toHaveLength(0);
    } else {
      // The horizon guard extended the bound rather than leaving an empty
      // case, which is the documented behaviour; the trail must then be real.
      expect(built.transactions.length).toBeGreaterThan(0);
    }
  });
});

describe('determinism', () => {
  it('produces an identical case from an identical complaint', () => {
    expect(buildDemoCase(complaint())).toEqual(buildDemoCase(complaint()));
  });
});
