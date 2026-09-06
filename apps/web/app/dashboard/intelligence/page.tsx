'use client';

import { useState } from 'react';

interface OutboundInstruction {
  id: string;
  type: 'Bank Request' | 'Case Hand-off';
  recipient: {
    name: string;
    organization: string;
  };
  details: string;
  targetRecord: string;
  sentTimestamp: string;
  expiryTimestamp: string;
  isLive: boolean;
  recipientStatus: 'Acknowledged' | 'Action Taken' | 'Pending' | 'Rejected';
  actionDetails?: string;
  auditTrail: {
    timestamp: string;
    actor: string;
    event: string;
  }[];
}

const initialInstructions: OutboundInstruction[] = [
  {
    id: 'OUT-2025-0891',
    type: 'Bank Request',
    recipient: {
      name: 'Nodal Officer - Fraud Cell',
      organization: 'HDFC Bank',
    },
    details: 'Lien/Freeze Request on Beneficiary Account',
    targetRecord: 'A/C XXXX6789',
    sentTimestamp: '05 Sep 2025, 08:30 AM',
    expiryTimestamp: '08 Sep 2025, 08:30 AM',
    isLive: true,
    recipientStatus: 'Action Taken',
    actionDetails: 'Account placed under debit freeze. $14,200 withheld.',
    auditTrail: [
      { timestamp: '05 Sep 2025, 08:30 AM', actor: 'Inspector Rajesh', event: 'Instruction dispatched via secure gateway.' },
      { timestamp: '05 Sep 2025, 08:45 AM', actor: 'HDFC Gateway', event: 'Delivery receipt acknowledged by recipient system.' },
      { timestamp: '05 Sep 2025, 10:12 AM', actor: 'Nodal Officer', event: 'Action status updated to Action Taken.' },
    ],
  },
  {
    id: 'OUT-2025-0890',
    type: 'Case Hand-off',
    recipient: {
      name: 'Cyber Crime Unit',
      organization: 'Karnataka Police Dept',
    },
    details: 'Inter-State Jurisdiction Case Transfer & File Hand-off',
    targetRecord: 'CASE-8821',
    sentTimestamp: '04 Sep 2025, 02:15 PM',
    expiryTimestamp: '11 Sep 2025, 02:15 PM',
    isLive: true,
    recipientStatus: 'Acknowledged',
    actionDetails: 'IO Assigned: Inspector V. Sharma.',
    auditTrail: [
      { timestamp: '04 Sep 2025, 02:15 PM', actor: 'SI Kavita Singh', event: 'Hand-off dossier transmitted.' },
      { timestamp: '04 Sep 2025, 03:00 PM', actor: 'KA Police Hub', event: 'Receipt confirmed by supervisor.' },
    ],
  },
];

