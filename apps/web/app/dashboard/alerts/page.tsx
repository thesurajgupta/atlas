
'use client';

import React, { useMemo, useState } from 'react';
import Sidebar from '@/components/Sidebar';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface Alert {
  id: string;
  timestamp: string;
  fraudInitiatedAt: string;
  goldenHourElapsedMinutes: number;
  severity: Severity;
  caseRef: string;
  typology: string;
  amountAtRisk: number;
  reason: string;
  isSuppressed: boolean;
  suppressionReason?: string;
}

/**
 * Demo data only.
 *
 * goldenHourElapsedMinutes represents the elapsed time returned by the
 * backend clock policy for this mock scenario.
 *
 * Backend policy:
 * GOLDEN_HOUR = 60 minutes
 */
const MOCK_ALERTS: Alert[] = [
  {
    id: 'ALT-1001',
    timestamp: '2026-09-05T14:42:00Z',
    fraudInitiatedAt: '2026-09-05T14:30:00Z',
    goldenHourElapsedMinutes: 12,
    severity: 'CRITICAL',
    caseRef: 'CASE-2026-8821',
    typology: 'digital arrest',
    amountAtRisk: 820000,
    reason:
      'digital arrest · ₹820,000 at risk · 12 minutes since fraud began · strong evidence · top candidate EP-0783',
    isSuppressed: false,
  },
  {
    id: 'ALT-1002',
    timestamp: '2026-09-05T14:35:00Z',
    fraudInitiatedAt: '2026-09-05T14:25:00Z',
    goldenHourElapsedMinutes: 10,
    severity: 'HIGH',
    caseRef: 'CASE-2026-8819',
    typology: 'account takeover',
    amountAtRisk: 85000,
    reason:
      'account takeover · ₹85,000 at risk · 10 minutes since fraud began · moderate evidence · top candidate EP-0812',
    isSuppressed: false,
  },
  {
    id: 'ALT-1003',
    timestamp: '2026-09-05T13:58:00Z',
    fraudInitiatedAt: '2026-09-05T13:40:00Z',
    goldenHourElapsedMinutes: 18,
    severity: 'MEDIUM',
    caseRef: 'CASE-2026-8790',
    typology: 'structuring / smurfing',
    amountAtRisk: 48000,
    reason:
      'structuring / smurfing · ₹48,000 at risk · 18 minutes since fraud began · moderate evidence · top candidate EP-0790',
    isSuppressed: false,
  },
  {
    id: 'ALT-1004',
    timestamp: '2026-09-05T13:32:00Z',
    fraudInitiatedAt: '2026-09-05T13:02:00Z',
    goldenHourElapsedMinutes: 30,
    severity: 'LOW',
    caseRef: 'CASE-2026-8755',
    typology: 'velocity spike',
    amountAtRisk: 12500,
    reason:
      'velocity spike · ₹12,500 at risk · 30 minutes since fraud began · weak evidence · top candidate EP-0755',
    isSuppressed: false,
  },
  {
    id: 'ALT-1005',
    timestamp: '2026-09-05T12:40:00Z',
    fraudInitiatedAt: '2026-09-05T12:20:00Z',
    goldenHourElapsedMinutes: 20,
    severity: 'HIGH',
    caseRef: 'CASE-2026-8701',
    typology: 'mule account activity',
    amountAtRisk: 150000,
    reason:
      'mule account activity · ₹150,000 at risk · 20 minutes since fraud began · strong evidence · top candidate EP-0701',
    isSuppressed: true,
    suppressionReason:
      'jurisdiction budget exhausted (25/25 in window); escalate rather than repeat (spec §27)',
  },
  {
    id: 'ALT-1006',
    timestamp: '2026-09-05T11:55:00Z',
    fraudInitiatedAt: '2026-09-05T11:20:00Z',
    goldenHourElapsedMinutes: 35,
    severity: 'LOW',
    caseRef: 'CASE-2026-8650',
    typology: 'geographic anomaly',
    amountAtRisk: 3200,
    reason:
      'geographic anomaly · ₹3,200 at risk · 35 minutes since fraud began · weak evidence · top candidate EP-0650',
    isSuppressed: true,
    suppressionReason:
      'jurisdiction budget exhausted (25/25 in window); escalate rather than repeat (spec §27)',
  },
];

