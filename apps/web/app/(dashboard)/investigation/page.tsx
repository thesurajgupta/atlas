"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRightLeft,
  Building2,
  ExternalLink,
  Share2,
  ShieldAlert,
  Users,
} from "lucide-react";
import { MOCK_CASES } from "@/lib/mock-data";
import { SYNTHETIC_TRAIL_PATHS } from "@/lib/graph/synthetic-trail";
import type { Case } from "@/lib/types";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card, MockNotice } from "@/components/ui/Card";
import { EvidenceBadge } from "@/components/prediction/EvidenceBadge";
import { PredictionAndWhy } from "@/components/prediction/PredictionAndWhy";

/**
 * The investigator's workspace (spec §26).
 *
 * One case, everything about it on one screen, in the order the work happens:
 * what is at stake, where the money went, who is involved, what is predicted,
 * what can be done. The whole point is that the investigator does not navigate
 * between five pages to hold one case in their head — the deep links out are for
 * going *deeper* into a view, not for assembling the picture.
 *
 * The action panel deliberately shows what each intervention *costs in time*.
 * An action list without that is a menu; with it, it is a decision, and the
 * golden hour is the only budget that matters here.
 */

const ACTIONS = [
  {
    label: "Request fund block",
    detail: "Bank freezes the beneficiary account pending verification",
    eta: "8–20 min",
    tone: "primary" as const,
  },
  {
    label: "Alert ATM operator",
    detail: "Operator watches the ranked endpoints for the predicted window",
    eta: "5–15 min",
    tone: "normal" as const,
  },
  {
    label: "Hand off to jurisdiction",
    detail: "Ranked endpoints sit outside this district",
    eta: "30–90 min",
    tone: "normal" as const,
  },
];

