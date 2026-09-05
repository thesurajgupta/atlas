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

import React, { useState, useMemo } from 'react';
import Sidebar from '@/components/Sidebar'; 

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface Alert {
  id: string;
  timestamp: string;
  severity: Severity;
  caseRef: string;
  typology: string;
  amountAtRisk: number;
  reason: string;
  isSuppressed: boolean;
  suppressionReason?: string;
}

const MOCK_ALERTS: Alert[] = [
  {
    id: 'ALT-1001',
    timestamp: '2026-03-01T10:45:00Z',
    severity: 'CRITICAL',
    caseRef: 'CASE-2026-8821',
    typology: 'Unauthorized Cash Withdrawal',
    amountAtRisk: 250000,
    reason: 'Multiple high-value ATM withdrawals detected in rapid succession across geographically impossible locations within 15 minutes.',
    isSuppressed: false,
  },
  {
    id: 'ALT-1002',
    timestamp: '2026-03-01T09:15:00Z',
    severity: 'HIGH',
    caseRef: 'CASE-2026-8819',
    typology: 'Account Takeover (ATO)',
    amountAtRisk: 85000,
    reason: 'Password reset followed immediately by beneficiary addition and maximum limit wire transfer request from an unrecognized IP address.',
    isSuppressed: false,
  },
  {
    id: 'ALT-1003',
    timestamp: '2026-02-28T18:30:00Z',
    severity: 'MEDIUM',
    caseRef: 'CASE-2026-8790',
    typology: 'Structuring / Smurfing',
    amountAtRisk: 48000,
    reason: 'Series of sub-threshold cash deposits completed at three distinct branch kiosks within a 2-hour window.',
    isSuppressed: false,
  },
  {
    id: 'ALT-1004',
    timestamp: '2026-02-28T14:20:00Z',
    severity: 'LOW',
    caseRef: 'CASE-2026-8755',
    typology: 'Velocity Spike',
    amountAtRisk: 12500,
    reason: 'Card transactions exceeded standard daily transaction count baseline by 300%.',
    isSuppressed: false,
  },
  {
    id: 'ALT-1005',
    timestamp: '2026-02-27T11:00:00Z',
    severity: 'HIGH',
    caseRef: 'CASE-2026-8701',
    typology: 'Mule Account Activity',
    amountAtRisk: 150000,
    reason: 'Dormant account suddenly received multiple inbound P2P transfers followed by immediate full liquidation via ATM.',
    isSuppressed: true,
    suppressionReason: 'Whitelisted entity under pre-approved corporate payroll testing protocol.',
  },
  {
    id: 'ALT-1006',
    timestamp: '2026-02-26T16:45:00Z',
    severity: 'LOW',
    caseRef: 'CASE-2026-8650',
    typology: 'Geographic Anomaly',
    amountAtRisk: 3200,
    reason: 'POS purchase initiated from foreign jurisdiction without prior travel notice submission.',
    isSuppressed: true,
    suppressionReason: 'Rule auto-suppression triggered: User confirmed travel status via automated SMS verification.',
  },
];

