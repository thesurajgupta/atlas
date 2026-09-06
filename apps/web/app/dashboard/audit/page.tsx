'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
interface AuditLog {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  timestamp: string;
  affectedRecord: string;
  status: 'Allowed' | 'Denied';
}

const mockLogs: AuditLog[] = [
  {
    id: 'AUD-2025-0001',
    actorName: 'Inspector Rajesh',
    actorRole: 'Delhi Cyber Cell',
    action: 'Exported Case Evidence Package',
    timestamp: '05 Sep 2025, 10:45 AM',
    affectedRecord: 'CASE-8821',
    status: 'Allowed',
  },
  {
    id: 'AUD-2025-0002',
    actorName: 'SI Kavita Singh',
    actorRole: 'Delhi Cyber Cell',
    action: 'Attempted to Delete Audit Log Record',
    timestamp: '05 Sep 2025, 09:30 AM',
    affectedRecord: 'LOG-0041',
    status: 'Denied',
  },
  {
    id: 'AUD-2025-0003',
    actorName: 'HC Arvind',
    actorRole: 'Delhi Cyber Cell',
    action: 'Updated Alert Status to Under Review',
    timestamp: '04 Sep 2025, 06:33 PM',
    affectedRecord: 'ALT-2025-0005',
    status: 'Allowed',
  },
  {
    id: 'AUD-2025-0004',
    actorName: 'SI Meera',
    actorRole: 'Delhi Cyber Cell',
    action: 'Flagged IP Address for Threat Intelligence',
    timestamp: '03 Sep 2025, 10:45 AM',
    affectedRecord: 'IP: 103.211.55.22',
    status: 'Allowed',
  },
  {
    id: 'AUD-2025-0005',
    actorName: 'Inspector Rajesh',
    actorRole: 'Delhi Cyber Cell',
    action: 'Access Attempt to Restricted Account Data',
    timestamp: '03 Sep 2025, 08:12 AM',
    affectedRecord: 'A/C XXXX6789',
    status: 'Denied',
  },
];



export default function AtlasLayout() {
  const [activeTab, setActiveTab] = useState<'summary' | 'evidence' | 'audit'>('audit');

  return (
    <div className="flex h-screen bg-[#070A12] text-slate-100 font-sans antialiased overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-800/80 px-8 flex items-center justify-between bg-[#070A12]/80 backdrop-blur sticky top-0 z-10">
          <div className="w-96 relative">
            <input
              type="text"
              placeholder="Search cases, accounts, locations, or transaction IDs..."
              className="w-full bg-[#0E1320] text-xs text-slate-200 rounded-md py-2 pl-3 pr-10 border border-slate-800 focus:outline-none focus:border-blue-500"
            />
            <span className="absolute right-2.5 top-2 text-[10px] font-mono text-slate-500 border border-slate-700 rounded px-1">
              ⌘ K
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <button className="relative p-2 text-slate-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 01-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center">
                12
              </span>
            </button>
            <div className="flex items-center space-x-2 border-l border-slate-800 pl-4">
              <div className="w-8 h-8 rounded-full bg-slate-700 text-xs flex items-center justify-center font-bold text-slate-200">
                A
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Inspector</div>
                <div className="text-[10px] text-slate-400">Delhi Cyber Cell</div>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content Workspace */}
        <main className="p-8 space-y-6">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Case Overview & Action Log</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitor operational events and action trails within ATLAS.
            </p>
          </div>

          {/* Permanent Co-Equal Navigation Tabs */}
          <div className="border-b border-slate-800">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('summary')}
                className={`pb-3 px-1 inline-flex items-center border-b-2 font-medium text-xs transition-colors ${
                  activeTab === 'summary'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setActiveTab('evidence')}
                className={`pb-3 px-1 inline-flex items-center border-b-2 font-medium text-xs transition-colors ${
                  activeTab === 'evidence'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Evidence
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`pb-3 px-1 inline-flex items-center border-b-2 font-medium text-xs transition-colors ${
                  activeTab === 'audit'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Audit
              </button>
            </nav>
          </div>

          {/* Active Tab Views */}
          {activeTab === 'summary' && (
            <div className="bg-[#0E1320] border border-slate-800 rounded-lg p-6 text-xs text-slate-400">
              Summary Details View Panel
            </div>
          )}

          {activeTab === 'evidence' && (
            <div className="bg-[#0E1320] border border-slate-800 rounded-lg p-6 text-xs text-slate-400">
              Evidence Collection View Panel
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="bg-[#0E1320] border border-slate-800 rounded-lg overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider">Action Audit Trail</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Strict record of user actions and authorization states. Internal debug tools excluded.
                  </p>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  Showing 1 to 5 of 5 logs
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#0B0F19] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                      <th scope="col" className="px-6 py-3">Actor (Who)</th>
                      <th scope="col" className="px-6 py-3">Action Taken</th>
                      <th scope="col" className="px-6 py-3">Affected Record</th>
                      <th scope="col" className="px-6 py-3">Timestamp</th>
                      <th scope="col" className="px-6 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {mockLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-6 py-3.5 whitespace-nowrap">
                          <div className="font-medium text-white">{log.actorName}</div>
                          <div className="text-[10px] text-slate-500">{log.actorRole}</div>
                        </td>
                        <td className="px-6 py-3.5 text-slate-200">{log.action}</td>
                        <td className="px-6 py-3.5 whitespace-nowrap font-mono text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/80">
                            {log.affectedRecord}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-slate-400 text-[11px]">
                          {log.timestamp}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              log.status === 'Allowed'
                                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                                : 'bg-rose-950/40 text-rose-400 border-rose-800/50'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}