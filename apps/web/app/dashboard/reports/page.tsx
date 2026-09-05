// app/reports/page.tsx
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
  Download,
  Calendar,
  Filter,
  ChevronDown,
  Eye,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Play,
  RotateCw,
  Clock,
  XCircle,
  CheckCircle2,
  PieChart as PieChartIcon
} from 'lucide-react';

// --- MOCK DATA FOR REPORTS TABLE ---
const INITIAL_REPORTS = [
  {
    id: 'RPT/2025/09/0056',
    name: 'Cyber Fraud Cases Summary',
    type: 'Case Summary',
    generatedOn: '05 Sep 2025, 11:45 AM',
    dateRange: '01 Sep - 05 Sep 2025',
    priority: 'High',
    generatedBy: 'Arjun Singh (Inspector)',
    status: 'Completed'
  },
  {
    id: 'RPT/2025/09/0055',
    name: 'UPI Fraud Trend Analysis',
    type: 'Financial Analysis',
    generatedOn: '05 Sep 2025, 10:30 AM',
    dateRange: '29 Aug - 05 Sep 2025',
    priority: 'High',
    generatedBy: 'Priya Sharma (Sub-Inspector)',
    status: 'Completed'
  },
  {
    id: 'RPT/2025/09/0054',
    name: 'ATM Cash-Out Hotspots',
    type: 'Location Intelligence',
    generatedOn: '05 Sep 2025, 09:15 AM',
    dateRange: '01 Sep - 05 Sep 2025',
    priority: 'Medium',
    generatedBy: 'Vikram Mehta (Inspector)',
    status: 'Completed'
  },
  {
    id: 'RPT/2025/09/0053',
    name: 'Network Connection Report',
    type: 'Network Analysis',
    generatedOn: '04 Sep 2025, 08:40 PM',
    dateRange: '28 Aug - 04 Sep 2025',
    priority: 'Medium',
    generatedBy: 'Neha Verma (Sub-Inspector)',
    status: 'Completed'
  },
  {
    id: 'RPT/2025/09/0052',
    name: 'High Risk Transactions',
    type: 'Financial Analysis',
    generatedOn: '04 Sep 2025, 06:20 PM',
    dateRange: '01 Sep - 04 Sep 2025',
    priority: 'High',
    generatedBy: 'Rahul Kumar (Inspector)',
    status: 'Running'
  },
  {
    id: 'RPT/2025/09/0051',
    name: 'Phishing Links & Domains',
    type: 'Other Reports',
    generatedOn: '04 Sep 2025, 04:05 PM',
    dateRange: '28 Aug - 04 Sep 2025',
    priority: 'Low',
    generatedBy: 'Sneha Iyer (Sub-Inspector)',
    status: 'Scheduled'
  },
  {
    id: 'RPT/2025/09/0050',
    name: 'Weekly Cybercrime Digest',
    type: 'Case Summary',
    generatedOn: '04 Sep 2025, 02:30 PM',
    dateRange: '28 Aug - 04 Sep 2025',
    priority: 'Low',
    generatedBy: 'Arjun Singh (Inspector)',
    status: 'Failed'
  },
  {
    id: 'RPT/2025/09/0049',
    name: 'ATM Branch Audit Log',
    type: 'Location Intelligence',
    generatedOn: '03 Sep 2025, 05:12 PM',
    dateRange: '20 Aug - 03 Sep 2025',
    priority: 'Medium',
    generatedBy: 'Vikram Mehta (Inspector)',
    status: 'Completed'
  },
  {
    id: 'RPT/2025/09/0048',
    name: 'Mule Accounts Investigation',
    type: 'Financial Analysis',
    generatedOn: '03 Sep 2025, 01:20 PM',
    dateRange: '01 Aug - 03 Sep 2025',
    priority: 'High',
    generatedBy: 'Arjun Singh (Inspector)',
    status: 'Completed'
  }
];