const SeverityChip = ({ severity }: { severity: Severity }) => {
  const tokenMap: Record<Severity, string> = {
    CRITICAL: 'bg-red-950/50 text-red-400 border-red-800/60',
    HIGH: 'bg-orange-950/50 text-orange-400 border-orange-800/60',
    MEDIUM: 'bg-yellow-950/50 text-yellow-400 border-yellow-800/60',
    LOW: 'bg-blue-950/50 text-blue-400 border-blue-800/60',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tokenMap[severity]}`}>
      {severity}
    </span>
  );
};

export default function AtlasAlertsPage() {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [isSuppressedOpen, setIsSuppressedOpen] = useState<boolean>(false);

  const activeAlerts = useMemo(() => {
    return MOCK_ALERTS
      .filter((alert) => !alert.isSuppressed)
      .filter((alert) => selectedSeverity === 'ALL' || alert.severity === selectedSeverity)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selectedSeverity]);

  const suppressedAlerts = useMemo(() => {
    return MOCK_ALERTS
      .filter((alert) => alert.isSuppressed)
      .filter((alert) => selectedSeverity === 'ALL' || alert.severity === selectedSeverity)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selectedSeverity]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const formatDate = (isoStr: string) =>
    new Date(isoStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });



  return (
    <div className="flex h-screen bg-[#070c14] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar matching ATLAS visual hierarchy */}
    <Sidebar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top App Header */}
        <header className="h-14 bg-[#09111e] border-b border-slate-800/80 px-6 flex items-center justify-between shrink-0">
          {/* Global Search Bar */}
          <div className="relative w-96">
            <input
              type="text"
              placeholder="Search cases, accounts, locations, or transaction IDs..."
              className="w-full bg-[#0d1726] text-xs text-slate-200 placeholder-slate-500 pl-8 pr-10 py-2 rounded-md border border-slate-800 focus:outline-none focus:border-blue-500"
            />
            <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
            <span className="absolute right-2.5 top-2 text-[10px] text-slate-500 border border-slate-700 px-1 rounded">⌘ K</span>
          </div>

          {/* User Profile Info */}
          <div className="flex items-center gap-4">
            <button className="relative text-slate-400 hover:text-slate-200">
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
                <p className="text-xs font-semibold text-slate-200 leading-tight">Inspector</p>
                <p className="text-[10px] text-slate-400">Delhi Cyber Cell</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#070c14]">
          {/* Page Banner & Severity Control */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0d1726] p-5 rounded-xl border border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">Alerts Feed</h2>
              <p className="text-xs text-slate-400 mt-1">Real-time proactive cyber-fraud signals & risk indicators</p>
            </div>

            <div className="flex items-center gap-3">
              <label htmlFor="severity-filter" className="text-xs font-medium text-slate-400">
                Severity:
              </label>
              <select
                id="severity-filter"
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
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

          {/* Active Alerts Feed */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Active Signals ({activeAlerts.length})</h3>

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
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <SeverityChip severity={alert.severity} />
                      <span className="font-mono text-xs font-bold text-blue-400">{alert.caseRef}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-xs text-slate-400 font-medium">{alert.typology}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">{formatDate(alert.timestamp)}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                    <div className="md:col-span-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Reason</p>
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{alert.reason}</p>
                    </div>
                    <div className="md:col-span-1 bg-[#09111e] p-2.5 rounded-lg border border-slate-800 md:text-right">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Amount at Risk</p>
                      <p className="text-sm font-bold text-slate-100 mt-0.5">{formatCurrency(alert.amountAtRisk)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Collapsible Suppressed Alerts */}
          <div className="border border-slate-800 rounded-xl bg-[#0a1220] overflow-hidden">
            <button
              onClick={() => setIsSuppressedOpen((prev) => !prev)}
              className="w-full flex items-center justify-between p-3.5 bg-[#0d1726] hover:bg-slate-800/40 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-300 text-xs">Suppressed Alerts</span>
                <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-medium">
                  {suppressedAlerts.length}
                </span>
              </div>
              <span className="text-slate-500 text-xs">{isSuppressedOpen ? 'Hide ▲' : 'Show ▼'}</span>
            </button>

            {isSuppressedOpen && (
              <div className="p-3.5 border-t border-slate-800 space-y-3 bg-[#070c14]">
                {suppressedAlerts.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-2">No suppressed alerts for this filter.</p>
                ) : (
                  suppressedAlerts.map((alert) => (
                    <div key={alert.id} className="bg-[#0d1726] p-3.5 rounded-lg border border-slate-800/80 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <SeverityChip severity={alert.severity} />
                          <span className="font-mono text-xs text-slate-300">{alert.caseRef}</span>
                          <span className="text-xs text-slate-500">({alert.typology})</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{formatDate(alert.timestamp)}</span>
                      </div>

                      <p className="text-xs text-slate-400 whitespace-pre-wrap">{alert.reason}</p>

                      <div className="bg-amber-950/30 border border-amber-800/40 p-2 rounded text-[11px]">
                        <span className="font-semibold text-amber-400">Suppression Reason: </span>
                        <span className="text-amber-200/80">{alert.suppressionReason}</span>
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