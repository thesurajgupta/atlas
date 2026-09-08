'use client';

import Link from 'next/link';

import { rupees } from '@/lib/demo/defaults';
import { useDemoCase } from '@/lib/demo/store';

/**
 * The one-line answer to "which case am I looking at?".
 *
 * It sits at the top of every screen the referred complaint drives, and it
 * carries the four values that must never differ between two pages: complaint
 * reference, case id, victim account and amount. Putting them on every screen
 * is not redundancy — it is the check. If a page ever rendered a different
 * trail, network or ranking from the one named here, the banner is where a
 * reader would catch it.
 *
 * When nothing has been referred, it says so and points at the portal rather
 * than leaving the page's fixture to be mistaken for a live case.
 */
export function CaseBanner({ page }: { page: string }) {
  const { hydrated, activeCase, complaint, stage } = useDemoCase();

  if (!hydrated) return null;

  if (activeCase === null) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-line bg-surface px-3.5 py-2.5">
        <p className="text-[12px] text-ink-500">
          No complaint has been referred to ATLAS. {page} is showing its development fixture.
        </p>
        <Link
          href={stage === 'SUBMITTED' ? '/ncrp/acknowledgement' : '/ncrp'}
          className="shrink-0 text-[11.5px] text-accent transition-opacity hover:opacity-80"
        >
          {complaint === null
            ? 'File a complaint in the reporting portal →'
            : `Refer ${complaint.complaint_id} to ATLAS →`}
        </Link>
      </div>
    );
  }

  const { complaint: filed } = activeCase;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-accent/30 bg-accent/5 px-3.5 py-2.5">
      <span className="rounded-sm border border-accent/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
        Live case
      </span>
      {[
        ['Complaint', filed.complaint_id],
        ['Case', activeCase.case_id],
        ['Victim account', filed.victim_account],
        ['Transaction', filed.transaction_id],
        ['Amount', rupees(filed.fraud_amount_inr)],
      ].map(([label, value]) => (
        <span key={label} className="min-w-0">
          <span className="block text-[9.5px] uppercase tracking-wider text-ink-500">{label}</span>
          <span className="block truncate font-mono text-[12px] font-medium text-ink-900">
            {value}
          </span>
        </span>
      ))}
      <Link
        href="/pipeline"
        className="ml-auto shrink-0 text-[11.5px] text-accent transition-opacity hover:opacity-80"
      >
        Analysis pipeline →
      </Link>
    </div>
  );
}
