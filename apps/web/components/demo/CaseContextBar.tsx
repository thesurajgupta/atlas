"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCaseView, formatRupees } from "@/lib/case-view";

/**
 * The case a page is currently showing, on every page that can show one.
 *
 * It carries the four values a judge compares between screens — reference,
 * amount, hop count, top candidate — so drifting numbers are visible rather
 * than something you have to go looking for. If two pages disagree, this bar is
 * where it shows.
 *
 * Renders nothing when no run is active, so ordinary browsing is unchanged.
 */
export function CaseContextBar({ stage }: { stage?: string }) {
  const view = useCaseView();
  if (!view) return null;

  return (
    <div className="mx-6 mt-4 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-700">
          <span className="font-medium text-ink-900">{view.caseRef}</span>
          <span className="text-ink-300">·</span>
          <span className="tabular-nums">{formatRupees(view.reportedAmount)} reported</span>
          <span className="text-ink-300">·</span>
          <span className="tabular-nums">{view.hops.length} hops</span>
          {view.candidates[0] && (
            <>
              <span className="text-ink-300">·</span>
              <span>
                top candidate <span className="font-mono">{view.candidates[0].endpoint_ref}</span>
              </span>
            </>
          )}
          {stage && (
            <>
              <span className="text-ink-300">·</span>
              <span className="uppercase tracking-wider text-ink-500">{stage}</span>
            </>
          )}
        </div>
        <Link
          href="/demo"
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-accent transition-opacity hover:opacity-80"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Walkthrough
        </Link>
      </div>
    </div>
  );
}
