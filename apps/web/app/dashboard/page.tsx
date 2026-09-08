"use client";

import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "../../components/Sidebar";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  LayoutDashboard,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";

type Risk = "Critical" | "High" | "Medium" | "Low";
type Status = "New" | "Reviewing" | "Escalated" | "Resolved";
type Threat = {
  id: string;
  title: string;
  description: string;
  entity: string;
  entityType: "Person" | "Account" | "ATM" | "Device" | "Phone" | "Transaction";
  risk: Risk;
  score: number;
  status: Status;
  amount: string;
  location: string;
  createdAt: string;
};

const seedThreats: Threat[] = [
  {
    id: "ALT-9042",
    title: "Rapid account hopping detected",
    description: "Funds moved across 5 linked accounts in less than 14 minutes.",
    entity: "A-1122334455",
    entityType: "Account",
    risk: "Critical",
    score: 98,
    status: "New",
    amount: "₹4.82L",
    location: "New Delhi",
    createdAt: "Just now",
  },
  {
    id: "ALT-9041",
    title: "ATM cash-out pattern anomaly",
    description: "Repeated withdrawals break the account's 90-day behavior baseline.",
    entity: "ATM-4412",
    entityType: "ATM",
    risk: "High",
    score: 92,
    status: "Reviewing",
    amount: "₹1.48L",
    location: "Karol Bagh",
    createdAt: "2 min ago",
  },
  {
    id: "ALT-9040",
    title: "Shared device across investigations",
    description: "The same device fingerprint is connected to 3 active cases.",
    entity: "DV-443322",
    entityType: "Device",
    risk: "High",
    score: 89,
    status: "Escalated",
    amount: "₹2.15L",
    location: "Delhi",
    createdAt: "5 min ago",
  },
  {
    id: "ALT-9039",
    title: "Unusual high-value transfer",
    description: "Transfer amount is 8.2× higher than the customer's baseline.",
    entity: "P-78234",
    entityType: "Person",
    risk: "High",
    score: 86,
    status: "New",
    amount: "₹2.25L",
    location: "Laxmi Nagar",
    createdAt: "8 min ago",
  },
  {
    id: "ALT-9038",
    title: "Previously unseen phone linked",
    description: "A new phone number was associated shortly before a transfer spike.",
    entity: "PH-9876543210",
    entityType: "Phone",
    risk: "Medium",
    score: 72,
    status: "Reviewing",
    amount: "₹78K",
    location: "East Delhi",
    createdAt: "12 min ago",
  },
  {
    id: "ALT-9037",
    title: "Cross-branch activity",
    description: "Transactions appeared at two branches inside a 21-minute window.",
    entity: "BR-0214",
    entityType: "Account",
    risk: "Medium",
    score: 66,
    status: "New",
    amount: "₹1.16L",
    location: "Connaught Place",
    createdAt: "17 min ago",
  },
  {
    id: "ALT-9036",
    title: "Dormant account reactivated",
    description: "A dormant account resumed activity after 184 days with a large inflow.",
    entity: "A-5544332210",
    entityType: "Account",
    risk: "Medium",
    score: 64,
    status: "Reviewing",
    amount: "₹92K",
    location: "Saket",
    createdAt: "25 min ago",
  },
  {
    id: "ALT-9035",
    title: "Transaction velocity exceeded",
    description: "12 transactions were observed within the configured velocity window.",
    entity: "TXN-998877",
    entityType: "Transaction",
    risk: "High",
    score: 84,
    status: "New",
    amount: "₹75K",
    location: "Delhi",
    createdAt: "32 min ago",
  },
  {
    id: "ALT-9034",
    title: "Low-value probe transactions",
    description: "Several small transactions resemble card testing behavior.",
    entity: "A-9988776655",
    entityType: "Account",
    risk: "Medium",
    score: 58,
    status: "Reviewing",
    amount: "₹18K",
    location: "Noida",
    createdAt: "39 min ago",
  },
  {
    id: "ALT-9033",
    title: "Known mule pattern match",
    description: "Graph features overlap with previously confirmed mule-account cases.",
    entity: "P-55661",
    entityType: "Person",
    risk: "Critical",
    score: 96,
    status: "Escalated",
    amount: "₹3.62L",
    location: "Ghaziabad",
    createdAt: "48 min ago",
  },
  {
    id: "ALT-9032",
    title: "Login from high-risk device",
    description: "Authentication originated from a device previously linked to fraud.",
    entity: "DV-820114",
    entityType: "Device",
    risk: "High",
    score: 81,
    status: "New",
    amount: "₹54K",
    location: "Gurugram",
    createdAt: "54 min ago",
  },
  {
    id: "ALT-9031",
    title: "Unusual cash withdrawal timing",
    description: "Cash was withdrawn shortly after a large inbound transfer.",
    entity: "ATM-8831",
    entityType: "ATM",
    risk: "Medium",
    score: 63,
    status: "Resolved",
    amount: "₹46K",
    location: "Connaught Place",
    createdAt: "1 hr ago",
  },
];

