'use client';

import dynamic from 'next/dynamic';

/**
 * The complaint form, mounted client-only.
 *
 * `ssr: false` because the form's opening values are relative to the wall clock
 * — the incident defaults to five hours ago, which is what puts the synthetic
 * ledger's hops behind the filing instant and its predicted windows ahead of
 * it. A value like that computed during a server pass would not match the one
 * the browser computes a moment later, and React discards a tree that hydrates
 * into a mismatch.
 *
 * The alternative, seeding from an effect, renders an empty form for a frame.
 * On a projector that reads as a bug.
 */
const NcrpComplaintForm = dynamic(() => import('@/components/ncrp/ComplaintForm'), {
  ssr: false,
  loading: () => (
    <p className="py-16 text-center text-[13px] text-[#7A8798]">Loading the complaint form…</p>
  ),
});

export default function NcrpPage() {
  return <NcrpComplaintForm />;
}
