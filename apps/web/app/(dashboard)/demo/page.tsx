"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleDashed, Loader2, RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useDemoRun, writeRun, type DemoRun, type StageSource } from "@/lib/demo-run";
import { runInvestigation, STAGES, type StageKey, type StageState } from "@/lib/run-investigation";
import { useCaseView, formatRupees } from "@/lib/case-view";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card, RiskChip } from "@/components/ui/Card";
import { PresentationControls } from "@/components/demo/PresentationMode";

/**
 * The end-to-end walkthrough (spec §14.1).
 *
 * The pipeline itself lives in `lib/run-investigation`, because `/new-complaint`
 * runs the same one — two copies would be two pipelines that drift, and the
 * point of this work is that a case means the same thing wherever it is looked
 * at. This page is the view over it.
 *
 * **Four of the six stages are real API calls**, and each stage carries a badge
 * saying which it is. A demo that renders a plausible pipeline without touching
 * the backend is a video, and a judge who finds that out has learned something
 * worse than "the model is not trained yet".
 */

function SourceBadge({ source }: { source: StageSource }) {
  return source === "live" ? (
    <span className="shrink-0 rounded border border-evidence-strong/40 bg-evidence-strong/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-evidence-strong">
      live API
    </span>
  ) : (
    <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-ink-500">
      simulated
    </span>
  );
}

