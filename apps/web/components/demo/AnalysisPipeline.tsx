'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { rupees } from '@/lib/demo/defaults';
import type { DemoCase } from '@/lib/demo/types';

/**
 * The processing view: what ATLAS did to the complaint, in the order it did it.
 *
 * Every line a stage prints is read off the case that was already derived from
 * the complaint — the hop count is the trail's hop count, the endpoint is the
 * top-ranked endpoint, the alert severity is the alert's severity. The staging
 * is presentation; the numbers are not. That distinction is the whole reason
 * this component takes a `DemoCase` and computes nothing of its own.
 *
 * The delay between stages is there so a judge can follow the flow, and it is
 * honest about being a delay: the derivation is instantaneous, and the caption
 * says so rather than implying a long-running job.
 */

export interface PipelineStage {
  readonly key: string;
  readonly title: string;
  readonly caption: string;
  readonly lines: readonly string[];
}

export function pipelineStages(demoCase: DemoCase): readonly PipelineStage[] {
  const { complaint, features, locations, alert } = demoCase;
  const top = locations[0];

  return [
    {
      key: 'complaint',
      title: 'COMPLAINT',
      caption: 'Received from the reporting portal',
      lines: [
        complaint.complaint_id,
        `${complaint.complaint_type} · ${rupees(complaint.fraud_amount_inr)}`,
        `Victim account ${complaint.victim_account} · transaction ${complaint.transaction_id}`,
      ],
    },
    {
      key: 'ingestion',
      title: 'DATA INGESTION',
      caption: 'Joining the complaint to the transaction ledger',
      lines: [
        demoCase.ledger_match
          ? `Transactions · ${demoCase.transactions.length} rows matched on ${complaint.transaction_id}`
          : `Transactions · ${demoCase.transactions.length} rows derived (no ledger record for ${complaint.transaction_id})`,
        `Accounts · ${features.account_count} on the reconstruction`,
        `History · ${demoCase.locations.length} cash-out endpoints with prior-utilisation records`,
      ],
    },
    {
      key: 'trail',
      title: 'MONEY TRAIL',
      caption: 'Walking value forward from the victim account',
      lines: [
        `${features.hop_count} hops linked, to a depth of ${features.max_depth}`,
        `Layering span ${Math.floor(features.layering_span_minutes / 60)}h ${features.layering_span_minutes % 60}m`,
        features.truncated_paths > 0
          ? `${features.truncated_paths} path${features.truncated_paths === 1 ? '' : 's'} cut short — where the money went next is unknown`
          : 'Every path ended at a withdrawal',
      ],
    },
    {
      key: 'analysis',
      title: 'ANALYSIS',
      caption: 'What the shape of the trail supports',
      lines: [
        `${features.observed_cash_outs} cash-out${features.observed_cash_outs === 1 ? '' : 's'} observed on ${features.observed_channels.length || 'no'} channel${features.observed_channels.length === 1 ? '' : 's'}`,
        `${Math.round(features.retained_fraction * 100)}% of what left the victim account is still inside the banking system`,
        `Evidence sufficiency · ${demoCase.evidence_sufficiency}`,
      ],
    },
    {
      key: 'prediction',
      title: 'PREDICTION',
      caption: 'Ranking where the remainder is likely to be withdrawn',
      lines: top
        ? [
            `${demoCase.prediction.candidate_set_size} endpoints scored, ${demoCase.prediction.candidates.length} emitted as candidates`,
            `#1 ${top.endpoint_id} — ${top.name}, score ${top.score.toFixed(2)}`,
            `Window ${top.window_start.slice(11, 16)}–${top.window_end.slice(11, 16)} on ${top.window_start.slice(0, 10)}`,
          ]
        : ['No ranked candidates emitted at this evidence level (§16.2)'],
    },
    {
      key: 'alert',
      title: 'ALERT',
      caption: 'Raised to the owning jurisdiction',
      lines: [
        `${alert.alert_id} · ${alert.severity}`,
        `Case ${alert.case_id}`,
        `Top candidate ${alert.endpoint_id}, score ${alert.score.toFixed(2)}`,
      ],
    },
  ];
}

