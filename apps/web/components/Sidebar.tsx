import React from 'react';
import { 
  LayoutDashboard, FilePlus, Briefcase, Search, GitFork, Network, 
  MapPin, Radio, AlertTriangle, FileText, Users, Settings 
} from 'lucide-react';

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "New Complaint", icon: FilePlus, href: "/dashboard/new-complaint" },
  { label: "Cases", icon: Briefcase, href: "/dashboard/cases" },
  { label: "Investigation", icon: Search, href: "/dashboard/investigation" },
  { label: "Transaction Trail", icon: GitFork, href: "/dashboard/transaction-trail" },
  { label: "Network Graph", icon: Network, href: "/dashboard/network-graph" },
  { label: "ATM / Branch Map", icon: MapPin, href: "/dashboard/ATM-BranchMap", active: true },
  { label: "Predicted Locations", icon: Radio, href: "/dashboard/predicted-locations" },
  { label: "Alerts", icon: AlertTriangle, href: "/dashboard/alerts", badge: "12" },
  { label: "Reports", icon: FileText, href: "/dashboard/reports" },
  { label: "Users", icon: Users, href: "/dashboard/users" },
  { label: "Settings", icon: Settings, href: "/dashboard/settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-60 bg-[#0f141d] border-r border-slate-800/80 flex flex-col justify-between p-3 shrink-0">
      <div>
        <div className="flex items-center gap-2.5 px-2 mb-6">
          <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center">
            <span className="text-cyan-400 font-bold text-sm">A</span>
          </div>
          <div>
            <h1 className="font-bold text-white tracking-wider text-base leading-none">ATLAS</h1>
            <p className="text-[9px] text-slate-400 font-medium tracking-widest mt-0.5">TRACK • DETECT • PREVENT</p>
          </div>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.label}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                  item.active
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    {item.badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-800/80 pt-3 flex items-center gap-2.5 px-2">
        <div className="w-6 h-6 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 text-xs">
          🏛
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-300">Ministry of Home Affairs</p>
          <p className="text-[9px] text-slate-500">Government of India</p>
        </div>
      </div>
    </aside>
  );
}