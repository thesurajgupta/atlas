"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { CaseContextBar } from "@/components/demo/CaseContextBar";
import { PipelineRail } from "@/components/demo/PipelineRail";
import { useCaseView, formatRupees } from "@/lib/case-view";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Node,
  Edge,
  NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Shield,
  Search,
  Network,
  Bell,
  Landmark,
  User,
  Building2,
  Smartphone,
  CreditCard,
  Building,
  CheckCircle2,
  Download,
  X,
  ExternalLink,
  Filter,
  Plus,
  Minus,
  Maximize2,
  Crosshair,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

// --- Custom Node Component for Interactive Canvas ---
const CustomNode = ({ data }: NodeProps) => {
  const getIcon = () => {
    switch (data.type) {
      case "person":
        return <User className="w-5 h-5 text-ink-900" />;
      case "account":
        return <Building2 className="w-5 h-5 text-emerald-400" />;
      case "atm":
        return <Landmark className="w-5 h-5 text-purple-400" />;
      case "branch":
        return <Building className="w-5 h-5 text-amber-400" />;
      case "phone":
        return <Smartphone className="w-5 h-5 text-cyan-400" />;
      case "device":
        return <Smartphone className="w-5 h-5 text-pink-400" />;
      case "transaction":
        return <CreditCard className="w-5 h-5 text-amber-500" />;
      default:
        return <User className="w-5 h-5 text-ink-900" />;
    }
  };

  const getBorderColor = () => {
    if (data.isCentral) return "border-blue-500 ring-4 ring-blue-500/20";
    if (data.risk === "high") return "border-red-500/80 shadow-lg shadow-red-500/20";
    if (data.type === "account") return "border-emerald-500/80";
    if (data.type === "atm") return "border-purple-500/80";
    if (data.type === "branch") return "border-amber-500/80";
    if (data.type === "device") return "border-pink-500/80";
    if (data.type === "phone") return "border-cyan-500/80";
    if (data.type === "transaction") return "border-amber-500/80";
    return "border-line-strong";
  };

  const getBgColor = () => {
    if (data.isCentral) return "bg-blue-600";
    return "bg-[#121826]";
  };

  return (
    <div className="flex flex-col items-center group cursor-pointer">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />

      {/* Node Circle */}
      <div
        className={`w-12 h-12 rounded-full ${getBgColor()} border-2 ${getBorderColor()} flex items-center justify-center transition-all duration-200 group-hover:scale-110 shadow-xl`}
      >
        {getIcon()}
      </div>

      {/* Node Labels */}
    <div className="mt-2 text-center bg-paper/90 border border-line rounded-lg px-2.5 py-1 backdrop-blur-sm shadow-md">
  <p className="text-[11px] font-bold text-ink-900 leading-tight">
    {String(data.label)}
  </p>

{data.sublabel != null && (
  <p className="text-[9px] text-ink-500 leading-tight mt-0.5">
    {String(data.sublabel)}
  </p>
)}

{data.amount != null && (
  <p className="text-[10px] text-emerald-400 font-mono font-semibold mt-0.5">
    {String(data.amount)}
  </p>
)}
</div>
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

// --- Initial Nodes & Edges ---
const initialNodes: Node[] = [
  {
    id: "p-78234",
    type: "custom",
    position: { x: 380, y: 260 },
    data: { label: "P-78234", sublabel: "Rohit Sharma", type: "person", isCentral: true, risk: "high" },
  },
  {
    id: "a-5544332210",
    type: "custom",
    position: { x: 220, y: 120 },
    data: { label: "A-5544332210", sublabel: "Savings Account | Bank A", type: "account" },
  },
  {
    id: "a-1122334455",
    type: "custom",
    position: { x: 380, y: 40 },
    data: { label: "A-1122334455", sublabel: "Savings Account | Bank C", type: "account", risk: "high" },
  },
  {
    id: "atm-8831",
    type: "custom",
    position: { x: 540, y: 100 },
    data: { label: "ATM-8831", sublabel: "Connaught Place, New Delhi", type: "atm" },
  },
  {
    id: "br-0214",
    type: "custom",
    position: { x: 620, y: 200 },
    data: { label: "BR-0214", sublabel: "Bank A Branch | Connaught Place", type: "branch" },
  },
  {
    id: "a-9988776655",
    type: "custom",
    position: { x: 530, y: 340 },
    data: { label: "A-9988776655", sublabel: "Current Account | Bank B", type: "account" },
  },
  {
    id: "p-55661",
    type: "custom",
    position: { x: 670, y: 350 },
    data: { label: "P-55661", sublabel: "Neha Singh", type: "person" },
  },
  {
    id: "atm-4412",
    type: "custom",
    position: { x: 530, y: 480 },
    data: { label: "ATM-4412", sublabel: "Karol Bagh, New Delhi", type: "atm" },
  },
  {
    id: "txn-998877",
    type: "custom",
    position: { x: 420, y: 520 },
    data: { label: "TXN-998877", sublabel: "05 Sep 2025", amount: "₹75,000", type: "transaction" },
  },
  {
    id: "ph-9876543210",
    type: "custom",
    position: { x: 300, y: 480 },
    data: { label: "PH-9876543210", sublabel: "+91 98765 43210", type: "phone" },
  },
  {
    id: "dv-443322",
    type: "custom",
    position: { x: 220, y: 380 },
    data: { label: "DV-443322", sublabel: "Android Device | Delhi, India", type: "device", risk: "high" },
  },
  {
    id: "p-19384",
    type: "custom",
    position: { x: 220, y: 240 },
    data: { label: "P-19384", sublabel: "Amit Verma", type: "person" },
  },
];

const initialEdges: Edge[] = [
  { id: "e1", source: "p-78234", target: "a-5544332210", label: "₹45,000", animated: true, style: { stroke: "#3B82F6", strokeWidth: 1.5 } },
  { id: "e2", source: "p-78234", target: "a-1122334455", label: "₹2,25,000", animated: true, style: { stroke: "#3B82F6", strokeWidth: 1.5 } },
  { id: "e3", source: "a-5544332210", target: "a-1122334455", label: "₹1,85,000", animated: true, style: { stroke: "#EF4444", strokeWidth: 1.5 } },
  { id: "e4", source: "a-1122334455", target: "atm-8831", label: "₹18,500", animated: true, style: { stroke: "#8B5CF6", strokeWidth: 1.5 } },
  { id: "e5", source: "atm-8831", target: "br-0214", label: "Associated With", style: { stroke: "#64748B", strokeDasharray: "4 4" } },
  { id: "e6", source: "p-78234", target: "br-0214", label: "₹95,000", animated: true, style: { stroke: "#F59E0B", strokeWidth: 1.5 } },
  { id: "e7", source: "p-78234", target: "a-9988776655", style: { stroke: "#3B82F6", strokeWidth: 1.5 } },
  { id: "e8", source: "a-9988776655", target: "p-55661", label: "Communicates", style: { stroke: "#10B981", strokeDasharray: "4 4" } },
  { id: "e9", source: "p-78234", target: "atm-4412", style: { stroke: "#8B5CF6", strokeWidth: 1.5 } },
  { id: "e10", source: "p-78234", target: "txn-998877", label: "Involved In", style: { stroke: "#F59E0B", strokeWidth: 1.5 } },
  { id: "e11", source: "p-78234", target: "ph-9876543210", label: "Linked", style: { stroke: "#06B6D4", strokeDasharray: "4 4" } },
  { id: "e12", source: "p-78234", target: "dv-443322", label: "Uses", style: { stroke: "#EC4899" } },
  { id: "e13", source: "p-19384", target: "p-78234", label: "Communicates", style: { stroke: "#10B981", strokeDasharray: "4 4" } },
];

/**
 * The active case as nodes and edges, in the shape this canvas already renders.
 *
 * Laid out by depth — column per hop from the victim — rather than by a physics
 * simulation. Money has a direction, and a force layout redraws the same case
 * differently on every visit, so "the account on the left" stops meaning
 * anything between two people looking at one screen.
 *
 * Every node here is an account that appears in the reconstructed trail. It
 * cannot show an entity the case does not contain, which was the point.
 */
function graphFromCase(view: NonNullable<ReturnType<typeof useCaseView>>): {
  nodes: Node[];
  edges: Edge[];
} {
  const byDepth = new Map<number, typeof view.nodes>();
  for (const n of view.nodes) {
    byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), n]);
  }

  const nodes: Node[] = view.nodes.map((n) => {
    const column = byDepth.get(n.depth) ?? [];
    const row = column.findIndex((c) => c.id === n.id);
    return {
      id: n.id,
      type: "custom",
      position: { x: 60 + n.depth * 210, y: 60 + row * 130 },
      data: {
        label: n.label,
        sublabel:
          n.role === "VICTIM"
            ? "Victim account"
            : n.role === "TERMINAL"
              ? "Terminal — no onward transfer"
              : `Mule · hop ${n.depth}`,
        type: "account",
        isCentral: n.role === "VICTIM",
        risk: n.role === "TERMINAL" ? "high" : undefined,
      },
    };
  });

  const edges: Edge[] = view.hops.map((h) => ({
    id: h.id,
    source: h.from,
    target: h.to,
    label: formatRupees(h.amount),
    animated: true,
    style: { stroke: "#4A8CD4", strokeWidth: 1.5 },
  }));

  return { nodes, edges };
}