function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function CaseSummary({ item }: { item: Case }) {
  const s = item.fact_strip;
  const inGoldenHour = s.golden_hour_position_minutes <= 60;
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
      {[
        { label: "Typology", value: s.typology.replace(/_/g, " ").toLowerCase() },
        { label: "Amount at risk", value: rupees(s.amount_at_risk_inr) },
        {
          label: "Golden hour",
          value: `${s.golden_hour_position_minutes} min elapsed`,
          tone: inGoldenHour ? "text-severity-high" : "text-ink-500",
        },
        { label: "Status", value: item.status.replace(/_/g, " ").toLowerCase() },
      ].map((f) => (
        <div key={f.label}>
          <p className="text-[10px] uppercase tracking-wider text-ink-500">{f.label}</p>
          <p className={`mt-1 text-[13px] tabular-nums ${f.tone ?? "text-ink-900"}`}>
            {f.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function InvestigationPage() {
  const [caseId, setCaseId] = useState(MOCK_CASES[0]?.case_id ?? "");
  const item = MOCK_CASES.find((c) => c.case_id === caseId) ?? MOCK_CASES[0];

  // The trail fixture is the same one `/money-trail` renders, so the hop count
  // here and the canvas there cannot disagree.
  const hops = SYNTHETIC_TRAIL_PATHS.flatMap((p) => p.hops);
  const accounts = new Set(
    hops.flatMap((h) => [h.from_entity_id, h.to_entity_id]),
  );

  if (!item) return null;

  return (
    <>
      <PageHeader
        title="Investigation"
        subtitle={`${item.case_id} · one case, everything about it`}
        actions={
          <select
            aria-label="Case"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="rounded-md border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink-900 focus:border-accent focus:outline-none"
          >
            {MOCK_CASES.map((c) => (
              <option key={c.case_id} value={c.case_id}>
                {c.case_id} — {c.fact_strip.typology.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        }
      />

      <div className="px-6 py-5">
        <div className="mb-4">
          <MockNotice>
            Mock case data for interface development. The trail, network and prediction
            below are the same fixture, so the story stays consistent across pages.
          </MockNotice>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-4">
            <Card
              title="Case"
              action={<EvidenceBadge band={item.fact_strip.evidence_sufficiency} />}
            >
              <CaseSummary item={item} />
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card
                title="Money trail"
                action={
                  <Link
                    href="/money-trail"
                    className="inline-flex items-center gap-1 text-[11px] text-accent transition-opacity hover:opacity-80"
                  >
                    Open <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                }
              >
                <div className="flex items-center gap-3">
                  <ArrowRightLeft className="h-5 w-5 shrink-0 text-ink-300" aria-hidden />
                  <p className="text-[13px] text-ink-700">
                    <span className="text-lg font-semibold tabular-nums text-ink-900">
                      {hops.length}
                    </span>{" "}
                    hops reconstructed, time-respecting, bounded at the as-of instant.
                  </p>
                </div>
              </Card>

              <Card
                title="Accounts involved"
                action={
                  <Link
                    href="/network-graph"
                    className="inline-flex items-center gap-1 text-[11px] text-accent transition-opacity hover:opacity-80"
                  >
                    Network <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                }
              >
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 shrink-0 text-ink-300" aria-hidden />
                  <p className="text-[13px] text-ink-700">
                    <span className="text-lg font-semibold tabular-nums text-ink-900">
                      {accounts.size}
                    </span>{" "}
                    accounts on the reconstructed path.
                  </p>
                </div>
              </Card>
            </div>

            <Card
              title="Prediction"
              action={
                <Link
                  href="/predicted-locations"
                  className="inline-flex items-center gap-1 text-[11px] text-accent transition-opacity hover:opacity-80"
                >
                  Ranked list <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              }
            >
              <PredictionAndWhy prediction={item.prediction} />
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="Available action">
              <ul className="space-y-2.5">
                {ACTIONS.map((a) => (
                  <li key={a.label}>
                    <button
                      type="button"
                      className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                        a.tone === "primary"
                          ? "border-accent/40 bg-accent/10 hover:bg-accent/15"
                          : "border-line bg-raised hover:border-line-strong"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[13px] font-medium ${
                            a.tone === "primary" ? "text-accent" : "text-ink-900"
                          }`}
                        >
                          {a.label}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-ink-500">
                          {a.eta}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-ink-500">
                        {a.detail}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {/* The times are what make this a decision rather than a menu. An
                  action whose typical completion is longer than the remaining
                  golden hour is a different proposition, and the investigator is
                  the one who should weigh that — not the interface, silently. */}
              <p className="mt-3 text-[11px] text-ink-500">
                Times are typical completion, not guarantees. Weigh them against{" "}
                {item.fact_strip.golden_hour_position_minutes} minutes already elapsed.
              </p>
              <p className="mt-2 text-[10px] italic text-ink-300">
                Buttons are inert — intervention recording is not built (§26).
              </p>
            </Card>

            <Card title="Risk factors">
              <ul className="space-y-2">
                {/* `sentence`, never `feature`. §25.4 requires factors to render
                    as sentences carrying a quantity and a window; the raw SHAP
                    feature name is audit/debug only and must not reach an
                    investigator. */}
                {item.prediction.candidates[0]?.contributing_factors.map((f) => (
                  <li key={f.feature} className="flex items-start gap-2">
                    <ShieldAlert
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-severity-medium"
                      aria-hidden
                    />
                    <span className="text-[12px] leading-snug text-ink-700">
                      {f.sentence}
                    </span>
                  </li>
                )) ?? (
                  <li className="text-[12px] text-ink-500">
                    No ranked candidate, so no contributing factors to show.
                  </li>
                )}
              </ul>
            </Card>

            <Card title="Jurisdiction">
              <div className="flex items-start gap-2.5">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" aria-hidden />
                <div>
                  <p className="text-[13px] text-ink-900">Delhi Cyber Cell</p>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    Cross-jurisdiction reads return 404, not 403, and are audited
                    either way (§29).
                  </p>
                </div>
              </div>
              <Link
                href="/network-graph"
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-accent transition-opacity hover:opacity-80"
              >
                <Share2 className="h-3 w-3" aria-hidden />
                See linked cases
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
