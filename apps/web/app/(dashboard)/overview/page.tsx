"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Clock,
  IndianRupee,
  PlayCircle,
} from "lucide-react";
import {
  ApiError,
  auth,
  listAlerts,
  listCases,
  type ApiAlert,
  type ApiCase,
} from "@/lib/api";
import { Funnel } from "@/components/overview/Funnel";
import { MOCK_FUNNEL } from "@/lib/mock-data";
import { useSignedIn } from "@/lib/use-signed-in";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card, MockNotice, RiskChip, StatTile } from "@/components/ui/Card";

/**
 * The dashboard answers one question: what is happening right now.
 *
 * The four tiles across the top are **live**, from `/api/v1/cases` and
 * `/api/v1/alerts`, and the two that matter are the ones counting time rather
 * than volume: cases still inside the golden hour, and decisions the policy
 * refused to send. Total case count is a number nobody acts on; "three cases
 * have under an hour left" is the whole job.
 *
 * The funnel below is mock and labelled, because intervention and outcome
 * recording is not built. Keeping the live and mock halves visually separate —
 * and saying which is which — matters more here than anywhere else in the
 * product: this is the screen a judge looks at first.
 */

function rupees(amount: string | null): string {
  if (amount === null) return "—";
  const n = Number(amount);
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * The operations queue: every alert decision, filterable, newest first.
 *
 * Structure taken from Lucky's dashboard in #78 — KPI row, filterable table,
 * status chips. The data is not: his fed on a threat feed with IP addresses,
 * user emails and entries like "Bot Attack — Moscow, RU". ATLAS holds none of
 * those, forecasts the cash-out leg of reported fraud rather than intrusions,
 * and `docs/NON-GOALS.md` rules out scoring individuals — which a table keyed on
 * a person's email is. The same layout over `/api/v1/alerts` says something the
 * system can actually stand behind.
 */
function OperationsTable({
  alerts,
  cases,
}: {
  alerts: ApiAlert[] | null;
  cases: ApiCase[] | null;
}) {
  const [severity, setSeverity] = useState<string>("ALL");
  const [showSuppressed, setShowSuppressed] = useState(true);

  const byCase = new Map((cases ?? []).map((c) => [c.public_ref, c]));
  const rows = (alerts ?? [])
    .filter((a) => (showSuppressed ? true : a.raised))
    .filter((a) => severity === "ALL" || a.severity === severity);

  return (
    <Card
      title={`Operations queue · ${rows.length} decisions`}
      action={
        <div className="flex flex-wrap items-center gap-1">
          {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              aria-pressed={severity === s}
              className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
                severity === s
                  ? "border-ink-900 text-ink-900"
                  : "border-line text-ink-500 hover:text-ink-700"
              }`}
            >
              {s.toLowerCase()}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowSuppressed((v) => !v)}
            aria-pressed={showSuppressed}
            className={`ml-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
              showSuppressed
                ? "border-ink-900 text-ink-900"
                : "border-line text-ink-500 hover:text-ink-700"
            }`}
          >
            incl. suppressed
          </button>
        </div>
      }
      bodyClassName="overflow-x-auto"
    >
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-ink-500">
          {alerts === null ? "Loading…" : "No decisions match this filter."}
        </p>
      ) : (
        <table className="w-full min-w-[46rem] text-left text-[12px]">
          <thead className="border-b border-line text-[10px] uppercase tracking-wider text-ink-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Severity</th>
              <th scope="col" className="px-2 py-2 font-medium">Case</th>
              <th scope="col" className="px-2 py-2 font-medium">Amount at risk</th>
              <th scope="col" className="px-2 py-2 font-medium">Golden hour</th>
              <th scope="col" className="px-4 py-2 font-medium">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((a) => {
              const linked = byCase.get(a.case_ref);
              const minutes = linked?.golden_hour_minutes_elapsed ?? null;
              return (
                <tr key={a.id} className={a.raised ? "" : "opacity-70"}>
                  <td className="px-4 py-2">
                    {a.severity ? (
                      <RiskChip level={a.severity} />
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-ink-500">
                        not sent
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href="/investigation"
                      className="font-medium text-ink-900 hover:text-accent"
                    >
                      {a.case_ref}
                    </Link>
                  </td>
                  <td className="px-2 py-2 tabular-nums text-ink-700">
                    {rupees(linked?.amount_at_risk ?? null)}
                  </td>
                  <td
                    className={`px-2 py-2 tabular-nums ${
                      minutes !== null && minutes <= 60
                        ? "text-severity-high"
                        : "text-ink-500"
                    }`}
                  >
                    {minutes === null ? "—" : `${minutes}m`}
                  </td>
                  {/* The policy's own sentence, in full. It is the only place the
                      typology, amount and endpoint appear together, and
                      summarising it produces an alert nobody can weigh. */}
                  <td className="max-w-[22rem] px-4 py-2 text-[11px] leading-snug text-ink-500">
                    {a.reason}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const signedIn = useSignedIn();
  const [cases, setCases] = useState<ApiCase[] | null>(null);
  const [alerts, setAlerts] = useState<ApiAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    Promise.all([listCases(), listAlerts()])
      .then(([c, a]) => {
        setCases(c.items);
        setAlerts(a.items);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : "Could not reach the ATLAS API.",
        );
      });
  }, [signedIn]);

  const raised = alerts?.filter((a) => a.raised) ?? [];
  const suppressed = alerts?.filter((a) => !a.raised) ?? [];
  const inGoldenHour =
    cases?.filter(
      (c) =>
        c.golden_hour_minutes_elapsed !== null &&
        c.golden_hour_minutes_elapsed <= 60,
    ) ?? [];
  const atRisk =
    cases?.reduce((sum, c) => sum + Number(c.amount_at_risk ?? 0), 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="What is happening right now, in your jurisdiction."
        actions={
          <Link
            href="/demo"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-paper transition-opacity hover:opacity-90"
          >
            <PlayCircle className="h-3.5 w-3.5" aria-hidden />
            Run demo investigation
          </Link>
        }
      />

      <div className="space-y-4 px-6 py-5">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-severity-high/40 bg-severity-high/5 px-3 py-2.5 text-[13px] text-severity-high"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            value={inGoldenHour.length}
            label="Cases inside the golden hour"
            tone={inGoldenHour.length > 0 ? "critical" : "neutral"}
            hint="Interception is still possible"
            icon={<Clock className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={raised.length}
            label="Alerts raised"
            tone={raised.length > 0 ? "warning" : "neutral"}
            hint={`${suppressed.length} refused, with reasons`}
            icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={cases?.length ?? "—"}
            label="Open cases"
            hint="Scoped to your jurisdiction"
            icon={<Briefcase className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={rupees(String(atRisk))}
            label="Amount at risk"
            hint="Sum across open cases"
            icon={<IndianRupee className="h-4 w-4" aria-hidden />}
          />
        </div>

        <OperationsTable alerts={alerts} cases={cases} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Needs attention first"
            action={
              <Link
                href="/alerts"
                className="inline-flex items-center gap-1 text-[11px] text-accent transition-opacity hover:opacity-80"
              >
                All alerts <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            }
            bodyClassName=""
          >
            {alerts === null && !error && (
              <p className="px-4 py-6 text-center text-[12px] text-ink-500">Loading…</p>
            )}
            {raised.length === 0 && alerts !== null && (
              <p className="px-4 py-6 text-center text-[12px] text-ink-500">
                No alerts raised.{" "}
                {suppressed.length > 0 &&
                  `The policy considered ${suppressed.length} and sent none.`}
              </p>
            )}
            <ul className="divide-y divide-line">
              {raised.slice(0, 4).map((a) => (
                <li key={a.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] font-medium text-ink-900">
                      {a.case_ref}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-severity-high">
                      {a.severity}
                    </span>
                  </div>
                  {/* Full reason, not a summary. It is the only place the amount,
                      typology and endpoint appear. */}
                  <p className="mt-1 text-[11px] leading-snug text-ink-500">{a.reason}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="Recent cases"
            action={
              <Link
                href="/cases"
                className="inline-flex items-center gap-1 text-[11px] text-accent transition-opacity hover:opacity-80"
              >
                All cases <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            }
            bodyClassName=""
          >
            {cases === null && !error && (
              <p className="px-4 py-6 text-center text-[12px] text-ink-500">Loading…</p>
            )}
            {cases?.length === 0 && (
              <p className="px-4 py-6 text-center text-[12px] text-ink-500">
                No cases in your jurisdiction yet.
              </p>
            )}
            <ul className="divide-y divide-line">
              {cases?.slice(0, 4).map((c) => {
                const minutes = c.golden_hour_minutes_elapsed;
                const urgent = minutes !== null && minutes <= 60;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/cases/${c.public_ref}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-raised"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium text-ink-900">
                          {c.public_ref}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-ink-500">
                          {c.title}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[11px] tabular-nums text-ink-700">
                          {rupees(c.amount_at_risk)}
                        </span>
                        <span
                          className={`block text-[10px] tabular-nums ${
                            urgent ? "text-severity-high" : "text-ink-500"
                          }`}
                        >
                          {minutes === null ? "—" : `${minutes}m elapsed`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <Card title="Intelligence funnel">
          <div className="mb-3">
            <MockNotice>
              Mock counts. Live funnel conversion needs the intervention and outcome
              recording described in §26, which is not built — the four tiles above are
              live, this is not.
            </MockNotice>
          </div>
          <Funnel counts={MOCK_FUNNEL} />
        </Card>
      </div>
    </>
  );
}