export default function NetworkGraphDashboard() {
  const caseView = useCaseView();
  const fromCase = caseView ? graphFromCase(caseView) : null;

  const [nodes, setNodes, onNodesChange] = useNodesState(
    fromCase?.nodes ?? initialNodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    fromCase?.edges ?? initialEdges,
  );

  // A run started or cleared while this page was mounted replaces the canvas.
  // `useNodesState` seeds once, so without this the graph would keep showing
  // whatever it was initialised with.
  const signature = caseView ? `${caseView.caseRef}:${caseView.hops.length}` : "none";
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    const next = caseView ? graphFromCase(caseView) : { nodes: initialNodes, edges: initialEdges };
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [signature, caseView, setNodes, setEdges]);
  const [activeTab, setActiveTab] = useState<"Graph" | "List" | "Timeline">("Graph");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Filter Checkbox States
  const [entityFilters, setEntityFilters] = useState({
    person: true,
    account: true,
    atm: true,
    branch: true,
    phone: true,
    device: true,
    transaction: true,
  });

  const toggleEntityFilter = (key: keyof typeof entityFilters) => {
    setEntityFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex h-full w-full bg-[#080C14] text-ink-500 font-sans overflow-hidden text-xs">
      {/* Navigation Sidebar */}

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0A0E17]">
        {/* Top Header */}
        <header className="h-14 border-b border-line flex items-center justify-between px-6 bg-paper shrink-0">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              type="text"
              placeholder="Search cases, accounts, locations, or transaction IDs..."
              className="w-full bg-[#121824] border border-line text-xs rounded-lg pl-9 pr-12 py-1.5 text-ink-700 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-raised px-1.5 py-0.5 rounded text-ink-500 font-mono">⌘ K</span>
          </div>

          <div className="flex items-center space-x-4">
            <button className="relative text-ink-500 hover:text-ink-900 p-1.5">
              <Bell className="w-4 h-4" />
              <span className="absolute top-0 right-0 bg-red-500 text-ink-900 text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">12</span>
            </button>
            <div className="flex items-center space-x-3 border-l border-line pl-4">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-ink-900 font-bold border border-slate-600">A</div>
              <div className="text-left leading-none">
                <p className="text-xs font-semibold text-ink-900">Inspector</p>
                <p className="text-[10px] text-ink-500 mt-0.5">Delhi Cyber Cell</p>
              </div>
            </div>
          </div>
        </header>
        <CaseContextBar stage="Network graph" />
        <PipelineRail current="Network" />

        <p className="mx-6 mt-4 rounded-md border border-line bg-surface px-3 py-2 text-[11px] italic text-ink-500">
          Mock network for interface development. Synthetic accounts only.
        </p>

        {/* Workspace Body */}
        <main className="flex-1 flex flex-col min-h-0 p-6 space-y-4 overflow-y-auto">
          {/* Header Title + View Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-ink-900 tracking-tight">Network Graph</h2>
              <p className="text-xs text-ink-500 mt-0.5">Visualize relationships between entities and uncover hidden connections in cybercrime investigations.</p>
            </div>
            <div className="flex items-center space-x-3">
              <button className="flex items-center space-x-1.5 bg-[#101622] hover:bg-raised text-ink-700 border border-line text-xs px-3 py-1.5 rounded-lg font-medium transition-colors">
                <Download className="w-3.5 h-3.5" />
                <span>Export Graph</span>
              </button>
              <div className="flex items-center bg-[#101622] p-1 rounded-lg border border-line">
                <button
                  onClick={() => setActiveTab("Graph")}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    activeTab === "Graph" ? "bg-blue-600 text-ink-900 shadow-md" : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  Graph
                </button>
                <button
                  onClick={() => setActiveTab("List")}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    activeTab === "List" ? "bg-blue-600 text-ink-900 shadow-md" : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setActiveTab("Timeline")}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    activeTab === "Timeline" ? "bg-blue-600 text-ink-900 shadow-md" : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  Timeline
                </button>
              </div>
            </div>
          </div>

          {/* Metric Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
            <MetricCard title="Total Entities" value="2,456" change="+8.4%" isPositive icon={<Network className="w-5 h-5 text-blue-500" />} />
            <MetricCard title="Total Connections" value="6,831" change="+12.7%" isPositive icon={<Network className="w-5 h-5 text-purple-500" />} />
            <MetricCard title="High Risk Entities" value="312" change="+5.2%" isPositive={false} icon={<Shield className="w-5 h-5 text-red-500" />} />
            <MetricCard title="Active Investigations" value="28" change="View all →" isLink icon={<Crosshair className="w-5 h-5 text-emerald-500" />} />
          </div>

          {/* Core Graph Section Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[560px]">
            {/* Left Filter Sidebar */}
            <div className="lg:col-span-3 bg-[#101622] rounded-xl border border-line p-4 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div className="flex items-center space-x-2 text-ink-900 font-semibold">
                    <Filter className="w-3.5 h-3.5 text-blue-500" />
                    <span>Filters</span>
                  </div>
                  <button className="text-blue-400 hover:text-blue-300 text-[11px] font-medium">Reset</button>
                </div>

                {/* Entity Types */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-ink-700 font-medium text-[11px]">Entity Types</span>
                    <button className="text-blue-400 text-[10px]">Select All</button>
                  </div>
                  <div className="space-y-1.5">
                    <FilterCheckbox label="Person" count="412" icon={<User className="w-3.5 h-3.5 text-blue-400" />} checked={entityFilters.person} onChange={() => toggleEntityFilter("person")} />
                    <FilterCheckbox label="Account" count="1,132" icon={<Building2 className="w-3.5 h-3.5 text-emerald-400" />} checked={entityFilters.account} onChange={() => toggleEntityFilter("account")} />
                    <FilterCheckbox label="ATM" count="236" icon={<Landmark className="w-3.5 h-3.5 text-purple-400" />} checked={entityFilters.atm} onChange={() => toggleEntityFilter("atm")} />
                    <FilterCheckbox label="Bank Branch" count="128" icon={<Building className="w-3.5 h-3.5 text-amber-400" />} checked={entityFilters.branch} onChange={() => toggleEntityFilter("branch")} />
                    <FilterCheckbox label="Phone" count="324" icon={<Smartphone className="w-3.5 h-3.5 text-cyan-400" />} checked={entityFilters.phone} onChange={() => toggleEntityFilter("phone")} />
                    <FilterCheckbox label="Device" count="182" icon={<Smartphone className="w-3.5 h-3.5 text-pink-400" />} checked={entityFilters.device} onChange={() => toggleEntityFilter("device")} />
                    <FilterCheckbox label="Transaction" count="1,024" icon={<CreditCard className="w-3.5 h-3.5 text-amber-500" />} checked={entityFilters.transaction} onChange={() => toggleEntityFilter("transaction")} />
                  </div>
                </div>

                {/* Risk Level */}
                <div className="pt-2 border-t border-line">
                  <span className="text-ink-700 font-medium text-[11px] block mb-2">Risk Level</span>
                  <div className="flex items-center space-x-2">
                    <label className="flex-1 flex items-center justify-center space-x-1 bg-red-950/40 border border-red-800/60 rounded py-1 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded accent-red-500 w-3 h-3" />
                      <span className="text-red-400 text-[11px] font-medium">High</span>
                    </label>
                    <label className="flex-1 flex items-center justify-center space-x-1 bg-amber-950/40 border border-amber-800/60 rounded py-1 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded accent-amber-500 w-3 h-3" />
                      <span className="text-amber-400 text-[11px] font-medium">Medium</span>
                    </label>
                    <label className="flex-1 flex items-center justify-center space-x-1 bg-emerald-950/40 border border-emerald-800/60 rounded py-1 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded accent-emerald-500 w-3 h-3" />
                      <span className="text-emerald-400 text-[11px] font-medium">Low</span>
                    </label>
                  </div>
                </div>

                {/* Relationship Types */}
                <div className="pt-2 border-t border-line">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-ink-700 font-medium text-[11px]">Relationship Types</span>
                    <button className="text-blue-400 text-[10px]">Select All</button>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded accent-blue-600 w-3 h-3" />
                        <span className="text-ink-700">Transfers</span>
                      </label>
                      <span className="text-ink-500 font-mono">2,831</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded accent-blue-600 w-3 h-3" />
                        <span className="text-ink-700">Communicates</span>
                      </label>
                      <span className="text-ink-500 font-mono">1,942</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded accent-blue-600 w-3 h-3" />
                        <span className="text-ink-700">Owns / Uses</span>
                      </label>
                      <span className="text-ink-500 font-mono">1,126</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded accent-blue-600 w-3 h-3" />
                        <span className="text-ink-700">Associated With</span>
                      </label>
                      <span className="text-ink-500 font-mono">932</span>
                    </div>
                  </div>
                </div>

                {/* Date Range */}
                <div className="pt-2 border-t border-line">
                  <span className="text-ink-700 font-medium text-[11px] block mb-2">Date Range</span>
                  <div className="flex items-center bg-[#0C101A] border border-line rounded px-2.5 py-1.5 text-ink-700">
                    <span className="text-[11px]">01 Sep 2025 → 05 Sep 2025</span>
                  </div>
                </div>
              </div>

              <button className="w-full bg-blue-600 hover:bg-blue-500 text-ink-900 font-medium py-2 rounded-lg transition-colors mt-4">
                Apply Filters
              </button>
            </div>

            {/* Main Interactive Canvas Area */}
            <div className="lg:col-span-6 bg-[#0B0E17] rounded-xl border border-line relative overflow-hidden flex flex-col min-h-[500px]">
              <div className="flex-1 w-full h-full relative">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  nodeTypes={nodeTypes}
                  fitView
                  className="bg-[#0A0E17]"
                >
                  <Background color="#1E293B" gap={20} size={1} />
                </ReactFlow>

                {/* Overlaid Bottom Left Legend */}
                <div className="absolute bottom-4 left-4 bg-[#0F1522]/90 border border-line rounded-lg p-3 backdrop-blur-md z-10 w-48 space-y-2">
                  <p className="text-[10px] font-bold text-ink-700 uppercase tracking-wider">Legend</p>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                    <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5" />Person</span>
                    <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />Account</span>
                    <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-purple-500 mr-1.5" />ATM</span>
                    <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5" />Bank Branch</span>
                    <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-cyan-500 mr-1.5" />Phone</span>
                    <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-pink-500 mr-1.5" />Device</span>
                    <span className="flex items-center col-span-2"><span className="w-2 h-2 rounded-full bg-amber-600 mr-1.5" />Transaction</span>
                  </div>

                  <div className="border-t border-line pt-1.5 mt-1 space-y-1 text-[10px]">
                    <p className="text-[9px] font-bold text-ink-500 uppercase">Relationship Types (Edge)</p>
                    <div className="flex items-center justify-between text-ink-500">
                      <span>Transfers</span>
                      <span className="w-6 h-0.5 bg-blue-500" />
                    </div>
                    <div className="flex items-center justify-between text-ink-500">
                      <span>Communicates</span>
                      <span className="w-6 border-b border-dashed border-emerald-500" />
                    </div>
                    <div className="flex items-center justify-between text-ink-500">
                      <span>Owns / Uses</span>
                      <span className="w-6 border-b border-dotted border-cyan-500" />
                    </div>
                    <div className="flex items-center justify-between text-ink-500">
                      <span>Associated With</span>
                      <span className="w-6 border-b border-dashed border-slate-500" />
                    </div>
                  </div>
                </div>

                {/* Overlaid Bottom Right Floating Canvas Controls */}
                <div className="absolute bottom-4 right-4 flex flex-col space-y-1 z-10">
                  <button className="w-8 h-8 bg-[#101622] hover:bg-raised border border-line rounded-lg flex items-center justify-center text-ink-700">
                    <Plus className="w-4 h-4" />
                  </button>
                  <button className="w-8 h-8 bg-[#101622] hover:bg-raised border border-line rounded-lg flex items-center justify-center text-ink-700">
                    <Minus className="w-4 h-4" />
                  </button>
                  <button className="w-8 h-8 bg-[#101622] hover:bg-raised border border-line rounded-lg flex items-center justify-center text-ink-700">
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button className="w-8 h-8 bg-[#101622] hover:bg-raised border border-line rounded-lg flex items-center justify-center text-ink-700">
                    <Crosshair className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right Entity Details Sidebar */}
            <div className="lg:col-span-3 bg-[#101622] rounded-xl border border-line p-4 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <h3 className="font-semibold text-ink-900 text-xs">Entity Details</h3>
                  <button className="text-ink-500 hover:text-ink-900">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Profile Header */}
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500 flex items-center justify-center text-blue-400 font-bold text-base">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-ink-900 text-sm">P-78234</span>
                      <span className="bg-raised text-ink-700 text-[10px] px-1.5 py-0.2 rounded">Person</span>
                    </div>
                    <p className="text-xs text-ink-700 font-medium mt-0.5">Rohit Sharma</p>
                  </div>
                </div>

                {/* Risk Status Badges */}
                <div className="flex items-center justify-between bg-[#0C101A] p-2.5 rounded-lg border border-line">
                  <div>
                    <span className="text-[10px] text-ink-500 block">Risk Score</span>
                    <span className="text-red-400 font-bold text-xs flex items-center mt-0.5">
                      <Shield className="w-3 h-3 mr-1 fill-current" /> 92 <span className="text-[10px] ml-1 font-normal">High Risk</span>
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-ink-500 block">Status</span>
                    <span className="bg-emerald-950/40 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-medium inline-block mt-0.5">
                      Under Investigation
                    </span>
                  </div>
                </div>

                {/* Metadata */}
                <div>
                  <h4 className="text-[11px] font-bold text-ink-700 mb-2">Metadata</h4>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between"><span className="text-ink-500">Date of Birth</span><span className="text-ink-700">12 Mar 1992</span></div>
                    <div className="flex justify-between"><span className="text-ink-500">Gender</span><span className="text-ink-700">Male</span></div>
                    <div className="flex justify-between"><span className="text-ink-500">Mobile</span><span className="text-ink-700 font-mono">+91 98765 43210</span></div>
                    <div className="flex justify-between"><span className="text-ink-500">Email</span><span className="text-ink-700">rohit.sharma92@gmail.com</span></div>
                    <div className="flex justify-between"><span className="text-ink-500">Address</span><span className="text-ink-700">Laxmi Nagar, Delhi, India</span></div>
                    <div className="flex justify-between">
                      <span className="text-ink-500">KYC Status</span>
                      <span className="text-emerald-400 flex items-center"><CheckCircle2 className="w-3 h-3 mr-1" /> Verified</span>
                    </div>
                  </div>
                </div>

                {/* Connected Entities */}
                <div className="pt-2 border-t border-line">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-[11px] font-bold text-ink-700">Connected Entities (7)</h4>
                    <button className="text-blue-400 text-[10px]">View All</button>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between items-center"><span className="flex items-center text-ink-500"><Building2 className="w-3 h-3 text-emerald-400 mr-2" /> Accounts</span><span className="text-ink-700 font-mono">4</span></div>
                    <div className="flex justify-between items-center"><span className="flex items-center text-ink-500"><Smartphone className="w-3 h-3 text-cyan-400 mr-2" /> Phone Numbers</span><span className="text-ink-700 font-mono">2</span></div>
                    <div className="flex justify-between items-center"><span className="flex items-center text-ink-500"><Smartphone className="w-3 h-3 text-pink-400 mr-2" /> Devices</span><span className="text-ink-700 font-mono">1</span></div>
                    <div className="flex justify-between items-center"><span className="flex items-center text-ink-500"><Landmark className="w-3 h-3 text-purple-400 mr-2" /> ATMs</span><span className="text-ink-700 font-mono">3</span></div>
                    <div className="flex justify-between items-center"><span className="flex items-center text-ink-500"><CreditCard className="w-3 h-3 text-amber-500 mr-2" /> Transactions</span><span className="text-ink-700 font-mono">12</span></div>
                    <div className="flex justify-between items-center"><span className="flex items-center text-ink-500"><User className="w-3 h-3 text-blue-400 mr-2" /> Persons</span><span className="text-ink-700 font-mono">2</span></div>
                    <div className="flex justify-between items-center"><span className="flex items-center text-ink-500"><Building className="w-3 h-3 text-amber-400 mr-2" /> Bank Branches</span><span className="text-ink-700 font-mono">1</span></div>
                  </div>
                </div>

                {/* Recent Activity Timeline */}
                <div className="pt-2 border-t border-line">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-[11px] font-bold text-ink-700">Recent Activity</h4>
                    <button className="text-blue-400 text-[10px]">View All</button>
                  </div>
                  <div className="space-y-2 text-[10px]">
                    <ActivityItem text="₹75,000 transferred to A-9988776655" date="05 Sep 2025, 10:24 AM" dotColor="bg-amber-500" />
                    <ActivityItem text="Cash withdrawn at ATM-4412" date="05 Sep 2025, 09:18 AM" dotColor="bg-[#F59E0B]" />
                    <ActivityItem text="Login from Device DV-443322" date="05 Sep 2025, 08:42 AM" dotColor="bg-red-500" />
                    <ActivityItem text="Call with +91 91234 56789 (Incoming)" date="05 Sep 2025, 07:30 AM" dotColor="bg-emerald-500" />
                  </div>
                </div>
              </div>

              <button className="w-full bg-blue-600 hover:bg-blue-500 text-ink-900 font-medium py-2 rounded-lg transition-colors flex items-center justify-center space-x-1.5 mt-4">
                <span>View Full Profile</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// --- Helper Components ---

