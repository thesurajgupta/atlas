
'use client';
import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar'; 
import { 
  Search, Bell, Shield, User, FileText, Activity, 
  MapPin, AlertTriangle, Users, Settings, Upload, 
  Download, ArrowLeft, ArrowRight, Phone, Mail, 
  CheckCircle, MessageSquare, Paperclip, Send, ChevronDown,
  X, Plus, FileUp, Filter, Eye, Clock, Calendar
} from 'lucide-react';

// --- MOCK DATA ---
const SUSPECTS_DATA = [
  {
    id: 'S-01',
    name: 'Rohit Sharma',
    riskScore: 92,
    status: 'Under Investigation',
    dob: '12 Mar 1992',
    gender: 'Male',
    mobile: '+91 98765 43210',
    email: 'rohit.sharma2@gmail.com',
    address: 'Nagoi Nagar, India',
    kyc: 'Verified',
    timeline: [
      { event: 'Unusual Transfer Flagged', time: '05 Sep 2025, 08:24 AM', status: 'high' },
      { event: 'Device Binding Change', time: '05 Sep 2025, 01:24 PM', status: 'medium' }
    ]
  },
  {
    id: 'S-02',
    name: 'Amit Verma',
    riskScore: 45,
    status: 'Person of Interest',
    dob: '18 Aug 1988',
    gender: 'Male',
    mobile: '+91 91234 56789',
    email: 'amit.verma88@gmail.com',
    address: 'Rohini Sector 7, Delhi',
    kyc: 'Pending',
    timeline: [
      { event: 'Account Linked to IP', time: '04 Sep 2025, 11:10 PM', status: 'low' }
    ]
  },
  {
    id: 'S-03',
    name: 'Priya Nair',
    riskScore: 18,
    status: 'Victim',
    dob: '04 Jun 1995',
    gender: 'Female',
    mobile: '+91 99887 76655',
    email: 'pnair_95@outlook.com',
    address: 'Indiranagar, Bengaluru',
    kyc: 'Verified',
    timeline: [
      { event: 'Report Submitted', time: '05 Sep 2025, 07:15 AM', status: 'info' }
    ]
  }
];

const EVIDENCE_ITEMS = [
  {
    id: 'E-101',
    title: 'Forensic Image: Android Device (DV-443322)',
    category: 'Digital Forensic',
    meta: 'Metadata: Android OS v13',
    accessed: '05 Sep 2025, 10:24 AM',
    analysed: '17 Sep 2025, 11:28 AM',
    analysesCount: 166
  },
  {
    id: 'E-102',
    title: 'CCTV Footages (ATM-8831)',
    category: 'Video Recording',
    meta: 'Metadata: 1080p 30fps MP4',
    accessed: '05 Sep 2025, 10:24 AM',
    analysed: '17 Sep 2025, 11:38 AM',
    analysesCount: 0
  },
  {
    id: 'E-103',
    title: 'SMS Logs & Gateway Records',
    category: 'Telecom Records',
    meta: 'Metadata: Carrier Dump',
    accessed: '05 Sep 2025, 10:24 AM',
    analysed: '17 Sep 2025, 11:38 PM',
    analysesCount: 12
  },
  {
    id: 'E-104',
    title: 'Witness Written Statements',
    category: 'Documentation',
    meta: 'Metadata: Signed Affidavit',
    accessed: '05 Sep 2025, 10:24 PM',
    analysed: 'Pending',
    analysesCount: 0
  }
];

const CASE_DETAILS_DATA = {
  caseId: 'C-4501',
  title: 'Phishing Fraud Operation - Rohit Sharma',
  severity: 'Critical',
  assignedTo: 'Inspector [Delhi Cyber Cell]',
  dateOpened: '05 Sep 2025',
  totalLoss: '₹7,50,000',
  description: 'Multi-phishing operation targeting national banking customers via fake spoofed web portals. Funds diverted via mule accounts across multiple states.'
};

