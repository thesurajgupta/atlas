
'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar'; 

import {
  Search,
  Bell,
  Shield,
  FileText,
  Activity,
  MapPin,
  AlertTriangle,
  Users,
  Settings,
  Filter,
  ChevronDown,
  Calendar,
  Download,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  Building,
  CreditCard,
  UserCheck,
  RefreshCw,
  ExternalLink,
  Layers,
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
        bank: 'State Bank of India',
        accNo: 'SBI-9012-3341',
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
        bank: 'HDFC Bank',
        accNo: 'HDFC-8821-0012',
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
        bank: 'ICICI Bank',
        accNo: 'ICIC-4401-9920',
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
        bank: 'Axis Bank',
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
        bank: 'ATM-8831 (Canara Bank)',
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
        bank: 'Kotak Mahindra Bank',
        accNo: 'KKBK-5541-1109',
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
        bank: 'Yes Bank',
        accNo: 'YESB-0012-7743',
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

export default function TransactionTrailPage() {
  // --- STATE MANAGEMENT ---
  const [activeTrailIndex, setActiveTrailIndex] = useState(0);
  const currentTrail = TRAIL_DATASETS[activeTrailIndex];

  // Selected Node State for Detail Side-Panel
  const [selectedNode, setSelectedNode] = useState<typeof currentTrail['nodes'][0] | null>(
    currentTrail.nodes[1]
  );

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
    <div className="flex h-screen bg-[#070A11] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-[#0B0F19] border-b border-slate-800/80 flex items-center justify-between px-6 shrink-0">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search account numbers, transaction hashes, or node IDs..."
              className="w-full bg-[#070A11] border border-slate-800 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
              ⌘K
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <button className="relative p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>
            </button>
            <div className="flex items-center space-x-3 pl-4 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-slate-300">
                I
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Inspector</p>
                <p className="text-[10px] text-slate-400">Delhi Cyber Cell</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-bold text-white tracking-tight">Fund Flowchart Trail</h2>
                <span className="bg-blue-500/10 text-blue-400 text-xs px-2.5 py-0.5 rounded-full border border-blue-500/30 font-semibold font-mono">
                  {currentTrail.trailId}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Visualizing fund sequencing, multi-hop splits, and cash-out sinks.
              </p>
            </div>

            {/* Trail Selector Pagination & Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Pagination Switcher for Trail Cases */}
              <div className="flex items-center bg-[#0B0F19] border border-slate-800 rounded-lg p-1 text-xs text-slate-300 space-x-2">
                <button
                  disabled={activeTrailIndex === 0}
                  onClick={() => {
                    const newIndex = activeTrailIndex - 1;
                    setActiveTrailIndex(newIndex);
                    setSelectedNode(TRAIL_DATASETS[newIndex].nodes[1]);
                  }}
                  className="p-1.5 hover:bg-slate-800 rounded disabled:opacity-30 transition-colors"
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
                    setSelectedNode(TRAIL_DATASETS[newIndex].nodes[1]);
                  }}
                  className="p-1.5 hover:bg-slate-800 rounded disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Date Range Selector */}
              <div className="flex items-center bg-[#0B0F19] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 space-x-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="bg-transparent border-none focus:outline-none text-slate-200 w-44 text-xs"
                />
              </div>

              {/* Export Button */}
              <button className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-blue-950/30 transition-all">
                <Download className="w-3.5 h-3.5" />
                <span>Export Flow Diagram</span>
              </button>
            </div>
          </div>

          {/* Interactive Filter Control Strip */}
          <div className="bg-[#0B0F19] border border-slate-800/80 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Bank Filter */}
              <div className="md:col-span-4 relative">
                <select
                  value={bankFilter}
                  onChange={(e) => setBankFilter(e.target.value)}
                  className="w-full bg-[#070A11] border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-2 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Participating Banks</option>
                  <option value="HDFC Bank">HDFC Bank</option>
                  <option value="State Bank of India">State Bank of India</option>
                  <option value="ICICI Bank">ICICI Bank</option>
                  <option value="Axis Bank">Axis Bank</option>
                  <option value="Binance P2P Escrow">Binance P2P Escrow</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Threat Risk Level Filter */}
              <div className="md:col-span-4 relative">
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="w-full bg-[#070A11] border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-2 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Risk Severities</option>
                  <option value="Critical">Critical Risk Nodes</option>
                  <option value="High">High Risk Nodes</option>
                  <option value="Low">Low Risk Nodes</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Reset Controls Button */}
              <div className="md:col-span-4 flex items-center justify-end">
                <button
                  onClick={() => {
                    setBankFilter('All');
                    setRiskFilter('All');
                    setSearchQuery('');
                  }}
                  className="w-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 rounded-lg px-3 py-2 flex items-center justify-center space-x-1.5 transition-colors"
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
            <div className="lg:col-span-8 bg-[#0B0F19] border border-slate-800/80 rounded-xl p-6 relative min-h-[560px] flex flex-col justify-between overflow-x-auto">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  <h3 className="font-semibold text-white text-xs uppercase tracking-wider">
                    Sequential Fund Trajectory
                  </h3>
                </div>
                <span className="text-[10px] text-slate-500">
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
                        className={`w-80 bg-[#070A11] border rounded-xl p-4 cursor-pointer transition-all space-y-2 relative ${
                          selectedNode?.id === sourceNode.id
                            ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xl shadow-blue-950/50'
                            : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {sourceNode.role}
                          </span>
                          <span className="text-xs font-bold text-white font-mono">
                            {sourceNode.amount}
                          </span>
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">{sourceNode.holder}</p>
                          <p className="text-xs text-slate-400 font-mono">{sourceNode.accNo}</p>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/80 pt-2">
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
                        className={`w-80 bg-[#070A11] border rounded-xl p-4 cursor-pointer transition-all space-y-2 relative ${
                          selectedNode?.id === muleNode.id
                            ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xl shadow-blue-950/50'
                            : 'border-rose-500/40 hover:border-rose-500'
                        } ${freezeStatus[muleNode.id] ? 'opacity-60 bg-rose-950/10' : ''}`}
                      >
                        {freezeStatus[muleNode.id] && (
                          <span className="absolute -top-2.5 right-3 bg-rose-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
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
                          <p className="font-bold text-white text-sm">{muleNode.holder}</p>
                          <p className="text-xs text-slate-400 font-mono">{muleNode.accNo}</p>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/80 pt-2">
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
                          className={`bg-[#070A11] border rounded-xl p-4 cursor-pointer transition-all space-y-2 relative ${
                            selectedNode?.id === splitNode.id
                              ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xl'
                              : 'border-slate-800 hover:border-slate-700'
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
                            <p className="font-bold text-white text-xs">{splitNode.holder}</p>
                            <p className="text-[11px] text-slate-400 font-mono">{splitNode.accNo}</p>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/80 pt-2">
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
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/50">
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
                          className={`bg-[#070A11] border rounded-xl p-4 cursor-pointer transition-all space-y-2 ${
                            selectedNode?.id === sinkNode.id
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
                            <p className="font-bold text-white text-xs">{sinkNode.holder}</p>
                            <p className="text-[11px] text-slate-400 font-mono">{sinkNode.accNo}</p>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/80 pt-2">
                            <span>{sinkNode.bank}</span>
                            <span>{sinkNode.location}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Canvas Footer Status */}
              <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between text-xs text-slate-500">
                <span>Total Flow Evaluated: <strong className="text-slate-200">{currentTrail.totalFlow}</strong></span>
                <span>Case Status: <strong className="text-rose-400">{currentTrail.status}</strong></span>
              </div>
            </div>

            {/* Right Column: Node Details & Legal Action Inspector */}
            <div className="lg:col-span-4 bg-[#0B0F19] border border-slate-800/80 rounded-xl p-5 space-y-5 flex flex-col justify-between h-full min-h-[560px]">
              {selectedNode ? (
                <>
                  <div className="space-y-4">
                    {/* Panel Header */}
                    <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono text-blue-400 font-bold">
                          {selectedNode.id}
                        </span>
                        <h3 className="font-bold text-white text-base leading-tight">
                          Node Inspector Details
                        </h3>
                      </div>
                      <span className={`text-xs px-2.5 py-0.5 rounded border ${getRiskBadge(selectedNode.risk)}`}>
                        {selectedNode.risk} Risk
                      </span>
                    </div>

                    {/* Metadata Breakdown */}
                    <div className="space-y-2.5 text-xs">
                      <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-1">
                        <span className="text-slate-500 text-[10px]">Account Holder / Entity Name</span>
                        <p className="font-bold text-white text-sm">{selectedNode.holder}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[#070A11] p-2.5 rounded-lg border border-slate-800 space-y-0.5">
                          <span className="text-slate-500 text-[10px]">Banking Gateway</span>
                          <p className="font-medium text-slate-200 truncate">{selectedNode.bank}</p>
                        </div>
                        <div className="bg-[#070A11] p-2.5 rounded-lg border border-slate-800 space-y-0.5">
                          <span className="text-slate-500 text-[10px]">Account Identifier</span>
                          <p className="font-mono text-blue-400 truncate">{selectedNode.accNo}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[#070A11] p-2.5 rounded-lg border border-slate-800 space-y-0.5">
                          <span className="text-slate-500 text-[10px]">Sequenced Flow Amount</span>
                          <p className="font-bold text-rose-400 font-mono">{selectedNode.amount}</p>
                        </div>
                        <div className="bg-[#070A11] p-2.5 rounded-lg border border-slate-800 space-y-0.5">
                          <span className="text-slate-500 text-[10px]">Timestamp</span>
                          <p className="font-medium text-slate-300 text-[11px]">{selectedNode.time}</p>
                        </div>
                      </div>

                      <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-1">
                        <span className="text-slate-500 text-[10px]">IP Vector / Geographical Marker</span>
                        <p className="font-medium text-slate-300">{selectedNode.ip}</p>
                        <p className="text-[10px] text-slate-500">{selectedNode.location}</p>
                      </div>
                    </div>
                  </div>

                  {/* Legal Action Control Buttons */}
                  <div className="pt-4 border-t border-slate-800 space-y-2">
                    <span className="text-[10px] text-slate-500 block">Investigative Actions</span>

                    <button
                      onClick={() => setIsFreezeModalOpen(true)}
                      className={`w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                        freezeStatus[selectedNode.id]
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/30'
                      }`}
                    >
                      <Shield className="w-4 h-4" />
                      <span>
                        {freezeStatus[selectedNode.id]
                          ? 'Unfreeze Account Hold'
                          : 'Issue Emergency Lien / Freeze'}
                      </span>
                    </button>

                    <button className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Request Bank KYC & IP Dump</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs">
                  <HelpCircle className="w-8 h-8 mb-2 stroke-1" />
                  <span>Click any flowchart node to inspect detailed parameters.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Freeze Modal */}
      {isFreezeModalOpen && selectedNode && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B0F19] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <span>Confirm Emergency Lien Notice</span>
              </h3>
              <button
                onClick={() => setIsFreezeModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                You are about to issue an automated emergency freeze order to{' '}
                <strong className="text-white">{selectedNode.bank}</strong> for account{' '}
                <strong className="text-blue-400 font-mono">{selectedNode.accNo}</strong> under IT Act Section 91.
              </p>

              <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px]">Target Account Holder</span>
                <p className="font-bold text-white">{selectedNode.holder}</p>
                <span className="text-slate-500 text-[10px]">Flow Exposure: {selectedNode.amount}</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800 text-xs">
              <button
                onClick={() => setIsFreezeModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleToggleFreeze(selectedNode.id)}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-500 font-semibold"
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