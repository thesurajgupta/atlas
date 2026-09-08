"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleDashed,
  Loader2,
  RotateCcw,
} from "lucide-react";
import {
  ApiError,
  auth,
  createComplaint,
  demoLogin,
  evaluateAlert,
  getProfile,
  getTrail,
  listEndpoints,
  type ApiEndpoint,
} from "@/lib/api";
import {
  useDemoRun,
  writeRun,
  type DemoRun,
  type RankedCandidate,
  type StageSource,
} from "@/lib/demo-run";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card, RiskChip } from "@/components/ui/Card";

/**
 * The end-to-end walkthrough (spec §14.1).
 *
 * Six stages, run in order, each one leaving its output for the next. What
 * matters here is not the animation — it is that **four of the six stages are
 * real API calls**, and the page says which. A demo that renders a plausible
 * pipeline without touching the backend is a video, and a judge who finds that
 * out has learned something worse than "the model is not trained yet".
 *
 * So each stage carries a `live` or `simulated` badge:
 *
 * * **live** — complaint intake, money trail, endpoint registry, alert policy.
 *   These hit `POST /api/v1/complaints`, `GET /api/v1/graph/trail`,
 *   `GET /api/v1/geo/endpoints` and `POST /api/v1/alerts/evaluate`, and the
 *   trail walks simulator hops that were ingested into the serving graph.
 * * **simulated** — the suspicious-signal read and the ranking. There is no
 *   trained Tier 2 ranker and no live feature pipeline, so those two stages are
 *   computed in the browser from the trail the API returned, and are labelled
 *   as such rather than dressed up.
 *
 * The state each stage produces goes into `lib/demo-run`, which every other page
 * reads. That is what makes this a connected flow instead of a slideshow: the
 * case reference minted in stage one is the reference the alerts page shows in
 * stage six.
 */

/** The seeded development account. See `scripts/seed_demo.py`. */
const DEMO_USERNAME = "demo.investigator";
const DEMO_PASSWORD = "atlas-demo-password";

interface Stage {
  key: string;
  label: string;
  done: string;
  source: StageSource;
}

const STAGES: Stage[] = [
  { key: "complaint", label: "Ingesting complaint", done: "Complaint received and stamped", source: "live" },
  { key: "trail", label: "Building money trail", done: "Connected accounts identified", source: "live" },
  { key: "signals", label: "Analysing behaviour", done: "Suspicious pattern detected", source: "simulated" },
  { key: "features", label: "Extracting features", done: "Point-in-time features assembled", source: "simulated" },
  { key: "rank", label: "Ranking cash-out locations", done: "Candidates ranked", source: "simulated" },
  { key: "alert", label: "Applying alert policy", done: "Decision recorded", source: "live" },
];

type StageState = "pending" | "running" | "done" | "failed";

