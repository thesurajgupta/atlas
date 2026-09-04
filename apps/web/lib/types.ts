// Types mirror docs/ATLAS_MASTER_SPEC.md §15.5 (prediction output schema) and
// §25.2 (work-item fact-strip). Field names match the spec's JSON example
// deliberately, so a future real API response needs no relabelling here.

export type EvidenceSufficiency =
  | "STRONG"
  | "MODERATE"
  | "WEAK"
  | "INSUFFICIENT";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export type Channel =
  | "ATM"
  | "AEPS_BC"
  | "BANK_BRANCH"
  | "POS_CASHBACK"
  | "MERCHANT_QR"
  | "PREPAID_GIFT"
  | "CRYPTO_P2P";

export type Typology =
  | "DIGITAL_ARREST"
  | "INVESTMENT_SCAM"
  | "UPI_COLLECT_FRAUD"
  | "CUSTOMER_CARE_IMPERSONATION"
  | "LOAN_APP_EXTORTION"
  | "JOB_TASK_FRAUD"
  | "SEXTORTION";

export interface ContributingFactor {
  feature: string;
  contribution: number;
  direction: "+" | "-";
  /**
   * §25.4: "Contributing factors render as sentences containing a quantity
   * and a window... SHAP values are translated before display and never
   * shown raw to an investigator." This field is the already-translated
   * sentence; `feature`/`contribution`/`direction` stay for audit/debug use
   * only and must never render directly in investigator-facing UI.
   */
  sentence: string;
}

export interface PredictionCandidate {
  rank: number;
  endpoint_id: string;
  channel: Channel;
  h3_cell: string;
  probability: number; // calibrated; never more precise than 2 decimal places (§15.5)
  confidence: Confidence;
  predicted_window: {
    start: string; // ISO 8601
    end: string;
    hazard_model_version: string;
  };
  contributing_factors: ContributingFactor[];
}

export interface Prediction {
  prediction_id: string;
  case_id: string;
  as_of: string; // point-in-time boundary
  tier: 1 | 2 | 3;
  evidence_sufficiency: EvidenceSufficiency;
  candidates: PredictionCandidate[];
  candidate_set_size: number;
  recall_stage_rungs_used: number[];
  model_version: string;
  feature_snapshot_id: string;
}

/**
 * §25.2: the pinned fact-strip fields, present on every case/alert/prediction
 * work item, in the fixed order the spec gives.
 */
export interface FactStrip {
  case_id: string;
  typology: Typology;
  complaint_time: string; // ISO 8601
  amount_at_risk_inr: number;
  /** Elapsed time since estimated fraud initiation, in minutes (§11, §25.2). */
  golden_hour_position_minutes: number;
  predicted_window_start: string | null;
  predicted_window_end: string | null;
  top_candidate_endpoint_id: string | null;
  evidence_sufficiency: EvidenceSufficiency;
  model_version: string;
}

export type CaseStatus =
  | "NEW"
  | "TRIAGED"
  | "INVESTIGATING"
  | "ACTION_RECOMMENDED"
  | "ACTIONED"
  | "OUTCOME_RECORDED"
  | "CLOSED";

export interface Case {
  case_id: string;
  status: CaseStatus;
  fact_strip: FactStrip;
  prediction: Prediction;
}

/**
 * §21.3: the intelligence funnel — the primary KPI row on Command Overview.
 * Deliberately not a model metric.
 */
export interface FunnelCounts {
  predictions: number;
  alerts: number;
  cases_opened: number;
  interventions: number;
  outcomes: number;
}
