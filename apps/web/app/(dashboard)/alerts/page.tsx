"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, auth, listAlerts, type ApiAlert } from "@/lib/api";
import { PageHeader } from "@/components/nav/PageHeader";

/**
 * Alerts (spec §27, §35.1) — live from `GET /api/v1/alerts`.
 *
 * Two decisions shape this page, and both come from the policy rather than
 * from design preference:
 *
 * **The reason string is rendered in full.** `atlas/alerts/policy.py` composes
 * it to carry a quantity and a window — "digital arrest · ₹820,000 at risk ·
 * 38 minutes since fraud began · strong evidence · top candidate EP-0783" —
 * and it is the *only* place the amount, typology, evidence band and endpoint
 * appear, because the API returns no separate columns for them. Summarising it
 * to "High risk" would not just look worse, it would discard the content.
 *
 * **Suppressed decisions are shown, not hidden.** They are the rows that answer
 * "why was I not told about this case?". An operator who cannot see that the
 * system rationed something concludes it is broken.
 */

const SEVERITY_STYLE: Record<string, string> = {
  LOW: "border-severity-low/30 text-severity-low",
  MEDIUM: "border-severity-medium/40 text-severity-medium",
  HIGH: "border-severity-high/40 text-severity-high",
  CRITICAL: "border-severity-critical/50 bg-severity-critical/5 text-severity-critical",
};

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

function issued(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function AlertRow({ alert }: { alert: ApiAlert }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        {alert.severity ? (
          <span
            className={`mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${SEVERITY_STYLE[alert.severity]}`}
          >
            {alert.severity}
          </span>
        ) : (
          // A suppressed decision has no severity — the API returns null rather
          // than a placeholder, so nothing here can render it as if it had one.
          <span className="mt-0.5 shrink-0 rounded-sm border border-line px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-ink-500">
            not sent
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-ink-900">{alert.case_ref}</span>
            <span className="text-[11px] text-ink-500 tabular-nums">
              {issued(alert.issued_at)}
            </span>
            {alert.acknowledged_at && (
              <span className="text-[11px] uppercase tracking-wider text-ink-500">
                · acknowledged
              </span>
            )}
          </div>

          {/* Whole, never truncated. See the module docstring. */}
          <p className="mt-1 text-[13px] leading-snug text-ink-700">{alert.reason}</p>
        </div>
      </div>
    </li>
  );
}

export default function AlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<ApiAlert[] | null>(null);
  const [totals, setTotals] = useState({ raised: 0, suppressed: 0 });
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string>("ALL");
  const [showSuppressed, setShowSuppressed] = useState(false);

  useEffect(() => {
    if (!auth.isSignedIn()) {
      router.replace("/login");
      return;
    }
    listAlerts()
      .then((r) => {
        setAlerts(r.items);
        setTotals({ raised: r.raised_total, suppressed: r.suppressed_total });
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          auth.clear();
          router.replace("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not load alerts.");
      });
  }, [router]);

  const raised = useMemo(
    () =>
      (alerts ?? []).filter(
        (a) => a.raised && (severity === "ALL" || a.severity === severity),
      ),
    [alerts, severity],
  );
  const suppressed = useMemo(() => (alerts ?? []).filter((a) => !a.raised), [alerts]);

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Decisions the alert policy made, newest first. Live from the API."
        searchPlaceholder="Search alerts by case…"
      />
      <div className="mx-auto max-w-4xl px-6 py-5">
      {error && (
        <p
          role="alert"
          className="rounded-sm border border-severity-high/30 bg-severity-high/5 px-3 py-2.5 text-[13px] text-severity-high"
        >
          {error}
        </p>
      )}

      {!error && alerts === null && (
        <p className="py-10 text-center text-sm text-ink-500">Loading alerts…</p>
      )}

      {alerts !== null && (
        <>
          <div className="mb-3 flex items-center gap-1">
            {(["ALL", ...SEVERITIES] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                aria-pressed={severity === s}
                className={`rounded-sm border px-2 py-1 text-[11px] uppercase tracking-wider transition-colors ${
                  severity === s
                    ? "border-ink-900 text-ink-900"
                    : "border-line text-ink-500 hover:text-ink-700"
                }`}
              >
                {s.toLowerCase()}
              </button>
            ))}
          </div>

          {raised.length === 0 ? (
            <div className="rounded-sm border border-line bg-surface px-4 py-8 text-center">
              <p className="text-sm text-ink-700">
                {totals.raised === 0
                  ? "No alerts were raised in your jurisdiction."
                  : "No alerts at this severity."}
              </p>
              {totals.raised === 0 && totals.suppressed > 0 && (
                <p className="mt-1 text-[12px] text-ink-500">
                  The policy considered {totals.suppressed} and sent none. The reasons are
                  below.
                </p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-sm border border-line bg-surface">
              {raised.map((a) => (
                <AlertRow key={a.id} alert={a} />
              ))}
            </ul>
          )}

          {suppressed.length > 0 && (
            <section className="mt-6">
              <button
                type="button"
                onClick={() => setShowSuppressed((v) => !v)}
                aria-expanded={showSuppressed}
                className="flex w-full items-center justify-between rounded-sm border border-line bg-surface px-4 py-2.5 text-left transition-colors hover:bg-paper"
              >
                <span className="text-sm text-ink-700">
                  {suppressed.length} decision{suppressed.length === 1 ? "" : "s"} not sent
                </span>
                <span className="text-[11px] uppercase tracking-wider text-ink-500">
                  {showSuppressed ? "hide" : "show"}
                </span>
              </button>
              <p className="mt-1.5 px-1 text-[12px] text-ink-500">
                The policy refused these. Each carries its reason — an alert that was not
                sent is a decision somebody may have to explain.
              </p>
              {showSuppressed && (
                <ul className="mt-2 divide-y divide-line rounded-sm border border-line bg-surface">
                  {suppressed.map((a) => (
                    <AlertRow key={a.id} alert={a} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
      </div>
    </>
  );
}
