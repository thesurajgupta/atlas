
'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';

import {
  Search,
  Bell,
  Shield,
  User,
  FileText,
  Activity,
  MapPin,
  AlertTriangle,
  Users,
  Settings,
  Filter,
  ChevronDown,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowUpRight,
  ShieldAlert,
  Terminal,
  Zap,
  MoreVertical,
  Check,
  Ban,
  ExternalLink,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// --- MOCK ALERTS DATA ---
const INITIAL_ALERTS = [
  {
    id: 'ALT-2026-9041',
    title: 'High Velocity Mule Account Drain',
    source: 'Automated Rule #402',
    timestamp: '2 mins ago',
    fullTime: '05 Sep 2026, 06:12:04 PM',
    severity: 'Critical',
    category: 'Transaction Anomaly',
    account: 'ACC-8849-1029',
    entityName: 'Rohit Sharma (Mule Network A)',
    amount: '₹4,50,000',
    location: 'Mumbai, MH',
    ipAddress: '185.220.101.45 (Tor Exit)',
    status: 'Active',
    description: 'Rapid sequential withdrawals detected across 3 distinct ATM terminals within a 90-second window. High probability of structured cash-out scheme.',
    recommendedActions: [
      'Freeze Target Account ACC-8849-1029',
      'Notify Regional Cyber Patrol Units',
      'Issue Emergency Lock on Associated Gateway'
    ]
  },
  {
    id: 'ALT-2026-9040',
    title: 'Spoofed Banking Portal Domain Registered',
    source: 'Domain Threat Monitor',
    timestamp: '14 mins ago',
    fullTime: '05 Sep 2026, 06:00:11 PM',
    severity: 'High',
    category: 'Phishing Intelligence',
    account: 'N/A',
    entityName: 'hfdc-secure-verify.net',
    amount: 'N/A',
    location: 'Hosted in Eastern Europe',
    ipAddress: '91.218.114.208',
    status: 'Active',
    description: 'Newly registered lookalike domain mimicking primary retail banking login screen. Active phishing kit detected serving malicious payload.',
    recommendedActions: [
      'Issue Takedown Request to Registrar',
      'Update Global DNS Sinkhole List',
      'Broadcast Advisory to Monitoring Nodes'
    ]
  },
  {
    id: 'ALT-2026-9039',
    title: 'Sim-Swap Event On High-Risk Profile',
    source: 'Telecom Gateway Sync',
    timestamp: '38 mins ago',
    fullTime: '05 Sep 2026, 05:36:22 PM',
    severity: 'High',
    category: 'Identity Hijack',
    account: 'ACC-1102-4491',
    entityName: 'Amit Verma',
    amount: 'N/A',
    location: 'Delhi, DL',
    ipAddress: '103.21.126.12',
    status: 'Acknowledged',
    description: 'Unscheduled SIM card replacement performed via carrier kiosk followed immediately by OTP requests for high-value fund transfers.',
    recommendedActions: [
      'Temporary OTP Lockout on Mobile Number',
      'Contact Carrier Fraud Counterpart'
    ]
  },
  {
    id: 'ALT-2026-9038',
    title: 'Multiple Failed Biometric Authentications',
    source: 'Mobile App Telemetry',
    timestamp: '1 hour ago',
    fullTime: '05 Sep 2026, 05:10:00 PM',
    severity: 'Medium',
    category: 'Authentication',
    account: 'ACC-3391-8820',
    entityName: 'Priya Nair',
    amount: 'N/A',
    location: 'Bengaluru, KA',
    ipAddress: '49.207.210.88',
    status: 'Acknowledged',
    description: '12 consecutive biometric verification failures logged from an unregistered hardware device ID.',
    recommendedActions: [
      'Enforce Password Reset on Next Login',
      'Require Secondary Multi-Factor Verification'
    ]
  },
  {
    id: 'ALT-2026-9037',
    title: 'ATM Cash-Out Geo-Fence Violation',
    source: 'Geofence Patrol Engine',
    timestamp: '2 hours ago',
    fullTime: '05 Sep 2026, 04:15:30 PM',
    severity: 'Medium',
    category: 'Location Intelligence',
    account: 'ACC-9910-3341',
    entityName: 'Vikram Mehta',
    amount: '₹80,000',
    location: 'Kolkata, WB',
    ipAddress: '117.211.88.3',
    status: 'Resolved',
    description: 'Cardless cash withdrawal triggered outside user regular geographic boundary profile.',
    recommendedActions: [
      'Confirm Cardholder Location via App Push'
    ]
  },
  {
    id: 'ALT-2026-9036',
    title: 'Bulk Micro-Deposits Detected (Structuring)',
    source: 'AML Pattern Matcher',
    timestamp: '3 hours ago',
    fullTime: '05 Sep 2026, 03:00:19 PM',
    severity: 'Low',
    category: 'Transaction Anomaly',
    account: 'ACC-7721-0092',
    entityName: 'Unknown Syndicate Node',
    amount: '₹49,999 (x 15)',
    location: 'Jaipur, RJ',
    ipAddress: '122.160.44.19',
    status: 'Dismissed',
    description: 'Series of 15 deposits kept strictly below the mandatory PAN verification limit within 45 minutes.',
    recommendedActions: [
      'File Suspicious Activity Report (SAR)',
      'Tag Associated Bank Accounts'
    ]
  }
];

export default function AlertsDashboard() {
  // State Management
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [selectedAlert, setSelectedAlert] = useState<typeof INITIAL_ALERTS[0]>(INITIAL_ALERTS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Filter Logic
  const filteredAlerts = alerts.filter((alt) => {
    const matchesSearch =
      alt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alt.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alt.entityName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSeverity = severityFilter === 'All' || alt.severity === severityFilter;
    const matchesCategory = categoryFilter === 'All' || alt.category === categoryFilter;
    const matchesStatus = statusFilter === 'All' || alt.status === statusFilter;

    return matchesSearch && matchesSeverity && matchesCategory && matchesStatus;
  });

  // Action Handlers for Lifecycle Management
  const handleUpdateStatus = (id: string, newStatus: string) => {
    const updated = alerts.map((alt) => (alt.id === id ? { ...alt, status: newStatus } : alt));
    setAlerts(updated);
    if (selectedAlert.id === id) {
      setSelectedAlert({ ...selectedAlert, status: newStatus });
    }
  };

  // Badge Color Generators
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'Critical':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30 font-bold animate-pulse';
      case 'High':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-semibold';
      case 'Medium':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30 font-medium';
      case 'Low':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'Acknowledged':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'Resolved':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'Dismissed':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="flex h-screen bg-[#070A11] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar Nav */}
      <Sidebar />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 bg-[#0B0F19] border-b border-slate-800/80 flex items-center justify-between px-6 shrink-0">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search threat alerts, entities, accounts, or IDs..."
              className="w-full bg-[#070A11] border border-slate-800 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
              ⌘K
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <button className="relative p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>
            </button>
            <div className="flex items-center space-x-3 pl-4 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-slate-300">
                A
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Inspector</p>
                <p className="text-[10px] text-slate-400">Delhi Cyber Cell</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Main View */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header & Quick Action Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-bold text-white tracking-tight">Real-Time Threat Alerts</h2>
                <span className="bg-rose-500/10 text-rose-400 text-xs px-2.5 py-0.5 rounded-full border border-rose-500/30 font-semibold flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  <span>LIVE MONITORING</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Automated threat detection feeds and incident lifecycle management panel.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  const unacknowledged = alerts.map(a => a.status === 'Active' ? { ...a, status: 'Acknowledged' } : a);
                  setAlerts(unacknowledged);
                }}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all"
              >
                <Check className="w-3.5 h-3.5 text-amber-400" />
                <span>Acknowledge All Unhandled</span>
              </button>
              <button className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-blue-950/30 transition-all">
                <Zap className="w-3.5 h-3.5" />
                <span>Trigger Rule Re-Scan</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Critical Threats', count: alerts.filter(a => a.severity === 'Critical').length, color: 'text-rose-400', border: 'border-rose-500/20' },
              { label: 'Active Unhandled', count: alerts.filter(a => a.status === 'Active').length, color: 'text-amber-400', border: 'border-amber-500/20' },
              { label: 'Under Investigation', count: alerts.filter(a => a.status === 'Acknowledged').length, color: 'text-blue-400', border: 'border-blue-500/20' },
              { label: 'Resolved Today', count: alerts.filter(a => a.status === 'Resolved').length, color: 'text-emerald-400', border: 'border-emerald-500/20' },
            ].map((stat, i) => (
              <div key={i} className={`bg-[#0B0F19] border ${stat.border} rounded-xl p-3.5 flex items-center justify-between`}>
                <span className="text-xs text-slate-400">{stat.label}</span>
                <span className={`text-xl font-bold ${stat.color}`}>{stat.count}</span>
              </div>
            ))}
          </div>

          {/* Search and Filters Strip */}
          <div className="bg-[#0B0F19] border border-slate-800/80 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Search Bar */}
              <div className="md:col-span-5 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by Alert Title, ID, or Entity Name..."
                  className="w-full bg-[#070A11] border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Severity Dropdown */}
              <div className="md:col-span-2 relative">
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="w-full bg-[#070A11] border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-1.5 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Severities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Category Dropdown */}
              <div className="md:col-span-3 relative">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-[#070A11] border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-1.5 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Threat Categories</option>
                  <option value="Transaction Anomaly">Transaction Anomaly</option>
                  <option value="Phishing Intelligence">Phishing Intelligence</option>
                  <option value="Identity Hijack">Identity Hijack</option>
                  <option value="Authentication">Authentication</option>
                  <option value="Location Intelligence">Location Intelligence</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Status Dropdown */}
              <div className="md:col-span-2 relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-[#070A11] border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-1.5 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Acknowledged">Acknowledged</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Dismissed">Dismissed</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Master-Detail Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Live Alert Feed List */}
            <div className="lg:col-span-6 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Real-Time Alert Feed ({filteredAlerts.length})</span>
                <span className="text-[10px] text-slate-500">Auto-refreshing every 5s</span>
              </div>

              <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
                {filteredAlerts.length > 0 ? (
                  filteredAlerts.map((alt) => (
                    <div
                      key={alt.id}
                      onClick={() => setSelectedAlert(alt)}
                      className={`bg-[#0B0F19] border rounded-xl p-4 cursor-pointer transition-all space-y-3 relative ${
                        selectedAlert.id === alt.id
                          ? 'border-blue-500/80 ring-1 ring-blue-500/40 bg-slate-800/20 shadow-lg'
                          : 'border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-[10px] text-blue-400 font-semibold">{alt.id}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${getSeverityBadge(alt.severity)}`}>
                              {alt.severity}
                            </span>
                          </div>
                          <h4 className="font-semibold text-white text-xs truncate">{alt.title}</h4>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${getStatusBadge(alt.status)}`}>
                          {alt.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 bg-[#070A11] p-2.5 rounded-lg border border-slate-800/80">
                        <div>Target: <span className="text-slate-200 font-medium truncate block">{alt.entityName}</span></div>
                        <div>Category: <span className="text-slate-200 font-medium truncate block">{alt.category}</span></div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{alt.timestamp}</span>
                        </span>
                        <span>Source: {alt.source}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-[#0B0F19] border border-slate-800/80 rounded-xl p-8 text-center text-slate-500 text-xs">
                    No threat alerts matching active filter parameters.
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Detailed Lifecycle Panel */}
            <div className="lg:col-span-6 bg-[#0B0F19] border border-slate-800/80 rounded-xl p-5 space-y-5 flex flex-col justify-between h-[680px]">
              {selectedAlert ? (
                <>
                  <div className="space-y-5 overflow-y-auto pr-1">
                    {/* Header Detail */}
                    <div className="border-b border-slate-800 pb-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs text-blue-400 font-bold">{selectedAlert.id}</span>
                          <span className={`text-xs px-2.5 py-0.5 rounded border ${getSeverityBadge(selectedAlert.severity)}`}>
                            {selectedAlert.severity} Severity
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">{selectedAlert.fullTime}</span>
                      </div>
                      <h3 className="text-lg font-bold text-white leading-tight">{selectedAlert.title}</h3>
                      <p className="text-xs text-slate-400">Triggered by <strong className="text-slate-300">{selectedAlert.source}</strong></p>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-0.5">
                        <span className="text-slate-500 text-[10px]">Target Entity / Name</span>
                        <p className="font-semibold text-slate-200">{selectedAlert.entityName}</p>
                      </div>
                      <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-0.5">
                        <span className="text-slate-500 text-[10px]">Associated Account</span>
                        <p className="font-semibold text-blue-400 font-mono">{selectedAlert.account}</p>
                      </div>
                      <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-0.5">
                        <span className="text-slate-500 text-[10px]">Exposed Amount / Risk</span>
                        <p className="font-semibold text-rose-400">{selectedAlert.amount}</p>
                      </div>
                      <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-0.5">
                        <span className="text-slate-500 text-[10px]">Location & IP Vector</span>
                        <p className="font-semibold text-slate-200 truncate">{selectedAlert.location} ({selectedAlert.ipAddress})</p>
                      </div>
                    </div>

                    {/* Threat Narrative */}
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                        <Terminal className="w-3.5 h-3.5 text-blue-400" />
                        <span>Incident Narrative</span>
                      </h4>
                      <p className="text-xs text-slate-300 bg-[#070A11] p-3.5 rounded-lg border border-slate-800 leading-relaxed">
                        {selectedAlert.description}
                      </p>
                    </div>

                    {/* Recommended Playbook Actions */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        <span>Automated Response Playbook</span>
                      </h4>
                      <div className="space-y-1.5">
                        {selectedAlert.recommendedActions.map((action, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-[#070A11] p-2.5 rounded-lg border border-slate-800 text-xs">
                            <span className="text-slate-300">{action}</span>
                            <button className="text-[10px] bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white px-2 py-1 rounded transition-colors font-medium">
                              Execute
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Lifecycle Action Footer */}
                  <div className="pt-4 border-t border-slate-800 space-y-2">
                    <span className="text-[10px] text-slate-500 block">Incident Lifecycle State Control</span>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <button
                        onClick={() => handleUpdateStatus(selectedAlert.id, 'Acknowledged')}
                        className={`py-2 rounded-lg font-semibold border flex items-center justify-center space-x-1 transition-all ${
                          selectedAlert.status === 'Acknowledged'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Acknowledge</span>
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(selectedAlert.id, 'Resolved')}
                        className={`py-2 rounded-lg font-semibold border flex items-center justify-center space-x-1 transition-all ${
                          selectedAlert.status === 'Resolved'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Resolved</span>
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(selectedAlert.id, 'Dismissed')}
                        className={`py-2 rounded-lg font-semibold border flex items-center justify-center space-x-1 transition-all ${
                          selectedAlert.status === 'Dismissed'
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                            : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Dismiss False +</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs">
                  <AlertCircle className="w-8 h-8 mb-2 stroke-1" />
                  <span>Select an alert from the real-time feed to inspect lifecycle actions.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}