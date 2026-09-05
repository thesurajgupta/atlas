"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Order is fixed by issue #7 — not alphabetical, not reorderable by
// preference. Changing this order is a spec change, not a styling one.
const NAV_ITEMS = [
  { label: "Overview", href: "/overview" },
  { label: "Alerts", href: "/alerts" },
  { label: "Cases", href: "/cases" },
  { label: "Map", href: "/map" },
  { label: "Graph", href: "/graph" },
  { label: "Intelligence", href: "/intelligence" },
  { label: "Models", href: "/models" },
  { label: "Audit", href: "/audit" },
] as const;

export function PrimaryNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex h-12 items-center gap-1 border-b border-line bg-surface px-4"
    >
      <span className="mr-4 select-none text-sm font-semibold tracking-tight text-ink-900">
        ATLAS
      </span>
      <ul className="flex h-full items-stretch gap-1">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center border-b-2 px-3 text-sm transition-colors",
                  active
                    ? "border-ink-900 font-medium text-ink-900"
                    : "border-transparent text-ink-500 hover:text-ink-700",
                ].join(" ")}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
