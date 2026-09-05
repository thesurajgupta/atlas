'use client';

import React, { useState, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import {
  Search, MapPin, AlertTriangle, Building2, Store, Target, BarChart2,
  ExternalLink, Navigation, Compass, SlidersHorizontal, Map as MapIcon, List, Bell
} from 'lucide-react';

type LocationData = {
  id: string;
  name: string;
  type: 'ATM' | 'Branch';
  bank: string;
  address: string;
  coords: string;
  riskScore: number;
  riskLevel: 'High' | 'Medium' | 'Low';
  predicted: boolean;
  distance: string;
  topFactors: { factor: string; points: number }[];
  activity: { date: string; amount: string; status: 'Suspicious' | 'Under Review' | 'Normal' }[];
};

const MOCK_LOCATIONS: LocationData[] = [
  {
    id: 'SBI_DEL_0783',
    name: 'SBI ATM – Connaught Place',
    type: 'ATM',
    bank: 'State Bank of India',
    address: 'Block A, Connaught Place, New Delhi – 110001',
    coords: '28.6315, 77.2167',
    riskScore: 92,
    riskLevel: 'High',
    predicted: true,
    distance: '2.4 km',
    topFactors: [
      { factor: 'Multiple mule accounts linked', points: 25 },
      { factor: 'High-value cash withdrawals', points: 20 },
      { factor: 'Transactions in short time frame', points: 18 },
      { factor: 'Matches known mule pattern', points: 15 },
    ],
    activity: [
      { date: '05 Sep, 10:24 AM', amount: '₹40,000', status: 'Suspicious' },
      { date: '05 Sep, 09:18 AM', amount: '₹25,000', status: 'Suspicious' },
      { date: '04 Sep, 07:11 PM', amount: '₹50,000', status: 'Under Review' },
      { date: '04 Sep, 06:33 PM', amount: '₹20,000', status: 'Normal' },
    ],
  },
  {
    id: 'HDFC_DEL_1092',
    name: 'HDFC ATM – Karol Bagh',
    type: 'ATM',
    bank: 'HDFC Bank',
    address: 'Padam Singh Rd, Karol Bagh, New Delhi – 110005',
    coords: '28.6518, 77.1906',
    riskScore: 78,
    riskLevel: 'High',
    predicted: true,
    distance: '4.8 km',
    topFactors: [
      { factor: 'Rapid sequential withdrawals', points: 30 },
      { factor: 'Linked to flagged FIR #882', points: 25 },
      { factor: 'Off-hours high activity', points: 12 },
    ],
    activity: [
      { date: '05 Sep, 08:12 AM', amount: '₹50,000', status: 'Suspicious' },
      { date: '05 Sep, 08:05 AM', amount: '₹50,000', status: 'Suspicious' },
      { date: '03 Sep, 02:15 PM', amount: '₹10,000', status: 'Normal' },
    ],
  },
  {
    id: 'PNB_DEL_4012',
    name: 'PNB Branch – Laxmi Nagar',
    type: 'Branch',
    bank: 'Punjab National Bank',
    address: 'Vikas Marg, Laxmi Nagar, New Delhi – 110092',
    coords: '28.6304, 77.2774',
    riskScore: 64,
    riskLevel: 'Medium',
    predicted: false,
    distance: '6.1 km',
    topFactors: [
      { factor: 'Unusual OTC cash withdrawal volume', points: 20 },
      { factor: 'New account rapid drain', points: 18 },
    ],
    activity: [
      { date: '05 Sep, 11:30 AM', amount: '₹1,20,000', status: 'Under Review' },
      { date: '04 Sep, 03:20 PM', amount: '₹80,000', status: 'Suspicious' },
    ],
  },
  {
    id: 'ICICI_NOI_0881',
    name: 'ICICI ATM – Noida Sector 18',
    type: 'ATM',
    bank: 'ICICI Bank',
    address: 'Sector 18 Market, Noida – 201301',
    coords: '28.5708, 77.3261',
    riskScore: 58,
    riskLevel: 'Medium',
    predicted: true,
    distance: '12.3 km',
    topFactors: [
      { factor: 'Geographic discrepancy with cardholder', points: 22 },
      { factor: 'ATM cluster anomaly', points: 14 },
    ],
    activity: [
      { date: '05 Sep, 01:10 PM', amount: '₹35,000', status: 'Suspicious' },
      { date: '05 Sep, 09:00 AM', amount: '₹15,000', status: 'Normal' },
    ],
  },
];

export default function WebApp() {
  const [selectedBank, setSelectedBank] = useState<string>('All');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('01 Sep - 05 Sep');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('SBI_DEL_0783');

  const [layers, setLayers] = useState({
    highRisk: true,
    mediumRisk: true,
    atms: true,
    branches: true,
  });

  const filteredLocations = useMemo(() => {
    return MOCK_LOCATIONS.filter((loc) => {
      if (selectedBank !== 'All' && loc.bank !== selectedBank) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        if (!loc.name.toLowerCase().includes(q) && !loc.id.toLowerCase().includes(q)) return false;
      }
      if (!layers.highRisk && loc.riskLevel === 'High') return false;
      if (!layers.mediumRisk && loc.riskLevel === 'Medium') return false;
      if (!layers.atms && loc.type === 'ATM') return false;
      if (!layers.branches && loc.type === 'Branch') return false;
      return true;
    });
  }, [selectedBank, searchQuery, layers]);

  const activeLocation = useMemo(() => {
    return MOCK_LOCATIONS.find((l) => l.id === selectedLocationId) || filteredLocations[0] || MOCK_LOCATIONS[0];
  }, [selectedLocationId, filteredLocations]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0b0e14] text-slate-200 text-xs">
      <Sidebar />

      <main className="flex-1 flex flex-col p-4 overflow-hidden gap-3">
        {/* HEADER */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">ATM / Branch Map</h1>
            <p className="text-[11px] text-slate-400">View actual and predicted cash-out locations from transaction analysis</p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search case, location, ATM ID..."
                className="w-full bg-[#161c26] border border-slate-700/60 rounded-lg pl-8 pr-10 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              className="bg-[#161c26] border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="01 Sep - 05 Sep">📅 01 Sep - 05 Sep 2025</option>
              <option value="25 Aug - 31 Aug">📅 25 Aug - 31 Aug 2025</option>
            </select>

            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="bg-[#161c26] border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="All">All Banks</option>
              <option value="State Bank of India">SBI</option>
              <option value="HDFC Bank">HDFC</option>
              <option value="Punjab National Bank">PNB</option>
              <option value="ICICI Bank">ICICI</option>
            </select>

            <button className="bg-[#161c26] border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-slate-300 flex items-center gap-1.5 hover:bg-slate-800">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
            </button>

            <div className="bg-[#161c26] border border-slate-700/60 p-1 rounded-lg flex items-center gap-1">
              <button className="bg-blue-600 text-white px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                <MapIcon className="w-3 h-3" /> Map
              </button>
              <button className="text-slate-400 px-2 py-0.5 rounded flex items-center gap-1 hover:text-white">
                <List className="w-3 h-3" /> List
              </button>
            </div>

            <div className="relative ml-2">
              <Bell className="w-4 h-4 text-slate-400 cursor-pointer" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">12</span>
            </div>
          </div>
        </header>

        {/* METRICS ROW */}
        <div className="grid grid-cols-6 gap-2.5">
          {[
            { label: 'Total Locations', val: filteredLocations.length * 400 + 242, icon: MapPin, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'High Risk Locations', val: filteredLocations.filter(l => l.riskLevel === 'High').length * 70 + 4, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
            { label: 'ATMs', val: filteredLocations.filter(l => l.type === 'ATM').length * 300, icon: Building2, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
            { label: 'Bank Branches', val: filteredLocations.filter(l => l.type === 'Branch').length * 150, icon: Store, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
            { label: 'Predicted (Today)', val: filteredLocations.filter(l => l.predicted).length * 19, icon: Target, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="bg-[#121721] border border-slate-800/80 rounded-lg p-2.5 flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${m.bg}`}>
                  <Icon className={`w-4 h-4 ${m.color}`} />
                </div>
                <div>
                  <p className="text-base font-bold text-white">{m.val}</p>
                  <p className="text-[10px] text-slate-400 leading-none">{m.label}</p>
                </div>
              </div>
            );
          })}
          <button className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-2 flex items-center justify-center gap-1.5 hover:bg-blue-900/30">
            <BarChart2 className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-blue-400 text-xs">Analytics</span>
          </button>
        </div>

        {/* DASHBOARD CONTENT GRID */}
        <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
          
          {/* MAP CANVAS */}
          <div className="col-span-8 bg-[#121721] border border-slate-800/80 rounded-xl relative overflow-hidden flex flex-col justify-between p-3">
            <div className="absolute top-3 left-3 bg-[#0f141d]/90 backdrop-blur border border-slate-800 rounded-lg p-2.5 w-48 text-[11px] z-20 space-y-1.5 shadow-xl">
              <p className="font-semibold text-slate-300 border-b border-slate-800 pb-1 text-[10px] uppercase">Show on Map</p>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input type="checkbox" checked={layers.highRisk} onChange={(e) => setLayers({ ...layers, highRisk: e.target.checked })} className="accent-red-500 rounded" />
                <span className="w-2 h-2 rounded-full bg-red-500"></span> High Risk
              </label>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input type="checkbox" checked={layers.mediumRisk} onChange={(e) => setLayers({ ...layers, mediumRisk: e.target.checked })} className="accent-amber-500 rounded" />
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Medium Risk
              </label>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input type="checkbox" checked={layers.atms} onChange={(e) => setLayers({ ...layers, atms: e.target.checked })} className="accent-blue-500 rounded" />
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> ATMs
              </label>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input type="checkbox" checked={layers.branches} onChange={(e) => setLayers({ ...layers, branches: e.target.checked })} className="accent-emerald-500 rounded" />
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Branches
              </label>
            </div>

            <div className="absolute inset-0 bg-[#0a0d13] flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px] opacity-40" />
              {filteredLocations.map((loc, idx) => {
                const isSelected = loc.id === activeLocation.id;
                const topOffsets = ['top-1/3 left-1/2', 'top-1/4 left-1/3', 'top-1/2 left-2/3', 'top-2/3 left-1/4'];
                return (
                  <button
                    key={loc.id}
                    onClick={() => setSelectedLocationId(loc.id)}
                    className={`absolute ${topOffsets[idx % topOffsets.length]} transform -translate-x-1/2 -translate-y-1/2 group transition-all z-10`}
                  >
                    <div className={`relative flex items-center justify-center p-2 rounded-full ${
                      loc.riskLevel === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    } ${isSelected ? 'ring-2 ring-blue-400 scale-125' : 'hover:scale-110'}`}>
                      <MapPin className="w-5 h-5 fill-current" />
                      {loc.predicted && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-500 animate-ping" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="relative z-10 self-end bg-[#0f141d]/80 backdrop-blur px-2 py-1 rounded text-[10px] text-slate-500">
              Interactive Map • Active Location: {activeLocation.name}
            </div>
          </div>

          {/* PREDICTED LOCATIONS SIDEBAR */}
          <div className="col-span-4 bg-[#121721] border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-semibold text-white">Predicted Cash-Out Locations</h2>
                <span className="text-[10px] text-blue-400">{filteredLocations.length} Listed</span>
              </div>

              <div className="space-y-1.5 overflow-y-auto max-h-[220px] pr-1">
                {filteredLocations.map((item, idx) => {
                  const isSelected = item.id === activeLocation.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedLocationId(item.id)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-600/20 border border-blue-500/40'
                          : 'bg-[#161c26]/60 border border-slate-800/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-[10px] w-3">{idx + 1}</span>
                        <div>
                          <p className="text-slate-200 font-medium leading-tight">{item.name}</p>
                          <p className="text-[10px] text-slate-500">{item.type} • {item.distance}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-bold text-[11px] ${item.riskLevel === 'High' ? 'text-red-400' : 'text-amber-400'}`}>{item.riskScore}%</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                          item.riskLevel === 'High' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {item.riskLevel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ACTIVE LOCATION INFO CARD */}
          <div className="col-span-8 grid grid-cols-12 gap-3">
            <div className="col-span-6 bg-[#121721] border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-white text-sm">{activeLocation.name}</span>
                  <div className="flex gap-1">
                    <span className="bg-red-500/20 text-red-400 text-[9px] px-1.5 py-0.5 rounded font-semibold border border-red-500/30">
                      {activeLocation.riskLevel} Risk
                    </span>
                  </div>
                </div>

                <p className="text-slate-400 text-[11px]">📍 {activeLocation.address}</p>
                <p className="text-slate-400 text-[11px] mb-2">🏦 {activeLocation.bank}</p>

                <div className="grid grid-cols-2 bg-[#161c26] p-2 rounded-lg border border-slate-800 mb-2">
                  <div>
                    <p className="text-[9px] text-slate-500">ATM ID</p>
                    <p className="text-slate-200 font-medium">{activeLocation.id}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500">Coordinates</p>
                    <p className="text-slate-200 font-medium">{activeLocation.coords}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-1.5">
                <button className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded-lg font-medium flex items-center justify-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Investigation
                </button>
                <button className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> Directions
                </button>
                <button className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1">
                  <Compass className="w-3 h-3" /> Nearby
                </button>
              </div>
            </div>

            {/* RISK BREAKDOWN */}
            <div className="col-span-6 bg-[#121721] border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
              <h3 className="font-semibold text-slate-300">Risk Analysis Breakdown</h3>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full" viewBox="0 0 36 36">
                    <path className="text-slate-800" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="text-red-500" strokeDasharray={`${activeLocation.riskScore}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-base font-bold text-white">{activeLocation.riskScore}%</span>
                    <p className="text-[8px] text-slate-400">Score</p>
                  </div>
                </div>

                <div className="space-y-1 flex-1">
                  {activeLocation.topFactors.map((f, i) => (
                    <div key={i} className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-300 truncate max-w-[150px]">{f.factor}</span>
                      <span className="text-red-400 font-bold">+{f.points}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ACTIVITY LOG TABLE */}
          <div className="col-span-4 bg-[#121721] border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-white">Recent Transactions</h3>
                <span className="text-[10px] text-slate-500">{selectedTimeframe}</span>
              </div>

              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800 text-[9px] uppercase">
                    <th className="pb-1.5">Date & Time</th>
                    <th className="pb-1.5">Amount</th>
                    <th className="pb-1.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activeLocation.activity.map((row, idx) => (
                    <tr key={idx} className="text-slate-300">
                      <td className="py-1.5 text-[10px]">{row.date}</td>
                      <td className="py-1.5 font-medium">{row.amount}</td>
                      <td className="py-1.5 text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                          row.status === 'Suspicious' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}