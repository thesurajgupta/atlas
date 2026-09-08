import Link from 'next/link';

import { ResetDemoButton } from '@/components/demo/ResetDemoButton';

/**
 * The citizen-facing half of the demo.
 *
 * Deliberately a different product from the console next door: light, roomy,
 * one column, large controls, no jargon. The two surfaces are meant to feel
 * unrelated, because the story the demo tells is that a citizen files a
 * complaint into a public portal and an investigator picks it up in a
 * jurisdiction-scoped intelligence system. If they looked alike the handover
 * would read as a tab change.
 *
 * ## What this is not
 *
 * It is not the National Cybercrime Reporting Portal, it carries no government
 * emblem or seal, and it is not connected to any government system. It is a
 * demonstration interface built for an SIH presentation, it stores only what
 * the presenter types, and it says so on every screen. The colours are the
 * conventional Indian public-service palette; the wording is ours.
 *
 * The root layout puts `dark` on `<html>` and a dark colour on `<body>`, so
 * this shell paints its own light ground and sets `color-scheme: light` for the
 * form controls and scrollbars inside it.
 */
export default function NcrpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ncrp-surface min-h-dvh bg-[#F4F6F9] text-[#1B2733]">
      <div className="h-1 w-full bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

      <header className="border-b border-[#D8DFE8] bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <Link href="/ncrp" className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[#1A3A6B] text-[15px] font-bold tracking-tight text-[#1A3A6B]"
            >
              CRP
            </span>
            <span className="min-w-0">
              <span className="block text-[17px] font-semibold leading-tight text-[#1A3A6B]">
                Cyber Crime Reporting Portal
              </span>
              <span className="block text-[11.5px] leading-tight text-[#5A6A7D]">
                NCRP-style complaint intake · demonstration build
              </span>
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-1 text-[12.5px]">
            <Link
              href="/ncrp"
              className="rounded px-2.5 py-1.5 text-[#1A3A6B] transition-colors hover:bg-[#EDF2F8]"
            >
              File a complaint
            </Link>
            <Link
              href="/ncrp/acknowledgement"
              className="rounded px-2.5 py-1.5 text-[#1A3A6B] transition-colors hover:bg-[#EDF2F8]"
            >
              Track complaint
            </Link>
            <span className="w-[7.5rem]">
              <ResetDemoButton
                className="rounded border border-[#D8DFE8] px-2.5 py-1.5 text-[#5A6A7D] transition-colors hover:border-[#B9C5D4] hover:text-[#1B2733]"
                redirectTo="/ncrp"
              />
            </span>
          </nav>
        </div>
      </header>

      {/* Unmissable, once, at the top — not a footnote a reader has to find. */}
      <p className="border-b border-[#E4D7B4] bg-[#FFF7E3] px-5 py-2 text-center text-[12px] text-[#6B5518]">
        Demo interface for SIH presentation. Not the National Cybercrime Reporting Portal, not
        connected to any government system, and not monitored. Every record is synthetic.
      </p>

      <main className="mx-auto max-w-5xl px-5 py-7">{children}</main>

      <footer className="mt-8 border-t border-[#D8DFE8] bg-white">
        <div className="mx-auto max-w-5xl px-5 py-5 text-[11.5px] leading-relaxed text-[#5A6A7D]">
          <p>
            Built for <strong className="font-semibold text-[#1B2733]">SIH26184</strong> — predictive
            cash-out intelligence for cybercrime complaints. This portal is the input half of that
            prototype; complaints filed here open a case in the ATLAS investigator console.
          </p>
          <p className="mt-1.5">
            A referred complaint sends its reference, category, amount, incident time and
            description to the ATLAS prototype. Contact details, bank and account references are
            not sent — they stay in this browser and can be cleared with{" "}
            <span className="font-medium">Reset demo</span>.
          </p>
        </div>
      </footer>
    </div>
  );
}
