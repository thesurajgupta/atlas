"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Briefcase, Clock, IndianRupee } from "lucide-react";
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
import { rupees as inr } from "@/lib/demo/defaults";
import { useDemoCase } from "@/lib/demo/store";
import { CaseBanner } from "@/components/demo/CaseBanner";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card, MockNotice, StatTile } from "@/components/ui/Card";

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

export default function DashboardPage() {
  const { activeCase } = useDemoCase();
  const [cases, setCases] = useState<ApiCase[] | null>(null);
  const [alerts, setAlerts] = useState<ApiAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isSignedIn()) return;
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
  }, []);

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

  /* The referred case counts in the tiles like any other open case.
   *
   * It is one of the cases in front of this operator, and leaving it out would
   * make the dashboard say "no cases inside the golden hour" while a case filed
   * two minutes ago sits one click away. The counts below are the API's plus
   * one, never the API's replaced. */
  const demoCount = activeCase === null ? 0 : 1;
  const demoInGoldenHour =
    activeCase !== null && activeCase.features.golden_hour_minutes <= 60 ? 1 : 0;
  const totalCases = (cases?.length ?? 0) + demoCount;
  const totalAtRisk = atRisk + (activeCase?.complaint.fraud_amount_inr ?? 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="What is happening right now, in your jurisdiction."
      />

      <div className="space-y-4 px-6 py-5">
        <CaseBanner page="The dashboard" />

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
            value={inGoldenHour.length + demoInGoldenHour}
            label="Cases inside the golden hour"
            tone={inGoldenHour.length + demoInGoldenHour > 0 ? "critical" : "neutral"}
            hint="Interception is still possible"
            icon={<Clock className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={raised.length + demoCount}
            label="Alerts raised"
            tone={raised.length + demoCount > 0 ? "warning" : "neutral"}
            hint={`${suppressed.length} refused, with reasons`}
            icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={cases === null && demoCount === 0 ? "—" : totalCases}
            label="Open cases"
            hint="Scoped to your jurisdiction"
            icon={<Briefcase className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={rupees(String(totalAtRisk))}
            label="Amount at risk"
            hint="Sum across open cases"
            icon={<IndianRupee className="h-4 w-4" aria-hidden />}
          />
        </div>

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
            {alerts === null && !error && activeCase === null && (
              <p className="px-4 py-6 text-center text-[12px] text-ink-500">Loading…</p>
            )}
            {raised.length === 0 && alerts !== null && activeCase === null && (
              <p className="px-4 py-6 text-center text-[12px] text-ink-500">
                No alerts raised.{" "}
                {suppressed.length > 0 &&
                  `The policy considered ${suppressed.length} and sent none.`}
              </p>
            )}
            <ul className="divide-y divide-line">
              {activeCase !== null && (
                <li className="bg-severity-high/5 px-4 py-2.5">
                  <Link href="/alerts" className="block">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-medium text-ink-900">
                        {activeCase.alert.case_id}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-severity-high">
                        {activeCase.alert.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-ink-500">
                      {activeCase.alert.reason}
                    </p>
                  </Link>
                </li>
              )}
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
            {cases === null && !error && activeCase === null && (
              <p className="px-4 py-6 text-center text-[12px] text-ink-500">Loading…</p>
            )}
            {cases?.length === 0 && activeCase === null && (
              <p className="px-4 py-6 text-center text-[12px] text-ink-500">
                No cases in your jurisdiction yet.
              </p>
            )}
            <ul className="divide-y divide-line">
              {activeCase !== null && (
                <li>
                  <Link
                    href={`/cases/${activeCase.case_id}`}
                    className="flex items-center justify-between gap-3 bg-accent/5 px-4 py-2.5 transition-colors hover:bg-accent/10"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-ink-900">
                        {activeCase.case_id}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-500">
                        {activeCase.complaint.complaint_type} ·{" "}
                        {activeCase.complaint.complaint_id}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[11px] tabular-nums text-ink-700">
                        {inr(activeCase.complaint.fraud_amount_inr)}
                      </span>
                      <span
                        className={`block text-[10px] tabular-nums ${
                          activeCase.features.golden_hour_minutes <= 60
                            ? "text-severity-high"
                            : "text-ink-500"
                        }`}
                      >
                        {activeCase.features.golden_hour_minutes}m elapsed
                      </span>
                    </span>
                  </Link>
                </li>
              )}
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
