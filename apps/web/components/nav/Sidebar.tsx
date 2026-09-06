"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  FileText,
  GitFork,
  Landmark,
  LayoutDashboard,
  MapPin,
  ScrollText,
  Send,
  Briefcase,
} from "lucide-react";

/**
 * Primary navigation (spec §25.2), from Lucky's console design in #68.
 *
 * Order is fixed and is not alphabetical: it follows the investigator's path
 * through a case — what is happening, what needs attention, what I own, where
 * the money went, where it will surface, who to tell — and then the two tabs
 * that are about the system rather than the case. Reordering it is a spec
 * change, not a styling one.
 *
 * **Audit is permanent and co-equal** (§25.2). It is not tucked into a settings
 * menu, and it is not conditional on the viewer's role: an investigator who
 * cannot open it still sees that it exists and that their actions land in it.
 * A log that only auditors know about is a log nobody expects to be read.
 */
const NAV_ITEMS = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "Alerts", href: "/alerts", icon: AlertTriangle },
  { label: "Cases", href: "/cases", icon: Briefcase },
  { label: "Money trail", href: "/money-trail", icon: GitFork },
  { label: "Map", href: "/map", icon: MapPin },
  { label: "Intelligence", href: "/intelligence", icon: Send },
  { label: "Models", href: "/models", icon: FileText },
  { label: "Audit", href: "/audit", icon: ScrollText },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-line bg-surface p-3">
      <div>
        <div className="mb-6 flex items-center gap-2.5 px-2 pt-1">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-sm font-bold text-accent"
          >
            A
          </span>
          <span>
            <span className="block text-base font-bold leading-none tracking-wider text-ink-900">
              ATLAS
            </span>
            <span className="mt-1 block whitespace-nowrap text-[8px] font-medium tracking-[0.14em] text-ink-500">
              TRACK · DETECT · PREVENT
            </span>
          </span>
        </div>

        <nav aria-label="Primary">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              // `startsWith` so /cases/CASE-2026-0914 keeps Cases lit. The
              // trailing slash matters: without it /map would also match
              // /map-something the day such a route exists.
              const active =
                pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
                      active
                        ? "border border-accent/30 bg-accent/10 font-medium text-accent"
                        : "border border-transparent text-ink-500 hover:bg-raised hover:text-ink-700"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Whose system this is. It belongs on every screen an officer acts from:
          the authority behind a request is the thing that makes it lawful, and
          a console that does not say so invites the question at the wrong
          moment. */}
      <div className="flex items-center gap-2.5 border-t border-line px-2 pt-3">
        <Landmark className="h-5 w-5 shrink-0 text-severity-medium" aria-hidden />
        <span>
          <span className="block text-[11px] font-semibold text-ink-700">
            Ministry of Home Affairs
          </span>
          <span className="block text-[9px] text-ink-500">
            Indian Cyber Crime Coordination Centre
          </span>
        </span>
      </div>
    </aside>
  );
}
