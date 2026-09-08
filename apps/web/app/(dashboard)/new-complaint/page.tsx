"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Check, CheckCircle2, Clock, Loader2, Wand2 } from "lucide-react";
import {
  ApiError,
  auth,
  createComplaint,
  FRAUD_TYPOLOGIES,
  getProfile,
  type ApiComplaint,
  type FraudTypology,
} from "@/lib/api";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card } from "@/components/ui/Card";
import { syntheticAccount } from "@/lib/synthetic-bank";
import {
  runInvestigation,
  STAGES,
  type StageKey,
  type StageState,
} from "@/lib/run-investigation";
import { PresentationControls } from "@/components/demo/PresentationMode";

/**
 * Complaint intake (spec §11) — a real `POST /api/v1/complaints`.
 *
 * The form is ordered the way the call actually happens: what kind of fraud,
 * how much, when it started, where the money was sent, what the victim said.
 * "When it started" sits directly beside the amount because those two decide
 * whether anything can still be done, and burying the timestamp under optional
 * fields is how an intake screen quietly loses the golden hour.
 *
 * **No victim PII is collected.** Not an omission — ATLAS predicts the cash-out
 * leg of reported fraud and never scores individuals (`docs/NON-GOALS.md`), so
 * a name or a phone number here would be data the system has no use for and a
 * liability the moment it is stored. The complaint reference links back to
 * NCRP, which is where victim details belong.
 */

const TYPOLOGY_LABEL: Record<FraudTypology, string> = {
  DIGITAL_ARREST: "Digital arrest",
  INVESTMENT_SCAM: "Investment scam",
  UPI_COLLECT_FRAUD: "UPI collect fraud",
  CUSTOMER_CARE_IMPERSONATION: "Customer-care impersonation",
  LOAN_APP_EXTORTION: "Loan-app extortion",
  JOB_TASK_FRAUD: "Job / task fraud",
  SEXTORTION: "Sextortion",
  OTHER: "Other",
};

