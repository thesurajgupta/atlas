import type { FunnelCounts } from "@/lib/types";

const STAGES: { key: keyof FunnelCounts; label: string }[] = [
  { key: "predictions", label: "Predictions" },
  { key: "alerts", label: "Alerts" },
  { key: "cases_opened", label: "Cases opened" },
  { key: "interventions", label: "Interventions" },
  { key: "outcomes", label: "Outcomes" },
];

/**
 * §25.1: "The primary KPI row is the intelligence funnel (§21.3), not a
 * model metric... A dashboard whose headline is 'model accuracy 0.87' tells
 * an officer nothing they can act on."
 *
 * Each hop's conversion is shown against the *previous* stage, per §21.3 —
 * a low rate at each hop has a different cause and a different fix, so the
 * hops must never be collapsed into one aggregate rate.
 */
export function Funnel({ counts }: { counts: FunnelCounts }) {
  const max = counts.predictions || 1;

  return (
    <section aria-label="Intelligence funnel" className="w-full">
      <div className="flex items-stretch gap-0">
        {STAGES.map((stage, i) => {
          const value = counts[stage.key];
          const prev = i === 0 ? null : counts[STAGES[i - 1]!.key];
          const conversionPct =
            prev && prev > 0 ? Math.round((value / prev) * 100) : null;
          const widthPct = Math.max(8, Math.round((value / max) * 100));

          return (
            <div key={stage.key} className="flex flex-1 flex-col items-center">
              {i > 0 && (
                <div className="mb-1 text-xs text-ink-500">
                  {conversionPct}%
                  <span className="mx-1 text-ink-300">→</span>
                </div>
              )}
              {i === 0 && <div className="mb-1 h-4 text-xs text-ink-500" />}
              <div className="flex h-16 w-full items-end justify-center">
                <div
                  className="w-full rounded-sm bg-ink-900/85"
                  style={{ height: `${widthPct}%` }}
                  aria-hidden
                />
              </div>
              <div className="mt-2 text-lg font-semibold leading-none text-ink-900">
                {value}
              </div>
              <div className="mt-0.5 text-xs text-ink-500">{stage.label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