export default function AtlasOutboxPage() {
  const [instructions, setInstructions] = useState<OutboundInstruction[]>(initialInstructions);
  const [filterType, setFilterType] = useState<'All' | 'Bank Request' | 'Case Hand-off'>('All');
  
  // Modal & Drawer State Management
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [selectedAuditEntry, setSelectedAuditEntry] = useState<OutboundInstruction | null>(null);

  // Form State
  const [formType, setFormType] = useState<'Bank Request' | 'Case Hand-off'>('Bank Request');
  const [formRecipientName, setFormRecipientName] = useState('');
  const [formOrg, setFormOrg] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formRecord, setFormRecord] = useState('');

  const handleCreateInstruction = (e: React.FormEvent) => {
    e.preventDefault();
    const newEntry: OutboundInstruction = {
      id: `OUT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      type: formType,
      recipient: {
        name: formRecipientName || 'Nodal Desk',
        organization: formOrg || 'Target Entity',
      },
      details: formDetails || 'Standard Information Requisition',
      targetRecord: formRecord || 'RECORD-0000',
      sentTimestamp: '06 Sep 2026, 06:17 PM',
      expiryTimestamp: '09 Sep 2026, 06:17 PM',
      isLive: true,
      recipientStatus: 'Pending',
      actionDetails: 'Transmission dispatched. Awaiting recipient response.',
      auditTrail: [
        { timestamp: '06 Sep 2026, 06:17 PM', actor: 'Inspector (Active User)', event: 'Instruction initiated and dispatched.' },
      ],
    };

    setInstructions([newEntry, ...instructions]);
    setIsIssueModalOpen(false);
    // Reset Form
    setFormRecipientName('');
    setFormOrg('');
    setFormDetails('');
    setFormRecord('');
  };

  const filteredData = instructions.filter((item) => {
    return filterType === 'All' || item.type === filterType;
  });

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-100 font-sans p-8 relative">
      {/* Top Header Title */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded">
              / intelligence / outbox
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">Outward Instructions</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Track external transmissions, active instruction validity, and recipient action status.
          </p>
        </div>

        <button
          onClick={() => setIsIssueModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-md text-xs font-medium transition-colors flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Issue Instruction</span>
        </button>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-[#0E1320] border border-slate-800 rounded-lg p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-xs text-slate-400 font-medium">Type:</span>
          {(['All', 'Bank Request', 'Case Hand-off'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                filterType === type
                  ? 'bg-slate-700 text-white font-medium'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Outbox Data Table */}
      <div className="bg-[#0E1320] border border-slate-800 rounded-lg overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B0F19] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th scope="col" className="px-6 py-3.5">Instruction ID & Type</th>
                <th scope="col" className="px-6 py-3.5">Recipient & Entity</th>
                <th scope="col" className="px-6 py-3.5">Instruction Details</th>
                <th scope="col" className="px-6 py-3.5">Validity Status</th>
                <th scope="col" className="px-6 py-3.5">Recipient Action</th>
                <th scope="col" className="px-6 py-3.5 text-right">Action Log</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-mono text-white font-medium">{item.id}</div>
                    <span
                      className={`inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded border ${
                        item.type === 'Bank Request'
                          ? 'bg-indigo-950/50 text-indigo-300 border-indigo-800/60'
                          : 'bg-cyan-950/50 text-cyan-300 border-cyan-800/60'
                      }`}
                    >
                      {item.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-200">{item.recipient.name}</div>
                    <div className="text-[11px] text-slate-400">{item.recipient.organization}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-200 font-medium">{item.details}</div>
                    <div className="mt-1 font-mono text-[11px]">
                      <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded">
                        {item.targetRecord}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-1.5">
                      <span className={`h-2 w-2 rounded-full ${item.isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      <span className={`font-semibold text-[11px] ${item.isLive ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {item.isLive ? 'LIVE' : 'EXPIRED'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Sent: {item.sentTimestamp}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        item.recipientStatus === 'Action Taken'
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                          : item.recipientStatus === 'Acknowledged'
                          ? 'bg-blue-950/40 text-blue-400 border-blue-800/50'
                          : 'bg-amber-950/40 text-amber-400 border-amber-800/50'
                      }`}
                    >
                      {item.recipientStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => setSelectedAuditEntry(item)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium underline underline-offset-4"
                    >
                      View Receipt & Audit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Issue New Outward Instruction */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E1320] border border-slate-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Initiate Outward Instruction</h3>
              <button onClick={() => setIsIssueModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCreateInstruction} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Instruction Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                  className="w-full bg-[#070A12] border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="Bank Request">Bank Request (Lien/Freeze/Statement)</option>
                  <option value="Case Hand-off">Case Hand-off (Transfer/Referral)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Recipient Name/Desk</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Nodal Officer - Fraud Desk"
                    value={formRecipientName}
                    onChange={(e) => setFormRecipientName(e.target.value)}
                    className="w-full bg-[#070A12] border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Organization</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Axis Bank / ED Office"
                    value={formOrg}
                    onChange={(e) => setFormOrg(e.target.value)}
                    className="w-full bg-[#070A12] border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Affected Record / ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. A/C XXXX9012 or CASE-7710"
                  value={formRecord}
                  onChange={(e) => setFormRecord(e.target.value)}
                  className="w-full bg-[#070A12] border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Instruction Details</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide precise details of the action required..."
                  value={formDetails}
                  onChange={(e) => setFormDetails(e.target.value)}
                  className="w-full bg-[#070A12] border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsIssueModalOpen(false)}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-500">
                  Dispatch Instruction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER: Specific Entry Receipt & Audit View */}
      {selectedAuditEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-[#0E1320] border-l border-slate-800 h-full p-6 overflow-y-auto flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                <div>
                  <span className="text-[10px] font-mono bg-blue-950 text-blue-400 border border-blue-800 px-2 py-0.5 rounded">
                    {selectedAuditEntry.id}
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">Receipt & Delivery Audit</h3>
                </div>
                <button onClick={() => setSelectedAuditEntry(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              {/* Receipt Summary */}
              <div className="space-y-3 bg-[#070A12] p-4 rounded-lg border border-slate-800 mb-6 text-xs">
                <div>
                  <div className="text-slate-500 text-[10px]">RECIPIENT</div>
                  <div className="text-slate-200 font-medium">{selectedAuditEntry.recipient.name}</div>
                  <div className="text-slate-400">{selectedAuditEntry.recipient.organization}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[10px]">AFFECTED RECORD</div>
                  <div className="font-mono text-slate-300">{selectedAuditEntry.targetRecord}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[10px]">LATEST RECIPIENT FEEDBACK</div>
                  <div className="text-emerald-400 font-medium mt-0.5">{selectedAuditEntry.actionDetails}</div>
                </div>
              </div>

              {/* Specific Audit Timeline */}
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Transmission History</h4>
              <div className="space-y-4 relative border-l-2 border-slate-800 pl-4 ml-2 text-xs">
                {selectedAuditEntry.auditTrail.map((log, index) => (
                  <div key={index} className="relative">
                    <span className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-[#0E1320]" />
                    <div className="text-slate-400 text-[10px] font-mono">{log.timestamp}</div>
                    <div className="text-slate-200 font-medium">{log.event}</div>
                    <div className="text-slate-500 text-[10px]">Actor: {log.actor}</div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setSelectedAuditEntry(null)}
              className="w-full mt-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium"
            >
              Close Receipt Drawer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}