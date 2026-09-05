"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, auth, listCases, type ApiCase } from "@/lib/api";

/**
 * Case list, read from the API (spec §26, §29).
 *
 * The list the API returns is already scoped to the caller's jurisdiction — the
 * filtering happens in the query, not here — so there is nothing to hide
 * client-side, and nothing a devtools console can reveal that the response did
 * not already contain.
 *
 * Golden-hour position comes from the server rather than being computed here.
 * It is a function of now against the earliest fraud start on the case, and the
 * server is the only place that knows the second half of that.
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

function rupees(amount: string | null): string {
  if (amount === null) return "—";
  return `₹${Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function CasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<ApiCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isSignedIn()) {
      router.replace("/login");
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
  }, [router]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-ink-900">Cases</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Open cases in your jurisdiction, newest first. Live from the API.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-sm border border-severity-high/30 bg-severity-high/5 px-3 py-2.5 text-[13px] text-severity-high"
        >
          {error}
        </p>
      )}

      {!error && cases === null && (
        <p className="py-10 text-center text-sm text-ink-500">Loading cases…</p>
      )}

      {cases !== null && cases.length === 0 && (
        <div className="rounded-sm border border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm text-ink-700">No cases in your jurisdiction yet.</p>
          <p className="mt-1 text-[12px] text-ink-500">
            Run <code className="font-mono">python scripts/seed_demo.py</code> to create a few.
          </p>
        </div>
      )}

      {cases !== null && cases.length > 0 && (
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
                      {c.title} · {rupees(c.amount_at_risk)} ·{" "}
                      {c.complaint_count} complaint{c.complaint_count === 1 ? "" : "s"}
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
  );
}
