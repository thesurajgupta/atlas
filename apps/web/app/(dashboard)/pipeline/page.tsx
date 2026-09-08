'use client';

import Link from 'next/link';
import { useState } from 'react';

import { AnalysisPipeline } from '@/components/demo/AnalysisPipeline';
import { CaseBanner } from '@/components/demo/CaseBanner';
import { PageHeader } from '@/components/nav/PageHeader';
import { Card } from '@/components/ui/Card';
import { MODEL_VERSION } from '@/lib/demo/case';
import { rupees } from '@/lib/demo/defaults';
import { useDemoCase } from '@/lib/demo/store';

/**
 * The pipeline as a record rather than a transition.
 *
 * `/atlas-intake` runs this once, on the way in from the portal. This page is
 * where it can be re-read afterwards, and re-run on demand — which is what a
 * judge asks for when they want to see the derivation a second time without the
 * presenter refiling a complaint.
 *
 * The right-hand column is the part that matters under questioning: the exact
 * feature weights, in one place, with the honest statement about what a score
 * is and is not.
 */
export default function PipelinePage() {
  const { hydrated, activeCase } = useDemoCase();
  const [runKey, setRunKey] = useState(0);
  const [replaying, setReplaying] = useState(false);

  return (
    <>
      <PageHeader
        title="Analysis pipeline"
        subtitle="Complaint → ingestion → trail → analysis → prediction → alert."
        actions={
          activeCase !== null ? (
            <button
              type="button"
              onClick={() => {
                setReplaying(true);
                setRunKey((key) => key + 1);
              }}
              className="rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
            >
              Replay the stages
            </button>
          ) : undefined
        }
      />

      <div className="px-6 py-5">
        <CaseBanner page="The pipeline" />

        {hydrated && activeCase === null && (
          <Card>
            <p className="text-[13px] text-ink-700">
              The pipeline runs on a complaint referred from the reporting portal. Nothing has been
              referred yet, so there is nothing to show — this page deliberately renders no example
              run, because a staged animation over invented values is exactly the thing this build
              is not.
            </p>
            <Link
              href="/ncrp"
              className="mt-3 inline-block rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
            >
              Open the reporting portal
            </Link>
          </Card>
        )}

        {activeCase !== null && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0">
              <AnalysisPipeline
                key={runKey}
                demoCase={activeCase}
                compact={!replaying}
                onComplete={() => setReplaying(false)}
              />
            </div>

            <div className="space-y-4">
              <Card title="How a score is computed">
                <p className="text-[12px] leading-relaxed text-ink-700">
                  Each of the {activeCase.prediction.candidate_set_size} endpoints in the catalogue
                  is scored as a weighted mean of five features, each on 0–1. The weights are stated
                  constants, not learned parameters.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {(activeCase.locations[0]?.features ?? []).map((feature) => (
                    <li
                      key={feature.name}
                      className="flex items-baseline justify-between gap-3 text-[12px]"
                    >
                      <span className="min-w-0 truncate text-ink-700">
                        {feature.name.replace(/_/g, ' ')}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-500">
                        weight {feature.weight.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 rounded-md border border-line bg-raised px-3 py-2 text-[11px] italic leading-relaxed text-ink-500">
                  A score orders candidates for tasking. It is not a calibrated probability, no
                  ranker has been trained on this data, and it must not be read as a likelihood that
                  a withdrawal will occur.
                </p>
              </Card>

              <Card title="This run">
                <dl className="grid gap-x-4 gap-y-3 text-[12px] sm:grid-cols-2">
                  {[
                    ['Case', activeCase.case_id],
                    ['Complaint', activeCase.complaint.complaint_id],
                    ['Amount at risk', rupees(activeCase.complaint.fraud_amount_inr)],
                    ['Evidence band', activeCase.evidence_sufficiency],
                    ['Ledger record', activeCase.ledger_match ? activeCase.ledger_template : 'derived'],
                    ['Feature snapshot', activeCase.prediction.feature_snapshot_id],
                    ['As of', activeCase.as_of.slice(0, 16).replace('T', ' ')],
                    ['Recall rungs used', activeCase.prediction.recall_stage_rungs_used.join(', ') || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-ink-500">{label}</dt>
                      <dd className="mt-0.5 break-words font-mono text-[11px] text-ink-900">
                        {value}
                      </dd>
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <dt className="text-ink-500">Model version</dt>
                    <dd className="mt-0.5 font-mono text-[11px] text-ink-900">{MODEL_VERSION}</dd>
                  </div>
                </dl>
              </Card>

              <Card title="Where this goes next">
                <ul className="space-y-1.5 text-[12px]">
                  {(
                    [
                      ['Transaction trail', '/money-trail'],
                      ['Network graph', '/network-graph'],
                      ['Predicted locations', '/predicted-locations'],
                      ['ATM / branch map', '/map'],
                      ['Alerts', '/alerts'],
                      [
                        'Investigation',
                        `/investigation?case=${encodeURIComponent(activeCase.case_id)}`,
                      ],
                    ] as const
                  ).map(([label, href]) => (
                    <li key={href}>
                      <Link href={href} className="text-accent transition-opacity hover:opacity-80">
                        {label} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
