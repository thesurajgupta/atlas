import type { EvidenceSufficiency } from "./types";

const RUNG_LABEL: Record<number, string> = {
  1: "the account's own prior activity",
  2: "membership in a known mule cluster",
  3: "KYC-district proximity",
  4: "the Tier 1 zone forecast",
  5: "typology signature matching",
};

/**
 * §16.2: a WEAK prediction comes from rung 3 alone, or rungs 4+5 without 1
 * or 2. §25.3 requires the UI to name the *missing* evidence, not just show
 * a lower number — so this derives what's absent from what actually fired.
 */
export function describeMissingEvidence(rungsUsed: number[]): string {
  const present = new Set(rungsUsed);
  const missing = [1, 2]
    .filter((r) => !present.has(r))
    .map((r) => RUNG_LABEL[r]);

  if (missing.length === 0) return "";

  return `This ranking has no ${missing.join(" and no ")}. It relies on ${rungsUsed
    .map((r) => RUNG_LABEL[r])
    .join(" and ")} alone.`;
}

export const EVIDENCE_BAND_COPY: Record<EvidenceSufficiency, string> = {
  STRONG: "Strong evidence",
  MODERATE: "Moderate evidence",
  WEAK: "Weak evidence",
  INSUFFICIENT: "Insufficient evidence",
};
