'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { defaultComplaintDraft, parseAmount, rupees, type ComplaintDraft } from '@/lib/demo/defaults';
import { SEEDED_TRANSACTION_REFS, resolveTemplate } from '@/lib/demo/ledger';
import { useDemoCase } from '@/lib/demo/store';
import { COMPLAINT_TYPES } from '@/lib/demo/types';

/**
 * Complaint registration.
 *
 * Every field is editable and every field is used. What the presenter types is
 * what `buildDemoCase` derives the case from, so the amount on this form is the
 * amount in the alert, and the transaction reference typed here is the
 * reference on the first hop of the money trail. There is no second set of
 * values anywhere.
 *
 * ## Two things this form deliberately does
 *
 * **It shows the ledger join live.** As soon as a transaction reference is
 * typed, the panel on the right says whether it names a seeded synthetic record
 * and what shape of chain that record has. A judge asking "so what is it
 * actually matching on?" gets an answer before the complaint is even filed, and
 * a presenter who mistypes finds out here rather than three screens later.
 *
 * **It collects no real personal data.** The mobile number is masked by default
 * and nothing on this page leaves the browser. This is a demonstration
 * interface; a live portal would need consent, retention and transport rules
 * that a hackathon build has no business pretending to implement.
 */

const FIELD =
  'w-full rounded-md border border-[#C6D0DC] bg-white px-3 py-2.5 text-[14px] text-[#1B2733] ' +
  'placeholder-[#98A6B8] transition-colors focus:border-[#1A3A6B] focus:outline-none';
const LABEL = 'mb-1.5 block text-[12.5px] font-medium text-[#3D4C5E]';
const HINT = 'mt-1 text-[11.5px] leading-snug text-[#7A8798]';