export default function ReportsDashboard() {
  // --- STATE MANAGEMENT ---
  const [reports, setReports] = useState(INITIAL_REPORTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [timeRange, setTimeRange] = useState('This Week');
  const [dateRangePicker, setDateRangePicker] = useState('01 Sep 2025 → 05 Sep 2025');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(7);

  // Active Row Menu Dropdown State
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Modal / Preview State
  const [previewReport, setPreviewReport] = useState<typeof INITIAL_REPORTS[0] | null>(null);

  // --- FILTERING LOGIC ---
  const filteredReports = reports.filter((rpt) => {
    const matchesSearch =
      rpt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rpt.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rpt.generatedBy.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || rpt.status === statusFilter;
    const matchesPriority = priorityFilter === 'All' || rpt.priority === priorityFilter;
    const matchesType = typeFilter === 'All' || rpt.type === typeFilter;

    return matchesSearch && matchesStatus && matchesPriority && matchesType;
  });

  // --- PAGINATION LOGIC ---
  const totalPages = Math.ceil(filteredReports.length / rowsPerPage) || 1;
  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  // Priority Styling Helper
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'High':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'Medium':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'Low':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  // Status Styling Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'Running':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse';
      case 'Scheduled':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'Failed':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
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
              placeholder="Search cases, accounts, locations, or transaction IDs..."
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

        {/* Dashboard Scrollable Canvas */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title & Global Export Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Reports</h2>
              <p className="text-xs text-slate-400 mt-1">
                Generate, view, and export cybercrime analytics reports.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Date Range Picker */}
              <div className="flex items-center bg-[#0B0F19] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 space-x-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={dateRangePicker}
                  onChange={(e) => setDateRangePicker(e.target.value)}
                  className="bg-transparent border-none focus:outline-none text-slate-200 w-48 text-xs"
                />
              </div>

              {/* Report Type Filter Dropdown */}
              <div className="relative">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="bg-[#0B0F19] border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-1.5 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Report Types</option>
                  <option value="Case Summary">Case Summary</option>
                  <option value="Financial Analysis">Financial Analysis</option>
                  <option value="Location Intelligence">Location Intelligence</option>
                  <option value="Network Analysis">Network Analysis</option>
                  <option value="Other Reports">Other Reports</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* PDF Export Button */}
              <button className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-rose-950/30 transition-all">
                <Download className="w-3.5 h-3.5" />
                <span>Export PDF</span>
              </button>

              {/* CSV Export Button */}
              <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-emerald-950/30 transition-all">
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Metric Counter Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                title: 'Reports Generated',
                count: '128',
                change: '↑ 18.7%',
                isPositive: true,
                color: 'blue',
                icon: FileText
              },
              {
                title: 'Completed Reports',
                count: '72',
                change: '↑ 12.4%',
                isPositive: true,
                color: 'emerald',
                icon: CheckCircle2
              },
              {
                title: 'Scheduled Reports',
                count: '34',
                change: '↓ 5.3%',
                isPositive: false,
                color: 'amber',
                icon: Clock
              },
              {
                title: 'Viewed Reports',
                count: '22',
                change: '↑ 8.6%',
                isPositive: true,
                color: 'purple',
                icon: Eye
              },
              {
                title: 'Failed Reports',
                count: '9',
                change: '↓ 3.2%',
                isPositive: false,
                color: 'rose',
                icon: XCircle
              }
            ].map((stat, idx) => (
              <div
                key={idx}
                className="bg-[#0B0F19] border border-slate-800/80 rounded-xl p-4 space-y-3 relative overflow-hidden group hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`p-2 rounded-lg bg-${stat.color}-500/10 text-${stat.color}-400 border border-${stat.color}-500/20`}
                  >
                    <stat.icon className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      stat.isPositive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {stat.change} vs last 7 days
                  </span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tracking-tight">{stat.count}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{stat.title}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Line Chart: Reports Overview */}
            <div className="lg:col-span-8 bg-[#0B0F19] border border-slate-800/80 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white text-sm">Reports Overview</h3>
                  <p className="text-[11px] text-slate-400">
                    Daily volume of analytics reports compiled
                  </p>
                </div>
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="bg-[#070A11] border border-slate-800 text-xs text-slate-300 rounded-lg px-2.5 py-1 focus:outline-none"
                >
                  <option>This Week</option>
                  <option>Last Week</option>
                  <option>This Month</option>
                </select>
              </div>

              {/* Line Chart Visual Representation */}
              <div className="h-48 w-full flex flex-col justify-end pt-4 relative">
                {/* Background Grid Lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                  <div className="border-b border-slate-700 w-full"></div>
                  <div className="border-b border-slate-700 w-full"></div>
                  <div className="border-b border-slate-700 w-full"></div>
                  <div className="border-b border-slate-700 w-full"></div>
                </div>

                {/* SVG Curve Line */}
                <svg className="w-full h-36 overflow-visible" viewBox="0 0 500 100">
                  <defs>
                    <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Gradient Area Fill */}
                  <path
                    d="M 0,70 Q 70,30 140,40 T 280,20 T 420,50 L 500,10 L 500,100 L 0,100 Z"
                    fill="url(#blueGradient)"
                  />
                  {/* Dynamic Line Stroke */}
                  <path
                    d="M 0,70 Q 70,30 140,40 T 280,20 T 420,50 L 500,10"
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="3"
                  />
                  {/* Data Points */}
                  {[
                    { x: 0, y: 70 },
                    { x: 70, y: 40 },
                    { x: 140, y: 35 },
                    { x: 210, y: 50 },
                    { x: 280, y: 20 },
                    { x: 350, y: 45 },
                    { x: 420, y: 50 },
                    { x: 500, y: 10 }
                  ].map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r="4"
                      className="fill-blue-500 stroke-[#0B0F19] stroke-2 hover:r-6 transition-all cursor-pointer"
                    />
                  ))}
                </svg>

                {/* X-Axis Labels */}
                <div className="flex justify-between text-[10px] text-slate-500 pt-3 border-t border-slate-800">
                  <span>29 Aug</span>
                  <span>30 Aug</span>
                  <span>31 Aug</span>
                  <span>1 Sep</span>
                  <span>2 Sep</span>
                  <span>3 Sep</span>
                  <span>4 Sep</span>
                  <span>5 Sep</span>
                </div>
              </div>
            </div>

            {/* Donut Chart: Reports by Type */}
            <div className="lg:col-span-4 bg-[#0B0F19] border border-slate-800/80 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white text-sm">Reports by Type</h3>
                  <p className="text-[11px] text-slate-400">Distribution breakdown</p>
                </div>
                <PieChartIcon className="w-4 h-4 text-slate-400" />
              </div>

              <div className="flex items-center justify-between pt-2">
                {/* SVG Donut Chart */}
                <div className="relative w-32 h-32 shrink-0">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    {/* Circle 1: Case Summary (Blue - 29.7%) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="transparent"
                      stroke="#3B82F6"
                      strokeWidth="4"
                      strokeDasharray="29.7 70.3"
                      strokeDashoffset="0"
                    />
                    {/* Circle 2: Financial Analysis (Emerald - 25%) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="transparent"
                      stroke="#10B981"
                      strokeWidth="4"
                      strokeDasharray="25 75"
                      strokeDashoffset="-29.7"
                    />
                    {/* Circle 3: Network Analysis (Amber - 18.8%) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="transparent"
                      stroke="#F59E0B"
                      strokeWidth="4"
                      strokeDasharray="18.8 81.2"
                      strokeDashoffset="-54.7"
                    />
                    {/* Circle 4: Location Intelligence (Purple - 14.1%) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="transparent"
                      stroke="#8B5CF6"
                      strokeWidth="4"
                      strokeDasharray="14.1 85.9"
                      strokeDashoffset="-73.5"
                    />
                    {/* Circle 5: Other Reports (Rose - 12.5%) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="transparent"
                      stroke="#F43F5E"
                      strokeWidth="4"
                      strokeDasharray="12.5 87.5"
                      strokeDashoffset="-87.6"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-sm font-bold text-white">128</span>
                    <span className="text-[8px] text-slate-400">Total</span>
                  </div>
                </div>

                {/* Donut Chart Legend */}
                <div className="space-y-1.5 text-xs text-slate-300">
                  {[
                    { label: 'Case Summary', pct: '29.7%', color: 'bg-blue-500' },
                    { label: 'Financial Analysis', pct: '25.0%', color: 'bg-emerald-500' },
                    { label: 'Network Analysis', pct: '18.8%', color: 'bg-amber-500' },
                    { label: 'Location Intel', pct: '14.1%', color: 'bg-purple-500' },
                    { label: 'Other Reports', pct: '12.5%', color: 'bg-rose-500' }
                  ].map((leg, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${leg.color}`}></span>
                      <span className="text-[11px] text-slate-400 truncate w-24">
                        {leg.label}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-200">
                        {leg.pct}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Filters & Controls Bar */}
          <div className="bg-[#0B0F19] border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Table Search Input */}
              <div className="md:col-span-4 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search by Report Name, ID, or Generated By..."
                  className="w-full bg-[#070A11] border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Status Filter */}
              <div className="md:col-span-2 relative">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-[#070A11] border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-2 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="Running">Running</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Failed">Failed</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Priority Filter */}
              <div className="md:col-span-2 relative">
                <select
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-[#070A11] border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-2 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Priorities</option>
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Type Filter */}
              <div className="md:col-span-2 relative">
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-[#070A11] border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-2 appearance-none pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  <option value="Case Summary">Case Summary</option>
                  <option value="Financial Analysis">Financial Analysis</option>
                  <option value="Location Intelligence">Location Intelligence</option>
                  <option value="Network Analysis">Network Analysis</option>
                  <option value="Other Reports">Other Reports</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Reset Filters Button */}
              <div className="md:col-span-2 flex items-center justify-end">
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('All');
                    setPriorityFilter('All');
                    setTypeFilter('All');
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 rounded-lg px-3 py-2 flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              </div>
            </div>
          </div>

          {/* Paginated Recent Reports Table Section */}
          <div className="bg-[#0B0F19] border border-slate-800/80 rounded-xl overflow-hidden space-y-0">
            <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm">Recent Reports</h3>
              <span className="text-xs text-slate-400">
                Showing {filteredReports.length} total entries
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#070A11] text-slate-400 uppercase font-medium border-b border-slate-800/80">
                  <tr>
                    <th className="py-3 px-4">Report ID</th>
                    <th className="py-3 px-4">Report Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Generated On</th>
                    <th className="py-3 px-4">Date Range</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Generated By</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {paginatedReports.length > 0 ? (
                    paginatedReports.map((rpt) => (
                      <tr key={rpt.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-blue-400 font-medium">
                          {rpt.id}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-white">{rpt.name}</td>
                        <td className="py-3.5 px-4 text-slate-400">{rpt.type}</td>
                        <td className="py-3.5 px-4 text-slate-300">{rpt.generatedOn}</td>
                        <td className="py-3.5 px-4 text-slate-400">{rpt.dateRange}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${getPriorityBadge(
                              rpt.priority
                            )}`}
                          >
                            {rpt.priority}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">{rpt.generatedBy}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${getStatusBadge(
                              rpt.status
                            )}`}
                          >
                            {rpt.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right relative">
                          <div className="flex items-center justify-end space-x-2">
                            {/* Eye View Quick Action */}
                            <button
                              onClick={() => setPreviewReport(rpt)}
                              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Download Action */}
                            <button
                              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                              title="Download Report"
                            >
                              <Download className="w-4 h-4" />
                            </button>

                            {/* Three Dot Action Dropdown Trigger */}
                            <button
                              onClick={() =>
                                setOpenMenuId(openMenuId === rpt.id ? null : rpt.id)
                              }
                              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Dynamic Row Menu Popup */}
                          {openMenuId === rpt.id && (
                            <div className="absolute right-4 top-10 w-40 bg-[#070A11] border border-slate-700 rounded-lg shadow-xl py-1.5 z-30 text-left">
                              <button
                                onClick={() => {
                                  setPreviewReport(rpt);
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center space-x-2"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Preview Report</span>
                              </button>
                              <button
                                onClick={() => setOpenMenuId(null)}
                                className="w-full px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center space-x-2"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                                <span>Re-run Analytics</span>
                              </button>
                              <button
                                onClick={() => {
                                  setReports(reports.filter((r) => r.id !== rpt.id));
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-950/30 flex items-center space-x-2"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Delete Entry</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
                        No reports matching your search and filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center space-x-2">
                <span>Rows per page:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-[#070A11] border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none"
                >
                  <option value={5}>5</option>
                  <option value={7}>7</option>
                  <option value={10}>10</option>
                </select>
                <span>
                  Showing {(currentPage - 1) * rowsPerPage + 1} to{' '}
                  {Math.min(currentPage * rowsPerPage, filteredReports.length)} of{' '}
                  {filteredReports.length}
                </span>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  className="p-1.5 bg-[#070A11] border border-slate-800 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={`px-3 py-1 rounded border text-xs font-semibold transition-colors ${
                      currentPage === pg
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#070A11] border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {pg}
                  </button>
                ))}

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  className="p-1.5 bg-[#070A11] border border-slate-800 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Report Quick Detail Preview Drawer / Modal */}
      {previewReport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B0F19] border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono text-blue-400 font-semibold">
                  {previewReport.id}
                </span>
                <h3 className="font-bold text-white text-base">{previewReport.name}</h3>
              </div>
              <button
                onClick={() => setPreviewReport(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-500">Category</span>
                <p className="font-medium text-slate-200">{previewReport.type}</p>
              </div>
              <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-500">Priority Level</span>
                <p className="font-medium text-slate-200">{previewReport.priority}</p>
              </div>
              <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-500">Generated By</span>
                <p className="font-medium text-slate-200">{previewReport.generatedBy}</p>
              </div>
              <div className="bg-[#070A11] p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-500">Execution Status</span>
                <p className="font-medium text-emerald-400">{previewReport.status}</p>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <span className="text-slate-500">Analytics Range</span>
              <p className="text-slate-300 bg-[#070A11] p-2.5 rounded-lg border border-slate-800">
                {previewReport.dateRange}
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800 text-xs">
              <button
                onClick={() => setPreviewReport(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Close
              </button>
              <button className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 font-medium flex items-center space-x-1.5">
                <Download className="w-3.5 h-3.5" />
                <span>Download Report</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}