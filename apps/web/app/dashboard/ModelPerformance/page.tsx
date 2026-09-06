// tailwind.config.ts reference for required tokens:
// colors: {
//   severity: {
//     critical: { bg: 'bg-red-950/40', text: 'text-red-400', border: 'border-red-800/50' },
//     high: { bg: 'bg-orange-950/40', text: 'text-orange-400', border: 'border-orange-800/50' },
//     medium: { bg: 'bg-yellow-950/40', text: 'text-yellow-400', border: 'border-yellow-800/50' },
//     low: { bg: 'bg-blue-950/40', text: 'text-blue-400', border: 'border-blue-800/50' },
//   }
// }

'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
// Status Type
type SystemStatus = 'OK' | 'DEGRADED' | 'EVALUATION_FAILED';

interface PerformanceMetric {
  metric: string;
  baseline: number | null;
  model: number | null;
  unit: string;
  isUpliftPositive: boolean;
  status: 'COMPUTED' | 'NOT_COMPUTED';
  notComputedReason?: string;
}

// Mock evaluation data
const PROVENANCE = {
  gitSha: 'a7f9b2d8e41c3098a5d21',
  datasetVersion: 'v2.4.1-hotspot-prod',
  generatedAt: '2026-09-06T01:40:00Z',
  status: 'DEGRADED' as SystemStatus,
  statusMessage: 'Partial evaluation run: Geospatial distance metrics skipped due to missing PostGIS cluster nodes during evaluation window.',
};

const METRICS_DATA: PerformanceMetric[] = [
  {
    metric: 'Precision @ Top 100 Hotspots',
    baseline: 0.612,
    model: 0.845,
    unit: '%',
    isUpliftPositive: true,
    status: 'COMPUTED',
  },
  {
    metric: 'Recall @ 24h Window',
    baseline: 0.540,
    model: 0.782,
    unit: '%',
    isUpliftPositive: true,
    status: 'COMPUTED',
  },
  {
    metric: 'False Positive Rate (FPR)',
    baseline: 0.185,
    model: 0.062,
    unit: '%',
    isUpliftPositive: true, // Lower FPR is positive
    status: 'COMPUTED',
  },
  {
    metric: 'Mean Time to Intercept (MTTI)',
    baseline: 142,
    model: 38,
    unit: ' mins',
    isUpliftPositive: true,
    status: 'COMPUTED',
  },
  {
    metric: 'Geospatial Hotspot Radius Error (p95)',
    baseline: null,
    model: null,
    unit: ' km',
    isUpliftPositive: true,
    status: 'NOT_COMPUTED',
    notComputedReason: 'PostGIS cluster node timeout during evaluation boundary calculation.',
  },
  {
    metric: 'Multi-hop Link Accuracy (3-hop)',
    baseline: null,
    model: null,
    unit: '%',
    isUpliftPositive: true,
    status: 'NOT_COMPUTED',
    notComputedReason: 'Graph engine pipeline execution halted under degraded mode.',
  },
];