function NavItem({ icon, label, active, badge }: { icon: React.ReactNode; label: string; active?: boolean; badge?: string }) {
  return (
    <a
      href="#"
      className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
        active
          ? "bg-blue-600/15 text-blue-400 font-medium border-l-2 border-blue-500"
          : "text-ink-500 hover:bg-raised hover:text-ink-900"
      }`}
    >
      <div className="flex items-center space-x-3">
        {icon}
        <span>{label}</span>
      </div>
      {badge && <span className="bg-red-600 text-ink-900 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{badge}</span>}
    </a>
  );
}

function MetricCard({ title, value, change, isPositive, isLink, icon }: { title: string; value: string; change: string; isPositive?: boolean; isLink?: boolean; icon: React.ReactNode }) {
  return (
    <div className="bg-[#101622] p-4 rounded-xl border border-line flex items-center space-x-4">
      <div className="p-3 bg-raised rounded-lg">{icon}</div>
      <div>
        <p className="text-lg font-bold text-ink-900">{value}</p>
        <p className="text-xs text-ink-500">{title}</p>
        {isLink ? (
          <p className="text-[11px] mt-0.5 text-blue-400 hover:underline cursor-pointer">{change}</p>
        ) : (
          <p className={`text-[11px] mt-0.5 flex items-center ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
            {isPositive ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
            {change} <span className="text-ink-500 ml-1">vs last 7 days</span>
          </p>
        )}
      </div>
    </div>
  );
}

function FilterCheckbox({ label, count, icon, checked, onChange }: { label: string; count: string; icon: React.ReactNode; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <label className="flex items-center space-x-2 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={onChange} className="rounded accent-blue-600 w-3 h-3" />
        <span className="flex items-center text-ink-700">
          <span className="mr-1.5">{icon}</span> {label}
        </span>
      </label>
      <span className="text-ink-500 font-mono">{count}</span>
    </div>
  );
}

function ActivityItem({ text, date, dotColor }: { text: string; date: string; dotColor: string }) {
  return (
    <div className="flex items-start space-x-2">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-1 shrink-0`} />
      <div>
        <p className="text-ink-700 leading-tight">{text}</p>
        <p className="text-[9px] text-ink-500 mt-0.5">{date}</p>
      </div>
    </div>
  );
}