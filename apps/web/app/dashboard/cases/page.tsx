// app/cases/page.tsx
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
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  Clock,
  UserX,
  FileCode,
  Paperclip,
  Share2,
  MoreVertical,
  Plus,
  ShieldAlert,
  FolderOpen,
  User,
  ArrowUpRight,
  Check,
  X,
  PlusCircle,
  FileCheck
} from 'lucide-react';

// --- MOCK CASE DATA ---
const CASES_DATA = [
  {
    caseId: 'CAS-2026-0891',
    title: 'Phishing Campaign targeting Nationalized Banks',
    category: 'Cyber Fraud / Phishing',
    assignedOfficer: 'Inspector Arjun Singh',
    priority: 'High',
    status: 'Active',
    createdDate: '28 Aug 2026',
    lastUpdated: '05 Sep 2026, 04:30 PM',
    progress: 68,
    overview: {
      description: 'Multi-state phishing campaign using spoofed banking domains to capture customer credentials and route unauthorized UPI transfers through mule accounts.',
      complainantsCount: 42,
      totalLossAmount: '₹48,50,000',
      jurisdiction: 'Delhi Cyber Cell (Special Task Force)'
    },
    suspects: [
      { id: 'SUS-01', name: 'Rohit Sharma (Alias: @cyber_fox)', role: 'Primary Mule Recruiter', status: 'In Custody', location: 'Rohini, New Delhi', risk: 'Critical' },
      { id: 'SUS-02', name: 'Amit Verma', role: 'Account Operator', status: 'Absconding', location: 'Jamtara, Jharkhand', risk: 'High' },
      { id: 'SUS-03', name: 'Karan Malhotra', role: 'Domain Registrar Proxy', status: 'Under Surveillance', location: 'Gurugram, Haryana', risk: 'Medium' }
    ],
    evidence: [
      { id: 'EVI-101', name: 'Bank_Statement_HDFC_Mule.pdf', type: 'Financial Record', size: '4.2 MB', verified: true, dateAdded: '30 Aug 2026' },
      { id: 'EVI-102', name: 'Phishing_Site_Source_Dump.zip', type: 'Digital Artifact', size: '128 MB', verified: true, dateAdded: '01 Sep 2026' },
      { id: 'EVI-103', name: 'Telegram_Chat_Export_MulePool.txt', type: 'Communication Log', size: '890 KB', verified: false, dateAdded: '03 Sep 2026' }
    ],
    timeline: [
      { date: '05 Sep 2026, 02:15 PM', title: 'Suspect Rohit Sharma Remanded to Custody', author: 'Insp. Arjun Singh', details: 'Court granted 5-day police custody for forensic device extraction.' },
      { date: '03 Sep 2026, 11:00 AM', title: 'Digital Evidence EVI-103 Submitted', author: 'SI Priya Sharma', details: 'Exported chat records from intercepted Telegram channel.' },
      { date: '30 Aug 2026, 04:30 PM', title: 'Emergency Lien Issued on Primary Mule Account', author: 'Insp. Arjun Singh', details: 'HDFC Bank account blocked with balance ₹4,50,000.' },
      { date: '28 Aug 2026, 09:00 AM', title: 'FIR Filed & Investigation Initiated', author: 'Duty Officer', details: 'Case registered under IT Act Section 66D and IPC 420.' }
    ]
  },
  {
    caseId: 'CAS-2026-0885',
    title: 'ATM Card Cloning & Skimming Syndicate',
    category: 'Financial Crime',
    assignedOfficer: 'SI Priya Sharma',
    priority: 'Critical',
    status: 'In Progress',
    createdDate: '20 Aug 2026',
    lastUpdated: '04 Sep 2026, 06:15 PM',
    progress: 45,
    overview: {
      description: 'Physical skimming devices identified across 5 standalone ATM kiosks in South Delhi. Over 120 cards cloned for cardless cash-outs.',
      complainantsCount: 128,
      totalLossAmount: '₹82,00,000',
      jurisdiction: 'South District Cyber Crime Unit'
    },
    suspects: [
      { id: 'SUS-04', name: 'Unidentified Syndicate Node #1', role: 'ATM Skimmer Installer', status: 'Absconding', location: 'Saket, New Delhi', risk: 'Critical' }
    ],
    evidence: [
      { id: 'EVI-201', name: 'ATM_CCTV_Footage_Saket.mp4', type: 'Video Evidence', size: '1.4 GB', verified: true, dateAdded: '22 Aug 2026' }
    ],
    timeline: [
      { date: '04 Sep 2026, 06:15 PM', title: 'Forensic Video Enhancement Completed', author: 'SI Priya Sharma', details: 'Vehicle license plate partially decoded.' }
    ]
  },
  {
    caseId: 'CAS-2026-0870',
    title: 'Deepfake Identity Extortion Syndicate',
    category: 'Identity Theft / Cyber Stalking',
    assignedOfficer: 'Inspector Vikram Mehta',
    priority: 'Medium',
    status: 'Closed',
    createdDate: '10 Aug 2026',
    lastUpdated: '01 Sep 2026, 01:00 PM',
    progress: 100,
    overview: {
      description: 'AI-generated video extortion scheme targeting high-profile corporate executives.',
      complainantsCount: 5,
      totalLossAmount: '₹15,00,000',
      jurisdiction: 'Special Cell Cyber Division'
    },
    suspects: [
      { id: 'SUS-05', name: 'Siddharth Roy', role: 'AI Payload Creator', status: 'Convicted', location: 'Central Jail Tihar', risk: 'Low' }
    ],
    evidence: [
      { id: 'EVI-301', name: 'Extortion_Audio_Tapes.wav', type: 'Audio Evidence', size: '45 MB', verified: true, dateAdded: '12 Aug 2026' }
    ],
    timeline: [
      { date: '01 Sep 2026, 01:00 PM', title: 'Final Charge Sheet Filed & Case Closed', author: 'Insp. Vikram Mehta', details: 'Accused pled guilty; case closed.' }
    ]
  }
];

