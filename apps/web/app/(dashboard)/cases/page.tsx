import Link from "next/link";
import { MOCK_CASES } from "@/lib/mock-data";
import { EvidenceBadge } from "@/components/prediction/EvidenceBadge";
import { formatGoldenHour, formatInr, formatTypology } from "@/lib/format";

export default function CasesListPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-ink-900">Cases</h1>
      <ul className="divide-y divide-line rounded-sm border border-line bg-surface">
        {MOCK_CASES.map((c) => (
          <li key={c.case_id}>
            <Link
              href={`/cases/${c.case_id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-paper"
            >
              <div>
                <div className="text-sm font-medium text-ink-900">
                  {c.case_id}
                </div>
                <div className="text-xs text-ink-500">
                  {formatTypology(c.fact_strip.typology)} ·{" "}
                  {formatInr(c.fact_strip.amount_at_risk_inr)} ·{" "}
                  {formatGoldenHour(c.fact_strip.golden_hour_position_minutes)}{" "}
                  elapsed
                </div>
              </div>
              <EvidenceBadge band={c.fact_strip.evidence_sufficiency} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