export default function ModelPerformancePage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Compute headline metric (Primary Precision Uplift)
  const primaryMetric = METRICS_DATA[0];
  const baselineVal = primaryMetric.baseline ?? 0;
  const modelVal = primaryMetric.model ?? 0;
  const rawUplift = modelVal - baselineVal;
  const relativeUplift = ((rawUplift / baselineVal) * 100).toFixed(1);

  const computedMetrics = METRICS_DATA.filter((m) => m.status === 'COMPUTED');
  const notComputedMetrics = METRICS_DATA.filter((m) => m.status === 'NOT_COMPUTED');

 

  return (
    <div className="flex h-screen bg-[#070c14] text-slate-200 font-sans overflow-hidden">
      {/* ATLAS Sidebar */}
      <Sidebar />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-14 bg-[#09111e] border-b border-slate-800/80 px-6 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-white tracking-wide">Model Evaluation Diagnostics</h2>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-xs text-amber-400 font-medium">Evaluation Status: {PROVENANCE.status}</span>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#070c14]">
          {/* Provenance Line */}
          <div className="bg-[#0b1424] border border-slate-800/80 rounded-lg p-3 px-4 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 gap-3">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <span className="text-slate-600 uppercase text-[10px] block font-sans">Git Commit SHA</span>
                <span className="text-blue-400 font-bold">{PROVENANCE.gitSha}</span>
              </div>
              <div>
                <span className="text-slate-600 uppercase text-[10px] block font-sans">Dataset Version</span>
                <span className="text-slate-200">{PROVENANCE.datasetVersion}</span>
              </div>
              <div>
                <span className="text-slate-600 uppercase text-[10px] block font-sans">Generated At</span>
                <span className="text-slate-300">{new Date(PROVENANCE.generatedAt).toUTCString()}</span>
              </div>
            </div>
            <span className="bg-slate-800 text-slate-300 text-[10px] font-sans px-2 py-1 rounded border border-slate-700">
              PROD EVAL RUN #8841
            </span>
          </div>

          {/* Non-OK Status Banner */}
          {PROVENANCE.status !== 'OK' && (
            <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-4 flex items-start gap-3 text-amber-200">
              <span className="text-lg">⚠️</span>
              <div className="text-xs">
                <p className="font-bold uppercase tracking-wider text-amber-400">
                  Status Alert: {PROVENANCE.status} Mode
                </p>
                <p className="mt-0.5 text-amber-200/80 leading-relaxed">{PROVENANCE.statusMessage}</p>
              </div>
            </div>
          )}

          {/* Headline Block: Model Uplift */}
          <div className="bg-[#0d1726] border border-slate-800 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10 font-bold text-8xl text-blue-500 pointer-events-none">
              +{relativeUplift}%
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Primary Accuracy Indicator</p>
            <div className="flex flex-wrap items-baseline gap-4 mt-2">
              <h3 className="text-4xl font-extrabold text-white">+{relativeUplift}%</h3>
              <span className="text-sm text-emerald-400 font-semibold bg-emerald-950/50 border border-emerald-800/60 px-2.5 py-1 rounded-full">
                Uplift over Baseline
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2 max-w-xl">
              Model candidate improves high-risk cash withdrawal hotspot prediction precision by{' '}
              <strong className="text-slate-200">{(rawUplift * 100).toFixed(1)} percentage points</strong> compared to the current rule-based heuristic baseline.
            </p>
          </div>

          {/* Side-by-Side Model vs Baseline Comparison Table */}
          <div className="bg-[#0d1726] border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800/80 bg-[#09111e]">
              <h4 className="text-sm font-semibold text-slate-200">Computed Metrics Comparison</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0b1424] text-slate-400 uppercase text-[10px] tracking-wider">
                    <th className="p-3.5 pl-5">Metric Name</th>
                    <th className="p-3.5 text-right">Baseline Performance</th>
                    <th className="p-3.5 text-right">Model Candidate</th>
                    <th className="p-3.5 text-right pr-5">Absolute Uplift</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {computedMetrics.map((row) => {
                    const base = row.baseline ?? 0;
                    const model = row.model ?? 0;
                    const diff = model - base;
                    const formattedDiff = row.unit === '%' ? `${(diff * 100).toFixed(1)}%` : `${diff > 0 ? '+' : ''}${diff}${row.unit}`;

                    return (
                      <tr key={row.metric} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3.5 pl-5 font-medium text-slate-200">{row.metric}</td>
                        <td className="p-3.5 text-right font-mono text-slate-400">
                          {row.unit === '%' ? `${(base * 100).toFixed(1)}%` : `${base}${row.unit}`}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-white">
                          {row.unit === '%' ? `${(model * 100).toFixed(1)}%` : `${model}${row.unit}`}
                        </td>
                        <td className="p-3.5 text-right pr-5 font-mono">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/50 font-bold">
                            {formattedDiff}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Not Computed Metrics Table */}
          <div className="bg-[#0d1726] border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800/80 bg-[#09111e] flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-200">Uncalculated / Not Computed Metrics</h4>
              <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {notComputedMetrics.length} Skipped
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0b1424] text-slate-400 uppercase text-[10px] tracking-wider">
                    <th className="p-3.5 pl-5">Metric Name</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 pr-5">Reason for Non-Computation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {notComputedMetrics.map((row) => (
                    <tr key={row.metric} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3.5 pl-5 font-medium text-slate-300">{row.metric}</td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/50 text-amber-400 border border-amber-800/60">
                          NOT COMPUTED
                        </span>
                      </td>
                      <td className="p-3.5 pr-5 text-slate-400 italic">{row.notComputedReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}