
'use client';

import React, { useState } from 'react';
import { CaseContextBar } from '@/components/demo/CaseContextBar';
import { PipelineRail } from '@/components/demo/PipelineRail';
import { useCaseView, formatRupees } from '@/lib/case-view';

import {
  Search,
  Bell,
  Shield,
  AlertTriangle,
  Filter,
  ChevronDown,
  Calendar,
  Download,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  X,
  Play
} from 'lucide-react';

// --- MOCK TRAIL DATA SETS (For Pagination & Interactive Switches) ---
const TRAIL_DATASETS = [
  {
    trailId: 'TRL-882910-DELHI',
    caseTitle: 'Phishing Fraud Operation - Mule Cluster A',
    totalFlow: '₹7,50,000',
    status: 'High Risk',
    nodes: [
      {
        id: 'N-SRC',
        role: 'Victim Account',
        type: 'Source',
        bank: 'Bank A',
        accNo: 'Bank A-9012-3341',
        holder: 'Priya Nair',
        amount: '₹7,50,000',
        time: '05 Sep 2026, 08:15 AM',
        ip: '103.44.201.12',
        risk: 'Low',
        location: 'Bengaluru, KA'
      },
      {
        id: 'N-INT-1',
        role: 'Primary Mule Account',
        type: 'Intermediary',
        bank: 'Bank B',
        accNo: 'BNKB-8821-0012',
        holder: 'Rohit Sharma',
        amount: '₹7,50,000',
        time: '05 Sep 2026, 08:24 AM',
        ip: '185.220.101.45 (Tor Proxy)',
        risk: 'Critical',
        location: 'New Delhi, DL'
      },
      {
        id: 'N-INT-2A',
        role: 'Secondary Mule A',
        type: 'Split Node',
        bank: 'Bank C',
        accNo: 'BNKC-4401-9920',
        holder: 'Amit Verma',
        amount: '₹4,00,000',
        time: '05 Sep 2026, 09:10 AM',
        ip: '185.220.101.45',
        risk: 'High',
        location: 'Rohini, DL'
      },
      {
        id: 'N-INT-2B',
        role: 'Secondary Mule B',
        type: 'Split Node',
        bank: 'Bank D',
        accNo: 'AXIS-1102-5534',
        holder: 'Karan Malhotra',
        amount: '₹3,50,000',
        time: '05 Sep 2026, 09:12 AM',
        ip: '49.207.210.88',
        risk: 'High',
        location: 'Gurugram, HR'
      },
      {
        id: 'N-SINK-1',
        role: 'ATM Cash Withdrawal',
        type: 'Destination',
        bank: 'ATM-8831 (Bank H)',
        accNo: 'Cardless Cash Out',
        holder: 'Unidentified Syndicate Courier',
        amount: '₹4,00,000',
        time: '05 Sep 2026, 11:30 AM',
        ip: 'N/A (Physical Kiosk)',
        risk: 'Critical',
        location: 'Chandni Chowk, DL'
      },
      {
        id: 'N-SINK-2',
        role: 'Crypto Gateway Sink',
        type: 'Destination',
        bank: 'Binance P2P Escrow',
        accNo: 'USDT-TRX-0x88fA',
        holder: 'Wallet #883921',
        amount: '₹3,50,000',
        time: '05 Sep 2026, 11:45 AM',
        ip: '103.21.126.12',
        risk: 'Critical',
        location: 'Offshore Escrow'
      }
    ]
  },
  {
    trailId: 'TRL-994012-MUMBAI',
    caseTitle: 'Investment Scam - High Speed Layering',
    totalFlow: '₹12,00,000',
    status: 'Under Investigation',
    nodes: [
      {
        id: 'N-SRC-2',
        role: 'Victim Account',
        type: 'Source',
        bank: 'Bank F',
        accNo: 'BNKF-5541-1109',
        holder: 'Suresh Patil',
        amount: '₹12,00,000',
        time: '04 Sep 2026, 02:20 PM',
        ip: '117.211.88.3',
        risk: 'Low',
        location: 'Mumbai, MH'
      },
      {
        id: 'N-INT-3',
        role: 'Shell Enterprise Account',
        type: 'Intermediary',
        bank: 'Bank G',
        accNo: 'BNKG-0012-7743',
        holder: 'Apex Tech Solutions',
        amount: '₹12,00,000',
        time: '04 Sep 2026, 02:45 PM',
        ip: '122.160.44.19',
        risk: 'High',
        location: 'Thane, MH'
      },
      {
        id: 'N-SINK-3',
        role: 'Wire Transfer Out',
        type: 'Destination',
        bank: 'International SWIFT Gateway',
        accNo: 'GB89-WEST-102938',
        holder: 'Offshore Holding Co.',
        amount: '₹12,00,000',
        time: '04 Sep 2026, 04:00 PM',
        ip: '91.218.114.208',
        risk: 'Critical',
        location: 'London, UK'
      }
    ]
  }
];

