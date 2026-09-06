"use client";

import { useMemo } from "react";
import Link from "next/link";
import { MOCK_FUNNEL } from "@/lib/mock-data";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card, MockNotice, StatTile } from "@/components/ui/Card";

/**
 * Analytical summaries (spec §21.3).
 *
 * Every figure here is a **count of things this system did** — complaints,
 * cases, alerts, interventions, outcomes. None of it is a model metric, and the
 * separation is deliberate: funnel conversion tells you whether the operation is
 * working, PAI tells you whether the model is, and mixing them on one page is
 * how a healthy funnel starts being quoted as evidence the prediction is good.
 * Model performance lives on its own page, sourced from `make eval`.
 */

const TYPOLOGY_VOLUME = [
  { label: "Digital arrest", cases: 96, amount: 3_84_00_000 },
  { label: "Investment scam", cases: 71, amount: 5_12_00_000 },
  { label: "UPI collect fraud", cases: 64, amount: 41_00_000 },
  { label: "Customer-care impersonation", cases: 48, amount: 96_00_000 },
  { label: "Job / task fraud", cases: 37, amount: 62_00_000 },
  { label: "Loan-app extortion", cases: 22, amount: 18_00_000 },
];

const HOTSPOTS = [
  { zone: "Jamtara, Jharkhand", cashOuts: 118, share: 0.14 },
  { zone: "Nuh, Haryana", cashOuts: 104, share: 0.12 },
  { zone: "Alwar, Rajasthan", cashOuts: 89, share: 0.11 },
  { zone: "Gaya, Bihar", cashOuts: 61, share: 0.07 },
  { zone: "Ghaziabad, Uttar Pradesh", cashOuts: 54, share: 0.06 },
];

function crore(n: number): string {
  return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
}

/** A bar that is a bar: length is the only encoding, and it is proportional. */
function Bar({ fraction, tone }: { fraction: number; tone: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%` }}
      />
    </div>
  );
}

export default function ReportsPage() {
  const funnel = MOCK_FUNNEL;

  // Conversion between consecutive funnel stages. Computed rather than stored:
  // a stored percentage is one that survives a change to its own numerator.
  const stages = useMemo(
    () =>
      [
        { label: "Predictions", value: funnel.predictions },
        { label: "Alerts raised", value: funnel.alerts },
        { label: "Cases opened", value: funnel.cases_opened },
        { label: "Interventions", value: funnel.interventions },
        { label: "Outcomes recorded", value: funnel.outcomes },
      ].map((stage, i, all) => ({
        ...stage,
        conversion: i === 0 ? null : stage.value / (all[i - 1]?.value || 1),
      })),
    [funnel],
  );

  const totalCases = TYPOLOGY_VOLUME.reduce((sum, t) => sum + t.cases, 0);
  const maxAmount = Math.max(...TYPOLOGY_VOLUME.map((t) => t.amount));

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Operational summaries. Model performance is on its own page."
        searchPlaceholder="Search reports…"
      />

      <div className="space-y-4 px-6 py-5">
        <MockNotice>
          Mock aggregates for interface development. Live figures require the
          intervention and outcome recording that §26 describes, which is not built.
        </MockNotice>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {stages.map((s) => (
            <StatTile
              key={s.label}
              value={s.value.toLocaleString("en-IN")}
              label={s.label}
              hint={
                s.conversion === null
                  ? "start of funnel"
                  : `${(s.conversion * 100).toFixed(0)}% of previous stage`
              }
            />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Volume by typology">
            <ul className="space-y-3">
              {TYPOLOGY_VOLUME.map((t) => (
                <li key={t.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[12px] text-ink-700">{t.label}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-500">
                      {t.cases} cases · {crore(t.amount)}
                    </span>
                  </div>
                  <Bar fraction={t.amount / maxAmount} tone="bg-accent/70" />
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-500">
              Bars are amount, not case count — {totalCases} cases, and the two orderings
              differ. Investment scam is a third of the money and a fifth of the volume.
            </p>
          </Card>

          <Card title="Geographic hotspots">
            <ul className="space-y-3">
              {HOTSPOTS.map((h) => (
                <li key={h.zone}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[12px] text-ink-700">{h.zone}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-500">
                      {h.cashOuts} cash-outs · {(h.share * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Bar fraction={h.share / HOTSPOTS[0]!.share} tone="bg-severity-medium/70" />
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-500">
              Where cash was withdrawn, not where crime originates. A district appearing
              here means money surfaced there — that is a statement about logistics, not
              about the people who live in it.
            </p>
          </Card>
        </div>

        <Card
          title="Model performance"
          action={
            <Link
              href="/models"
              className="text-[11px] text-accent transition-opacity hover:opacity-80"
            >
              Open →
            </Link>
          }
        >
          <p className="text-[12px] leading-relaxed text-ink-500">
            PAI, Recall@K and uplift over baseline are reported separately, from{" "}
            <code className="font-mono not-italic text-ink-700">make eval</code>, stamped
            with a git SHA. They are not on this page because a healthy funnel is not
            evidence that a prediction is good, and putting the two side by side invites
            exactly that reading.
          </p>
        </Card>
      </div>
    </>
  );
}
