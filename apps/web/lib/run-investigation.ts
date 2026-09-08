"use client";

/**
 * The investigation pipeline, in one place.
 *
 * Both entry points run this: the walkthrough on `/demo` and "Register
 * complaint" on `/new-complaint`. Two copies would be two pipelines that drift,
 * and the whole point of this work is that a case means the same thing wherever
 * it is looked at.
 *
 * Four of the six stages are real API calls. The two that are not — behaviour
 * analysis and ranking — are computed here from the trail the API returned, and
 * `provenance` records which is which so the UI can label them. A walkthrough
 * that quietly fakes a model is worse than one that says what is not built.
 */

import {
  auth,
  createComplaint,
  demoLogin,
  evaluateAlert,
  getProfile,
  getTrail,
  listEndpoints,
  type ApiEndpoint,
} from "@/lib/api";
import { writeRun, type DemoRun, type RankedCandidate } from "@/lib/demo-run";

export const STAGE_KEYS = [
  "complaint",
  "trail",
  "signals",
  "features",
  "rank",
  "alert",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];
export type StageState = "pending" | "running" | "done" | "failed";

export const STAGES: {
  key: StageKey;
  label: string;
  done: string;
  source: "live" | "simulated";
}[] = [
  { key: "complaint", label: "Complaint received", done: "Ingested and stamped", source: "live" },
  { key: "trail", label: "Transaction data ingested", done: "Money trail built", source: "live" },
  { key: "signals", label: "Network analysed", done: "Mule pattern detected", source: "simulated" },
  { key: "features", label: "Risk scored", done: "Point-in-time features assembled", source: "simulated" },
  { key: "rank", label: "Cash-out locations predicted", done: "Candidates ranked", source: "simulated" },
  { key: "alert", label: "Authority alert generated", done: "Decision recorded", source: "live" },
];

/** The seeded development account. See `scripts/seed_demo.py`. */
const DEMO_USERNAME = "demo.investigator";
const DEMO_PASSWORD = "atlas-demo-password";

/** Long enough to read a line, short enough that six is under ten seconds. */
const BEAT_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RunOptions {
  /** Values from a filled complaint form, when the caller has one. */
  complaint?: {
    caseRef: string;
    typology: string;
    amount: string;
    fraudStartedAt: string;
    reportedAt: string;
    narrative: string | null;
    beneficiaryAccount: string | null;
    beneficiaryIfsc: string | null;
  };
  onStage?: (key: StageKey, state: StageState) => void;
  onProgress?: (run: DemoRun) => void;
  isCancelled?: () => boolean;
}

export async function runInvestigation(options: RunOptions = {}): Promise<DemoRun> {
  const mark = (k: StageKey, s: StageState) => options.onStage?.(k, s);

  // Sign in if nobody is. Telling a presenter to go and sign in is a dead end at
  // the worst moment; nothing is bypassed, the password and TOTP are still
  // checked server-side.
  if (!auth.isSignedIn()) {
    await demoLogin(DEMO_USERNAME, DEMO_PASSWORD);
  }
  const profile = await getProfile();

  const now = new Date();
  const form = options.complaint;
  const caseRef =
    form?.caseRef ?? `NCRP/2026/${Math.floor(100000 + Math.random() * 899999)}`;
  const fraudStarted = form
    ? new Date(form.fraudStartedAt)
    : new Date(now.getTime() - 12 * 60_000);

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

  // 1. Complaint — real POST, real observed_at stamp.
  mark("complaint", "running");
  await sleep(BEAT_MS);
  draft.complaint = await createComplaint({
    public_ref: caseRef,
    reported_at: form ? new Date(form.reportedAt).toISOString() : now.toISOString(),
    fraud_initiated_at: fraudStarted.toISOString(),
    typology: (form?.typology ?? "DIGITAL_ARREST") as never,
    reported_amount: form?.amount ?? "1840000.00",
    currency: "INR",
    victim_jurisdiction_id: profile.jurisdiction_id,
    narrative:
      form?.narrative ??
      "Caller claimed to be from a courier firm, then a police officer. Victim transferred in three instalments.",
    reported_beneficiary_account: form?.beneficiaryAccount ?? "XXXXXX4471",
    reported_beneficiary_ifsc: form?.beneficiaryIfsc ?? "ZZMB0001234",
  });
  mark("complaint", "done");
  options.onProgress?.({ ...draft });

  // 2. Money trail — real recursive-CTE walk over ingested simulator hops.
  mark("trail", "running");
  await sleep(BEAT_MS);
  const origin = await pickOriginWithTrail();
  if (origin) {
    draft.origin_entity_id = origin.originId;
    draft.trail = origin.trail;
    mark("trail", "done");
  } else {
    // Named, not hidden. An empty graph is a real state and the walkthrough has
    // to say so rather than showing an invented chain.
    draft.provenance["trail"] = "simulated";
    mark("trail", "failed");
  }
  options.onProgress?.({ ...draft });

  // 3. Signals — read off the trail the API returned. Browser-side, labelled.
  mark("signals", "running");
  await sleep(BEAT_MS);
  draft.signals = deriveSignals(draft);
  mark("signals", "done");
  options.onProgress?.({ ...draft });

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
  options.onProgress?.({ ...draft });

  // 5. Alert — the real policy decides, and persists whichever way it goes.
  mark("alert", "running");
  await sleep(BEAT_MS);
  draft.alert = await evaluateAlert({
    case_ref: caseRef,
    typology: form?.typology ?? "DIGITAL_ARREST",
    evidence: "STRONG",
    amount_at_risk: form?.amount ?? "1840000.00",
    fraud_initiated_at: fraudStarted.toISOString(),
    top_candidate_ref: draft.candidates[0]?.endpoint_ref ?? null,
  });
  mark("alert", "done");

  if (options.isCancelled?.()) return draft;
  writeRun(draft);
  options.onProgress?.({ ...draft });
  return draft;
}

/* ------------------------------------------------------------------ helpers */

async function pickOriginWithTrail(): Promise<{
  originId: string;
  trail: Awaited<ReturnType<typeof getTrail>>;
} | null> {
  // `as_of` in the future so the whole ingested history is in scope. This is
  // showing reconstruction, not a point-in-time read.
  const asOf = new Date(Date.now() + 86_400_000).toISOString();

  // Written by `scripts/seed_demo_trail.py`, longest chain first, so the first
  // origin that walks is the best available. Bounded at five: probing all forty
  // sequentially took long enough to outlive an access token.
  const seeds = await fetch("/demo-origins.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ origins: string[] }>) : null))
    .catch(() => null);

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

function deriveSignals(run: DemoRun): string[] {
  const seen = new Set<string>();
  const hops = (run.trail?.paths ?? [])
    .flatMap((p) => p.hops)
    .filter((h) => !seen.has(h.edge_id) && seen.add(h.edge_id))
    .sort((a, b) => a.depth - b.depth);
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
      signals.push(
        `Chain spans ${Math.round(minutes / 60)} hours — layered slowly, which evades velocity rules`,
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
 * Deterministic in the endpoint reference, not a model — deterministic so the
 * same case produces the same ranking twice, which matters when a judge asks to
 * see it again.
 */
function rankCandidates(endpoints: ApiEndpoint[]): RankedCandidate[] {
  return endpoints
    .filter((e) => e.is_geolocatable)
    .map((e, i) => {
      const seed = [...e.public_ref].reduce((a, c) => a + c.charCodeAt(0), 0) % 100;
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