function localNow(offsetMinutes = 0): string {
  const t = new Date(Date.now() - offsetMinutes * 60_000);
  return new Date(t.getTime() - t.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

const FIELD =
  "w-full rounded-md border border-line bg-raised px-2.5 py-2 text-[13px] text-ink-900 placeholder-ink-300 focus:border-accent focus:outline-none";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-500";

export default function NewComplaintPage() {
  const router = useRouter();
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ApiComplaint | null>(null);

  const [caseRef, setCaseRef] = useState("");
  const [stages, setStages] = useState<Partial<Record<StageKey, StageState>>>({});
  const [typology, setTypology] = useState<FraudTypology>("DIGITAL_ARREST");
  const [amount, setAmount] = useState("");
  const [fraudStarted, setFraudStarted] = useState(localNow(45));
  const [reportedAt, setReportedAt] = useState(localNow());
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [narrative, setNarrative] = useState("");

  useEffect(() => {
    // Deliberately no redirect to /login. This is where the demo starts, and
    // bouncing a signed-out presenter away from the first page is the dead end
    // the walkthrough already had to fix. `runInvestigation` signs in on submit;
    // until then the form is fillable and the jurisdiction is resolved lazily.
    if (!auth.isSignedIn()) return;
    getProfile()
      .then((p) => setJurisdiction(p.jurisdiction_id))
      .catch(() => setError("Could not read your jurisdiction. Try signing in again."));
  }, [router]);

  // The clock the case is actually racing, shown while typing rather than after
  // submission — it is the number that decides whether this complaint is an
  // interruption or a filing.
  //
  // Held in state and ticked, not derived with `Date.now()` in a memo. A memo
  // over the wall clock is impure: it would compute once and then sit there
  // stale, which is the one thing a golden-hour counter must not do.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const started = new Date(fraudStarted).getTime();
  const minutesElapsed = Number.isNaN(started)
    ? null
    : Math.max(0, Math.round((now - started) / 60_000));

  /**
   * Fill the form with one internally consistent synthetic scenario.
   *
   * Not random values: the beneficiary account and IFSC come from
   * `lib/synthetic-bank`, generated from the case reference, so the account this
   * complaint names is the same account the trail, network graph and report
   * show. Random per-field values are what produce a demo that contradicts
   * itself two screens later.
   */
  function autofill() {
    const ref = `NCRP/2026/${Math.floor(100000 + Math.random() * 899999)}`;
    const beneficiary = syntheticAccount(ref);
    setCaseRef(ref);
    setTypology("DIGITAL_ARREST");
    setAmount("840000");
    setFraudStarted(localNow(14));
    setReportedAt(localNow());
    setAccount(beneficiary.accountNumber);
    setIfsc(beneficiary.ifsc);
    setNarrative(
      "Caller claimed to be from a courier firm, then a police officer, and kept the " +
        "victim on a video call. Money transferred in three instalments to avoid limits.",
    );
    setError(null);
  }

  /**
   * Register the complaint and run the investigation.
   *
   * The same `runInvestigation` the walkthrough uses — the complaint POST is
   * stage one of it, so submitting here does not file a complaint and then
   * separately pretend to analyse it. One pipeline, one case.
   */
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStages({});
    try {
      const run = await runInvestigation({
        complaint: {
          caseRef: caseRef || `NCRP/2026/${Math.floor(100000 + Math.random() * 899999)}`,
          typology,
          amount: Number(amount).toFixed(2),
          fraudStartedAt: fraudStarted,
          reportedAt,
          narrative: narrative.trim() || null,
          beneficiaryAccount: account.trim() || null,
          beneficiaryIfsc: ifsc.trim().toUpperCase() || null,
        },
        onStage: (key, state) => setStages((s) => ({ ...s, [key]: state })),
      });
      if (run.complaint) setCreated(run.complaint);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.message}${err.correlationId ? ` (ref ${err.correlationId.slice(0, 8)})` : ""}`
          : "Could not record the complaint.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <>
        <PageHeader title="Complaint recorded" subtitle={created.public_ref} />
        <div className="mx-auto max-w-2xl px-6 py-6">
          <Card>
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-evidence-strong"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">
                  {created.public_ref} is in the system.
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                  <div>
                    <dt className="text-ink-500">Typology</dt>
                    <dd className="text-ink-900">{TYPOLOGY_LABEL[created.typology as FraudTypology]}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Amount</dt>
                    <dd className="text-ink-900 tabular-nums">
                      ₹{Number(created.reported_amount).toLocaleString("en-IN")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Golden hour</dt>
                    <dd className="text-severity-high tabular-nums">
                      {created.golden_hour_minutes_elapsed ?? "—"} minutes elapsed
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Observed at</dt>
                    <dd className="text-ink-900 tabular-nums">
                      {new Date(created.observed_at).toLocaleTimeString("en-IN")}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </Card>

          {/* What actually happens next, not what a finished product would do.
              Naming the two steps that are automatic and the one that is not is
              more useful than a progress bar over work nobody has started. */}
          <Card title="What happens next" className="mt-4">
            <ol className="space-y-2.5 text-[13px] text-ink-700">
              <li className="flex gap-2.5">
                <span className="text-ink-300 tabular-nums">1</span>
                <span>
                  The complaint is stamped with <code className="font-mono text-[12px]">observed_at</code>{" "}
                  — the instant ATLAS could first have known it. Every downstream
                  feature read is bounded by that timestamp.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-ink-300 tabular-nums">2</span>
                <span>
                  It appears under <strong className="text-ink-900">Cases</strong> once an
                  investigator opens a case against it. Grouping is proposed, never
                  automatic (§27.1).
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-ink-300 tabular-nums">3</span>
                <span>
                  Cash-out candidates were ranked against the real endpoint registry and
                  the case went through the alert policy. The ranking is a relative model
                  score, not a calibrated probability — there is no trained Tier 2 ranker.
                </span>
              </li>
            </ol>
          </Card>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/transaction-trail")}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
            >
              Follow the money <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => router.push("/demo")}
              className="rounded-md border border-line bg-raised px-3 py-2 text-[13px] text-ink-700 transition-colors hover:text-ink-900"
            >
              See the full pipeline
            </button>
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setAmount("");
                setNarrative("");
                setAccount("");
                setIfsc("");
                setFraudStarted(localNow(45));
                setReportedAt(localNow());
              }}
              className="rounded-md border border-line bg-raised px-3 py-2 text-[13px] text-ink-700 transition-colors hover:text-ink-900"
            >
              Record another
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New complaint"
        subtitle="Record a reported cybercrime. Goes straight to the complaints API."
        actions={
          <>
            <button
              type="button"
              onClick={autofill}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[12px] font-medium text-accent transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden />
              Autofill synthetic data
            </button>
            <PresentationControls />
          </>
        }
      />

      <div className="mx-auto max-w-3xl px-6 py-6">
        {error && (
          <p
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-severity-high/40 bg-severity-high/5 px-3 py-2.5 text-[13px] text-severity-high"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <Card title="The fraud">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="typology" className={LABEL}>
                  Typology
                </label>
                <select
                  id="typology"
                  value={typology}
                  onChange={(e) => setTypology(e.target.value as FraudTypology)}
                  className={FIELD}
                >
                  {FRAUD_TYPOLOGIES.map((t) => (
                    <option key={t} value={t}>
                      {TYPOLOGY_LABEL[t]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-ink-300">
                  Each typology has a different cash-out signature, so this is a
                  feature rather than a label (§9).
                </p>
              </div>

              <div>
                <label htmlFor="amount" className={LABEL}>
                  Amount reported (₹)
                </label>
                <input
                  id="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="820000.00"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor="fraud-started" className={LABEL}>
                  Fraud began
                </label>
                <input
                  id="fraud-started"
                  type="datetime-local"
                  required
                  value={fraudStarted}
                  onChange={(e) => setFraudStarted(e.target.value)}
                  className={FIELD}
                />
                {minutesElapsed !== null && (
                  <p
                    className={`mt-1 flex items-center gap-1 text-[11px] tabular-nums ${
                      minutesElapsed <= 60 ? "text-severity-high" : "text-ink-500"
                    }`}
                  >
                    <Clock className="h-3 w-3" aria-hidden />
                    {minutesElapsed} minutes elapsed
                    {minutesElapsed <= 60
                      ? " — inside the golden hour"
                      : " — past the golden hour"}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="reported-at" className={LABEL}>
                  Reported at
                </label>
                <input
                  id="reported-at"
                  type="datetime-local"
                  required
                  value={reportedAt}
                  onChange={(e) => setReportedAt(e.target.value)}
                  className={FIELD}
                />
              </div>
            </div>
          </Card>

          <Card title="Where the money went">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="account" className={LABEL}>
                  Beneficiary account <span className="normal-case text-ink-300">(optional)</span>
                </label>
                <input
                  id="account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="As stated by the victim"
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor="ifsc" className={LABEL}>
                  IFSC <span className="normal-case text-ink-300">(optional)</span>
                </label>
                <input
                  id="ifsc"
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value)}
                  placeholder="BNKB0001234"
                  maxLength={16}
                  className={`${FIELD} font-mono uppercase`}
                />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-ink-500">
              The first hop is what makes a trail reconstructable. Without it the case
              still records, and prediction has nothing to walk from.
            </p>
          </Card>

          <Card title="Narrative">
            <label htmlFor="narrative" className="sr-only">
              What the victim reported
            </label>
            <textarea
              id="narrative"
              rows={4}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="What the victim reported, in their words."
              className={FIELD}
            />
            <p className="mt-2 text-[11px] text-ink-500">
              No victim name, phone number or address. ATLAS forecasts where money is
              withdrawn and never scores individuals — personal details here would be
              data it has no use for.
            </p>
          </Card>

          {/* The pipeline, in place while it runs. Each line is a stage of
              `runInvestigation` — the same one the walkthrough uses — so this is
              reporting real progress rather than animating a wait. */}
          {submitting && (
            <Card title="Processing">
              <ol className="space-y-2">
                {STAGES.map((stage, i) => {
                  const state = stages[stage.key] ?? "pending";
                  return (
                    <li key={stage.key} className="flex items-center gap-2.5 text-[12px]">
                      <span className="shrink-0" aria-hidden>
                        {state === "done" ? (
                          <Check className="h-3.5 w-3.5 text-evidence-strong" />
                        ) : state === "running" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                        ) : (
                          <span className="block h-3.5 w-3.5 rounded-full border border-line" />
                        )}
                      </span>
                      <span className={state === "pending" ? "text-ink-500" : "text-ink-900"}>
                        {i + 1}. {stage.label}
                      </span>
                      {state === "done" && (
                        <span className="ml-auto text-[11px] text-evidence-strong">
                          {stage.done}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? "Processing…" : "Register complaint"}
            </button>
            <span className="text-[11px] text-ink-500">
              Filed into your own jurisdiction, then run through the investigation
              pipeline.
            </span>
          </div>
        </form>
      </div>
    </>
  );
}