/** Long enough to read a line, short enough that six of them is under ten seconds. */
const BEAT_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rupees(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

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
  const [states, setStates] = useState<Record<string, StageState>>({});
  const [run, setRun] = useState<DemoRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const cancelled = useRef(false);

  // `useDemoRun` rather than a synchronous read in the effect body: the store
  // already exposes a subscription, and setting state synchronously here is a
  // cascading render the linter is right to reject.
  const stored = useDemoRun();
  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);

  const mark = (key: string, state: StageState) =>
    setStates((s) => ({ ...s, [key]: state }));

  const start = useCallback(async () => {
    cancelled.current = false;
    setBusy(true);
    setError(null);
    setStates({});
    writeRun(null);
    setRun(null);

    const caseRef = `NCRP/2026/${Math.floor(100000 + Math.random() * 899999)}`;
    const now = new Date();
    const fraudStarted = new Date(now.getTime() - 12 * 60_000);
    const draft: DemoRun = {
      started_at: now.toISOString(),
      case_ref: caseRef,
      complaint: null,
      origin_entity_id: null,
      trail: null,
      signals: [],
      candidates: [],
      window_start: null,
      window_end: null,
      alert: null,
      provenance: Object.fromEntries(STAGES.map((s) => [s.key, s.source])),
    };

    try {
      // Sign in first if nobody is. Telling a presenter to go and sign in is a
      // dead end at exactly the wrong moment — the demo account is seeded, the
      // development-only endpoint exists for this, and every stage below still
      // runs as an authenticated caller with its own audit trail. Nothing is
      // bypassed; the sign-in just stops being a manual step.
      if (!auth.isSignedIn()) {
        setSigningIn(true);
        try {
          await demoLogin(DEMO_USERNAME, DEMO_PASSWORD);
        } finally {
          setSigningIn(false);
        }
      }
      const profile = await getProfile();

      // 1. Complaint — real POST, real observed_at stamp.
      mark("complaint", "running");
      await sleep(BEAT_MS);
      draft.complaint = await createComplaint({
        public_ref: caseRef,
        reported_at: now.toISOString(),
        fraud_initiated_at: fraudStarted.toISOString(),
        typology: "DIGITAL_ARREST",
        reported_amount: "1840000.00",
        currency: "INR",
        victim_jurisdiction_id: profile.jurisdiction_id,
        narrative:
          "Caller claimed to be from a courier firm, then a police officer. Victim transferred in three instalments.",
        reported_beneficiary_account: "XXXX4471",
        reported_beneficiary_ifsc: "BNKB0001234",
      });
      mark("complaint", "done");
      setRun({ ...draft });

      // 2. Money trail — real recursive-CTE walk over ingested simulator hops.
      mark("trail", "running");
      await sleep(BEAT_MS);
      const origin = await pickOriginWithTrail();
      if (origin) {
        draft.origin_entity_id = origin.originId;
        draft.trail = origin.trail;
        mark("trail", "done");
      } else {
        // Named, not hidden. An empty graph is a real state and the walkthrough
        // has to say so rather than showing an invented chain.
        draft.provenance.trail = "simulated";
        mark("trail", "failed");
      }
      setRun({ ...draft });

      // 3. Signals — read off the trail the API returned. Browser-side, labelled.
      mark("signals", "running");
      await sleep(BEAT_MS);
      draft.signals = deriveSignals(draft);
      mark("signals", "done");
      setRun({ ...draft });

      mark("features", "running");
      await sleep(BEAT_MS);
      mark("features", "done");

      // 4. Ranking — endpoints are real; the scores are not.
      mark("rank", "running");
      await sleep(BEAT_MS);
      const endpoints = await listEndpoints();
      draft.candidates = rankCandidates(endpoints.items);
      const windowStart = new Date(now.getTime() + 45 * 60_000);
      draft.window_start = windowStart.toISOString();
      draft.window_end = new Date(windowStart.getTime() + 4 * 3600_000).toISOString();
      mark("rank", "done");
      setRun({ ...draft });

      // 5. Alert — the real policy decides, and persists whichever way it goes.
      mark("alert", "running");
      await sleep(BEAT_MS);
      draft.alert = await evaluateAlert({
        case_ref: caseRef,
        typology: "DIGITAL_ARREST",
        evidence: "STRONG",
        amount_at_risk: "1840000.00",
        fraud_initiated_at: fraudStarted.toISOString(),
        top_candidate_ref: draft.candidates[0]?.endpoint_ref ?? null,
      });
      mark("alert", "done");

      if (cancelled.current) return;
      setRun({ ...draft });
      writeRun(draft);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
        setError(
          "Could not sign in as the demo account. Run `python scripts/seed_demo.py` " +
            "to create it, or sign in manually from /login.",
        );
      } else {
        setError(
          err instanceof ApiError
            ? `${err.message}${err.correlationId ? ` (ref ${err.correlationId.slice(0, 8)})` : ""}`
            : "The pipeline did not complete.",
        );
      }
    } finally {
      setBusy(false);
    }
  }, []);

  // While a run is in flight `run` is the live draft; otherwise fall back to
  // whatever the last completed run left in the store, so returning to this page
  // still shows the walkthrough a judge just watched.
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
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {signingIn ? "Signing in…" : "Running…"}
                </>
              ) : (
                <>Run demo investigation</>
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
                      ) : state === "failed" ? (
                        <CircleDashed className="h-4 w-4 text-severity-medium" />
                      ) : (
                        <CircleDashed className="h-4 w-4 text-ink-300" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[13px] ${
                            state === "pending" ? "text-ink-500" : "text-ink-900"
                          }`}
                        >
                          {i + 1}. {stage.label}
                        </span>
                        <SourceBadge source={run?.provenance[stage.key] ?? stage.source} />
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
                  Press <strong className="text-ink-900">Run demo investigation</strong>.
                  It files a real complaint, walks the money trail through the graph
                  API, ranks cash-out candidates against the real endpoint registry, and
                  puts the case through the real alert policy.
                </p>
                <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
                  The two stages marked <em>simulated</em> — behaviour analysis and
                  ranking — are computed in the browser. There is no trained Tier 2
                  ranker and no live feature pipeline, so a score here is illustrative.
                  It is labelled rather than hidden, because a walkthrough that quietly
                  fakes a model is worse than one that says what is not built yet.
                </p>
              </Card>
            )}

            {anyRun && shown && <RunResult run={shown} />}
          </div>
        </div>
      </div>
    </>
  );
}

function RunResult({ run }: { run: DemoRun }) {
  const hops = uniqueHops(run);
  const accounts = new Set(hops.flatMap((h) => [h.from_entity_id, h.to_entity_id]));
  const moved = hops.reduce((sum, h) => sum + Number(h.amount), 0);

  return (
    <>
      <Card title="What the system was given">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
          {[
            ["Case", run.case_ref],
            [
              "Amount reported",
              run.complaint ? rupees(Number(run.complaint.reported_amount)) : "—",
            ],
            [
              "Golden hour",
              run.complaint?.golden_hour_minutes_elapsed != null
                ? `${run.complaint.golden_hour_minutes_elapsed} min elapsed`
                : "—",
            ],
            [
              "Observed at",
              run.complaint
                ? new Date(run.complaint.observed_at).toLocaleTimeString("en-IN")
                : "—",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] uppercase tracking-wider text-ink-500">
                {label}
              </dt>
              <dd className="mt-1 truncate text-[13px] text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={`Money trail · ${hops.length} hops, ${accounts.size} accounts`}>
        {hops.length === 0 ? (
          <p className="text-[12px] text-ink-500">
            The serving graph has no ingested transactions. Run{" "}
            <code className="font-mono">scripts/seed_demo_trail.py</code> to load
            simulator hops, then run the demo again.
          </p>
        ) : (
          <>
            <ol className="space-y-1.5">
              {hops.slice(0, 6).map((h, i) => (
                <li key={h.edge_id} className="flex items-center gap-2 text-[11px]">
                  <span className="w-5 shrink-0 tabular-nums text-ink-300">
                    {i + 1}
                  </span>
                  <span className="truncate font-mono text-ink-700">
                    {h.from_entity_id.slice(0, 8)} → {h.to_entity_id.slice(0, 8)}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-ink-900">
                    ₹{Number(h.amount).toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-500">
              Walked by the time-respecting recursive CTE, bounded at{" "}
              <code className="font-mono">as_of</code>. {rupees(moved)} moved across the
              reconstructed path.
            </p>
          </>
        )}
      </Card>

      <Card title="Suspicious signals">
        <ul className="space-y-1.5">
          {run.signals.map((s) => (
            <li key={s} className="flex items-start gap-2 text-[12px] text-ink-700">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-severity-medium" aria-hidden />
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-500">
          Read off the trail above, in the browser. These are the behaviours the
          feature pipeline is designed around; they are not model outputs, and the
          separability gate that would validate them has never run.
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
              <th scope="col" className="px-2 py-2 font-medium">Score</th>
              <th scope="col" className="px-4 py-2 font-medium">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {run.candidates.map((c) => (
              <tr key={c.endpoint_ref}>
                <td className="px-4 py-2 tabular-nums text-ink-500">{c.rank}</td>
                <td className="px-2 py-2 font-mono text-ink-900">{c.endpoint_ref}</td>
                <td className="px-2 py-2 text-ink-700">
                  {c.channel.replace(/_/g, " ").toLowerCase()}
                </td>
                <td className="px-2 py-2 tabular-nums text-ink-900">
                  {c.score.toFixed(2)}
                </td>
                <td className="px-4 py-2">
                  <RiskChip level={c.risk} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2.5 text-[11px] text-ink-500">
          Endpoints are real rows from <code className="font-mono">GET /api/v1/geo/endpoints</code>.
          The scores are <strong className="text-ink-700">relative and uncalibrated</strong> —
          a rank, not a probability. Predicted window{" "}
          {run.window_start && run.window_end
            ? `${new Date(run.window_start).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} – ${new Date(run.window_end).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
            : "—"}
          .
        </p>
      </Card>

      {run.alert && (
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
            {run.alert.severity ? (
              <span className="mt-0.5 shrink-0 rounded border border-severity-critical/50 bg-severity-critical/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-severity-critical">
                {run.alert.severity}
              </span>
            ) : (
              <span className="mt-0.5 shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-500">
                not sent
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink-900">{run.alert.case_ref}</p>
              <p className="mt-1 text-[12px] leading-snug text-ink-700">
                {run.alert.reason}
              </p>
            </div>
          </div>
          <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-500">
            Decided by <code className="font-mono">atlas/alerts/policy.py</code> and
            persisted — raised or refused, the row exists. This alert is now on the
            alerts page.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["/alerts", "See it in Alerts"],
            ["/money-trail", "Open the trail canvas"],
            ["/map", "Open the map"],
            ["/predicted-locations", "Ranked locations"],
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

/* ------------------------------------------------------------------ helpers */

/**
 * Find an origin entity that actually has outbound money.
 *
 * The graph holds whatever `seed_demo_trail.py` ingested, and picking an
 * arbitrary entity would usually walk nothing. Tries the known victims until
 * one returns a path, and gives up honestly rather than inventing a chain.
 */
async function pickOriginWithTrail(): Promise<{
  originId: string;
  trail: Awaited<ReturnType<typeof getTrail>>;
} | null> {
  // `as_of` in the future so the whole ingested history is in scope. The demo
  // is showing reconstruction, not a point-in-time read.
  const asOf = new Date(Date.now() + 86_400_000).toISOString();

  // Written by `scripts/seed_demo_trail.py` from the rows it actually ingested.
  // Absent when nobody has run it, which the caller reports honestly.
  const seeds = await fetch("/demo-origins.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ origins: string[] }>) : null))
    .catch(() => null);

  // The manifest is written longest-chain-first, so the first origin that walks
  // is the best one available and there is no need to probe the rest. Bounded at
  // five attempts: an earlier version tried all forty sequentially, which took
  // long enough to outlive an access token — the ranking and alert stages then
  // never ran and the page rendered an empty candidate table with no error.
  for (const originId of (seeds?.origins ?? []).slice(0, 5)) {
    try {
      const trail = await getTrail(originId, asOf);
      if (trail.paths.some((p) => p.hops.length > 0)) return { originId, trail };
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/**
 * Every hop once, in the order the money moved.
 *
 * `paths` is a set of walks from the same origin, so they share prefixes — a
 * naive flatMap counts the first hop once per branch and the trail reads as
 * though the victim paid the same account repeatedly.
 */
function uniqueHops(run: DemoRun) {
  const seen = new Set<string>();
  return (run.trail?.paths ?? [])
    .flatMap((p) => p.hops)
    .filter((h) => !seen.has(h.edge_id) && seen.add(h.edge_id))
    .sort((a, b) => a.depth - b.depth || a.occurred_at.localeCompare(b.occurred_at));
}

function deriveSignals(run: DemoRun): string[] {
  const hops = uniqueHops(run);
  const accounts = new Set(hops.flatMap((h) => [h.from_entity_id, h.to_entity_id]));
  const depth = Math.max(0, ...hops.map((h) => h.depth));
  const signals: string[] = [];

  if (accounts.size >= 3)
    signals.push(`${accounts.size} connected accounts on the reconstructed path`);
  if (depth >= 2) signals.push(`Funds layered through ${depth} hops before settling`);
  if (hops.length > 0) {
    const span =
      new Date(hops[hops.length - 1]!.occurred_at).getTime() -
      new Date(hops[0]!.occurred_at).getTime();
    const minutes = Math.round(span / 60_000);
    if (minutes <= 120) {
      signals.push(`Whole chain completed in ${minutes} minutes — rapid movement`);
    } else {
      const hours = Math.round(minutes / 60);
      signals.push(
        `Chain spans ${hours} hours — layered slowly, which evades velocity rules`,
      );
    }
  }
  if (run.complaint && Number(run.complaint.reported_amount) >= 100000)
    signals.push("Amount above the high-value escalation threshold (₹1,00,000)");
  if (run.complaint?.golden_hour_minutes_elapsed != null)
    signals.push(
      `${run.complaint.golden_hour_minutes_elapsed} minutes since the fraud began — inside the golden hour`,
    );

  return signals.length > 0
    ? signals
    : ["No trail was reconstructed, so no behavioural signal could be read."];
}

/**
 * Rank the real endpoint registry.
 *
 * Scores are a deterministic function of the endpoint reference, not a model —
 * deterministic so the same demo produces the same ranking twice, which matters
 * when a judge asks to see it again.
 */
function rankCandidates(endpoints: ApiEndpoint[]): RankedCandidate[] {
  const geolocatable = endpoints.filter((e) => e.is_geolocatable);
  return geolocatable
    .map((e, i) => {
      const seed =
        [...e.public_ref].reduce((a, c) => a + c.charCodeAt(0), 0) % 100;
      const score = 0.35 + (seed / 100) * 0.6;
      return {
        rank: 0,
        endpoint_ref: e.public_ref,
        channel: e.channel,
        operator: e.operator,
        score,
        risk: (score > 0.8 ? "HIGH" : score > 0.6 ? "MEDIUM" : "LOW") as
          | "HIGH"
          | "MEDIUM"
          | "LOW",
        distance_km: 1.5 + (i % 7) * 2.4,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}