export default function InvestigationDashboard() {
  // State Management
  const [activeTab, setActiveTab] = useState<'caseDetails' | 'suspects' | 'evidence'>('suspects');
  const [selectedSuspect, setSelectedSuspect] = useState(SUSPECTS_DATA[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 2;

  // Toggle Panel & Modal States
  const [isCaseNotesOpen, setIsCaseNotesOpen] = useState(true);
  const [isTimelineOpen, setIsTimelineOpen] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Dynamic Case Notes State
  const [notes, setNotes] = useState([
    { id: 1, author: 'Inspector [Delhi Cyber Cell]', text: 'Threaded, secured, and automatically timestamped entry.', time: '05 Sep 2025, 08:22 AM' },
    { id: 2, author: 'Inspector [Delhi Cyber Cell]', text: 'Primary suspect identified via IMEI cross-match.', time: '05 Sep 2025, 11:45 AM' }
  ]);
  const [newNote, setNewNote] = useState('');

  // Timeline events state
  const [selectedTimelineEvent, setSelectedTimelineEvent] = useState<string | null>(null);

  // Dynamic Evidence State
  const [evidenceList, setEvidenceList] = useState(EVIDENCE_ITEMS);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('Digital Forensic');

  // Handle Note Submit
  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setNotes([
      ...notes,
      {
        id: Date.now(),
        author: 'Inspector [Delhi Cyber Cell]',
        text: newNote,
        time: new Date().toLocaleString()
      }
    ]);
    setNewNote('');
  };

  // Handle Evidence Upload Submit
  const handleUploadEvidence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim()) return;
    const newItem = {
      id: `E-${100 + evidenceList.length + 1}`,
      title: uploadTitle,
      category: uploadCategory,
      meta: 'Metadata: User Attached File',
      accessed: 'Just now',
      analysed: 'Pending',
      analysesCount: 0
    };
    setEvidenceList([newItem, ...evidenceList]);
    setUploadTitle('');
    setIsUploadModalOpen(false);
  };

  // Pagination Helper
  const totalPages = Math.ceil(SUSPECTS_DATA.length / itemsPerPage);
  const paginatedSuspects = SUSPECTS_DATA.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex h-screen bg-[#0B0F19] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar Nav */}
      <Sidebar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search cases, accounts, locations, or transaction IDs..."
              className="w-full bg-[#0B0F19] border border-slate-700 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
              ⌘K
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <button className="relative p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>
            </button>
            <div className="flex items-center space-x-3 pl-4 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-sm text-slate-300">
                I
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Inspector</p>
                <p className="text-[10px] text-slate-400">Delhi Cyber Cell</p>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content Workspace */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header Action Bar */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">
                Investigation: {CASE_DETAILS_DATA.title}
              </h2>
              <div className="flex items-center space-x-3 mt-1 text-xs text-slate-400">
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  Case ID: {CASE_DETAILS_DATA.caseId}
                </span>
                <span className="text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded font-medium">
                  {CASE_DETAILS_DATA.severity} Severity
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-blue-600/20 transition-all"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Evidence</span>
              </button>
              <button 
                onClick={() => setIsCaseNotesOpen(!isCaseNotesOpen)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  isCaseNotesOpen 
                    ? 'bg-slate-800 border-slate-600 text-white' 
                    : 'bg-transparent border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {isCaseNotesOpen ? 'Hide Notes' : 'Show Notes'}
              </button>
            </div>
          </div>

          {/* Interactive Nav Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex space-x-6 text-sm">
              <button 
                onClick={() => setActiveTab('caseDetails')}
                className={`pb-3 -mb-3 font-semibold transition-all ${
                  activeTab === 'caseDetails' 
                    ? 'text-blue-400 border-b-2 border-blue-500' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Case Details
              </button>
              <button 
                onClick={() => setActiveTab('suspects')}
                className={`pb-3 -mb-3 font-semibold transition-all ${
                  activeTab === 'suspects' 
                    ? 'text-blue-400 border-b-2 border-blue-500' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Suspects / Victims ({SUSPECTS_DATA.length})
              </button>
              <button 
                onClick={() => setActiveTab('evidence')}
                className={`pb-3 -mb-3 font-semibold transition-all ${
                  activeTab === 'evidence' 
                    ? 'text-blue-400 border-b-2 border-blue-500' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Evidence Management ({evidenceList.length})
              </button>
            </div>

            {/* Pagination Controls */}
            {activeTab === 'suspects' && (
              <div className="flex items-center space-x-3 text-xs text-slate-400">
                <span>Page {currentPage} of {totalPages}</span>
                <div className="flex items-center space-x-1">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="p-1 hover:bg-slate-800 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="p-1 hover:bg-slate-800 rounded disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Main Grid View */}
          <div className="grid grid-cols-12 gap-6">
            {/* Tabbed Panel Section */}
            <div className={`${isCaseNotesOpen ? 'col-span-8' : 'col-span-12'} transition-all space-y-4`}>
              
              {/* TAB 1: CASE DETAILS */}
              {activeTab === 'caseDetails' && (
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-6 space-y-6">
                  <h3 className="font-semibold text-white text-base">Overview & Case Parameters</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="bg-[#0B0F19] p-4 rounded-lg border border-slate-800 space-y-1">
                      <span className="text-slate-500">Assigned Investigator</span>
                      <p className="font-medium text-slate-200 text-sm">{CASE_DETAILS_DATA.assignedTo}</p>
                    </div>
                    <div className="bg-[#0B0F19] p-4 rounded-lg border border-slate-800 space-y-1">
                      <span className="text-slate-500">Estimated Loss</span>
                      <p className="font-bold text-rose-400 text-sm">{CASE_DETAILS_DATA.totalLoss}</p>
                    </div>
                    <div className="bg-[#0B0F19] p-4 rounded-lg border border-slate-800 space-y-1">
                      <span className="text-slate-500">Date Opened</span>
                      <p className="font-medium text-slate-200 text-sm">{CASE_DETAILS_DATA.dateOpened}</p>
                    </div>
                    <div className="bg-[#0B0F19] p-4 rounded-lg border border-slate-800 space-y-1">
                      <span className="text-slate-500">Primary Incident Type</span>
                      <p className="font-medium text-slate-200 text-sm">Online Banking Fraud / Phishing</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 mb-2">Case Summary</h4>
                    <p className="text-xs text-slate-300 bg-[#0B0F19] p-4 rounded-lg border border-slate-800 leading-relaxed">
                      {CASE_DETAILS_DATA.description}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: SUSPECTS / VICTIMS */}
              {activeTab === 'suspects' && (
                <div className="grid grid-cols-2 gap-4">
                  {paginatedSuspects.map((suspect) => (
                    <div 
                      key={suspect.id}
                      onClick={() => setSelectedSuspect(suspect)}
                      className={`bg-[#0F172A] border rounded-xl p-4 cursor-pointer transition-all space-y-4 ${
                        selectedSuspect.id === suspect.id 
                          ? 'border-blue-500 ring-1 ring-blue-500/50 shadow-lg' 
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center font-bold text-slate-300">
                            {suspect.name.charAt(0)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-white text-sm">{suspect.name}</h4>
                            <div className="flex items-center space-x-2 mt-0.5">
                              <span className="text-rose-400 font-bold text-xs">{suspect.riskScore}</span>
                              <span className="text-[10px] text-slate-400">Risk Score</span>
                            </div>
                          </div>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          suspect.status === 'Under Investigation' 
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {suspect.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-y-1.5 text-xs border-t border-slate-800/80 pt-3 text-slate-300">
                        <span className="text-slate-500">DOB:</span> <span>{suspect.dob}</span>
                        <span className="text-slate-500">Mobile:</span> <span>{suspect.mobile}</span>
                        <span className="text-slate-500">KYC:</span> <span className="text-emerald-400">{suspect.kyc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: EVIDENCE MANAGEMENT */}
              {activeTab === 'evidence' && (
                <div className="space-y-3">
                  {evidenceList.map((item) => (
                    <div key={item.id} className="bg-[#0F172A] border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex items-center justify-between transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-slate-800 rounded-lg text-blue-400">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-200">{item.title}</h4>
                          <p className="text-[10px] text-slate-400">{item.category} • {item.meta}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6 text-xs text-slate-400">
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500">Accessed</p>
                          <p className="text-slate-300">{item.accessed}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500">Analyses</p>
                          <p className="text-blue-400 font-semibold">{item.analysesCount}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Toggleable Right Panel - Case Notes */}
            {isCaseNotesOpen && (
              <div className="col-span-4 bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex flex-col justify-between h-[420px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="font-semibold text-white text-xs">Case Notes Log</h3>
                    <button onClick={() => setIsCaseNotesOpen(false)} className="text-slate-500 hover:text-slate-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Notes Feed */}
                  <div className="space-y-3 overflow-y-auto max-h-[280px] pr-1">
                    {notes.map((note) => (
                      <div key={note.id} className="flex items-start space-x-2 text-xs bg-[#0B0F19] p-2.5 rounded-lg border border-slate-800">
                        <div className="w-5 h-5 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center text-[10px] shrink-0 mt-0.5 font-bold">
                          I
                        </div>
                        <div className="flex-1">
                          <p className="text-slate-300 font-medium text-[11px]">{note.author}</p>
                          <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{note.text}</p>
                          <span className="text-[9px] text-slate-600 mt-1 block">{note.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submit New Note Input */}
                <form onSubmit={handleAddNote} className="pt-2 border-t border-slate-800">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add investigation note..."
                      className="w-full bg-[#0B0F19] border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-blue-500 hover:text-blue-400">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Toggleable Interactive Case Timeline Section */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h3 className="font-semibold text-white text-base">Interactive Timeline Events</h3>
                <span className="text-xs text-slate-500">(Click nodes to inspect details)</span>
              </div>
              <button 
                onClick={() => setIsTimelineOpen(!isTimelineOpen)}
                className="text-xs text-blue-400 hover:underline"
              >
                {isTimelineOpen ? 'Collapse Timeline' : 'Expand Timeline'}
              </button>
            </div>

            {isTimelineOpen && (
              <div className="relative py-6">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-800 -translate-y-1/2"></div>
                
                <div className="relative grid grid-cols-5 gap-4">
                  {[
                    { id: 'T1', title: 'Cloned Account Created', date: '05 Sep 2025', detail: 'Fake account initialized via TOR Proxy' },
                    { id: 'T2', title: 'Funds Transfer', amount: '₹75,000', date: '05 Sep 2025', detail: 'Transferred to Mule HDFC Bank account' },
                    { id: 'T3', title: 'ATM Withdrawal Attempt', date: '05 Sep 2025', detail: 'ATM-8831 CCTV triggered' },
                    { id: 'T4', title: 'Device Forensics', date: '06 Sep 2025', detail: 'IMEI matched to primary suspect' },
                    { id: 'T5', title: 'Evidence Acquisition', date: '07 Sep 2025', detail: 'Statements and logs secured' }
                  ].map((event) => (
                    <div 
                      key={event.id}
                      onClick={() => setSelectedTimelineEvent(selectedTimelineEvent === event.id ? null : event.id)}
                      className="flex flex-col items-center cursor-pointer group"
                    >
                      {/* Event Box */}
                      <div className={`p-2.5 rounded-lg text-left w-full space-y-1 transition-all ${
                        selectedTimelineEvent === event.id 
                          ? 'bg-blue-900/30 border border-blue-500' 
                          : 'bg-[#0B0F19] border border-slate-700/80 group-hover:border-slate-500'
                      }`}>
                        <p className="text-xs font-semibold text-slate-200 truncate">{event.title}</p>
                        {event.amount && <p className="text-xs font-bold text-rose-400">{event.amount}</p>}
                        <p className="text-[9px] text-slate-500">{event.date}</p>
                        {selectedTimelineEvent === event.id && (
                          <p className="text-[10px] text-blue-300 pt-1 border-t border-slate-800">{event.detail}</p>
                        )}
                      </div>

                      {/* Node Indicator */}
                      <div className={`w-3 h-3 rounded-full my-2 border-2 border-[#0F172A] transition-all ${
                        selectedTimelineEvent === event.id ? 'bg-blue-400 scale-125' : 'bg-slate-600 group-hover:bg-blue-500'
                      }`}></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Evidence Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-white text-base flex items-center space-x-2">
                <FileUp className="w-5 h-5 text-blue-400" />
                <span>Upload Case Evidence</span>
              </h3>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadEvidence} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Evidence Title / Description</label>
                <input 
                  type="text" 
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Call Detail Records (CDR) Dump"
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Evidence Category</label>
                <select 
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option>Digital Forensic</option>
                  <option>Video Recording</option>
                  <option>Telecom Records</option>
                  <option>Financial Statement</option>
                  <option>Documentation</option>
                </select>
              </div>

              <div className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center space-y-2 hover:border-blue-500/50 transition-colors cursor-pointer">
                <Upload className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-slate-300 font-medium">Click or drag files here to attach</p>
                <p className="text-[10px] text-slate-500">Supports PDF, PNG, MP4, CSV up to 50MB</p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 font-medium"
                >
                  Submit Evidence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}