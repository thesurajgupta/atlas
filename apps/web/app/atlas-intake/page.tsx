'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { AnalysisPipeline } from '@/components/demo/AnalysisPipeline';
import { rupees } from '@/lib/demo/defaults';
import { useDemoCase } from '@/lib/demo/store';

/**
 * The handover screen: NCRP on one side, the console on the other.
 *
 * Full-bleed and outside the console shell on purpose. This is the moment the
 * demo is about — a complaint stops being a citizen's form and becomes an
 * investigator's case — and putting it inside the sidebar would make it look
 * like another page of the same app.
 *
 * The pipeline below is staged for legibility, not because anything takes time:
 * the case was derived the instant the complaint was referred, and the caption
 * says so. What the stages actually do is *show* the derivation, so the answer
 * to "where did that number come from" is on screen before the question.
 */
export default function AtlasIntakePage() {
  const router = useRouter();
  const { hydrated, activeCase, complaint, stage } = useDemoCase();
  const [complete, setComplete] = useState(false);

  const onComplete = useCallback(() => setComplete(true), []);

  if (!hydrated) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <p className="text-[13px] text-ink-500">Loading…</p>
      </main>
    );
  }

  if (activeCase === null) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-[20px] font-semibold text-ink-900">Nothing has been referred yet</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
            {complaint === null
              ? 'No complaint has been filed from this browser. File one in the reporting portal and refer it to ATLAS.'
              : `Complaint ${complaint.complaint_id} is registered but has not been referred to ATLAS yet.`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link
              href={stage === 'SUBMITTED' ? '/ncrp/acknowledgement' : '/ncrp'}
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
            >
              {stage === 'SUBMITTED' ? 'Open the acknowledgement' : 'Open the reporting portal'}
            </Link>
            <Link
              href="/overview"
              className="rounded-md border border-line px-4 py-2 text-[13px] text-ink-700 transition-colors hover:border-line-strong"
            >
              Go to ATLAS
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { complaint: filed, case_id, features, alert } = activeCase;

  return (
    <main className="min-h-dvh px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
            Complaint received
          </p>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-ink-900">
            {filed.complaint_id}
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">
            Referred from the reporting portal · opened as{' '}
            <span className="font-mono text-ink-700">{case_id}</span>
          </p>

          <dl className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-left">
            {[
              ['Amount', rupees(filed.fraud_amount_inr)],
              ['Victim account', filed.victim_account],
              ['Transaction ID', filed.transaction_id],
              ['Since incident', `${features.golden_hour_minutes} min`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] uppercase tracking-wider text-ink-500">{label}</dt>
                <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
        </header>

        {/* Keyed on the case: referring a second complaint after a reset
            remounts the pipeline and runs the sequence again, rather than
            leaving it sitting at "complete" from the previous run. */}
        <AnalysisPipeline key={case_id} demoCase={activeCase} onComplete={onComplete} />

        <p className="mt-3 text-center text-[11px] italic text-ink-300">
          Stages are revealed in sequence so the flow can be followed. The case is derived the
          instant the complaint is referred — nothing here is waiting on a job.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={!complete}
            onClick={() => router.push(`/investigation?case=${encodeURIComponent(case_id)}`)}
            className={`rounded-md px-6 py-3 text-[15px] font-semibold transition-opacity ${
              complete
                ? 'bg-accent text-paper hover:opacity-90'
                : 'cursor-not-allowed border border-line bg-surface text-ink-300'
            }`}
          >
            {complete ? 'Open the investigation →' : 'Analysis running…'}
          </button>

          {complete && (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px]">
              <Link href="/money-trail" className="text-accent hover:opacity-80">
                Transaction trail
              </Link>
              <Link href="/network-graph" className="text-accent hover:opacity-80">
                Network graph
              </Link>
              <Link href="/predicted-locations" className="text-accent hover:opacity-80">
                Predicted locations · {activeCase.prediction.candidates.length}
              </Link>
              <Link href="/map" className="text-accent hover:opacity-80">
                ATM / branch map
              </Link>
              <Link href="/alerts" className="text-accent hover:opacity-80">
                Alerts · {alert.severity}
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
