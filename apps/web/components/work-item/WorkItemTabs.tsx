"use client";

import { useState } from "react";

// Fixed order, verbatim from §25.2. "Audit is a permanent, co-equal tab, not
// a settings screen" — it is the last item here, but it is never omitted,
// never nested, and never conditionally hidden.
const TABS = [
  "Summary",
  "Money Trail",
  "Graph",
  "Prediction & Why",
  "Evidence",
  "Audit",
] as const;

type Tab = (typeof TABS)[number];

export function WorkItemTabs({
  children,
}: {
  children: Partial<Record<Tab, React.ReactNode>>;
}) {
  const [active, setActive] = useState<Tab>("Prediction & Why");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Work item sections"
        className="flex gap-1 border-b border-line px-6"
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={active === tab}
            onClick={() => setActive(tab)}
            className={[
              "border-b-2 px-3 py-2 text-sm transition-colors",
              active === tab
                ? "border-ink-900 font-medium text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-700",
            ].join(" ")}
          >
            {tab}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="px-6 py-5">
        {children[active] ?? (
          <p className="text-sm text-ink-500">Not yet implemented.</p>
        )}
      </div>
    </div>
  );
}