export default function CasesDashboard() {
  // --- STATE MANAGEMENT ---
  const [cases, setCases] = useState(CASES_DATA);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(CASES_DATA[0].caseId);
  const [activeTab, setActiveTab] = useState<'overview' | 'suspects' | 'evidence' | 'timeline'>('overview');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  // Modals & Dynamic Additions State
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [newCaseCategory, setNewCaseCategory] = useState('Cyber Fraud / Phishing');
  const [newCasePriority, setNewCasePriority] = useState('High');

  // Find Currently Active Case Object
  const selectedCase = cases.find((c) => c.caseId === selectedCaseId) || cases[0];

  // Filter Logic
  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.caseId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.assignedOfficer.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
    const matchesPriority = priorityFilter === 'All' || c.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredCases.length / rowsPerPage) || 1;
  const paginatedCases = filteredCases.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  // Status Badge Colors
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'In Progress':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse';
      case 'Closed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  // Priority Badge Colors
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30 font-bold';
      case 'High':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-semibold';
      case 'Medium':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    }
  };

  // Case Status Lifecycle Update Handler
  const handleUpdateCaseStatus = (caseId: string, newStatus: string) => {
    setCases((prev) =>
      prev.map((c) => (c.caseId === caseId ? { ...c, status: newStatus } : c))
    );
  };

  // Handle New Case Creation
  const handleCreateCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseTitle.trim()) return;

    const newCaseObj = {
      caseId: `CAS-2026-0${Math.floor(100 + Math.random() * 900)}`,
      title: newCaseTitle,
      category: newCaseCategory,
      assignedOfficer: 'Inspector Arjun Singh',
      priority: newCasePriority,
      status: 'Active',
      createdDate: '05 Sep 2026',
      lastUpdated: '05 Sep 2026, Just Now',
      progress: 10,
      overview: {
        description: 'Newly initiated cybercrime investigation pending preliminary report compilation.',
        complainantsCount: 1,
        totalLossAmount: 'Pending Audit',
        jurisdiction: 'Delhi Cyber Cell'
      },
      suspects: [],
      evidence: [],
      timeline: [
        {
          date: '05 Sep 2026, Just Now',
          title: 'Case File Created',
          author: 'Insp. Arjun Singh',
          details: 'Investigation file opened and assigned to active queue.'
        }
      ]
    };

    setCases([newCaseObj, ...cases]);
    setSelectedCaseId(newCaseObj.caseId);
    setIsNewCaseModalOpen(false);
    setNewCaseTitle('');
  };

  return (
    <div className="flex h-screen bg-[#070A11] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 bg-[#0B0F19] border-b border-slate-800/80 flex items-center justify-between px-6 shrink-0">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search active cases, officers, or FIR numbers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
                A
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Inspector</p>
                <p className="text-[10px] text-slate-400">Delhi Cyber Cell</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Workspace */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header Action Strip */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Case Management Directory</h2>
              <p className="text-xs text-slate-400 mt-1">
                Centralized repository for active cybercrime investigations, evidence chains, and suspects.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsNewCaseModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-blue-950/30 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Register New Case</span>
              </button>
            </div>
          </div>

          {/* Master-Detail Case Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Paginated Cases Master Table/List */}
            <div className="lg:col-span-5 bg-[#0B0F19] border border-slate-800/80 rounded-xl overflow-hidden flex flex-col justify-between">
              <div>
                {/* List Header & Filters */}
                <div className="p-4 border-b border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white text-sm">Active Cases ({filteredCases.length})</h3>
                    <div className="flex items-center space-x-2">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-[#070A11] border border-slate-800 text-[11px] text-slate-300 rounded px-2 py-1 focus:outline-none"
                      >
                        <option value="All">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Case Items List */}
                <div className="divide-y divide-slate-800/60">
                  {paginatedCases.length > 0 ? (
                    paginatedCases.map((c) => (
                      <div
                        key={c.caseId}
                        onClick={() => setSelectedCaseId(c.caseId)}
                        className={`p-4 cursor-pointer transition-all space-y-2.5 relative ${
                          selectedCaseId === c.caseId
                            ? 'bg-blue-600/10 border-l-4 border-blue-500'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-[10px] text-blue-400 font-bold">{c.caseId}</span>
                            <h4 className="font-semibold text-white text-xs line-clamp-1">{c.title}</h4>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${getStatusBadge(c.status)}`}>
                            {c.status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>{c.assignedOfficer}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPriorityBadge(c.priority)}`}>
                            {c.priority}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] text-slate-500">
                            <span>Investigation Progress</span>
                            <span>{c.progress}%</span>
                          </div>
                          <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                            <div
                              className="bg-blue-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${c.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      No cases match the filter parameters.
                    </div>
                  )}
                </div>
              </div>

              {/* Pagination Controls */}
              <div className="p-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 bg-[#070A11]/50">
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center space-x-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    className="p-1 bg-[#070A11] border border-slate-800 rounded hover:bg-slate-800 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    className="p-1 bg-[#070A11] border border-slate-800 rounded hover:bg-slate-800 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Tabbed Case Workspace Detail */}
            <div className="lg:col-span-7 bg-[#0B0F19] border border-slate-800/80 rounded-xl p-5 space-y-5 flex flex-col justify-between min-h-[580px]">
              <div>
                {/* Case File Header Info */}
                <div className="border-b border-slate-800 pb-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs text-blue-400 font-bold">{selectedCase.caseId}</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded border ${getStatusBadge(selectedCase.status)}`}>
                        {selectedCase.status}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded border ${getPriorityBadge(selectedCase.priority)}`}>
                        {selectedCase.priority} Priority
                      </span>
                    </div>

                    {/* Status Update Quick Action */}
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] text-slate-500">Update Status:</span>
                      <select
                        value={selectedCase.status}
                        onChange={(e) => handleUpdateCaseStatus(selectedCase.caseId, e.target.value)}
                        className="bg-[#070A11] border border-slate-700 text-xs text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
                      >
                        <option value="Active">Active</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">{selectedCase.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Category: <span className="text-slate-300 font-medium">{selectedCase.category}</span> • Assigned Officer:{' '}
                      <span className="text-slate-300 font-medium">{selectedCase.assignedOfficer}</span>
                    </p>
                  </div>

                  {/* Tabbed Navigation */}
                  <div className="flex border-b border-slate-800/80 pt-2 text-xs font-semibold gap-6">
                    {[
                      { id: 'overview', label: 'Case Overview', icon: FolderOpen },
                      { id: 'suspects', label: `Suspects Details (${selectedCase.suspects.length})`, icon: Users },
                      { id: 'evidence', label: `Evidence (${selectedCase.evidence.length})`, icon: FileCheck },
                      { id: 'timeline', label: 'Case Timeline', icon: Clock }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`pb-2.5 flex items-center space-x-2 border-b-2 transition-all ${
                          activeTab === tab.id
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <tab.icon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Tab Panels */}
                <div className="pt-4">
                  {/* TAB 1: CASE OVERVIEW */}
                  {activeTab === 'overview' && (
                    <div className="space-y-4 text-xs">
                      <div className="bg-[#070A11] p-4 rounded-xl border border-slate-800/80 space-y-2">
                        <h4 className="font-semibold text-slate-300">Executive Summary Narrative</h4>
                        <p className="text-slate-300 leading-relaxed">{selectedCase.overview.description}</p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 text-[10px]">Total Complainants</span>
                          <p className="font-bold text-slate-200 text-sm">{selectedCase.overview.complainantsCount}</p>
                        </div>
                        <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 text-[10px]">Audited Fraud Loss</span>
                          <p className="font-bold text-rose-400 text-sm">{selectedCase.overview.totalLossAmount}</p>
                        </div>
                        <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800/80 space-y-0.5 col-span-2 sm:col-span-1">
                          <span className="text-slate-500 text-[10px]">Jurisdiction Unit</span>
                          <p className="font-semibold text-slate-300 truncate">{selectedCase.overview.jurisdiction}</p>
                        </div>
                      </div>

                      <div className="bg-[#070A11] p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between text-slate-400">
                        <span>FIR Created: <strong className="text-slate-200">{selectedCase.createdDate}</strong></span>
                        <span>Last Updated: <strong className="text-slate-200">{selectedCase.lastUpdated}</strong></span>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: SUSPECTS DETAILS */}
                  {activeTab === 'suspects' && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Identified Persons of Interest</span>
                        <button className="text-blue-400 hover:text-blue-300 font-medium flex items-center space-x-1 text-[11px]">
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Add Suspect Record</span>
                        </button>
                      </div>

                      <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                        {selectedCase.suspects.length > 0 ? (
                          selectedCase.suspects.map((s) => (
                            <div
                              key={s.id}
                              className="bg-[#070A11] p-3.5 rounded-xl border border-slate-800/80 space-y-2 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <User className="w-4 h-4 text-blue-400" />
                                  <span className="font-bold text-white">{s.name}</span>
                                </div>
                                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] border border-slate-700">
                                  {s.status}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px]">
                                <div>Role: <strong className="text-slate-200">{s.role}</strong></div>
                                <div>Location: <strong className="text-slate-200">{s.location}</strong></div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-500 text-xs py-4 text-center">No suspects cataloged for this case file yet.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: EVIDENCE MANAGEMENT */}
                  {activeTab === 'evidence' && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Chain of Custody File Repository</span>
                        <button className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded text-[11px] font-medium flex items-center space-x-1 border border-slate-700">
                          <Paperclip className="w-3.5 h-3.5" />
                          <span>Attach Digital Evidence</span>
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {selectedCase.evidence.length > 0 ? (
                          selectedCase.evidence.map((evi) => (
                            <div
                              key={evi.id}
                              className="bg-[#070A11] p-3 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center space-x-3">
                                <div className="p-2 bg-blue-600/10 text-blue-400 rounded-lg border border-blue-500/20">
                                  <FileCode className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="font-semibold text-white">{evi.name}</p>
                                  <p className="text-[10px] text-slate-500">
                                    {evi.type} • {evi.size} • Added {evi.dateAdded}
                                  </p>
                                </div>
                              </div>
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
                                Hash Verified
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-500 text-xs py-4 text-center">No digital evidence uploaded yet.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: CASE TIMELINE */}
                  {activeTab === 'timeline' && (
                    <div className="space-y-3">
                      <span className="text-xs text-slate-400 block">Chronological Investigation History</span>
                      <div className="space-y-3 max-h-[320px] overflow-y-auto pl-2 pr-1 border-l border-slate-800">
                        {selectedCase.timeline.map((item, idx) => (
                          <div key={idx} className="relative pl-4 space-y-1 text-xs">
                            <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-blue-500"></span>
                            <div className="flex items-center justify-between">
                              <h5 className="font-semibold text-white">{item.title}</h5>
                              <span className="text-[10px] text-slate-500">{item.date}</span>
                            </div>
                            <p className="text-slate-400 text-[11px]">{item.details}</p>
                            <span className="text-[10px] text-slate-500 italic">Logged by: {item.author}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Case Workspace Footer Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                <button className="text-slate-400 hover:text-slate-200 flex items-center space-x-1">
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Transfer Jurisdiction</span>
                </button>
                <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold flex items-center space-x-1.5 shadow-lg shadow-blue-950/30">
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Full Case Dossier</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Register New Case */}
      {isNewCaseModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCase}
            className="bg-[#0B0F19] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Register New Case File</h3>
              <button
                type="button"
                onClick={() => setIsNewCaseModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400">Case Title / Offense Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unlawful Transfer via Malicious APK"
                  value={newCaseTitle}
                  onChange={(e) => setNewCaseTitle(e.target.value)}
                  className="w-full bg-[#070A11] border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400">Category</label>
                <select
                  value={newCaseCategory}
                  onChange={(e) => setNewCaseCategory(e.target.value)}
                  className="w-full bg-[#070A11] border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none"
                >
                  <option value="Cyber Fraud / Phishing">Cyber Fraud / Phishing</option>
                  <option value="Financial Crime">Financial Crime</option>
                  <option value="Identity Theft / Cyber Stalking">Identity Theft / Cyber Stalking</option>
                  <option value="Ransomware Threat">Ransomware Threat</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400">Initial Priority</label>
                <select
                  value={newCasePriority}
                  onChange={(e) => setNewCasePriority(e.target.value)}
                  className="w-full bg-[#070A11] border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setIsNewCaseModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 font-semibold"
              >
                Create Case File
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}