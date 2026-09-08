'use client';

import { useEffect, useState } from 'react';
import { Database, X } from 'lucide-react';

import { horizonRanAhead } from '@/lib/demo/case';
import { rupees } from '@/lib/demo/defaults';
import { useDemoCase } from '@/lib/demo/store';

/**
 * The answer to "where is this prediction coming from?".
 *
 * A drawer over whatever screen the presenter is on, showing the complaint as
 * filed and the transaction rows the analysis actually read — input, then
 * analysis, then output, in that order, on one surface. It exists because that
 * question gets asked in the room, and the honest answer is a table, not a
 * paragraph.
 *
 * Nothing here is re-derived. Every value is read off the same `DemoCase` the
 * money trail, the map and the alert render, so if the panel and a page ever
 * disagreed it would mean the case itself had two values — which the data layer
 * makes impossible.
 */
export function SourceDataLauncher({ className = '' }: { className?: string }) {
  const { activeCase, hydrated } = useDemoCase();
  const [open, setOpen] = useState(false);

  // Escape closes it. A modal surface that traps a presenter mid-demo is worse
  // than no panel at all.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const disabled = !hydrated || activeCase === null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={
          disabled
            ? 'No case has been referred from the reporting portal yet'
            : 'Show the complaint and transaction rows this case was built from'
        }
        className={`flex w-full items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[11.5px] transition-colors ${
          disabled
            ? 'cursor-not-allowed text-ink-300'
            : 'text-ink-700 hover:border-line-strong hover:text-ink-900'
        } ${className}`}
      >
        <Database className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Source data
      </button>

      {open && activeCase !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Source data for this case"
          className="fixed inset-0 z-50 flex justify-end"
        >
          <button
            type="button"
            aria-label="Close source data"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
          />

          <div className="relative flex h-full w-full max-w-3xl flex-col border-l border-line bg-paper shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-ink-900">Source data</h2>
                <p className="mt-0.5 text-[11.5px] text-ink-500">
                  Everything this case was built from — the complaint as filed, and the transaction
                  rows the reconstruction read.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 rounded-md border border-line p-1.5 text-ink-500 transition-colors hover:text-ink-900"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {/* ---------------- input ---------------- */}
              <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
                Input · complaint data
              </h3>
              <dl className="mt-2 grid gap-x-6 gap-y-3 rounded-lg border border-line bg-surface px-4 py-3 sm:grid-cols-3">
                {[
                  ['Complaint ID', activeCase.complaint.complaint_id],
                  ['Fraud type', activeCase.complaint.complaint_type],
                  ['Amount', rupees(activeCase.complaint.fraud_amount_inr)],
                  ['Victim account', activeCase.complaint.victim_account],
                  ['Victim bank', activeCase.complaint.victim_bank],
                  ['Transaction ID', activeCase.complaint.transaction_id],
                  [
                    'Incident timestamp',
                    `${activeCase.complaint.incident_date} ${activeCase.complaint.incident_time} IST`,
                  ],
                  ['Filed at', new Date(activeCase.complaint.submitted_at).toLocaleString('en-IN')],
                  ['Case ID', activeCase.case_id],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">{label}</dt>
                    <dd className="mt-0.5 break-words text-[12.5px] text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>

              {/* ---------------- ledger join ---------------- */}
              <div
                className={`mt-3 rounded-lg border px-4 py-2.5 text-[11.5px] leading-relaxed ${
                  activeCase.ledger_match
                    ? 'border-evidence-strong/30 bg-evidence-strong/5 text-ink-700'
                    : 'border-severity-medium/40 bg-severity-medium/5 text-ink-700'
                }`}
              >
                {activeCase.ledger_match ? (
                  <>
                    <span className="font-mono">{activeCase.complaint.transaction_id}</span> matched
                    the synthetic ledger record{' '}
                    <span className="font-mono">{activeCase.ledger_template}</span>. The rows below
                    are that record, with rupee amounts computed from the complaint&rsquo;s own
                    figure.
                  </>
                ) : (
                  <>
                    <span className="font-mono">{activeCase.complaint.transaction_id}</span> is not a
                    seeded ledger reference. The chain below was derived deterministically from the
                    reference itself against template{' '}
                    <span className="font-mono">{activeCase.ledger_template}</span> — the same
                    reference always yields the same trail — and the case carries one evidence band
                    less because of it.
                  </>
                )}
              </div>

              {horizonRanAhead(activeCase) && (
                <p className="mt-2 rounded-lg border border-severity-medium/40 bg-severity-medium/5 px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-700">
                  The incident was reported close enough to the filing instant that most of the
                  ledger chain had not happened yet. The reconstruction horizon was extended to{' '}
                  <span className="font-mono">{activeCase.as_of.slice(0, 16).replace('T', ' ')}</span>{' '}
                  so the trail is not empty. In a deployment the bound would stay at the complaint
                  instant and the trail would fill in as banks reported.
                </p>
              )}

              {/* ---------------- transaction rows ---------------- */}
              <h3 className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
                Analysis · transaction data ({activeCase.transactions.length} rows)
              </h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[46rem] text-left text-[11.5px]">
                  <thead className="bg-surface">
                    <tr className="text-[10px] uppercase tracking-wider text-ink-500">
                      <th className="px-3 py-2 font-medium">Txn ref</th>
                      <th className="px-3 py-2 font-medium">Sender</th>
                      <th className="px-3 py-2 font-medium">Receiver</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Timestamp (IST)</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {activeCase.transactions.map((txn) => (
                      <tr key={txn.txn_ref} className="bg-paper">
                        <td className="px-3 py-2 font-mono text-ink-900">{txn.txn_ref}</td>
                        <td className="px-3 py-2 text-ink-700">
                          {txn.from_account}
                          <span className="block text-[10px] text-ink-500">{txn.from_label}</span>
                        </td>
                        <td className="px-3 py-2 text-ink-700">
                          {txn.to_account}
                          <span className="block text-[10px] text-ink-500">{txn.to_label}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-900">
                          {rupees(txn.amount_inr)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-ink-700">
                          {txn.occurred_at.slice(0, 10)} {txn.occurred_at.slice(11, 16)}
                        </td>
                        <td className="px-3 py-2 text-ink-700">
                          {txn.type === 'CASH_WITHDRAWAL' ? `Cash-out · ${txn.channel}` : `Transfer · ${txn.rail}`}
                        </td>
                        <td className="px-3 py-2 text-ink-500">{txn.location ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ---------------- features ---------------- */}
              <h3 className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
                Analysis · features the ranker read
              </h3>
              <dl className="mt-2 grid gap-x-6 gap-y-2.5 rounded-lg border border-line bg-surface px-4 py-3 sm:grid-cols-3">
                {Object.entries(activeCase.features).map(([name, value]) => (
                  <div key={name}>
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">
                      {name.replace(/_/g, ' ')}
                    </dt>
                    <dd className="mt-0.5 text-[12.5px] tabular-nums text-ink-900">
                      {Array.isArray(value) ? (value.join(', ') || '—') : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* ---------------- output ---------------- */}
              <h3 className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
                Output · ranked candidates ({activeCase.locations.length} endpoints scored)
              </h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[38rem] text-left text-[11.5px]">
                  <thead className="bg-surface">
                    <tr className="text-[10px] uppercase tracking-wider text-ink-500">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Endpoint</th>
                      <th className="px-3 py-2 text-right font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">Window (IST)</th>
                      <th className="px-3 py-2 font-medium">Weighted features</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {activeCase.locations.map((location) => (
                      <tr key={location.endpoint_id} className="bg-paper">
                        <td className="px-3 py-2 tabular-nums text-ink-500">{location.rank}</td>
                        <td className="px-3 py-2 text-ink-900">
                          {location.endpoint_id}
                          <span className="block text-[10px] text-ink-500">{location.name}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-900">
                          {location.score.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-ink-700">
                          {location.window_start.slice(11, 16)}–{location.window_end.slice(11, 16)}
                        </td>
                        <td className="px-3 py-2 text-[10.5px] text-ink-500">
                          {location.features
                            .map((f) => `${f.name} ${(f.value * f.weight).toFixed(3)}`)
                            .join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-[11px] italic leading-relaxed text-ink-500">
                Scores are a weighted mean of the five stated features, each on 0–1. They order
                candidates for tasking. They are not calibrated probabilities, no ranker has been
                trained on this data, and nothing here should be read as a likelihood that a
                withdrawal will occur.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
