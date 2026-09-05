/**
 * The case context strip.
 *
 * Two amounts appear here and they are **not the same number**, which is the
 * whole reason they sit side by side with a rule between them:
 *
 * - **Amount at risk** is what the complainant reported. It is a field on the
 *   case fixture, carries its own declared currency, and is never computed from
 *   the graph. A figure derived from trail shape would be a number nobody could
 *   reproduce and everybody would treat as a finding.
 *
 * - **Visible flow** is the sum of the hop amounts currently drawn. It is a
 *   graph-derived total, it double-counts layered money by construction, and it
 *   is labelled as such. It is not a loss figure and not a recovery figure.
 *
 * Golden hour and status carry an amber accent because they are the
 * time-critical facts on a complaint, not because anything has been scored.
 */

import { formatCurrencyAmount, sumDecimalStrings } from '@/lib/graph/decimal';
import type { SyntheticCaseContext } from '@/lib/graph/synthetic-case';
import type { MoneyTrailEdge } from '@/lib/graph/types';

function CaseField({
  label,
  value,
  tone,
  mono,
  title,
  grow,
}: {
  label: string;
  value: string;
  tone?: 'amber' | 'sky';
  mono?: boolean;
  title?: string;
  /** Opt in to the leftover width. Only long free text needs it. */
  grow?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 ${
        grow === true ? 'max-w-[20rem] min-w-[9rem] flex-1 basis-[11rem]' : 'shrink-0'
      }`}
      title={title}
    >
      <span className="text-micro font-semibold tracking-[0.14em] whitespace-nowrap text-slate-500 uppercase">
        {label}
      </span>
      <span
        className={`truncate text-ui-primary leading-none font-semibold ${mono === true ? 'font-mono' : ''} ${
          tone === 'amber' ? 'text-amber-300' : tone === 'sky' ? 'text-sky-300' : 'text-slate-100'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export interface CaseContextProps {
  readonly caseContext: SyntheticCaseContext;
  /** Hops currently drawn, for the graph-derived total only. */
  readonly visibleHops: readonly MoneyTrailEdge[];
}

export default function CaseContext({ caseContext, visibleHops }: CaseContextProps) {
  // Summed exactly over decimal strings — a float total of rupee amounts stops
  // matching the ledger at the third hop.
  const visibleFlow = sumDecimalStrings(visibleHops.map((hop) => hop.amount));

  return (
    <section
      aria-label="Case context (synthetic)"
      className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-800 bg-slate-900/60 px-4 py-2"
    >
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-sm border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-micro font-semibold tracking-[0.12em] text-sky-300 uppercase">
          Case
        </span>
        <span className="text-technical font-semibold text-slate-50">
          {caseContext.caseId}
        </span>
      </div>

      <span aria-hidden className="hidden h-7 w-px bg-slate-800 sm:block" />

      <CaseField label="Typology" value={caseContext.typology} title={caseContext.typology} grow />
      <CaseField
        label="Amount at risk"
        value={formatCurrencyAmount(caseContext.amountAtRisk, caseContext.currency)}
        mono
        title="Reported on the complaint. Synthetic case metadata — not computed from the trail."
      />
      <CaseField label="Complaint time" value={caseContext.complaintTime} />
      <CaseField label="Golden hour" value={caseContext.goldenHour} tone="amber" />
      <CaseField label="Status" value={caseContext.status} tone="sky" />

      <span aria-hidden className="hidden h-7 w-px bg-slate-800 sm:block" />

      {/* Graph-derived, and separated from the case fields above so the two
          totals are never read as one figure. */}
      <CaseField
        label="Visible flow (graph)"
        value={visibleFlow}
        mono
        title="Sum of the amounts on hops currently drawn. Layered hops repeat the same money, so this is not a loss figure and not the amount at risk."
      />

      <span className="ml-auto hidden max-w-[13rem] shrink-0 text-micro leading-tight whitespace-normal text-slate-600 2xl:block">
        Case fields are synthetic metadata, not derived from the trail. Visible flow is summed from
        drawn hops.
      </span>
    </section>
  );
}