const SeverityChip = ({
  severity,
}: {
  severity: Severity;
}) => {
  const tokenMap: Record<Severity, string> = {
    CRITICAL:
      'bg-red-950/50 text-red-400 border-red-800/60',
    HIGH:
      'bg-orange-950/50 text-orange-400 border-orange-800/60',
    MEDIUM:
      'bg-yellow-950/50 text-yellow-400 border-yellow-800/60',
    LOW:
      'bg-blue-950/50 text-blue-400 border-blue-800/60',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tokenMap[severity]}`}
    >
      {severity}
    </span>
  );
};

const GoldenHourStatus = ({
  elapsedMinutes,
}: {
  elapsedMinutes: number;
}) => {
  const totalMinutes = 60;
  const elapsed = Math.max(
    0,
    Math.min(elapsedMinutes, totalMinutes)
  );

  const remaining = Math.max(
    0,
    totalMinutes - elapsed
  );

  const progress = (elapsed / totalMinutes) * 100;
  const actionable = elapsed <= totalMinutes;

  return (
    <div className="bg-[#09111e] rounded-lg border border-slate-800 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Golden Hour
        </p>

        <span
          className={`text-[10px] font-bold ${
            actionable
              ? 'text-emerald-400'
              : 'text-slate-500'
          }`}
        >
          {actionable ? 'ACTIONABLE' : 'EXPIRED'}
        </span>
      </div>

      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-2 text-[10px]">
        <span className="text-slate-400">
          {elapsed} min elapsed
        </span>

        <span
          className={
            remaining > 0
              ? 'text-blue-400 font-semibold'
              : 'text-slate-500'
          }
        >
          {remaining} min remaining
        </span>
      </div>
    </div>
  );
};

export default function AtlasAlertsPage() {
  const [selectedSeverity, setSelectedSeverity] =
    useState<Severity | 'ALL'>('ALL');

  const [isSuppressedOpen, setIsSuppressedOpen] =
    useState(false);

  const activeAlerts = useMemo(() => {
    return MOCK_ALERTS
      .filter((alert) => !alert.isSuppressed)
      .filter(
        (alert) =>
          selectedSeverity === 'ALL' ||
          alert.severity === selectedSeverity
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() -
          new Date(a.timestamp).getTime()
      );
  }, [selectedSeverity]);

  const suppressedAlerts = useMemo(() => {
    return MOCK_ALERTS
      .filter((alert) => alert.isSuppressed)
      .filter(
        (alert) =>
          selectedSeverity === 'ALL' ||
          alert.severity === selectedSeverity
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() -
          new Date(a.timestamp).getTime()
      );
  }, [selectedSeverity]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);

  const formatDate = (isoString: string) =>
    new Date(isoString).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="flex h-screen bg-[#070c14] text-slate-200 font-sans overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top App Header */}
        <header className="h-14 bg-[#09111e] border-b border-slate-800/80 px-6 flex items-center justify-between shrink-0">
          {/* Global Search */}
          <div className="relative w-96">
            <input
              type="text"
              placeholder="Search cases, accounts, locations, or transaction IDs..."
              className="w-full bg-[#0d1726] text-xs text-slate-200 placeholder-slate-500 pl-8 pr-10 py-2 rounded-md border border-slate-800 focus:outline-none focus:border-blue-500"
            />

            <span className="absolute left-2.5 top-2 text-slate-500 text-xs">
              🔍
            </span>

            <span className="absolute right-2.5 top-2 text-[10px] text-slate-500 border border-slate-700 px-1 rounded">
              ⌘ K
            </span>
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Notifications"
              className="relative text-slate-400 hover:text-slate-200"
            >
              🔔

              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-red-600 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                12
              </span>
            </button>

            <div className="flex items-center gap-2.5 border-l border-slate-800 pl-4">
              <div className="h-8 w-8 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center font-semibold text-blue-400 text-xs">
                A
              </div>

              <div className="text-right">
                <p className="text-xs font-semibold text-slate-200 leading-tight">
                  Inspector
                </p>

                <p className="text-[10px] text-slate-400">
                  Delhi Cyber Cell
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#070c14]">
          {/* Page Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0d1726] p-5 rounded-xl border border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">
                Alerts Feed
              </h2>

              <p className="text-xs text-slate-400 mt-1">
                Real-time proactive cyber-fraud signals & risk indicators
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label
                htmlFor="severity-filter"
                className="text-xs font-medium text-slate-400"
              >
                Severity:
              </label>

              <select
                id="severity-filter"
                value={selectedSeverity}
                onChange={(event) =>
                  setSelectedSeverity(
                    event.target.value as Severity | 'ALL'
                  )
                }
                className="bg-[#09111e] border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          {/* Policy Legend */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#0d1726] border border-slate-800 rounded-lg px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Golden Hour
              </p>
              <p className="text-sm font-semibold text-slate-200 mt-1">
                60 minutes
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Intervention window after fraud initiation
              </p>
            </div>

            <div className="bg-[#0d1726] border border-slate-800 rounded-lg px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Active Signals
              </p>
              <p className="text-sm font-semibold text-slate-200 mt-1">
                {activeAlerts.length}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Alerts currently requiring attention
              </p>
            </div>

            <div className="bg-[#0d1726] border border-slate-800 rounded-lg px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Suppressed
              </p>
              <p className="text-sm font-semibold text-slate-200 mt-1">
                {suppressedAlerts.length}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Decisions withheld by policy
              </p>
            </div>
          </div>

          {/* Active Alerts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">
                Active Signals ({activeAlerts.length})
              </h3>

              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Investigator Queue
              </span>
            </div>

            {activeAlerts.length === 0 ? (
              <div className="p-8 text-center bg-[#0d1726] rounded-xl border border-slate-800 text-slate-500 text-xs">
                No active alerts matching the selected filters.
              </div>
            ) : (
              activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="bg-[#0d1726] rounded-xl border border-slate-800/80 p-4 hover:border-slate-700 transition-colors space-y-3"
                >
                  {/* Alert Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <SeverityChip severity={alert.severity} />

                      <span className="font-mono text-xs font-bold text-blue-400">
                        {alert.caseRef}
                      </span>

                      <span className="text-slate-600">
                        •
                      </span>

                      <span className="text-xs text-slate-400 font-medium">
                        {alert.typology}
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-500">
                      {formatDate(alert.timestamp)}
                    </span>
                  </div>

                  {/* Alert Content */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
                    {/* Reason */}
                    <div className="lg:col-span-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        Backend Policy Reason
                      </p>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        {alert.reason}
                      </p>
                    </div>

                    {/* Amount */}
                    <div className="lg:col-span-1 bg-[#09111e] p-2.5 rounded-lg border border-slate-800">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Amount at Risk
                      </p>

                      <p className="text-sm font-bold text-slate-100 mt-0.5">
                        {formatCurrency(alert.amountAtRisk)}
                      </p>
                    </div>

                    {/* Golden Hour */}
                    <div className="lg:col-span-1">
                      <GoldenHourStatus
                        elapsedMinutes={
                          alert.goldenHourElapsedMinutes
                        }
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Suppressed Alerts */}
          <div className="border border-slate-800 rounded-xl bg-[#0a1220] overflow-hidden">
            <button
              type="button"
              onClick={() =>
                setIsSuppressedOpen((previous) => !previous)
              }
              aria-expanded={isSuppressedOpen}
              className="w-full flex items-center justify-between p-3.5 bg-[#0d1726] hover:bg-slate-800/40 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-300 text-xs">
                  Suppressed Alerts
                </span>

                <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-medium">
                  {suppressedAlerts.length}
                </span>
              </div>

              <span className="text-slate-500 text-xs">
                {isSuppressedOpen ? 'Hide ▲' : 'Show ▼'}
              </span>
            </button>

            {isSuppressedOpen && (
              <div className="p-3.5 border-t border-slate-800 space-y-3 bg-[#070c14]">
                {suppressedAlerts.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-2">
                    No suppressed alerts for this filter.
                  </p>
                ) : (
                  suppressedAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="bg-[#0d1726] p-3.5 rounded-lg border border-slate-800/80 space-y-3"
                    >
                      {/* Suppressed Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SeverityChip severity={alert.severity} />

                          <span className="font-mono text-xs text-slate-300">
                            {alert.caseRef}
                          </span>

                          <span className="text-xs text-slate-500">
                            ({alert.typology})
                          </span>
                        </div>

                        <span className="text-[10px] text-slate-500">
                          {formatDate(alert.timestamp)}
                        </span>
                      </div>

                      {/* Backend Reason */}
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Policy Decision
                        </p>

                        <p className="text-xs text-slate-400 leading-relaxed">
                          {alert.reason}
                        </p>
                      </div>

                      {/* Golden Hour */}
                      <GoldenHourStatus
                        elapsedMinutes={
                          alert.goldenHourElapsedMinutes
                        }
                      />

                      {/* Suppression Reason */}
                      <div className="bg-amber-950/30 border border-amber-800/40 p-2.5 rounded">
                        <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
                          Suppression Reason
                        </p>

                        <p className="text-[11px] text-amber-200/80 leading-relaxed">
                          {alert.suppressionReason}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

