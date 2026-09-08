'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError } from '@/lib/api';
import { rupees } from '@/lib/demo/defaults';
import { useNcrpComplaint } from '@/lib/demo/store';
import { apiTypologyFor } from '@/lib/demo/typology';
import { istInstant } from '@/lib/demo/time';
import { runInvestigation, STAGES, type StageKey, type StageState } from '@/lib/run-investigation';

/**
 * The acknowledgement, and the handover.
 *
 * **"Send to ATLAS" runs the real pipeline.** It calls `runInvestigation` —
 * the same function `/demo` and `/new-complaint` call — with the values this
 * citizen typed. Four of its six stages are real API calls: the complaint is
 * POSTed and stamped with `observed_at`, a transaction chain is built for
 * *this* complaint, the trail is walked by the graph endpoint, and the alert
 * policy decides and records. One pipeline, one case, one set of numbers.
 *
 * The complaint reference minted at filing is passed straight through as
 * `caseRef`, so the reference on this page is the reference on the case, the
 * trail and the alert.
 *
 * Fields ATLAS has no column for — bank, masked account, transaction reference,
 * mobile — stay on this page and are not sent. ATLAS forecasts the cash-out leg
 * of reported fraud and never scores individuals, so victim identity is data it
 * has no use for.
 */

const STAGE_TONE: Record<StageState, string> = {
  pending: 'text-[#98A6B8]',
  running: 'text-[#1A3A6B]',
  done: 'text-[#2E7D4F]',
  failed: 'text-[#9B2C2C]',
};

