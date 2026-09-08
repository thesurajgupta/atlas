"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { MOCK_CASES } from "@/lib/mock-data";
import type { Case, PredictionCandidate } from "@/lib/types";
import { RANKED_CANDIDATE_LIMIT } from "@/lib/demo/case";
import { useDemoCase } from "@/lib/demo/store";
import { CaseBanner } from "@/components/demo/CaseBanner";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card, MockNotice } from "@/components/ui/Card";
import { PredictionAndWhy } from "@/components/prediction/PredictionAndWhy";
import { EvidenceBadge } from "@/components/prediction/EvidenceBadge";

/**
 * Ranked cash-out candidates across open cases (spec §15, §16.2, §25.3).
 *
 * The ordering on this page is the product: predict, rank, prioritise. Which is
 * why the rank number is the largest thing on each row and the score is not — a
 * score invites "how sure are you", and the honest answer is that nothing here
 * is calibrated. The rank is what tasking actually uses.
 *
 * **The referred case leads the list.** When a complaint has been sent over
 * from the reporting portal it is the first row and the default selection, and
 * its candidates are the ones `/map` draws and the alert names. Same case, same
 * endpoints, same scores, whichever screen you arrive from.
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
  // Sliced out of the ISO string rather than formatted: these instants carry an
  // explicit IST offset, and `toLocaleTimeString` would shift them into the
  // viewer's zone and render differently on the server and the client.
  return `${c.predicted_window.start.slice(11, 16)} – ${c.predicted_window.end.slice(11, 16)}`;
}

function CaseRow({
  item,
  selected,
  live,
  onSelect,
}: {
  item: Case;
  selected: boolean;
  live: boolean;
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
        {/* The case id gets the full width of the row.
            The evidence badge sits under it rather than beside it: at 20rem the
            two together clip the id, and a truncated case reference on the one
            screen where a reader is comparing references is the worst place to
            save a line. */}
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-900">
          {live && (
            <span className="shrink-0 rounded-sm border border-accent/40 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-accent">
              live
            </span>
          )}
          <span className="min-w-0 truncate">{item.case_id}</span>
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] text-ink-500">
            {strip.typology.replace(/_/g, " ").toLowerCase()} ·{" "}
            {rupees(strip.amount_at_risk_inr)}
          </span>
          <EvidenceBadge band={strip.evidence_sufficiency} />
        </div>
        <p className="mt-1.5 text-[11px] tabular-nums text-ink-500">
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
  const { activeCase } = useDemoCase();

  const cases: Case[] =
    activeCase === null ? MOCK_CASES : [activeCase.atlas_case, ...MOCK_CASES];

  // `null` means "follow the referred case". Held that way rather than seeded
  // with an id, because the store hydrates after the first render and a seeded
  // selection would stick to whatever was first before the case arrived.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const selectedId = pinnedId ?? cases[0]?.case_id ?? "";
  const selected = cases.find((c) => c.case_id === selectedId) ?? cases[0];

  const ranked = cases.filter((c) => c.prediction.candidates.length > 0).length;
  const isLive = selected !== undefined && selected.case_id === activeCase?.case_id;

  return (
    <>
      <PageHeader
        title="Predicted locations"
        subtitle="Ranked cash-out candidates per case. Predict → rank → prioritise."
        searchPlaceholder="Search endpoints or cases…"
      />

      <div className="px-6 py-5">
        <CaseBanner page="Predicted locations" />

        <div className="mb-4">
          <MockNotice>
            {isLive ? (
              <>
                Scores below are a weighted mean of five stated features over this case&rsquo;s own
                trail — reproducible, and shown in full under{" "}
                <span className="not-italic">Source data</span>. They order candidates for tasking.
                They are not calibrated probabilities, and no ranker has been trained on this data.
              </>
            ) : (
              <>
                Mock predictions for interface development. Live rankings come only from a
                validated, calibrated model run — <code className="not-italic">make eval</code> has a
                signal-carrying dataset now, but no Tier 2 ranker is trained, so nothing here is a
                model output.
              </>
            )}
          </MockNotice>
        </div>

        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <Card
            title={`Cases · ${ranked} of ${cases.length} ranked`}
            bodyClassName=""
            className="self-start"
          >
            <ul className="divide-y divide-line">
              {cases.map((c) => (
                <CaseRow
                  key={c.case_id}
                  item={c}
                  live={c.case_id === activeCase?.case_id}
                  selected={c.case_id === selectedId}
                  onSelect={() => setPinnedId(c.case_id)}
                />
              ))}
            </ul>
          </Card>

          <div className="min-w-0 space-y-4">
            {selected && (
              <>
                {/* The ranked list, with the endpoint names the map and the
                    alert use. `PredictionAndWhy` below carries the §25.3
                    band rendering; this table carries the place names, which
                    that component has no field for. */}
                {isLive && activeCase !== null && (
                  <Card
                    title={`${activeCase.case_id} · ranked cash-out locations`}
                    action={
                      <span className="flex items-center gap-3">
                        <span className="text-[11px] text-ink-500">
                          top {Math.min(RANKED_CANDIDATE_LIMIT, activeCase.locations.length)} of{" "}
                          {activeCase.locations.length} scored
                        </span>
                        <Link
                          href="/map"
                          className="text-[11px] text-accent transition-opacity hover:opacity-80"
                        >
                          Show on the map →
                        </Link>
                      </span>
                    }
                    bodyClassName=""
                  >
                    <ul className="divide-y divide-line">
                      {/* The head of the ranking. The whole catalogue is scored
                          — the map draws all of it — but a page that answers
                          "in what order" is answering about the ones a team
                          could actually cover. */}
                      {activeCase.locations.slice(0, RANKED_CANDIDATE_LIMIT).map((location) => (
                        <li key={location.endpoint_id} className="flex gap-3.5 px-4 py-3">
                          <span className="w-6 shrink-0 text-[20px] font-semibold leading-none tabular-nums text-ink-300">
                            {location.rank}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium text-ink-900">
                              {location.name}
                              <span className="font-mono text-[11px] text-ink-500">
                                {location.endpoint_id}
                              </span>
                              {location.observed_on_trail && (
                                <span className="rounded-sm border border-severity-high/40 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-severity-high">
                                  withdrawal seen
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] text-ink-500">
                              {location.kind} · {location.area} ·{" "}
                              {location.window_start.slice(11, 16)}–
                              {location.window_end.slice(11, 16)} on{" "}
                              {location.window_start.slice(0, 10)}
                            </p>
                            <ul className="mt-1.5 space-y-0.5">
                              {location.reasons.map((reason) => (
                                <li key={reason} className="text-[11.5px] leading-snug text-ink-700">
                                  · {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <span className="shrink-0 text-right">
                            <span className="block text-[17px] font-semibold tabular-nums text-ink-900">
                              {location.score.toFixed(2)}
                            </span>
                            <span
                              className={`mt-0.5 block text-[10px] uppercase tracking-wider ${
                                location.risk === "HIGH"
                                  ? "text-severity-high"
                                  : location.risk === "MEDIUM"
                                    ? "text-severity-medium"
                                    : "text-ink-500"
                              }`}
                            >
                              {location.risk}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                <Card
                  title={`${selected.case_id} · prediction`}
                  action={
                    <span className="text-[11px] tabular-nums text-ink-500">
                      as of {selected.prediction.as_of.slice(0, 16).replace("T", " ")}
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
                      <dd className="tabular-nums text-ink-900">
                        {selected.prediction.candidate_set_size}
                      </dd>
                      <dd className="mt-0.5 text-[10px] text-ink-300">
                        Published with every metric — a recall figure over a small candidate set is
                        not comparable to one over a large set.
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Recall rungs used</dt>
                      <dd className="tabular-nums text-ink-900">
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
                        Bounded at the as-of instant; nothing observed later could enter it (§19.1).
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card
                  title="On the map"
                  action={
                    <Link
                      href="/map"
                      className="text-[11px] text-accent transition-opacity hover:opacity-80"
                    >
                      Open ATM / branch map →
                    </Link>
                  }
                >
                  <p className="flex items-start gap-2 text-[12px] text-ink-500">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      Ranked endpoints for this case are drawn on the map with their risk bands. The
                      map answers <em>where</em>; this page answers <em>in what order</em>, which is
                      what a limited team needs first.
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