function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#D8DFE8] bg-white">
      <div className="flex items-start gap-3 border-b border-[#E7ECF2] px-5 py-3.5">
        <span
          aria-hidden
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1A3A6B] text-[12px] font-semibold text-white"
        >
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#1B2733]">{title}</h2>
          <p className="mt-0.5 text-[12px] text-[#5A6A7D]">{subtitle}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export default function NcrpComplaintForm() {
  const router = useRouter();
  const { submit, stage, complaint, hydrated } = useDemoCase();

  // Safe to read the wall clock in an initialiser because this component is
  // mounted client-only — see the `ssr: false` import in `app/ncrp/page.tsx`.
  // The defaults are relative to now, and a value like that computed during a
  // server pass would differ from the browser's and React would discard the
  // tree it hydrated into.
  const [draft, setDraft] = useState<ComplaintDraft>(() => defaultComplaintDraft());

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof ComplaintDraft>(key: K, value: ComplaintDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const amount = parseAmount(draft.fraud_amount);
  const ledger = resolveTemplate(draft.transaction_id);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = parseAmount(draft.fraud_amount);
    if (parsed === null) {
      setError('Enter the amount lost as a number, for example 1840000 or 18,40,000.');
      return;
    }
    if (draft.victim_account.trim() === '' || draft.transaction_id.trim() === '') {
      setError('The account reference and the transaction reference are both needed to trace the money.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const stored = submit({
      complaint_type: draft.complaint_type,
      incident_date: draft.incident_date,
      incident_time: draft.incident_time,
      fraud_amount_inr: parsed,
      victim_bank: draft.victim_bank.trim(),
      victim_account: draft.victim_account.trim(),
      transaction_id: draft.transaction_id.trim().toUpperCase(),
      mobile: draft.mobile.trim(),
      description: draft.description.trim(),
      state: draft.state.trim(),
      district: draft.district.trim(),
      supporting_document: draft.supporting_document,
    });
    // The reference is minted by the store, so the acknowledgement reads it
    // back rather than being handed a copy. One record, one identity.
    void stored;
    router.push('/ncrp/acknowledgement');
  }

  return (
    <>
      {hydrated && stage !== 'NONE' && complaint !== null && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#BBD5F0] bg-[#EAF3FC] px-4 py-3">
          <p className="text-[13px] text-[#1A3A6B]">
            Complaint <strong className="font-semibold">{complaint.complaint_id}</strong> is already
            registered in this browser.
          </p>
          <Link
            href="/ncrp/acknowledgement"
            className="rounded-md bg-[#1A3A6B] px-3 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Open acknowledgement
          </Link>
        </div>
      )}

      <div className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-tight text-[#1B2733]">
          Report a cyber financial fraud
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#5A6A7D]">
          Report money lost to online fraud. The sooner a complaint is filed, the more of the trail
          is still traceable — the first few hours are when a transfer can still be stopped.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-4">
          <Section
            step={1}
            title="What happened"
            subtitle="The category and when it took place."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={LABEL} htmlFor="complaint-type">
                  Complaint type
                </label>
                <select
                  id="complaint-type"
                  className={FIELD}
                  value={draft.complaint_type}
                  onChange={(e) =>
                    set('complaint_type', e.target.value as ComplaintDraft['complaint_type'])
                  }
                >
                  {COMPLAINT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={LABEL} htmlFor="incident-date">
                  Incident date
                </label>
                <input
                  id="incident-date"
                  type="date"
                  className={FIELD}
                  value={draft.incident_date}
                  onChange={(e) => set('incident_date', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className={LABEL} htmlFor="incident-time">
                  Incident time
                </label>
                <input
                  id="incident-time"
                  type="time"
                  className={FIELD}
                  value={draft.incident_time}
                  onChange={(e) => set('incident_time', e.target.value)}
                  required
                />
                <p className={HINT}>
                  When the money left the account, as closely as you can recall. Everything ATLAS
                  reconstructs is measured from this instant.
                </p>
              </div>
            </div>
          </Section>

          <Section
            step={2}
            title="The money"
            subtitle="The amount lost and the account it left."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="fraud-amount">
                  Fraud amount (₹)
                </label>
                <input
                  id="fraud-amount"
                  inputMode="numeric"
                  className={FIELD}
                  value={draft.fraud_amount}
                  onChange={(e) => set('fraud_amount', e.target.value)}
                  placeholder="1840000"
                  required
                />
                <p className={HINT}>
                  {amount === null
                    ? 'Enter a number — 1840000, or 18,40,000.'
                    : `${rupees(amount)} — this exact figure is what the case will carry.`}
                </p>
              </div>

              <div>
                <label className={LABEL} htmlFor="victim-bank">
                  Victim bank
                </label>
                <input
                  id="victim-bank"
                  className={FIELD}
                  value={draft.victim_bank}
                  onChange={(e) => set('victim_bank', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className={LABEL} htmlFor="victim-account">
                  Victim account
                </label>
                <input
                  id="victim-account"
                  className={FIELD}
                  value={draft.victim_account}
                  onChange={(e) => set('victim_account', e.target.value)}
                  placeholder="XXXX4471"
                  required
                />
                <p className={HINT}>
                  Masked reference is enough. The last four digits are what the money trail is keyed
                  on.
                </p>
              </div>

              <div>
                <label className={LABEL} htmlFor="transaction-id">
                  Transaction ID
                </label>
                <input
                  id="transaction-id"
                  className={`${FIELD} font-mono`}
                  value={draft.transaction_id}
                  onChange={(e) => set('transaction_id', e.target.value)}
                  placeholder="TXN001"
                  required
                />
                <p className={HINT}>
                  The reference on the disputed debit. This is the identifier the analysis joins on.
                </p>
              </div>
            </div>
          </Section>

          <Section
            step={3}
            title="Contact and location"
            subtitle="Where the complaint should be routed."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={LABEL} htmlFor="mobile">
                  Mobile number
                </label>
                <input
                  id="mobile"
                  className={FIELD}
                  value={draft.mobile}
                  onChange={(e) => set('mobile', e.target.value)}
                  placeholder="98XXXXXX21"
                />
                <p className={HINT}>Masked by default. Nothing on this form leaves the browser.</p>
              </div>
              <div>
                <label className={LABEL} htmlFor="state">
                  State / UT
                </label>
                <input
                  id="state"
                  className={FIELD}
                  value={draft.state}
                  onChange={(e) => set('state', e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="district">
                  District
                </label>
                <input
                  id="district"
                  className={FIELD}
                  value={draft.district}
                  onChange={(e) => set('district', e.target.value)}
                />
              </div>
            </div>
          </Section>

          <Section
            step={4}
            title="Description and evidence"
            subtitle="What the caller said, and anything you can attach."
          >
            <label className={LABEL} htmlFor="description">
              Description of the incident
            </label>
            <textarea
              id="description"
              rows={5}
              className={FIELD}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />

            <div className="mt-4">
              <label className={LABEL} htmlFor="document">
                Supporting document
              </label>
              <input
                id="document"
                type="file"
                className="block w-full text-[13px] text-[#3D4C5E] file:mr-3 file:rounded-md file:border file:border-[#C6D0DC] file:bg-[#F4F6F9] file:px-3 file:py-2 file:text-[13px] file:text-[#1A3A6B]"
                onChange={(e) => set('supporting_document', e.target.files?.[0]?.name ?? null)}
              />
              <p className={HINT}>
                {draft.supporting_document === null
                  ? 'Optional — a bank statement or a screenshot.'
                  : `Attached: ${draft.supporting_document}`}{' '}
                Only the file name is recorded; the demo never reads or uploads file contents.
              </p>
            </div>
          </Section>

          {error !== null && (
            <p
              role="alert"
              className="rounded-md border border-[#E0B4B4] bg-[#FDF0F0] px-4 py-3 text-[13px] text-[#9B2C2C]"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#1A3A6B] px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? 'Registering…' : 'Submit complaint'}
            </button>
            <button
              type="button"
              onClick={() => setDraft(defaultComplaintDraft())}
              className="rounded-md border border-[#C6D0DC] px-4 py-2.5 text-[13.5px] text-[#3D4C5E] transition-colors hover:border-[#98A6B8]"
            >
              Restore demo defaults
            </button>
          </div>
        </div>

        {/* --- the join, shown while typing ------------------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          <div className="rounded-lg border border-[#D8DFE8] bg-white">
            <div className="border-b border-[#E7ECF2] px-4 py-3">
              <h2 className="text-[13.5px] font-semibold text-[#1B2733]">What ATLAS will receive</h2>
              <p className="mt-0.5 text-[11.5px] text-[#7A8798]">
                Updates as you type. These are the exact values the case is built from.
              </p>
            </div>
            <dl className="divide-y divide-[#EEF2F6] text-[12.5px]">
              {[
                ['Complaint type', draft.complaint_type],
                ['Incident', `${draft.incident_date} · ${draft.incident_time} IST`],
                ['Amount', amount === null ? '—' : rupees(amount)],
                ['Victim account', draft.victim_account || '—'],
                ['Transaction ID', draft.transaction_id || '—'],
                ['Bank', draft.victim_bank || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-2">
                  <dt className="shrink-0 text-[#7A8798]">{label}</dt>
                  <dd className="min-w-0 truncate text-right font-medium text-[#1B2733]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Always present: `resolveTemplate` answers for any reference, seeded
              or not, and the two answers are what the panel distinguishes. */}
          <div
              className={`rounded-lg border px-4 py-3 ${
                ledger.matched
                  ? 'border-[#B7DCC3] bg-[#F0F9F3]'
                  : 'border-[#E4D7B4] bg-[#FFF7E3]'
              }`}
            >
              <h2 className="text-[13px] font-semibold text-[#1B2733]">
                {ledger.matched ? 'Matched in the transaction ledger' : 'No ledger record for this reference'}
              </h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[#4A5A6D]">
                {ledger.matched ? (
                  <>
                    <span className="font-mono">{draft.transaction_id.toUpperCase()}</span> names a
                    seeded synthetic record: {ledger.template.description.toLowerCase()}, traced to a
                    depth of {ledger.template.maxDepth}.
                  </>
                ) : (
                  <>
                    Nothing in the synthetic ledger is keyed on{' '}
                    <span className="font-mono">{draft.transaction_id.toUpperCase() || '—'}</span>.
                    ATLAS will still trace it — the chain is derived from the reference itself, so
                    it is the same every time you type it — but the case carries one evidence band
                    less, and says why.
                  </>
                )}
              </p>
              <p className="mt-2 text-[11px] text-[#7A8798]">
                Seeded references: {SEEDED_TRANSACTION_REFS.join(', ')}
              </p>
            </div>

          <div className="rounded-lg border border-[#D8DFE8] bg-white px-4 py-3">
            <h2 className="text-[13px] font-semibold text-[#1B2733]">After you submit</h2>
            <ol className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-[#5A6A7D]">
              <li>1. A complaint reference is issued and the record is stored.</li>
              <li>2. You choose to send it to ATLAS, the investigator console.</li>
              <li>3. ATLAS opens a case on this complaint and reconstructs the money trail.</li>
              <li>4. Ranked cash-out locations and an alert follow from that trail.</li>
            </ol>
          </div>
        </aside>
      </form>
    </>
  );
}
