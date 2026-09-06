"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { MOCK_CASES } from "@/lib/mock-data";
import type { Case, PredictionCandidate } from "@/lib/types";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card, MockNotice } from "@/components/ui/Card";
import { PredictionAndWhy } from "@/components/prediction/PredictionAndWhy";
import { EvidenceBadge } from "@/components/prediction/EvidenceBadge";

/**
 * Ranked cash-out candidates across open cases (spec §15, §16.2, §25.3).
 *
 * The ordering on this page is the product: predict, rank, prioritise. Which is
 * why the rank number is the largest thing on each row and the probability is
 * not — a probability invites "how sure are you", and the honest answer is that
 * nothing here is calibrated. The rank is what tasking actually uses.
 *
 * **Rendering is delegated to `PredictionAndWhy`.** §25.3 requires the four
 * evidence bands to be *structurally* different, not differently coloured, and
 * `INSUFFICIENT` to emit no ranked list at all. That component is the
 * enforcement point and has tests behind it; a second implementation here would
 * be a second place for the rule to quietly stop holding.
 */

function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function windowLabel(c: PredictionCandidate): string {
  const start = new Date(c.predicted_window.start);
  const end = new Date(c.predicted_window.end);
  const f = (d: Date) =>
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return `${f(start)} – ${f(end)}`;
}

function CaseRow({
  item,
  selected,
  onSelect,
}: {
  item: Case;
  selected: boolean;
  onSelect: () => void;
}) {
  const strip = item.fact_strip;
  const top = item.prediction.candidates[0];
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={`w-full px-4 py-3 text-left transition-colors ${
          selected ? "bg-accent/10" : "hover:bg-raised"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink-900">
              {item.case_id}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-ink-500">
              {strip.typology.replace(/_/g, " ").toLowerCase()} ·{" "}
              {rupees(strip.amount_at_risk_inr)}
            </p>
          </div>
          <EvidenceBadge band={strip.evidence_sufficiency} />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-500 tabular-nums">
          {top ? (
            <>
              top candidate <span className="font-mono">{top.endpoint_id}</span> ·{" "}
              {windowLabel(top)}
            </>
          ) : (
            // Not an empty state. INSUFFICIENT means the system declined to
            // rank, which is a different thing from having nothing to say.
            <span className="text-ink-300">no ranked candidates — zone forecast only</span>
          )}
        </p>
      </button>
    </li>
  );
}

export default function PredictedLocationsPage() {
  const [selectedId, setSelectedId] = useState(MOCK_CASES[0]?.case_id ?? "");
  const selected =
    MOCK_CASES.find((c) => c.case_id === selectedId) ?? MOCK_CASES[0];

  const ranked = MOCK_CASES.filter((c) => c.prediction.candidates.length > 0).length;

  return (
    <>
      <PageHeader
        title="Predicted locations"
        subtitle="Ranked cash-out candidates per case. Predict → rank → prioritise."
        searchPlaceholder="Search endpoints or cases…"
      />

      <div className="px-6 py-5">
        <div className="mb-4">
          <MockNotice>
            Mock predictions for interface development. Live rankings come only from a
            validated, calibrated model run — <code className="not-italic">make eval</code>{" "}
            has a signal-carrying dataset now, but no Tier 2 ranker is trained, so nothing
            here is a model output.
          </MockNotice>
        </div>

        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <Card
            title={`Cases · ${ranked} of ${MOCK_CASES.length} ranked`}
            bodyClassName=""
            className="self-start"
          >
            <ul className="divide-y divide-line">
              {MOCK_CASES.map((c) => (
                <CaseRow
                  key={c.case_id}
                  item={c}
                  selected={c.case_id === selectedId}
                  onSelect={() => setSelectedId(c.case_id)}
                />
              ))}
            </ul>
          </Card>

          <div className="min-w-0 space-y-4">
            {selected && (
              <>
                <Card
                  title={`${selected.case_id} · prediction`}
                  action={
                    <span className="text-[11px] text-ink-500 tabular-nums">
                      as of{" "}
                      {new Date(selected.prediction.as_of).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  }
                >
                  {/* The §25.3 enforcement point. Do not inline a second copy. */}
                  <PredictionAndWhy prediction={selected.prediction} />
                </Card>

                <Card title="Why this shape">
                  <dl className="grid gap-x-6 gap-y-3 text-[12px] sm:grid-cols-2">
                    <div>
                      <dt className="text-ink-500">Candidate set size</dt>
                      <dd className="text-ink-900 tabular-nums">
                        {selected.prediction.candidate_set_size}
                      </dd>
                      <dd className="mt-0.5 text-[10px] text-ink-300">
                        Published with every metric — a recall figure over a small
                        candidate set is not comparable to one over a large set.
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Recall rungs used</dt>
                      <dd className="text-ink-900 tabular-nums">
                        {selected.prediction.recall_stage_rungs_used.join(", ") || "—"}
                      </dd>
                      <dd className="mt-0.5 text-[10px] text-ink-300">
                        How far down the five-rung ladder generation had to reach.
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Model version</dt>
                      <dd className="font-mono text-[11px] text-ink-900">
                        {selected.prediction.model_version}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Feature snapshot</dt>
                      <dd className="font-mono text-[11px] text-ink-900">
                        {selected.prediction.feature_snapshot_id}
                      </dd>
                      <dd className="mt-0.5 text-[10px] text-ink-300">
                        Bounded at the as-of instant; nothing observed later could
                        enter it (§19.1).
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card
                  title="On the map"
                  action={
                    <a
                      href="/map"
                      className="text-[11px] text-accent transition-opacity hover:opacity-80"
                    >
                      Open ATM / branch map →
                    </a>
                  }
                >
                  <p className="flex items-start gap-2 text-[12px] text-ink-500">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      Ranked endpoints for this case are drawn on the map with their
                      risk bands. The map answers <em>where</em>; this page answers{" "}
                      <em>in what order</em>, which is what a limited team needs first.
                    </span>
                  </p>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
