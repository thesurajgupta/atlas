"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useDemoRun } from "@/lib/demo-run";

/**
 * Shown on any page a demo walkthrough leads into.
 *
 * Orientation, not decoration: a judge who has just watched a pipeline run and
 * then clicks "Alerts" is looking at every alert in the jurisdiction, and needs
 * to know which row is the one they were shown. It names the case and offers the
 * way back.
 *
 * Renders nothing when no demo is active, so the pages are unchanged in ordinary
 * use.
 */
export function ActiveRunBanner() {
  const run = useDemoRun();
  if (!run || !run.complaint) return null;

  return (
    <div className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
      <p className="text-[11px] text-ink-700">
        Demo investigation active —{" "}
        <span className="font-medium text-ink-900">{run.case_ref}</span>
        {run.candidates[0] && (
          <>
            {" · top candidate "}
            <span className="font-mono">{run.candidates[0].endpoint_ref}</span>
          </>
        )}
      </p>
      <Link
        href="/demo"
        className="inline-flex items-center gap-1 text-[11px] text-accent transition-opacity hover:opacity-80"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        Back to the walkthrough
      </Link>
    </div>
  );
}
