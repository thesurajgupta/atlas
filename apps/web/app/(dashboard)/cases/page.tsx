"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, auth, listCases, type ApiCase } from "@/lib/api";
import { rupees } from "@/lib/demo/defaults";
import { useDemoCase } from "@/lib/demo/store";
import { CaseBanner } from "@/components/demo/CaseBanner";
import { PageHeader } from "@/components/nav/PageHeader";

/**
 * Case list (spec §26, §29).
 *
 * Two sources, kept visibly apart. The list from `/api/v1/cases` is already
 * scoped to the caller's jurisdiction — the filtering happens in the query, not
 * here — so there is nothing to hide client-side. Above it sits the case opened
 * on the complaint referred from the reporting portal, which is the one an
 * operator ran the demo to reach.
 *
 * Opening that row leads to the *same* case the transaction trail, the network
 * graph, the ranked locations and the alert are all about. There is one case
 * object behind all five screens; this row is a link to it, not a copy of it.
 *
 * Golden-hour position on the API rows comes from the server rather than being
 * computed here. It is a function of now against the earliest fraud start on
 * the case, and the server is the only place that knows the second half of
 * that.
 */

function goldenHour(minutes: number | null): { label: string; tone: string } {
  if (minutes === null) return { label: "unknown", tone: "text-ink-500" };
  if (minutes < 60) return { label: `${minutes}m elapsed`, tone: "text-severity-high" };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return {
    label: `${hours}h ${rest}m elapsed`,
    tone: hours < 6 ? "text-severity-medium" : "text-ink-500",
  };
}

function apiRupees(amount: string | null): string {
  if (amount === null) return "—";
  return `₹${Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function CasesPage() {
  const router = useRouter();
  const { activeCase, hydrated } = useDemoCase();
  const [cases, setCases] = useState<ApiCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Nothing is decided before the store has been read. The first commit runs
    // against the server snapshot — "no complaint" — so redirecting on it would
    // bounce an operator with a live case straight to the sign-in screen, one
    // frame before the case arrives.
    if (!hydrated) return;
    if (!auth.isSignedIn()) {
      // With a complaint referred there is a case to show that owes nothing to
      // the API, so the redirect would hide the row the operator came for.
      if (activeCase === null) router.replace("/login");
      return;
    }
    listCases()
      .then((r) => setCases(r.items))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          auth.clear();
          router.replace("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not load cases.");
      });
  }, [router, hydrated, activeCase]);

  const signedIn = auth.isSignedIn();

  return (
    <>
      <PageHeader
        title="Cases"
        subtitle="Open cases in your jurisdiction, newest first."
        searchPlaceholder="Search cases…"
      />
      <div className="mx-auto max-w-4xl px-6 py-5">
        <CaseBanner page="Cases" />

        {activeCase !== null && (
          <Link
            href={`/cases/${activeCase.case_id}`}
            className="mb-4 block rounded-md border border-accent/40 bg-accent/5 px-4 py-3.5 transition-colors hover:border-accent/60"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-ink-900">
                  <span className="shrink-0 rounded-sm border border-accent/40 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-accent">
                    from NCRP
                  </span>
                  {activeCase.case_id}
                </p>
                <p className="mt-1 text-[12px] text-ink-500">
                  {activeCase.complaint.complaint_type} · complaint{" "}
                  <span className="font-mono">{activeCase.complaint.complaint_id}</span> · victim
                  account <span className="font-mono">{activeCase.complaint.victim_account}</span> ·
                  transaction <span className="font-mono">{activeCase.complaint.transaction_id}</span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[14px] font-semibold tabular-nums text-ink-900">
                  {rupees(activeCase.complaint.fraud_amount_inr)}
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-ink-500">
                  {activeCase.atlas_case.status.replace(/_/g, " ").toLowerCase()}
                </p>
                <p className="mt-0.5 text-[11px] tabular-nums text-severity-medium">
                  {activeCase.features.golden_hour_minutes}m elapsed at filing
                </p>
              </div>
            </div>
          </Link>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-sm border border-severity-high/30 bg-severity-high/5 px-3 py-2.5 text-[13px] text-severity-high"
          >
            {error}
          </p>
        )}

        {!signedIn && (
          <p className="rounded-sm border border-line bg-surface px-4 py-3 text-[12px] text-ink-500">
            Not signed in, so the jurisdiction&rsquo;s own case list is not loaded. The case above
            was opened on a complaint referred from the reporting portal and does not come from the
            API.{" "}
            <Link href="/login" className="text-accent transition-opacity hover:opacity-80">
              Sign in
            </Link>{" "}
            to see the rest.
          </p>
        )}

        {signedIn && !error && cases === null && (
          <p className="py-10 text-center text-sm text-ink-500">Loading cases…</p>
        )}

        {signedIn && cases !== null && cases.length === 0 && (
          <div className="rounded-sm border border-line bg-surface px-4 py-8 text-center">
            <p className="text-sm text-ink-700">No other cases in your jurisdiction yet.</p>
            <p className="mt-1 text-[12px] text-ink-500">
              Run <code className="font-mono">python scripts/seed_demo.py</code> to create a few.
            </p>
          </div>
        )}

        {signedIn && cases !== null && cases.length > 0 && (
          <ul className="divide-y divide-line rounded-sm border border-line bg-surface">
            {cases.map((c) => {
              const gh = goldenHour(c.golden_hour_minutes_elapsed);
              return (
                <li key={c.id}>
                  <Link
                    href={`/cases/${c.public_ref}`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-paper"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {c.public_ref}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-500">
                        {c.title} · {apiRupees(c.amount_at_risk)} · {c.complaint_count} complaint
                        {c.complaint_count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[11px] uppercase tracking-wider text-ink-500">
                        {c.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className={`mt-0.5 block text-[12px] tabular-nums ${gh.tone}`}>
                        {gh.label}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