export default function DemoPage() {
  const [states, setStates] = useState<Partial<Record<StageKey, StageState>>>({});
  const [run, setRun] = useState<DemoRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);
  const stored = useDemoRun();

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const start = useCallback(async () => {
    cancelled.current = false;
    setBusy(true);
    setError(null);
    setStates({});
    writeRun(null);
    setRun(null);
    try {
      await runInvestigation({
        onStage: (key, state) => setStates((s) => ({ ...s, [key]: state })),
        onProgress: (r) => setRun({ ...r }),
        isCancelled: () => cancelled.current,
      });
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 404 || err.status === 401)
          ? "Could not sign in as the demo account. Run `python scripts/seed_demo.py`, or sign in from /login."
          : err instanceof ApiError
            ? `${err.message}${err.correlationId ? ` (ref ${err.correlationId.slice(0, 8)})` : ""}`
            : "The pipeline did not complete.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  // The live draft while running, the last completed run otherwise, so coming
  // back to this page still shows the walkthrough a judge just watched.
  const shown = run ?? stored;
  const anyRun = shown !== null && shown.complaint !== null;

  return (
    <>
      <PageHeader
        title="Demo investigation"
        subtitle="One complaint, end to end. Four of the six stages call the real API."
        actions={
          <>
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Running…
                </>
              ) : (
                "Run demo investigation"
              )}
            </button>
            {anyRun && !busy && (
              <button
                type="button"
                onClick={() => {
                  writeRun(null);
                  setRun(null);
                  setStates({});
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink-700 transition-colors hover:text-ink-900"
              >
                <RotateCcw className="h-3 w-3" aria-hidden /> Clear
              </button>
            )}
            <PresentationControls />
          </>
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

        <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
          <Card title="Pipeline" bodyClassName="">
            <ol className="divide-y divide-line">
              {STAGES.map((stage, i) => {
                const state = states[stage.key] ?? "pending";
                return (
                  <li key={stage.key} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {state === "done" ? (
                        <Check className="h-4 w-4 text-evidence-strong" />
                      ) : state === "running" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-accent" />
                      ) : (
                        <CircleDashed
                          className={`h-4 w-4 ${state === "failed" ? "text-severity-medium" : "text-ink-300"}`}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[13px] ${state === "pending" ? "text-ink-500" : "text-ink-900"}`}
                        >
                          {i + 1}. {stage.label}
                        </span>
                        <SourceBadge source={shown?.provenance[stage.key] ?? stage.source} />
                      </span>
                      {state === "done" && (
                        <span className="mt-0.5 block text-[11px] text-evidence-strong">
                          {stage.done}
                        </span>
                      )}
                      {state === "failed" && (
                        <span className="mt-0.5 block text-[11px] text-severity-medium">
                          No ingested trail — run{" "}
                          <code className="font-mono">scripts/seed_demo_trail.py</code>
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>

          <div className="min-w-0 space-y-4">
            {!anyRun && (
              <Card>
                <p className="text-[13px] leading-relaxed text-ink-700">
                  Press <strong className="text-ink-900">Run demo investigation</strong>, or
                  start from{" "}
                  <Link href="/new-complaint" className="text-accent hover:opacity-80">
                    New complaint
                  </Link>{" "}
                  and autofill a synthetic case. Both run the same pipeline.
                </p>
                <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
                  The two stages marked <em>simulated</em> are computed in the browser.
                  There is no trained Tier 2 ranker and no live feature pipeline, so a
                  score is illustrative — labelled rather than hidden, because a
                  walkthrough that quietly fakes a model is worse than one that says what
                  is not built yet.
                </p>
              </Card>
            )}
            {anyRun && <RunResult />}
          </div>
        </div>
      </div>
    </>
  );
}

function RunResult() {
  const view = useCaseView();
  if (!view) return null;

  return (
    <>
      <Card title="What the system was given">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
          {[
            ["Case", view.caseRef],
            ["Amount reported", formatRupees(view.reportedAmount)],
            [
              "Golden hour",
              view.goldenHourMinutes === null ? "—" : `${view.goldenHourMinutes} min elapsed`,
            ],
            [
              "Observed at",
              view.observedAt ? new Date(view.observedAt).toLocaleTimeString("en-IN") : "—",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] uppercase tracking-wider text-ink-500">{label}</dt>
              <dd className="mt-1 truncate text-[13px] text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={`Money trail · ${view.hops.length} hops, ${view.nodes.length} accounts`}>
        {view.hops.length === 0 ? (
          <p className="text-[12px] text-ink-500">
            The serving graph has no ingested transactions. Run{" "}
            <code className="font-mono">scripts/seed_demo_trail.py</code>, then run again.
          </p>
        ) : (
          <>
            <ol className="space-y-1.5">
              {view.hops.slice(0, 6).map((h) => (
                <li key={h.id} className="flex items-center gap-2 text-[11px]">
                  <span className="w-5 shrink-0 tabular-nums text-ink-300">{h.index}</span>
                  <span className="truncate font-mono text-ink-700">
                    {h.fromLabel} → {h.toLabel}
                  </span>
                  <span className="shrink-0 text-ink-300">{h.rail}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-ink-900">
                    ₹{h.amount.toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-500">
              Walked by the time-respecting recursive CTE, bounded at{" "}
              <code className="font-mono">as_of</code>.{" "}
              <strong className="text-ink-700">{formatRupees(view.entered)}</strong> left the
              victim — the amount reported — and{" "}
              <strong className="text-ink-700">{formatRupees(view.reachedTerminals)}</strong>{" "}
              survived the mules&apos; cuts to reach a terminal account.
            </p>
          </>
        )}
      </Card>

      <Card title="Suspicious signals">
        <ul className="space-y-1.5">
          {view.signals.map((s) => (
            <li key={s} className="flex items-start gap-2 text-[12px] text-ink-700">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-severity-medium" aria-hidden />
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-500">
          Read off the trail above, in the browser. These are the behaviours the feature
          pipeline is designed around; they are not model outputs, and the separability
          gate that would validate them has never run.
        </p>
      </Card>

      <Card
        title="Ranked cash-out candidates"
        action={
          <Link
            href="/map"
            className="inline-flex items-center gap-1 text-[11px] text-accent transition-opacity hover:opacity-80"
          >
            On the map <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        }
        bodyClassName=""
      >
        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-line text-[10px] uppercase tracking-wider text-ink-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">#</th>
              <th scope="col" className="px-2 py-2 font-medium">Endpoint</th>
              <th scope="col" className="px-2 py-2 font-medium">Channel</th>
              <th scope="col" className="px-2 py-2 font-medium">Model score</th>
              <th scope="col" className="px-4 py-2 font-medium">Priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {view.candidates.map((c) => (
              <tr key={c.endpoint_ref}>
                <td className="px-4 py-2 tabular-nums text-ink-500">{c.rank}</td>
                <td className="px-2 py-2 font-mono text-ink-900">{c.endpoint_ref}</td>
                <td className="px-2 py-2 text-ink-700">
                  {c.channel.replace(/_/g, " ").toLowerCase()}
                </td>
                <td className="px-2 py-2 tabular-nums text-ink-900">{c.score.toFixed(2)}</td>
                <td className="px-4 py-2">
                  <RiskChip level={c.risk} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2.5 text-[11px] text-ink-500">
          Endpoints are real rows from{" "}
          <code className="font-mono">GET /api/v1/geo/endpoints</code>. The scores are{" "}
          <strong className="text-ink-700">relative and uncalibrated</strong> — a rank, not a
          probability. Predicted window{" "}
          {view.windowStart && view.windowEnd
            ? `${new Date(view.windowStart).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} – ${new Date(view.windowEnd).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
            : "—"}
          .
        </p>
      </Card>

      {view.alertReason && (
        <Card
          title="Alert policy decision"
          action={
            <Link
              href="/alerts"
              className="inline-flex items-center gap-1 text-[11px] text-accent transition-opacity hover:opacity-80"
            >
              Alerts <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          }
        >
          <div className="flex items-start gap-3">
            {view.alertSeverity ? (
              <RiskChip level={view.alertSeverity} />
            ) : (
              <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-500">
                not sent
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink-900">{view.caseRef}</p>
              <p className="mt-1 text-[12px] leading-snug text-ink-700">{view.alertReason}</p>
            </div>
          </div>
          <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-500">
            Decided by <code className="font-mono">atlas/alerts/policy.py</code> and
            persisted — raised or refused, the row exists.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["/transaction-trail", "Transaction trail"],
            ["/network-graph", "Network graph"],
            ["/predicted-locations", "Ranked locations"],
            ["/map", "Map"],
            ["/alerts", "Alerts"],
            ["/investigation", "Investigation"],
            ["/reports", "Report"],
          ] as const
        ).map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-2 text-[12px] text-ink-700 transition-colors hover:text-ink-900"
          >
            {label}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        ))}
      </div>
    </>
  );
}
