'use client';

import Link from 'next/link';

import { rupees } from '@/lib/demo/defaults';
import { useDemoCase } from '@/lib/demo/store';
import { getCaseById } from '@/lib/mock-data';

import { WorkItemShell } from './WorkItemShell';

/**
 * Resolve a case reference to a case.
 *
 * The referred complaint's case is checked first, because it is the only one
 * whose reference is minted at run time and so the only one a build could not
 * have known about. Fixture cases still resolve behind it, unchanged.
 *
 * A client component because the referred case lives in this browser's store,
 * which the server cannot see. A server component here would 404 the case a
 * presenter just filed.
 */
export function CaseDetail({ caseId }: { caseId: string }) {
  const { hydrated, activeCase } = useDemoCase();

  if (activeCase !== null && activeCase.case_id === caseId) {
    const { complaint } = activeCase;
    return (
      <div>
        <WorkItemShell item={activeCase.atlas_case} />

        <div className="px-6 pb-8">
          <section className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <h2 className="text-[12px] font-medium uppercase tracking-wider text-ink-500">
                Complaint this case was opened on
              </h2>
              <Link
                href="/ncrp/acknowledgement"
                className="text-[11px] text-accent transition-opacity hover:opacity-80"
              >
                View in the reporting portal →
              </Link>
            </div>
            <dl className="grid gap-x-6 gap-y-3 px-4 py-3.5 sm:grid-cols-3">
              {[
                ['Complaint reference', complaint.complaint_id],
                ['Complaint type', complaint.complaint_type],
                ['Reported amount', rupees(complaint.fraud_amount_inr)],
                ['Victim bank', complaint.victim_bank],
                ['Victim account', complaint.victim_account],
                ['Transaction ID', complaint.transaction_id],
                [
                  'Incident',
                  `${complaint.incident_date} ${complaint.incident_time} IST`,
                ],
                ['Jurisdiction', `${complaint.district}, ${complaint.state}`],
                [
                  'Ledger join',
                  activeCase.ledger_match
                    ? `matched ${activeCase.ledger_template}`
                    : `derived from the reference (${activeCase.ledger_template})`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[10.5px] uppercase tracking-wider text-ink-500">{label}</dt>
                  <dd className="mt-0.5 break-words text-[13px] text-ink-900">{value}</dd>
                </div>
              ))}
              <div className="sm:col-span-3">
                <dt className="text-[10.5px] uppercase tracking-wider text-ink-500">Description</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-700">
                  {complaint.description || '—'}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
              {(
                [
                  [
                    'Investigation',
                    `/investigation?case=${encodeURIComponent(activeCase.case_id)}`,
                  ],
                  ['Analysis pipeline', '/pipeline'],
                  ['Transaction trail', '/money-trail'],
                  ['Network graph', '/network-graph'],
                  ['Predicted locations', '/predicted-locations'],
                  ['ATM / branch map', '/map'],
                  ['Alerts', '/alerts'],
                ] as const
              ).map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-md border border-line bg-raised px-2.5 py-1.5 text-[11.5px] text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
                >
                  {label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const fixture = getCaseById(caseId);
  if (fixture) return <WorkItemShell item={fixture} />;

  // Not `notFound()`. The store hydrates after the first client render, so a
  // referred case's reference is genuinely unknown for one frame — throwing a
  // 404 into that frame would make a case a presenter just opened flash "not
  // found" on every navigation to it.
  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      {!hydrated ? (
        <p className="text-[13px] text-ink-500">Loading case {caseId}…</p>
      ) : (
        <>
          <h1 className="text-[18px] font-semibold text-ink-900">No case {caseId}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
            Nothing in this browser matches that reference. A case referred from the reporting
            portal is cleared by <span className="text-ink-700">Reset demo</span>, and a case from
            the API needs a signed-in session.
          </p>
          <Link
            href="/cases"
            className="mt-5 inline-block rounded-md border border-line bg-raised px-4 py-2 text-[13px] text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
          >
            Back to cases
          </Link>
        </>
      )}
    </div>
  );
}
