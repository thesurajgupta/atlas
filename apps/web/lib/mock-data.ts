import type { Case, FunnelCounts } from "./types";

/**
 * Deliberately includes one case in each evidence_sufficiency band (§16.2),
 * so the four-state rendering required by §25.3 is exercised from the first
 * commit rather than added later as an afterthought.
 *
 * Synthetic identifiers only, per §5 — this file must never be replaced with
 * anything resembling real complaint data.
 */
export const MOCK_CASES: Case[] = [
  {
    case_id: "CASE-2026-0914",
    status: "ACTION_RECOMMENDED",
    fact_strip: {
      case_id: "CASE-2026-0914",
      typology: "DIGITAL_ARREST",
      complaint_time: "2026-09-04T09:12:00Z",
      amount_at_risk_inr: 820000,
      golden_hour_position_minutes: 38,
      predicted_window_start: "2026-09-04T10:00:00Z",
      predicted_window_end: "2026-09-04T14:00:00Z",
      top_candidate_endpoint_id: "EP-SYN-000142",
      evidence_sufficiency: "STRONG",
      model_version: "tier2-lambdamart-2026.09.01-a1b2c3d",
    },
    prediction: {
      prediction_id: "PRED-0001",
      case_id: "CASE-2026-0914",
      as_of: "2026-09-04T09:40:00Z",
      tier: 2,
      evidence_sufficiency: "STRONG",
      candidate_set_size: 214,
      recall_stage_rungs_used: [1, 2],
      model_version: "tier2-lambdamart-2026.09.01-a1b2c3d",
      feature_snapshot_id: "FS-88214",
      candidates: [
        {
          rank: 1,
          endpoint_id: "EP-SYN-000142",
          channel: "AEPS_BC",
          h3_cell: "8761a2b3fffffff",
          probability: 0.31,
          confidence: "HIGH",
          predicted_window: {
            start: "2026-09-04T10:00:00Z",
            end: "2026-09-04T14:00:00Z",
            hazard_model_version: "hazard-2026.08.20-e4f1",
          },
          contributing_factors: [
            {
              feature: "endpoint_prior_fraud_utilisation",
              contribution: 0.14,
              direction: "+",
              sentence:
                "₹8.2 lakh moved through 4 accounts in 22 minutes, ending at this endpoint in 3 prior cases.",
            },
            {
              feature: "hops_since_victim",
              contribution: 0.09,
              direction: "+",
              sentence:
                "Only 2 hops separate this endpoint from the victim's account.",
            },
          ],
        },
        {
          rank: 2,
          endpoint_id: "EP-SYN-000198",
          channel: "ATM",
          h3_cell: "8761a2b7fffffff",
          probability: 0.18,
          confidence: "MEDIUM",
          predicted_window: {
            start: "2026-09-04T10:30:00Z",
            end: "2026-09-04T15:00:00Z",
            hazard_model_version: "hazard-2026.08.20-e4f1",
          },
          contributing_factors: [
            {
              feature: "geo_proximity_kyc_district",
              contribution: 0.07,
              direction: "+",
              sentence:
                "1.4 km from the mule account's registered KYC district.",
            },
          ],
        },
      ],
    },
  },
  {
    case_id: "CASE-2026-0915",
    status: "INVESTIGATING",
    fact_strip: {
      case_id: "CASE-2026-0915",
      typology: "UPI_COLLECT_FRAUD",
      complaint_time: "2026-09-04T07:50:00Z",
      amount_at_risk_inr: 46000,
      golden_hour_position_minutes: 142,
      predicted_window_start: "2026-09-04T12:00:00Z",
      predicted_window_end: "2026-09-05T00:00:00Z",
      top_candidate_endpoint_id: "EP-SYN-000311",
      evidence_sufficiency: "MODERATE",
      model_version: "tier2-lambdamart-2026.09.01-a1b2c3d",
    },
    prediction: {
      prediction_id: "PRED-0002",
      case_id: "CASE-2026-0915",
      as_of: "2026-09-04T08:05:00Z",
      tier: 2,
      evidence_sufficiency: "MODERATE",
      candidate_set_size: 176,
      recall_stage_rungs_used: [2],
      model_version: "tier2-lambdamart-2026.09.01-a1b2c3d",
      feature_snapshot_id: "FS-88220",
      candidates: [
        {
          rank: 1,
          endpoint_id: "EP-SYN-000311",
          channel: "MERCHANT_QR",
          h3_cell: "8761a3d1fffffff",
          probability: 0.19,
          confidence: "MEDIUM",
          predicted_window: {
            start: "2026-09-04T12:00:00Z",
            end: "2026-09-05T00:00:00Z",
            hazard_model_version: "hazard-2026.08.20-e4f1",
          },
          contributing_factors: [
            {
              feature: "cluster_membership",
              contribution: 0.11,
              direction: "+",
              sentence:
                "This account shares a device fingerprint with 6 accounts in a known mule cluster.",
            },
          ],
        },
      ],
    },
  },
  {
    case_id: "CASE-2026-0916",
    status: "TRIAGED",
    fact_strip: {
      case_id: "CASE-2026-0916",
      typology: "CUSTOMER_CARE_IMPERSONATION",
      complaint_time: "2026-09-04T05:20:00Z",
      amount_at_risk_inr: 128000,
      golden_hour_position_minutes: 301,
      predicted_window_start: "2026-09-05T00:00:00Z",
      predicted_window_end: "2026-09-06T00:00:00Z",
      top_candidate_endpoint_id: "EP-SYN-000450",
      evidence_sufficiency: "WEAK",
      model_version: "tier2-lambdamart-2026.09.01-a1b2c3d",
    },
    prediction: {
      prediction_id: "PRED-0003",
      case_id: "CASE-2026-0916",
      as_of: "2026-09-04T05:45:00Z",
      tier: 2,
      evidence_sufficiency: "WEAK",
      candidate_set_size: 340,
      recall_stage_rungs_used: [3],
      model_version: "tier2-lambdamart-2026.09.01-a1b2c3d",
      feature_snapshot_id: "FS-88231",
      candidates: [
        {
          rank: 1,
          endpoint_id: "EP-SYN-000450",
          channel: "ATM",
          h3_cell: "8761a4e2fffffff",
          probability: 0.07,
          confidence: "LOW",
          predicted_window: {
            start: "2026-09-05T00:00:00Z",
            end: "2026-09-06T00:00:00Z",
            hazard_model_version: "hazard-2026.08.20-e4f1",
          },
          contributing_factors: [
            {
              feature: "kyc_district_only",
              contribution: 0.04,
              direction: "+",
              sentence:
                "Nearest endpoint to the mule account's KYC district — no transaction history seen for this account.",
            },
          ],
        },
      ],
    },
  },
  {
    case_id: "CASE-2026-0917",
    status: "NEW",
    fact_strip: {
      case_id: "CASE-2026-0917",
      typology: "JOB_TASK_FRAUD",
      complaint_time: "2026-09-04T11:02:00Z",
      amount_at_risk_inr: 15000,
      golden_hour_position_minutes: 9,
      predicted_window_start: null,
      predicted_window_end: null,
      top_candidate_endpoint_id: null,
      evidence_sufficiency: "INSUFFICIENT",
      model_version: "tier1-hawkes-lgbm-2026.09.01-f7a2c9",
    },
    prediction: {
      prediction_id: "PRED-0004",
      case_id: "CASE-2026-0917",
      as_of: "2026-09-04T11:05:00Z",
      tier: 1,
      evidence_sufficiency: "INSUFFICIENT",
      candidate_set_size: 0,
      recall_stage_rungs_used: [],
      model_version: "tier1-hawkes-lgbm-2026.09.01-f7a2c9",
      feature_snapshot_id: "FS-88240",
      candidates: [],
    },
  },
];

export const MOCK_FUNNEL: FunnelCounts = {
  predictions: 318,
  alerts: 214,
  cases_opened: 96,
  interventions: 61,
  outcomes: 44,
};

export function getCaseById(caseId: string): Case | undefined {
  return MOCK_CASES.find((c) => c.case_id === caseId);
}
