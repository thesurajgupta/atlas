"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowRightLeft,
  Briefcase,
  FileBarChart,
  FilePlus,
  LayoutDashboard,
  Landmark,
  MapPin,
  PlayCircle,
  Radio,
  ScrollText,
  Search,
  Settings,
  GitFork,
  Share2,
  SlidersHorizontal,
  Users,
} from "lucide-react";

/**
 * Primary navigation (spec §25.2).
 *
 * Two groups, not one flat list. The first is the investigator's path through a
 * case — what is happening, take a complaint, what I own, work it, follow the
 * money, see the network, where it surfaces, what is predicted, what needs
 * attention. The second is about the system rather than any case. Splitting them
 * is what stops a twelve-item list reading as twelve equally urgent things.
 *
 * Order inside the first group is fixed by that path and is not alphabetical.
 * Changing it is a spec change, not a styling one.
 *
 * **Audit is permanent and unconditional.** §25.2 makes it a co-equal tab, and it
 * is shown to every role including those that cannot open it: an investigator
 * who can see that their actions are logged behaves differently from one who
 * cannot. A log only auditors know about is a log nobody expects to be read.
 */
const CASEWORK = [
  { label: "Dashboard", href: "/overview", icon: LayoutDashboard },
  { label: "Demo investigation", href: "/demo", icon: PlayCircle },
  { label: "New complaint", href: "/new-complaint", icon: FilePlus },
  { label: "Cases", href: "/cases", icon: Briefcase },
  { label: "Investigation", href: "/investigation", icon: Search },
  { label: "Transaction trail", href: "/transaction-trail", icon: ArrowRightLeft },
  { label: "Money trail canvas", href: "/money-trail", icon: GitFork },
  { label: "Network graph", href: "/network-graph", icon: Share2 },
  { label: "ATM / branch map", href: "/map", icon: MapPin },
  { label: "Predicted locations", href: "/predicted-locations", icon: Radio },
  { label: "Alerts", href: "/alerts", icon: AlertTriangle },
] as const;

const SYSTEM = [
  { label: "Reports", href: "/reports", icon: FileBarChart },
  { label: "Models", href: "/models", icon: SlidersHorizontal },
  { label: "Audit", href: "/audit", icon: ScrollText },
  { label: "Users", href: "/users", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

type Item = (typeof CASEWORK)[number] | (typeof SYSTEM)[number];

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] transition-colors ${
          active
            ? "border border-accent/30 bg-accent/10 font-medium text-accent"
            : "border border-transparent text-ink-500 hover:bg-raised hover:text-ink-700"
        }`}
      >
        <Icon className="h-[15px] w-[15px] shrink-0" aria-hidden />
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  // `startsWith` with the trailing slash so /cases/CASE-2026-0914 keeps Cases
  // lit, while /map does not light up for a future /map-something.
  const isActive = (href: string) =>
    pathname === href || (pathname?.startsWith(href + "/") ?? false);

  return (
    <aside className="flex w-[13.5rem] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-sm font-bold text-accent"
        >
          A
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold leading-none tracking-wide text-ink-900">
            ATLAS
          </span>
          <span className="mt-1 block whitespace-nowrap text-[8px] font-medium tracking-[0.14em] text-ink-500">
            TRACK · DETECT · PREVENT
          </span>
        </span>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2.5 pb-2">
        <ul className="space-y-0.5">
          {CASEWORK.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </ul>

        <p className="px-3 pb-1.5 pt-4 text-[9px] font-medium uppercase tracking-[0.14em] text-ink-300">
          System
        </p>
        <ul className="space-y-0.5">
          {SYSTEM.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </ul>
      </nav>

      {/* Whose system this is. It belongs on every screen an officer acts from:
          the authority behind a request is what makes it lawful, and a console
          that does not say so invites the question at the wrong moment. */}
      <div className="flex items-center gap-2.5 border-t border-line px-4 py-3">
        <Landmark className="h-4 w-4 shrink-0 text-severity-medium" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-[10px] font-semibold text-ink-700">
            Ministry of Home Affairs
          </span>
          <span className="block truncate text-[9px] text-ink-500">
            I4C · Government of India
          </span>
        </span>
      </div>
    </aside>
  );
}
