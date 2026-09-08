'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { rupees } from '@/lib/demo/defaults';
import { useDemoCase } from '@/lib/demo/store';

/**
 * The acknowledgement, and the handover.
 *
 * "Send to ATLAS" is a real transition, not a link dressed as a button: it
 * moves the stored complaint from `SUBMITTED` to `IN_ATLAS`, which is what
 * makes the case appear on the console's case list, its alert appear on the
 * alerts page and its candidates appear on the map. Before that click ATLAS has
 * nothing, and every one of those screens says so.
 *
 * The reference and every field below are read back out of the store rather
 * than passed through the router, so what this page prints is what was
 * persisted — if the two could differ, this is the screen where it would show.
 */
export default function AcknowledgementPage() {
  const router = useRouter();
  const { hydrated, complaint, stage, demoCase, sendToAtlas, sentToAtlasAt } = useDemoCase();
  const [sending, setSending] = useState(false);

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

  const sent = stage === 'IN_ATLAS';

  function onSend() {
    setSending(true);
    sendToAtlas();
    // Straight into the intake screen, which is where the pipeline runs. The
    // navigation is the last step, so a failure to persist would keep us here
    // rather than landing on a console with nothing behind it.
    router.push('/atlas-intake');
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
              {sent ? 'Referred to ATLAS' : 'Submitted'}
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
            <p className="mt-0.5 text-[12px] text-[#5A6A7D]">
              Exactly as filed. Every field below is what the investigator will see.
            </p>
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
              ATLAS is the investigator console for this prototype. Referring the complaint opens a
              case against{' '}
              <span className="font-mono text-[12px] text-[#1B2733]">{complaint.transaction_id}</span>,
              reconstructs the money trail from{' '}
              <span className="font-mono text-[12px] text-[#1B2733]">{complaint.victim_account}</span>{' '}
              and ranks the cash-out endpoints it can reach.
            </p>

            {sent ? (
              <>
                <p className="mt-4 rounded-md border border-[#BBD5F0] bg-[#EAF3FC] px-3 py-2.5 text-[12.5px] text-[#1A3A6B]">
                  Referred{' '}
                  {sentToAtlasAt !== null &&
                    `at ${new Date(sentToAtlasAt).toLocaleTimeString('en-IN', { timeStyle: 'short' })}`}
                  . Case{' '}
                  <span className="font-mono font-semibold">{demoCase?.case_id}</span> is open.
                </p>
                <Link
                  href="/atlas-intake"
                  className="mt-3 block rounded-md bg-[#1A3A6B] px-4 py-2.5 text-center text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Open ATLAS
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={onSend}
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
              No name, no address, and nothing that identifies a person. ATLAS forecasts where
              stolen money is withdrawn; it never scores individuals, so victim identity is data it
              has no use for. The complaint reference is the link back to this portal.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
