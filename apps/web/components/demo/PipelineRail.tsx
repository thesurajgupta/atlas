"use client";

import { useCaseView } from "@/lib/case-view";

/**
 * Where the current page sits in the pipeline.
 *
 * Deliberately one line of text, not a diagram. The instruction that shaped it
 * was that the data stays the focus — a workflow chart on every page competes
 * with the thing the page exists to show, and after the second screen a judge
 * stops reading it anyway. This just says "you are here".
 */
const STAGES = [
  "Ingestion",
  "Transactions",
  "Network",
  "Risk",
  "Prediction",
  "Ranking",
  "Alert",
] as const;

export function PipelineRail({ current }: { current: (typeof STAGES)[number] }) {
  const view = useCaseView();
  if (!view) return null;

  return (
    <div className="mx-6 mt-2 flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-wider">
      {STAGES.map((stage, i) => (
        <span key={stage} className="flex items-center gap-1">
          {i > 0 && <span className="text-ink-300">→</span>}
          <span className={stage === current ? "text-accent" : "text-ink-300"}>
            {stage}
          </span>
        </span>
      ))}
    </div>
  );
}
