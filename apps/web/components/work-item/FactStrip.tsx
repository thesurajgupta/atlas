import type { FactStrip as FactStripType } from "@/lib/types";
import {
  formatGoldenHour,
  formatInr,
  formatTypology,
  formatWindow,
} from "@/lib/format";
import { EvidenceBadge } from "@/components/prediction/EvidenceBadge";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[0.6875rem] text-ink-500">{label}</span>
      <span className="text-sm text-ink-900">{children}</span>
    </div>
  );
}

/**
 * §25.2, verbatim two-line layout:
 *   Case ID · Typology · Complaint time · Amount at risk · GOLDEN-HOUR POSITION
 *   Predicted window · Top candidate · Evidence sufficiency · Model version
 *
 * `sticky top-12` pins it directly under the primary nav (h-12) so it never
 * scrolls away, per "sits above the tabs and never scrolls away."
 */
export function FactStrip({ fact }: { fact: FactStripType }) {
  const goldenHourCritical = fact.golden_hour_position_minutes >= 60;

  return (
    <div className="sticky top-12 z-10 border-b border-line bg-surface px-6 py-3">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
        <Field label="Case ID">{fact.case_id}</Field>
        <Field label="Typology">{formatTypology(fact.typology)}</Field>
        <Field label="Complaint time">
          {new Date(fact.complaint_time).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </Field>
        <Field label="Amount at risk">
          {formatInr(fact.amount_at_risk_inr)}
        </Field>
        <Field label="Golden-hour position">
          <span
            className={
              goldenHourCritical ? "font-semibold text-severity-high" : ""
            }
          >
            {formatGoldenHour(fact.golden_hour_position_minutes)} elapsed
          </span>
        </Field>
      </div>

      <div className="mt-2 flex flex-wrap items-start gap-x-8 gap-y-2">
        <Field label="Predicted window">
          {fact.predicted_window_start && fact.predicted_window_end
            ? formatWindow(
                fact.predicted_window_start,
                fact.predicted_window_end,
              )
            : "—"}
        </Field>
        <Field label="Top candidate">
          {fact.top_candidate_endpoint_id ?? "—"}
        </Field>
        <Field label="Evidence sufficiency">
          <EvidenceBadge band={fact.evidence_sufficiency} />
        </Field>
        <Field label="Model version">
          <span className="font-mono text-xs">{fact.model_version}</span>
        </Field>
      </div>
    </div>
  );
}