/**
 * The active case, in the shape this page already renders.
 *
 * The flowchart is unchanged — only where its data comes from. Bank, account
 * number, holder and rail now come from `lib/synthetic-bank`, which generates
 * them deterministically from the entity id: the same account reads the same
 * here, on the network graph and in the report, across reloads.
 *
 * Those institutions are **fictional** — "Meridian Bank", not any real one —
 * because this repository is public and a real bank rendered under "Primary
 * Mule Account" is a defamation problem before it is a data one.
 *
 * IP and geolocation stay "—". Those are not derivable from anything ATLAS
 * holds, and inventing them would be inventing evidence rather than shaping a
 * plausible identifier.
 */
function trailFromCase(view: NonNullable<ReturnType<typeof useCaseView>>) {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const nodes = view.nodes.map((n) => ({
    id: n.id,
    role:
      n.role === "VICTIM"
        ? "Victim Account"
        : n.role === "TERMINAL"
          ? "Terminal Account"
          : "Mule Account",
    type:
      n.role === "VICTIM" ? "Source" : n.role === "TERMINAL" ? "Sink" : "Intermediary",
    bank: n.account.institution,
    accNo: `${n.account.accountNumber} · ${n.account.ifsc}`,
    holder: n.account.holder ?? "Not recorded — victim identity is not collected",
    // The victim receives nothing — they only pay out — so "₹0" here would be
    // read as a balance rather than as "this column does not apply".
    amount: n.received > 0 ? formatRupees(n.received) : '—',
    time: n.firstSeen
      ? new Date(n.firstSeen).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—",
    // Not derivable from anything ATLAS holds. Left absent rather than
    // fabricated: a plausible IP address in an investigation console reads as
    // evidence.
    ip: "—",
    // Depth is the only risk signal the graph supports on its own: the further
    // from the victim, the closer to a cash-out. Not a model score.
    risk: n.role === "TERMINAL" ? "Critical" : n.role === "VICTIM" ? "Low" : "High",
    location: "—",
  }));
  void byId;
  return {
    trailId: view.caseRef,
    caseTitle: `${view.typology.replace(/_/g, " ").toLowerCase()} — reconstructed trail`,
    totalFlow: formatRupees(view.totalMoved),
    status: view.alertSeverity ?? "Under review",
    nodes,
  };
}