export default function AcknowledgementPage() {
  const router = useRouter();
  const { hydrated, complaint, stage, markReferred, referredAt } = useNcrpComplaint();

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<Partial<Record<StageKey, StageState>>>({});

  if (!hydrated) {
    return <p className="py-16 text-center text-[13px] text-[#7A8798]">Loading…</p>;
  }

  if (complaint === null) {
    return (
      <div className="rounded-lg border border-[#D8DFE8] bg-white px-6 py-10 text-center">
        <h1 className="text-[18px] font-semibold text-[#1B2733]">No complaint registered</h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#5A6A7D]">
          Nothing has been filed from this browser yet. File a complaint and the acknowledgement,
          with its reference, appears here.
        </p>
        <Link
          href="/ncrp"
          className="mt-5 inline-block rounded-md bg-[#1A3A6B] px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          File a complaint
        </Link>
      </div>
    );
  }

  const referred = stage === 'REFERRED';

  async function onSend() {
    if (complaint === null) return;
    setSending(true);
    setError(null);
    setStages({});
    try {
      await runInvestigation({
        complaint: {
          // The portal's reference *is* the case reference. Everything ATLAS
          // shows downstream is keyed on it.
          caseRef: complaint.complaint_id,
          typology: apiTypologyFor(complaint.complaint_type),
          amount: `${complaint.fraud_amount_inr}.00`,
          fraudStartedAt: istInstant(complaint.incident_date, complaint.incident_time),
          reportedAt: complaint.submitted_at,
          narrative: complaint.description.trim() || null,
          // The citizen reported the account they lost money *from*, not the
          // one it went to. Sending it as a beneficiary would file a fact the
          // complaint does not contain.
          beneficiaryAccount: null,
          beneficiaryIfsc: null,
        },
        onStage: (key, state) => setStages((current) => ({ ...current, [key]: state })),
      });
      markReferred();
      router.push('/investigation');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.message}${err.correlationId ? ` (ref ${err.correlationId.slice(0, 8)})` : ''}`
          : 'Could not reach ATLAS. Start the API and try again.',
      );
      setSending(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border border-[#B7DCC3] bg-[#F0F9F3] px-5 py-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#2E7D4F] text-[16px] font-bold text-white"
          >
            ✓
          </span>
          <div className="min-w-0">
            <h1 className="text-[19px] font-semibold text-[#14532D]">Complaint registered</h1>
            <p className="mt-1 text-[13px] text-[#3A6B4E]">
              Keep this reference. It identifies the complaint everywhere it is handled.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-[#C8E3D2] bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-[#7A8798]">Complaint reference</p>
            <p className="mt-1 break-all font-mono text-[16px] font-semibold text-[#1B2733]">
              {complaint.complaint_id}
            </p>
          </div>
          <div className="rounded-md border border-[#C8E3D2] bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-[#7A8798]">Status</p>
            <p className="mt-1 text-[16px] font-semibold text-[#1B2733]">
              {referred ? 'Referred to ATLAS' : 'Submitted'}
            </p>
          </div>
          <div className="rounded-md border border-[#C8E3D2] bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-[#7A8798]">Filed at</p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#1B2733]">
              {new Date(complaint.submitted_at).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 rounded-lg border border-[#D8DFE8] bg-white">
          <div className="border-b border-[#E7ECF2] px-5 py-3.5">
            <h2 className="text-[15px] font-semibold text-[#1B2733]">Complaint record</h2>
            <p className="mt-0.5 text-[12px] text-[#5A6A7D]">Exactly as filed.</p>
          </div>
          <dl className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
            {[
              ['Complaint type', complaint.complaint_type],
              [
                'Incident',
                `${new Date(`${complaint.incident_date}T00:00:00`).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })} · ${complaint.incident_time} IST`,
              ],
              ['Fraud amount', rupees(complaint.fraud_amount_inr)],
              ['Victim bank', complaint.victim_bank],
              ['Victim account', complaint.victim_account],
              ['Transaction ID', complaint.transaction_id],
              ['Mobile', complaint.mobile || '—'],
              ['Jurisdiction', `${complaint.district}, ${complaint.state}`],
              ['Supporting document', complaint.supporting_document ?? 'None attached'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11.5px] uppercase tracking-wider text-[#7A8798]">{label}</dt>
                <dd className="mt-0.5 break-words text-[14px] text-[#1B2733]">{value}</dd>
              </div>
            ))}
            <div className="sm:col-span-2">
              <dt className="text-[11.5px] uppercase tracking-wider text-[#7A8798]">Description</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#3D4C5E]">
                {complaint.description || '—'}
              </dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-[#D8DFE8] bg-white p-5">
            <h2 className="text-[15px] font-semibold text-[#1B2733]">Refer to ATLAS</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#5A6A7D]">
              ATLAS is the investigator console for this prototype. Referring the complaint files it
              against reference{' '}
              <span className="font-mono text-[12px] text-[#1B2733]">{complaint.complaint_id}</span>,
              builds a transaction chain totalling{' '}
              <span className="font-semibold text-[#1B2733]">
                {rupees(complaint.fraud_amount_inr)}
              </span>
              , walks the money trail and runs the alert policy.
            </p>

            {(sending || referred) && (
              <ol className="mt-3.5 space-y-1.5 border-t border-[#E7ECF2] pt-3">
                {STAGES.map((s) => {
                  const state = stages[s.key] ?? (referred && !sending ? 'done' : 'pending');
                  return (
                    <li key={s.key} className="flex items-baseline justify-between gap-2 text-[12px]">
                      <span className={STAGE_TONE[state]}>
                        {state === 'done' ? '✓' : state === 'failed' ? '✕' : '·'} {s.label}
                      </span>
                      <span className="shrink-0 text-[9.5px] uppercase tracking-wider text-[#98A6B8]">
                        {s.source === 'live' ? 'live API' : 'simulated'}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            {error !== null && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-[#E0B4B4] bg-[#FDF0F0] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#9B2C2C]"
              >
                {error}
              </p>
            )}

            {referred ? (
              <>
                <p className="mt-3 rounded-md border border-[#BBD5F0] bg-[#EAF3FC] px-3 py-2.5 text-[12.5px] text-[#1A3A6B]">
                  Referred
                  {referredAt !== null &&
                    ` at ${new Date(referredAt).toLocaleTimeString('en-IN', { timeStyle: 'short' })}`}
                  .
                </p>
                <Link
                  href="/investigation"
                  className="mt-3 block rounded-md bg-[#1A3A6B] px-4 py-2.5 text-center text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Open ATLAS
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void onSend()}
                disabled={sending}
                className="mt-4 w-full rounded-md bg-[#1A3A6B] px-4 py-3 text-[14.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {sending ? 'Referring…' : 'Send to ATLAS →'}
              </button>
            )}
          </div>

          <div className="rounded-lg border border-[#D8DFE8] bg-white px-4 py-3.5">
            <h2 className="text-[13px] font-semibold text-[#1B2733]">What ATLAS will not receive</h2>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#5A6A7D]">
              No name, no address, no mobile number, and no bank or account reference. ATLAS
              forecasts where stolen money is withdrawn; it never scores individuals, so victim
              identity is data it has no use for. The complaint reference is the link back to this
              portal.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
