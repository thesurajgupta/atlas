"use client";

import { useState } from "react";

/**
 * Outbound intelligence (spec §28.3) — mock, and labelled as mock.
 *
 * `atlas/intel/certification.py` is merged: the certification block, the scope
 * rules, the 72-hour ceiling and the Ed25519 signing all exist and are tested.
 * What does not exist is persistence or an endpoint, so there is nothing to
 * read. The shapes below mirror the dataclasses exactly, which is what makes
 * this page cheap to wire up rather than cheap to throw away.
 *
 * The one thing this page has to get right is **expiry**. `validate()` refuses
 * an expired package outright — it is a fact, not a suggestion, and an expired
 * package confers nothing. So an expired row here reads as revoked, not as
 * something that merely needs a nudge.
 */

interface Package {
  ref: string;
  recipient: string;
  caseRef: string;
  status: "DELIVERED" | "ACKNOWLEDGED" | "PENDING";
  issuedAt: string;
  expiresAt: string;
  officer: string;
  jurisdiction: string;
  legalBasis: string;
  purpose: string;
  accounts: number;
  endpoints: number;
}

// Fixed timestamps, not `Date.now()` offsets: a page whose expiry state depends
// on when it is opened cannot be screenshotted, reviewed or reasoned about.
const NOW = new Date("2026-09-06T18:00:00Z");

const PACKAGES: Package[] = [
  {
    ref: "PKG-2026-0431",
    recipient: "Bank A · fraud operations",
    caseRef: "CASE-2026-0914",
    status: "ACKNOWLEDGED",
    issuedAt: "2026-09-06T14:20:00Z",
    expiresAt: "2026-09-07T14:20:00Z",
    officer: "OFF-2291",
    jurisdiction: "DL-CYB",
    legalBasis: "CrPC §91 production request",
    purpose: "Freeze pending verification of a suspected mule account",
    accounts: 2,
    endpoints: 1,
  },
  {
    ref: "PKG-2026-0429",
    recipient: "Bank C · nodal officer",
    caseRef: "CASE-2026-0915",
    status: "DELIVERED",
    issuedAt: "2026-09-06T11:05:00Z",
    expiresAt: "2026-09-08T11:05:00Z",
    officer: "OFF-2291",
    jurisdiction: "DL-CYB",
    legalBasis: "CrPC §91 production request",
    purpose: "Transaction history for a single beneficiary account",
    accounts: 1,
    endpoints: 0,
  },
  {
    ref: "PKG-2026-0402",
    recipient: "Bank B · fraud operations",
    caseRef: "CASE-2026-0916",
    status: "PENDING",
    issuedAt: "2026-09-03T09:30:00Z",
    expiresAt: "2026-09-06T09:30:00Z", // already past NOW
    officer: "OFF-1877",
    jurisdiction: "DL-CYB",
    legalBasis: "CrPC §91 production request",
    purpose: "Lien marking on two accounts pending verification",
    accounts: 2,
    endpoints: 0,
  },
];

const HANDOFFS = [
  {
    ref: "HO-2026-0088",
    to: "Jharkhand Cyber Cell",
    caseRef: "CASE-2026-0914",
    reason: "Two ranked endpoints and the receiving account sit outside DL-CYB",
    sentAt: "2026-09-06T15:02:00Z",
    receipt: "acknowledged",
  },
  {
    ref: "HO-2026-0086",
    to: "Maharashtra Cyber",
    caseRef: "CASE-2026-0915",
    reason: "Beneficiary device seen in three complaints owned by MH-CYB",
    sentAt: "2026-09-05T10:41:00Z",
    receipt: "awaiting receipt",
  },
];

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function IntelligencePage() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-ink-900">Intelligence</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Outbound packages to banks, and cross-jurisdiction hand-offs.
        </p>
      </header>

      <p className="mb-5 rounded-sm border border-line bg-surface px-3 py-2 text-[12px] italic text-ink-500">
        Mock records for interface development. The certification block, scope enforcement and
        signing are implemented and tested in{" "}
        <code className="font-mono not-italic">atlas/intel/certification.py</code>; there is no
        persistence or endpoint behind this page yet, so nothing here has been sent.
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-[11px] uppercase tracking-wider text-ink-500">
          Outbound packages
        </h2>
        <ul className="divide-y divide-line rounded-sm border border-line bg-surface">
          {PACKAGES.map((p) => {
            const expired = new Date(p.expiresAt) <= NOW;
            const isOpen = open === p.ref;
            return (
              <li key={p.ref}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : p.ref)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper"
                >
                  {/* Expired is a terminal state, not an older shade of live.
                      An expired package confers nothing at all. */}
                  <span
                    className={`mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
                      expired
                        ? "border-severity-high/40 bg-severity-high/5 text-severity-high"
                        : "border-line text-ink-500"
                    }`}
                  >
                    {expired ? "expired" : p.status.toLowerCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">
                      {p.ref} → {p.recipient}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-500">
                      {p.caseRef} · {p.accounts} account{p.accounts === 1 ? "" : "s"}
                      {p.endpoints > 0 &&
                        `, ${p.endpoints} endpoint${p.endpoints === 1 ? "" : "s"}`}{" "}
                      · {expired ? "expired" : "expires"} {when(p.expiresAt)}
                    </span>
                    {expired && (
                      <span className="mt-1 block text-[12px] text-severity-high">
                        The recipient refuses this package. It cannot be acted on, and reissuing
                        is a new authorisation, not a renewal.
                      </span>
                    )}
                  </span>
                </button>

                {isOpen && (
                  <dl className="grid gap-x-4 gap-y-1.5 border-t border-line bg-paper px-4 py-3 text-[12px] sm:grid-cols-2">
                    <div>
                      <dt className="text-ink-500">Requesting officer</dt>
                      <dd className="font-mono text-ink-900">{p.officer}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Jurisdiction</dt>
                      <dd className="font-mono text-ink-900">{p.jurisdiction}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Legal basis</dt>
                      <dd className="text-ink-900">{p.legalBasis}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Issued</dt>
                      <dd className="text-ink-900 tabular-nums">{when(p.issuedAt)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-ink-500">Purpose</dt>
                      <dd className="text-ink-900">{p.purpose}</dd>
                    </div>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-wider text-ink-500">
          Jurisdiction hand-offs
        </h2>
        <ul className="divide-y divide-line rounded-sm border border-line bg-surface">
          {HANDOFFS.map((h) => (
            <li key={h.ref} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium text-ink-900">{h.ref}</span>
                <span className="text-[12px] text-ink-500">→ {h.to}</span>
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  · {h.receipt}
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-ink-700">{h.reason}</p>
              <p className="mt-0.5 text-[11px] text-ink-500 tabular-nums">
                {h.caseRef} · sent {when(h.sentAt)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