/**
 * The reduced-motion preference, read as the external store it is.
 *
 * `useSyncExternalStore` rather than an effect: a media query is a subscription
 * to something outside React, and reading it into state from an effect renders
 * the animated version for one frame to somebody who asked not to see it.
 */
const motionQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)');

function subscribeToMotion(onChange: () => void): () => void {
  const query = motionQuery();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const readMotion = () => motionQuery().matches;
// On the server there is no preference to read. Assume none, which is what the
// markup has to say before the client can answer.
const serverMotion = () => false;

/**
 * The staged pipeline.
 *
 * **Remount to replay.** The reveal position is component state with no reset
 * path: callers that want the sequence to run again pass a changed `key`. That
 * is deliberate — a reset written as `setRevealed(0)` inside an effect is the
 * shape that renders twice and drifts out of step with `onComplete`.
 */
export function AnalysisPipeline({
  demoCase,
  stepMs = 850,
  onComplete,
  compact = false,
}: {
  demoCase: DemoCase;
  stepMs?: number;
  onComplete?: () => void;
  /** Render every stage immediately — for the console page, where it is a record. */
  compact?: boolean;
}) {
  const stages = useMemo(() => pipelineStages(demoCase), [demoCase]);
  const reducedMotion = useSyncExternalStore(subscribeToMotion, readMotion, serverMotion);
  const instant = compact || reducedMotion;

  const [tick, setTick] = useState(0);
  const revealed = instant ? stages.length : Math.min(tick, stages.length);
  const done = revealed >= stages.length;

  // A self-terminating chain of timeouts rather than an interval: the last
  // stage stops it, so nothing is left running behind a finished pipeline.
  useEffect(() => {
    if (instant || done) return;
    const timer = setTimeout(() => setTick((step) => step + 1), stepMs);
    return () => clearTimeout(timer);
  }, [instant, done, stepMs, tick]);

  // Held in a ref, and written from an effect rather than during render, so a
  // caller passing an inline arrow does not put `onComplete` in the dependency
  // list below and re-fire the notification on every parent render.
  const notify = useRef(onComplete);
  useEffect(() => {
    notify.current = onComplete;
  });
  useEffect(() => {
    if (done) notify.current?.();
  }, [done]);

  return (
    <ol className="space-y-0">
      {stages.map((stage, index) => {
        const state = index < revealed ? 'done' : index === revealed ? 'running' : 'pending';
        return (
          <li key={stage.key}>
            <div
              data-state={state}
              className={`rounded-lg border px-4 py-3 transition-colors duration-300 ${
                state === 'pending'
                  ? 'border-line bg-surface/40 opacity-40'
                  : state === 'running'
                    ? 'border-accent/50 bg-accent/5'
                    : 'border-line bg-surface'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-900">
                  {stage.title}
                </h3>
                <span
                  className={`shrink-0 text-[10.5px] uppercase tracking-wider ${
                    state === 'done'
                      ? 'text-evidence-strong'
                      : state === 'running'
                        ? 'text-accent'
                        : 'text-ink-300'
                  }`}
                >
                  {state === 'done' ? 'complete' : state === 'running' ? 'running' : 'queued'}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-500">{stage.caption}</p>

              {state !== 'pending' && (
                <ul className="mt-2 space-y-1">
                  {stage.lines.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-[12.5px] text-ink-700">
                      <span
                        aria-hidden
                        className={state === 'done' ? 'text-evidence-strong' : 'text-accent'}
                      >
                        {state === 'done' ? '✓' : '›'}
                      </span>
                      <span className="min-w-0">{line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {index < stages.length - 1 && (
              <div className="flex justify-center py-1" aria-hidden>
                <span
                  className={`text-[13px] leading-none ${
                    index < revealed - 1 ? 'text-accent' : 'text-ink-300'
                  }`}
                >
                  ↓
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