const riskStyles: Record<Risk, string> = {
  Critical: "border-red-500/30 bg-red-500/10 text-red-300",
  High: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  Medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

const statusStyles: Record<Status, string> = {
  New: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  Reviewing: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  Escalated: "bg-red-500/10 text-red-300 border-red-500/20",
  Resolved: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
};

const riskScoreClass = (score: number) => {
  if (score >= 90) return "text-red-300";
  if (score >= 75) return "text-orange-300";
  if (score >= 60) return "text-amber-300";
  return "text-emerald-300";
};

export default function CyberFraudDashboard() {
  const [threats, setThreats] = useState<Threat[]>(seedThreats);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"All" | Risk>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | Status>("All");
  const [entityFilter, setEntityFilter] = useState<"All" | Threat["entityType"]>("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [live, setLive] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [lastSync, setLastSync] = useState("Just now");

  useEffect(() => {
    if (!live) return;

    const id = window.setInterval(() => {
      const templates = [
        {
          title: "Realtime transfer velocity spike",
          description: "Multiple transfers crossed the configured anomaly threshold.",
          entityType: "Transaction" as const,
          risk: "High" as Risk,
          score: 82,
          status: "New" as Status,
          amount: "₹1.24L",
          location: "New Delhi",
        },
        {
          title: "New device-account association",
          description: "A new device was observed immediately before a high-value event.",
          entityType: "Device" as const,
          risk: "Medium" as Risk,
          score: 71,
          status: "New" as Status,
          amount: "₹68K",
          location: "East Delhi",
        },
        {
          title: "Rapid beneficiary change",
          description: "Beneficiary details changed shortly before a suspicious transfer.",
          entityType: "Account" as const,
          risk: "Critical" as Risk,
          score: 95,
          status: "Escalated" as Status,
          amount: "₹2.87L",
          location: "Noida",
        },
      ];

      const template = templates[Math.floor(Math.random() * templates.length)];
      const nextId = `ALT-${9043 + Math.floor(Math.random() * 900)}`;
      const newThreat: Threat = {
        id: nextId,
        ...template,
        entity: template.entityType === "Device" ? "DV-LIVE-19" : template.entityType === "Account" ? "A-LIVE-4821" : "TXN-LIVE-77",
        createdAt: "Just now",
      };

      setThreats((current) => [newThreat, ...current].slice(0, 30));
      setLastSync("Just now");
    }, 12000);

    return () => window.clearInterval(id);
  }, [live]);

  const filteredThreats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threats.filter((threat) => {
      const matchesSearch = !q || [threat.id, threat.title, threat.description, threat.entity, threat.location, threat.entityType]
        .some((value) => value.toLowerCase().includes(q));
      const matchesRisk = riskFilter === "All" || threat.risk === riskFilter;
      const matchesStatus = statusFilter === "All" || threat.status === statusFilter;
      const matchesEntity = entityFilter === "All" || threat.entityType === entityFilter;
      return matchesSearch && matchesRisk && matchesStatus && matchesEntity;
    });
  }, [threats, search, riskFilter, statusFilter, entityFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredThreats.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleThreats = filteredThreats.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, riskFilter, statusFilter, entityFilter, pageSize]);

  const stats = useMemo(() => {
    const critical = threats.filter((item) => item.risk === "Critical").length;
    const high = threats.filter((item) => item.risk === "High").length;
    const escalated = threats.filter((item) => item.status === "Escalated").length;
    return { total: threats.length, critical, high, escalated };
  }, [threats]);

  const clearFilters = () => {
    setSearch("");
    setRiskFilter("All");
    setStatusFilter("All");
    setEntityFilter("All");
  };

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-200">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.10),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.06),transparent_30%)]" />

      <div className="relative flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 bg-[#080d16]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>FraudWatch</span><span>/</span><span className="text-slate-300">Threat Monitoring</span>
              </div>
              <h1 className="mt-1 truncate text-lg font-semibold text-white sm:text-xl">Cyber-Fraud Prevention Dashboard</h1>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setLive((value) => !value)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${live ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}
              >
                <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
                {live ? "Live" : "Paused"}
              </button>
              <button className="relative rounded-lg border border-slate-800 bg-[#0d1420] p-2 text-slate-400 hover:text-white">
                <Bell className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{stats.critical + stats.high}</span>
              </button>
              <div className="hidden items-center gap-2 border-l border-slate-800 pl-3 sm:flex">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20 text-xs font-bold text-blue-300">A</div>
                <div>
                  <p className="text-xs font-medium text-white">Analyst</p>
                  <p className="text-[10px] text-slate-500">Delhi Cyber Cell</p>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 xl:p-8">
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Active Threats" value={String(stats.total)} change="+12.4%" positive icon={<Zap className="h-5 w-5 text-blue-400" />} />
              <StatCard title="Critical Alerts" value={String(stats.critical)} change="Requires action" icon={<ShieldAlert className="h-5 w-5 text-red-400" />} />
              <StatCard title="High Risk" value={String(stats.high)} change="Priority queue" icon={<AlertTriangle className="h-5 w-5 text-orange-400" />} />
              <StatCard title="Escalated Cases" value={String(stats.escalated)} change="Under investigation" icon={<Activity className="h-5 w-5 text-purple-400" />} />
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 rounded-2xl border border-slate-800/80 bg-[#0a111c] shadow-2xl shadow-black/20">
                <div className="border-b border-slate-800/80 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-white sm:text-base">Threat Feed</h2>
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Real-time
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Proactive alerts from transaction, identity, device, and network detection.</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="relative min-w-0 sm:w-64">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search threats, entities, locations..."
                          className="w-full rounded-lg border border-slate-800 bg-[#080e18] py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-500/60"
                        />
                      </div>
                      <button
                        onClick={() => setShowFilters((value) => !value)}
                        className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${showFilters ? "border-blue-500/40 bg-blue-500/10 text-blue-300" : "border-slate-800 bg-[#080e18] text-slate-400 hover:text-white"}`}
                      >
                        <SlidersHorizontal className="h-4 w-4" /> Filters
                      </button>
                    </div>
                  </div>

                  {showFilters && (
                    <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-[#080e18] p-3 sm:grid-cols-3">
                      <FilterSelect label="Risk" value={riskFilter} onChange={(value) => setRiskFilter(value as typeof riskFilter)} options={["All", "Critical", "High", "Medium", "Low"]} />
                      <FilterSelect label="Status" value={statusFilter} onChange={(value) => setStatusFilter(value as typeof statusFilter)} options={["All", "New", "Reviewing", "Escalated", "Resolved"]} />
                      <FilterSelect label="Entity" value={entityFilter} onChange={(value) => setEntityFilter(value as typeof entityFilter)} options={["All", "Person", "Account", "ATM", "Device", "Phone", "Transaction"]} />
                      <div className="sm:col-span-3 flex justify-between gap-2 border-t border-slate-800 pt-3">
                        <span className="text-[11px] text-slate-500">{filteredThreats.length} matching threats</span>
                        <button onClick={clearFilters} className="inline-flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200"><X className="h-3 w-3" /> Clear filters</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-xs">
                    <thead className="bg-[#0d1420] text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium sm:px-5">Threat</th>
                        <th className="px-4 py-3 font-medium">Risk</th>
                        <th className="px-4 py-3 font-medium">Score</th>
                        <th className="px-4 py-3 font-medium">Entity</th>
                        <th className="px-4 py-3 font-medium">Amount</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {visibleThreats.map((threat) => (
                        <tr key={threat.id} className="group transition hover:bg-white/[0.015]">
                          <td className="px-4 py-4 sm:px-5">
                            <div className="max-w-[360px]">
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-500/10">
                                  <ShieldAlert className="h-3.5 w-3.5" />
                                </div>
                                <div>
                                  <p className="font-medium text-slate-100">{threat.title}</p>
                                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{threat.description}</p>
                                  <p className="mt-1 font-mono text-[10px] text-slate-600">{threat.id}</p>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-medium ${riskStyles[threat.risk]}`}>{threat.risk}</span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-800">
                                <div className="h-full rounded-full bg-current" style={{ width: `${threat.score}%`, color: threat.score >= 90 ? "#f87171" : threat.score >= 75 ? "#fb923c" : threat.score >= 60 ? "#fbbf24" : "#34d399" }} />
                              </div>
                              <span className={`font-semibold ${riskScoreClass(threat.score)}`}>{threat.score}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-mono text-[11px] text-slate-300">{threat.entity}</p>
                            <p className="mt-0.5 text-[10px] text-slate-600">{threat.entityType} · {threat.location}</p>
                          </td>
                          <td className="px-4 py-4 font-mono text-slate-200">{threat.amount}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-medium ${statusStyles[threat.status]}`}>{threat.status}</span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1.5 whitespace-nowrap text-slate-500"><Clock3 className="h-3.5 w-3.5" />{threat.createdAt}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {visibleThreats.length === 0 && (
                    <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center">
                      <ShieldCheck className="h-9 w-9 text-emerald-400" />
                      <p className="mt-3 text-sm font-medium text-white">No threats match the current filters</p>
                      <p className="mt-1 text-xs text-slate-500">Try a broader search or clear one of the filters.</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-800/80 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span>Rows per page</span>
                    <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded-md border border-slate-800 bg-[#080e18] px-2 py-1 text-slate-300 outline-none">
                      <option value={5}>5</option>
                      <option value={6}>6</option>
                      <option value={10}>10</option>
                    </select>
                    <span>{filteredThreats.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, filteredThreats.length)} of {filteredThreats.length}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={safePage === 1} className="rounded-md border border-slate-800 bg-[#080e18] p-2 text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).slice(Math.max(0, safePage - 3), Math.min(totalPages, safePage + 2)).map((item) => (
                      <button key={item} onClick={() => setPage(item)} className={`min-w-8 rounded-md border px-2 py-1.5 text-[11px] ${item === safePage ? "border-blue-500/30 bg-blue-600 text-white" : "border-slate-800 bg-[#080e18] text-slate-500 hover:text-white"}`}>{item}</button>
                    ))}
                    <button onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={safePage === totalPages} className="rounded-md border border-slate-800 bg-[#080e18] p-2 text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>

              <aside className="rounded-2xl border border-slate-800/80 bg-[#0a111c] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Live Threat Stream</h2>
                    <p className="mt-1 text-xs text-slate-500">Signals entering the prevention layer</p>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-300 ring-1 ring-emerald-500/10"><Activity className="h-4 w-4" /></div>
                </div>

                <div className="mt-5 space-y-3">
                  {threats.slice(0, 5).map((threat, index) => (
                    <div key={`${threat.id}-${index}`} className="rounded-xl border border-slate-800 bg-[#0c1420] p-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${threat.risk === "Critical" ? "bg-red-400" : threat.risk === "High" ? "bg-orange-400" : "bg-amber-400"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-xs font-medium leading-4 text-slate-200">{threat.title}</p>
                            <span className="shrink-0 text-[9px] text-slate-600">{index === 0 ? "LIVE" : threat.createdAt}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                            <span className="rounded bg-slate-900 px-1.5 py-1 font-mono">{threat.entity}</span>
                            <span>{threat.location}</span>
                            <span className={riskScoreClass(threat.score)}>score {threat.score}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <MiniMetric label="Detection rate" value="99.2%" icon={<ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />} />
                  <MiniMetric label="False positive" value="2.8%" icon={<ArrowDownRight className="h-3.5 w-3.5 text-emerald-400" />} />
                </div>

                <div className="mt-5 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-blue-200"><Bell className="h-3.5 w-3.5" /> Event ingestion</div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">Latest sync: {lastSync}. New threats are added automatically while Live mode is enabled.</p>
                </div>
              </aside>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, badge }: { icon: React.ReactNode; label: string; active?: boolean; badge?: number }) {
  return (
    <button className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 transition ${active ? "border border-blue-500/15 bg-blue-500/10 text-blue-300" : "text-slate-500 hover:bg-slate-800/50 hover:text-slate-200"}`}>
      <span className="flex items-center gap-3">{icon}<span>{label}</span></span>
      {badge !== undefined && <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-300">{badge}</span>}
    </button>
  );
}

function StatCard({ title, value, change, positive, icon }: { title: string; value: string; change: string; positive?: boolean; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-[#0a111c] p-4 shadow-xl shadow-black/10 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-slate-900 p-2.5 ring-1 ring-slate-800">{icon}</div>
        {positive ? <ArrowUpRight className="h-4 w-4 text-emerald-400" /> : null}
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{title}</p>
      <p className="mt-2 text-[10px] text-slate-600">{change}</p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.1em] text-slate-600">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-800 bg-[#0b121d] px-3 py-2 text-xs text-slate-300 outline-none focus:border-blue-500/50">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function MiniMetric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0c1420] p-3">
      <div className="flex items-center justify-between"><span className="text-[10px] text-slate-600">{label}</span>{icon}</div>
      <p className="mt-1 text-sm font-semibold text-slate-200">{value}</p>
    </div>
  );
}
