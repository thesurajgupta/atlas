"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, auth, listAlerts, type ApiAlert } from "@/lib/api";
import { rupees } from "@/lib/demo/defaults";
import { useDemoCase } from "@/lib/demo/store";
import type { DemoCase } from "@/lib/demo/types";
import { CaseBanner } from "@/components/demo/CaseBanner";
import { PageHeader } from "@/components/nav/PageHeader";

/**
 * Alerts (spec §27, §35.1) — live from `GET /api/v1/alerts`, plus the alert the
 * referred complaint raised.
 *
 * Three decisions shape this page, and they come from the policy rather than
 * from design preference:
 *
 * **The reason string is rendered in full.** `atlas/alerts/policy.py` composes
 * it to carry a quantity and a window — "digital arrest · ₹820,000 at risk ·
 * 38 minutes since fraud began · strong evidence · top candidate EP-0783" —
 * and it is the *only* place the amount, typology, evidence band and endpoint
 * appear, because the API returns no separate columns for them. Summarising it
 * to "High risk" would not just look worse, it would discard the content. The
 * demo alert composes its reason the same way, for the same reason.
 *
 * **Suppressed decisions are shown, not hidden.** They are the rows that answer
 * "why was I not told about this case?". An operator who cannot see that the
 * system rationed something concludes it is broken.
 *
 * **The referred case's alert does not need the API.** It comes from the same
 * `DemoCase` the map and the prediction render, so it names the same endpoint
 * with the same score and the same window — and opening it goes back to that
 * one investigation. Signing in is still what gets the jurisdiction's own
 * alerts; it is not what gets this one.
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
            <span className="text-[11px] tabular-nums text-ink-500">
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

/**
 * The referred case's alert, rendered as the priority row.
 *
 * Larger than an API row because it is the one an investigator is meant to act
 * on right now, and because it is the row a judge will read. Every field is off
 * the case: the amount is the complaint's amount, the endpoint is the top
 * candidate, the window is that candidate's window.
 */
function DemoAlertRow({ demoCase }: { demoCase: DemoCase }) {
  const { alert, complaint } = demoCase;
  return (
    <div className="rounded-md border border-severity-high/40 bg-severity-high/5 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${SEVERITY_STYLE[alert.severity]}`}
          >
            {alert.severity}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-severity-high">
            New priority alert
          </span>
        </div>
        <span className="text-[11px] tabular-nums text-ink-500">
          issued {alert.issued_at.slice(0, 10)} {alert.issued_at.slice(11, 16)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Case", alert.case_id],
          ["Complaint", alert.complaint_id],
          ["Fraud amount", rupees(alert.amount_inr)],
          ["Predicted location", alert.endpoint_id],
          ["Score", alert.score.toFixed(2)],
          [
            "Time window",
            `${alert.window_start.slice(11, 16)} – ${alert.window_end.slice(11, 16)}`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10px] uppercase tracking-wider text-ink-500">{label}</dt>
            <dd className="mt-0.5 truncate font-mono text-[12.5px] font-medium text-ink-900">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[12.5px] leading-snug text-ink-700">{alert.reason}</p>
      <p className="mt-1 text-[11.5px] text-ink-500">{alert.endpoint_name}</p>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-severity-high/20 pt-3">
        <Link
          href={`/investigation?case=${encodeURIComponent(alert.case_id)}`}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-paper transition-opacity hover:opacity-90"
        >
          Open the investigation
        </Link>
        <Link
          href={`/cases/${alert.case_id}`}
          className="rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
        >
          Case record
        </Link>
        <Link
          href="/map"
          className="rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
        >
          Show {alert.endpoint_id} on the map
        </Link>
      </div>

      <p className="mt-2 text-[10.5px] italic text-ink-500">
        Raised on complaint {complaint.complaint_id}. The score orders candidates for tasking; it is
        not a calibrated probability that a withdrawal will occur.
      </p>
    </div>
  );
}

export default function AlertsPage() {
  const router = useRouter();
  const { activeCase, hydrated } = useDemoCase();
  const [alerts, setAlerts] = useState<ApiAlert[] | null>(null);
  const [totals, setTotals] = useState({ raised: 0, suppressed: 0 });
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string>("ALL");
  const [showSuppressed, setShowSuppressed] = useState(false);

  useEffect(() => {
    // Nothing is decided before the store has been read. The first commit runs
    // against the server snapshot — "no complaint" — so redirecting on it would
    // bounce an operator with a live case straight to the sign-in screen, one
    // frame before the case arrives.
    if (!hydrated) return;
    if (!auth.isSignedIn()) {
      // A referred case has an alert of its own that owes nothing to the API,
      // so bouncing to sign-in would hide the one row the operator came here
      // for. Signed out with nothing referred, the redirect stands.
      if (activeCase === null) router.replace("/login");
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
  }, [router, hydrated, activeCase]);

  const raised = useMemo(
    () =>
      (alerts ?? []).filter(
        (a) => a.raised && (severity === "ALL" || a.severity === severity),
      ),
    [alerts, severity],
  );
  const suppressed = useMemo(() => (alerts ?? []).filter((a) => !a.raised), [alerts]);

  const signedIn = auth.isSignedIn();
  const demoMatchesFilter =
    activeCase !== null && (severity === "ALL" || activeCase.alert.severity === severity);

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Decisions the alert policy made, newest first."
        searchPlaceholder="Search alerts by case…"
      />
      <div className="mx-auto max-w-4xl px-6 py-5">
        <CaseBanner page="Alerts" />

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

        {demoMatchesFilter && activeCase !== null && (
          <div className="mb-4">
            <DemoAlertRow demoCase={activeCase} />
          </div>
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
            Not signed in, so the jurisdiction&rsquo;s own alerts are not loaded. The alert above
            belongs to the complaint referred from the reporting portal and does not come from the
            API.{" "}
            <Link href="/login" className="text-accent transition-opacity hover:opacity-80">
              Sign in
            </Link>{" "}
            to see the rest.
          </p>
        )}

        {signedIn && !error && alerts === null && (
          <p className="py-10 text-center text-sm text-ink-500">Loading alerts…</p>
        )}

        {signedIn && alerts !== null && (
          <>
            {raised.length === 0 ? (
              <div className="rounded-sm border border-line bg-surface px-4 py-8 text-center">
                <p className="text-sm text-ink-700">
                  {totals.raised === 0
                    ? "No alerts were raised in your jurisdiction."
                    : "No alerts at this severity."}
                </p>
                {totals.raised === 0 && totals.suppressed > 0 && (
                  <p className="mt-1 text-[12px] text-ink-500">
                    The policy considered {totals.suppressed} and sent none. The reasons are below.
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
                  The policy refused these. Each carries its reason — an alert that was not sent is
                  a decision somebody may have to explain.
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