export default function TransactionTrailPage() {
  const caseView = useCaseView();

  // --- STATE MANAGEMENT ---
  const [activeTrailIndex, setActiveTrailIndex] = useState(0);
  // The active case when there is one, the fixture otherwise. Falling back keeps
  // the page usable on its own; it does not get to disagree with the case.
  const currentTrail = caseView
    ? trailFromCase(caseView)
    : TRAIL_DATASETS[activeTrailIndex]!;

  // Selected Node State for Detail Side-Panel
  const [selectedNode, setSelectedNode] = useState<
    (typeof currentTrail)["nodes"][0] | null
  >(null);

  // Default to the second node — the first hop the money took — but only once a
  // trail exists. Deriving it in state would pin the fixture's node even after a
  // demo run replaced the trail underneath it.
  const shownNode = selectedNode ?? currentTrail.nodes[1] ?? currentTrail.nodes[0] ?? null;

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [bankFilter, setBankFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');
  const [dateRange, setDateRange] = useState('04 Sep 2026 → 05 Sep 2026');

  // Modal / Action State
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false);
  const [freezeStatus, setFreezeStatus] = useState<Record<string, boolean>>({});

  // Node Selection Handler
  const handleSelectNode = (node: typeof currentTrail['nodes'][0]) => {
    setSelectedNode(node);
  };

  // Toggle Freeze Action
  const handleToggleFreeze = (nodeId: string) => {
    setFreezeStatus((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
    setIsFreezeModalOpen(false);
  };

  // Node Risk Badge Helper
  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'Critical':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30 font-bold animate-pulse';
      case 'High':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-semibold';
      case 'Medium':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    }
  };

  return (
    <div className="flex h-full bg-paper text-ink-700 overflow-hidden">

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-paper border-b border-line flex items-center justify-between px-6 shrink-0">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search account numbers, transaction hashes, or node IDs..."
              className="w-full bg-paper border border-line rounded-lg pl-9 pr-8 py-1.5 text-xs text-ink-700 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-raised text-ink-500 px-1.5 py-0.5 rounded border border-line-strong">
              ⌘K
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <button className="relative p-2 text-ink-500 hover:text-ink-900 rounded-lg hover:bg-raised transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>
            </button>
            <div className="flex items-center space-x-3 pl-4 border-l border-line">
              <div className="w-8 h-8 rounded-full bg-raised border border-line-strong flex items-center justify-center font-bold text-xs text-ink-700">
                I
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-700">Inspector</p>
                <p className="text-[10px] text-ink-500">Delhi Cyber Cell</p>
              </div>
            </div>
          </div>
        </header>
        <CaseContextBar stage="Transaction trail" />
        <PipelineRail current="Transactions" />

        <p className="mx-6 mt-4 rounded-md border border-line bg-surface px-3 py-2 text-[11px] italic text-ink-500">
          Mock trail for interface development. Synthetic accounts and amounts only.
        </p>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-bold text-ink-900 tracking-tight">Fund Flowchart Trail</h2>
                <span className="bg-blue-500/10 text-blue-400 text-xs px-2.5 py-0.5 rounded-full border border-blue-500/30 font-semibold font-mono">
                  {currentTrail.trailId}
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-1">
                Visualizing fund sequencing, multi-hop splits, and cash-out sinks.
              </p>
            </div>

            {/* Trail Selector Pagination & Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Pagination Switcher for Trail Cases */}
              <div className="flex items-center bg-paper border border-line rounded-lg p-1 text-xs text-ink-700 space-x-2">
                <button
                  disabled={activeTrailIndex === 0}
                  onClick={() => {
                    const newIndex = activeTrailIndex - 1;
                    setActiveTrailIndex(newIndex);
                    setSelectedNode(TRAIL_DATASETS[newIndex]!.nodes[1]!);
                  }}
                  className="p-1.5 hover:bg-raised rounded disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-medium">
                  Trail Case {activeTrailIndex + 1} of {TRAIL_DATASETS.length}
                </span>
                <button
                  disabled={activeTrailIndex === TRAIL_DATASETS.length - 1}
                  onClick={() => {
                    const newIndex = activeTrailIndex + 1;
                    setActiveTrailIndex(newIndex);
                    setSelectedNode(TRAIL_DATASETS[newIndex]!.nodes[1]!);
                  }}
                  className="p-1.5 hover:bg-raised rounded disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Date Range Selector */}
              <div className="flex items-center bg-paper border border-line rounded-lg px-3 py-1.5 text-xs text-ink-700 space-x-2">
                <Calendar className="w-3.5 h-3.5 text-ink-500" />
                <input
                  type="text"
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="bg-transparent border-none focus:outline-none text-ink-700 w-44 text-xs"
                />
              </div>

              {/* Export Button */}
              <button className="bg-blue-600 hover:bg-blue-500 text-ink-900 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-blue-950/30 transition-all">
                <Download className="w-3.5 h-3.5" />
                <span>Export Flow Diagram</span>
              </button>
            </div>
          </div>

          {/* Interactive Filter Control Strip */}
          <div className="bg-paper border border-line rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Bank Filter */}
              <div className="md:col-span-4 relative">
                <select
                  value={bankFilter}
                  onChange={(e) => setBankFilter(e.target.value)}
                  className="w-full bg-paper border border-line text-xs text-ink-700 rounded-lg px-3 py-2 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Participating Banks</option>
                  <option value="Bank B">Bank B</option>
                  <option value="Bank A">Bank A</option>
                  <option value="Bank C">Bank C</option>
                  <option value="Bank D">Bank D</option>
                  <option value="Binance P2P Escrow">Binance P2P Escrow</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
              </div>

              {/* Threat Risk Level Filter */}
              <div className="md:col-span-4 relative">
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="w-full bg-paper border border-line text-xs text-ink-700 rounded-lg px-3 py-2 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Risk Severities</option>
                  <option value="Critical">Critical Risk Nodes</option>
                  <option value="High">High Risk Nodes</option>
                  <option value="Low">Low Risk Nodes</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
              </div>

              {/* Reset Controls Button */}
              <div className="md:col-span-4 flex items-center justify-end">
                <button
                  onClick={() => {
                    setBankFilter('All');
                    setRiskFilter('All');
                    setSearchQuery('');
                  }}
                  className="w-full bg-raised/80 hover:bg-slate-700 border border-line-strong text-xs text-ink-700 rounded-lg px-3 py-2 flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>Reset Interactive Filters</span>
                </button>
              </div>
            </div>
          </div>

          {/* Main Visual Flowchart & Node Detail Canvas */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Flowchart Diagram Canvas Area */}
            <div className="lg:col-span-8 bg-paper border border-line rounded-xl p-6 relative min-h-[560px] flex flex-col justify-between overflow-x-auto">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  <h3 className="font-semibold text-ink-900 text-xs uppercase tracking-wider">
                    Sequential Fund Trajectory
                  </h3>
                </div>
                <span className="text-[10px] text-ink-500">
                  Click nodes to inspect metadata & trigger legal holds
                </span>
              </div>

              {/* Flowchart Nodes Container */}
              <div className="py-8 flex flex-col items-center justify-center space-y-10 min-w-[600px]">
                {/* STAGE 1: SOURCE NODE */}
                {currentTrail.nodes
                  .filter((n) => n.type === 'Source')
                  .map((sourceNode) => (
                    <div key={sourceNode.id} className="flex flex-col items-center">
                      <div
                        onClick={() => handleSelectNode(sourceNode)}
                        className={`w-80 bg-paper border rounded-xl p-4 cursor-pointer transition-all space-y-2 relative ${
                          shownNode?.id === sourceNode.id
                            ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xl shadow-blue-950/50'
                            : 'border-line hover:border-line-strong'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {sourceNode.role}
                          </span>
                          <span className="text-xs font-bold text-ink-900 font-mono">
                            {sourceNode.amount}
                          </span>
                        </div>
                        <div>
                          <p className="font-bold text-ink-900 text-sm">{sourceNode.holder}</p>
                          <p className="text-xs text-ink-500 font-mono">{sourceNode.accNo}</p>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-ink-500 border-t border-line pt-2">
                          <span>{sourceNode.bank}</span>
                          <span>{sourceNode.time}</span>
                        </div>
                      </div>

                      {/* Connecting Line Downward */}
                      <div className="w-0.5 h-10 bg-gradient-to-b from-blue-500 to-amber-500 my-1 relative">
                        <ArrowRight className="w-3.5 h-3.5 text-amber-400 absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 rotate-90" />
                      </div>
                    </div>
                  ))}

                {/* STAGE 2: PRIMARY INTERMEDIARY / MULE NODE */}
                {currentTrail.nodes
                  .filter((n) => n.type === 'Intermediary')
                  .map((muleNode) => (
                    <div key={muleNode.id} className="flex flex-col items-center">
                      <div
                        onClick={() => handleSelectNode(muleNode)}
                        className={`w-80 bg-paper border rounded-xl p-4 cursor-pointer transition-all space-y-2 relative ${
                          shownNode?.id === muleNode.id
                            ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xl shadow-blue-950/50'
                            : 'border-rose-500/40 hover:border-rose-500'
                        } ${freezeStatus[muleNode.id] ? 'opacity-60 bg-rose-950/10' : ''}`}
                      >
                        {freezeStatus[muleNode.id] && (
                          <span className="absolute -top-2.5 right-3 bg-rose-600 text-ink-900 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
                            FROZEN BY COURT ORDER
                          </span>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            {muleNode.role}
                          </span>
                          <span className="text-xs font-bold text-rose-400 font-mono">
                            {muleNode.amount}
                          </span>
                        </div>
                        <div>
                          <p className="font-bold text-ink-900 text-sm">{muleNode.holder}</p>
                          <p className="text-xs text-ink-500 font-mono">{muleNode.accNo}</p>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-ink-500 border-t border-line pt-2">
                          <span>{muleNode.bank}</span>
                          <span className={getRiskBadge(muleNode.risk)}>
                            {muleNode.risk} Risk
                          </span>
                        </div>
                      </div>

                      {/* Split Arrow Branching Lines if Multiple Secondary Nodes Exist */}
                      {currentTrail.nodes.some((n) => n.type === 'Split Node') && (
                        <div className="w-full max-w-lg h-12 relative my-2">
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-slate-700"></div>
                          <div className="absolute top-4 left-1/4 right-1/4 h-0.5 bg-slate-700"></div>
                          <div className="absolute top-4 left-1/4 w-0.5 h-8 bg-slate-700"></div>
                          <div className="absolute top-4 right-1/4 w-0.5 h-8 bg-slate-700"></div>
                        </div>
                      )}
                    </div>
                  ))}

                {/* STAGE 3: MULTI-HOP SPLIT NODES (If present) */}
                {currentTrail.nodes.some((n) => n.type === 'Split Node') && (
                  <div className="grid grid-cols-2 gap-8 w-full max-w-2xl">
                    {currentTrail.nodes
                      .filter((n) => n.type === 'Split Node')
                      .map((splitNode) => (
                        <div
                          key={splitNode.id}
                          onClick={() => handleSelectNode(splitNode)}
                          className={`bg-paper border rounded-xl p-4 cursor-pointer transition-all space-y-2 relative ${
                            shownNode?.id === splitNode.id
                              ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xl'
                              : 'border-line hover:border-line-strong'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              {splitNode.role}
                            </span>
                            <span className="text-xs font-bold text-amber-400 font-mono">
                              {splitNode.amount}
                            </span>
                          </div>
                          <div>
                            <p className="font-bold text-ink-900 text-xs">{splitNode.holder}</p>
                            <p className="text-[11px] text-ink-500 font-mono">{splitNode.accNo}</p>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-ink-500 border-t border-line pt-2">
                            <span>{splitNode.bank}</span>
                            <span>{splitNode.time}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* STAGE 4: DESTINATION CASH-OUT SINK NODES */}
                <div className="w-full max-w-2xl pt-4">
                  <div className="text-center mb-4">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-ink-500 bg-raised px-3 py-1 rounded-full border border-line-strong/50">
                      Final Cash-Out Sinks
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentTrail.nodes
                      .filter((n) => n.type === 'Destination')
                      .map((sinkNode) => (
                        <div
                          key={sinkNode.id}
                          onClick={() => handleSelectNode(sinkNode)}
                          className={`bg-paper border rounded-xl p-4 cursor-pointer transition-all space-y-2 ${
                            shownNode?.id === sinkNode.id
                              ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xl'
                              : 'border-rose-900/40 hover:border-rose-500/60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                              {sinkNode.role}
                            </span>
                            <span className="text-xs font-bold text-rose-400 font-mono">
                              {sinkNode.amount}
                            </span>
                          </div>
                          <div>
                            <p className="font-bold text-ink-900 text-xs">{sinkNode.holder}</p>
                            <p className="text-[11px] text-ink-500 font-mono">{sinkNode.accNo}</p>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-ink-500 border-t border-line pt-2">
                            <span>{sinkNode.bank}</span>
                            <span>{sinkNode.location}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Canvas Footer Status */}
              <div className="border-t border-line pt-3 flex items-center justify-between text-xs text-ink-500">
                <span>Total Flow Evaluated: <strong className="text-ink-700">{currentTrail.totalFlow}</strong></span>
                <span>Case Status: <strong className="text-rose-400">{currentTrail.status}</strong></span>
              </div>
            </div>

            {/* Right Column: Node Details & Legal Action Inspector */}
            <div className="lg:col-span-4 bg-paper border border-line rounded-xl p-5 space-y-5 flex flex-col justify-between h-full min-h-[560px]">
              {shownNode ? (
                <>
                  <div className="space-y-4">
                    {/* Panel Header */}
                    <div className="border-b border-line pb-3 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono text-blue-400 font-bold">
                          {shownNode.id}
                        </span>
                        <h3 className="font-bold text-ink-900 text-base leading-tight">
                          Node Inspector Details
                        </h3>
                      </div>
                      <span className={`text-xs px-2.5 py-0.5 rounded border ${getRiskBadge(shownNode.risk)}`}>
                        {shownNode.risk} Risk
                      </span>
                    </div>

                    {/* Metadata Breakdown */}
                    <div className="space-y-2.5 text-xs">
                      <div className="bg-paper p-3 rounded-lg border border-line space-y-1">
                        <span className="text-ink-500 text-[10px]">Account Holder / Entity Name</span>
                        <p className="font-bold text-ink-900 text-sm">{shownNode.holder}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-paper p-2.5 rounded-lg border border-line space-y-0.5">
                          <span className="text-ink-500 text-[10px]">Banking Gateway</span>
                          <p className="font-medium text-ink-700 truncate">{shownNode.bank}</p>
                        </div>
                        <div className="bg-paper p-2.5 rounded-lg border border-line space-y-0.5">
                          <span className="text-ink-500 text-[10px]">Account Identifier</span>
                          <p className="font-mono text-blue-400 truncate">{shownNode.accNo}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-paper p-2.5 rounded-lg border border-line space-y-0.5">
                          <span className="text-ink-500 text-[10px]">Sequenced Flow Amount</span>
                          <p className="font-bold text-rose-400 font-mono">{shownNode.amount}</p>
                        </div>
                        <div className="bg-paper p-2.5 rounded-lg border border-line space-y-0.5">
                          <span className="text-ink-500 text-[10px]">Timestamp</span>
                          <p className="font-medium text-ink-700 text-[11px]">{shownNode.time}</p>
                        </div>
                      </div>

                      <div className="bg-paper p-3 rounded-lg border border-line space-y-1">
                        <span className="text-ink-500 text-[10px]">IP Vector / Geographical Marker</span>
                        <p className="font-medium text-ink-700">{shownNode.ip}</p>
                        <p className="text-[10px] text-ink-500">{shownNode.location}</p>
                      </div>
                    </div>
                  </div>

                  {/* Legal Action Control Buttons */}
                  <div className="pt-4 border-t border-line space-y-2">
                    <span className="text-[10px] text-ink-500 block">Investigative Actions</span>

                    <button
                      onClick={() => setIsFreezeModalOpen(true)}
                      className={`w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                        freezeStatus[shownNode.id]
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-ink-900'
                          : 'bg-rose-600 hover:bg-rose-500 text-ink-900 shadow-lg shadow-rose-950/30'
                      }`}
                    >
                      <Shield className="w-4 h-4" />
                      <span>
                        {freezeStatus[shownNode.id]
                          ? 'Unfreeze Account Hold'
                          : 'Issue Emergency Lien / Freeze'}
                      </span>
                    </button>

                    <button className="w-full bg-raised hover:bg-slate-700 border border-line-strong text-ink-700 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Request Bank KYC & IP Dump</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-ink-500 text-xs">
                  <HelpCircle className="w-8 h-8 mb-2 stroke-1" />
                  <span>Click any flowchart node to inspect detailed parameters.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Freeze Modal */}
      {isFreezeModalOpen && shownNode && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-paper border border-line rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-bold text-ink-900 text-base flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <span>Confirm Emergency Lien Notice</span>
              </h3>
              <button
                onClick={() => setIsFreezeModalOpen(false)}
                className="text-ink-500 hover:text-ink-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-ink-700">
              <p>
                You are about to issue an automated emergency freeze order to{' '}
                <strong className="text-ink-900">{shownNode.bank}</strong> for account{' '}
                <strong className="text-blue-400 font-mono">{shownNode.accNo}</strong> under IT Act Section 91.
              </p>

              <div className="bg-paper p-3 rounded-lg border border-line space-y-1">
                <span className="text-ink-500 text-[10px]">Target Account Holder</span>
                <p className="font-bold text-ink-900">{shownNode.holder}</p>
                <span className="text-ink-500 text-[10px]">Flow Exposure: {shownNode.amount}</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-line text-xs">
              <button
                onClick={() => setIsFreezeModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-raised text-ink-700 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleToggleFreeze(shownNode.id)}
                className="px-4 py-2 rounded-lg bg-rose-600 text-ink-900 hover:bg-rose-500 font-semibold"
              >
                Confirm & Issue Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}