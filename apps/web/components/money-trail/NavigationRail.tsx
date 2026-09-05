import type { ReactNode } from 'react';

import AtlasWordmark from './AtlasWordmark';
import IndiaOutline from './IndiaOutline';
import TrailPulse from './TrailPulse';

/**
 * The ATLAS section rail.
 *
 * Every entry except Money Trail is a *label*, not a link. They are rendered as
 * non-interactive, `aria-disabled` items with a note at the foot of the rail,
 * because a nav item that looks clickable and does nothing is a claim the
 * platform cannot back — the same reason the trail refuses to render a
 * confidence it has not calibrated.
 *
 * The emblem at the bottom is decoration and nothing else: no markers, no
 * shading, no counts. Anything drawn on it would read as geographic
 * intelligence, and the module that would produce that intelligence does not
 * exist in this build. See `IndiaOutline` for why it is currently abstract
 * rather than a national outline.
 */

interface RailItem {
  readonly label: string;
  readonly icon: ReactNode;
}

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 } as const;

const ICONS: Record<string, ReactNode> = {
  command: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" {...s} />
      <rect x="9" y="2" width="5" height="5" rx="1" {...s} />
      <rect x="2" y="9" width="5" height="5" rx="1" {...s} />
      <rect x="9" y="9" width="5" height="5" rx="1" {...s} />
    </>
  ),
  cases: (
    <>
      <rect x="2" y="4.5" width="12" height="9" rx="1.5" {...s} />
      <path d="M6 4.5V3.2A1.2 1.2 0 0 1 7.2 2h1.6A1.2 1.2 0 0 1 10 3.2v1.3" {...s} />
    </>
  ),
  heatmap: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="1.5" {...s} />
      <path d="M2 6h12M2 10h12M6 2v12M10 2v12" {...s} strokeWidth={1} />
    </>
  ),
  prediction: (
    <>
      <path d="M2 11.5l3.2-3.6 2.6 2.2L13.8 4" {...s} strokeLinecap="round" />
      <path d="M10.6 4h3.2v3.2" {...s} strokeLinecap="round" />
    </>
  ),
  trail: (
    <>
      <circle cx="3.5" cy="12.5" r="1.8" {...s} />
      <circle cx="8" cy="6" r="1.8" {...s} />
      <circle cx="12.5" cy="11" r="1.8" {...s} />
      <path d="M4.8 11.1 6.8 7.4M9.3 7.3l2.1 2.3" {...s} />
    </>
  ),
  graph: (
    <>
      <circle cx="8" cy="3.6" r="1.6" {...s} />
      <circle cx="3.4" cy="12" r="1.6" {...s} />
      <circle cx="12.6" cy="12" r="1.6" {...s} />
      <path d="M6.9 5 4.4 10.5M9.1 5l2.5 5.5M5 12h6" {...s} />
    </>
  ),
  alerts: (
    <>
      <path d="M4 6.8a4 4 0 0 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z" {...s} strokeLinejoin="round" />
      <path d="M6.6 13.2a1.6 1.6 0 0 0 2.8 0" {...s} strokeLinecap="round" />
    </>
  ),
  evidence: (
    <>
      <path d="M4 2h5l3 3v9H4V2Z" {...s} strokeLinejoin="round" />
      <path d="M9 2v3h3M6 8.5h4M6 11h4" {...s} strokeLinecap="round" />
    </>
  ),
  audit: (
    <>
      <circle cx="8" cy="8" r="6" {...s} />
      <path d="M8 4.6V8l2.4 1.6" {...s} strokeLinecap="round" />
    </>
  ),
};

/** Grouped so a hairline can separate the concerns rather than one long list. */
const SECTION_GROUPS: readonly (readonly RailItem[])[] = [
  [
    { label: 'Command Center', icon: ICONS.command },
    { label: 'Active Cases', icon: ICONS.cases },
    { label: 'Risk Heatmap', icon: ICONS.heatmap },
    { label: 'Prediction Feed', icon: ICONS.prediction },
  ],
  [
    { label: 'Money Trail', icon: ICONS.trail },
    { label: 'Graph Intelligence', icon: ICONS.graph },
  ],
  [
    { label: 'Alerts', icon: ICONS.alerts },
    { label: 'Evidence', icon: ICONS.evidence },
    { label: 'Audit Log', icon: ICONS.audit },
  ],
];

const CURRENT_SECTION = 'Money Trail';

export default function NavigationRail() {
  return (
    <nav
      aria-label="ATLAS sections"
      className="hidden shrink-0 flex-col border-r border-slate-800 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 md:flex md:w-16 xl:w-52"
    >
      {/* Brand block: the supplied logo and nothing else. The wordmark it
          already contains is the artwork's, so no text is set beside it. */}
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-slate-800 px-2 xl:px-4">
        <AtlasWordmark className="h-3 w-auto xl:h-10" />
      </div>

      {/* The only region that scrolls, and it scrolls invisibly.
          `min-h-0` is what lets it actually shrink inside the flex column —
          without it a flex item refuses to go below its content height and the
          overflow lands on the sidebar instead of here.

          `tabIndex` is not decoration: every item in this rail is
          non-interactive (the planned sections are labels, not links), so
          without a tab stop there would be nothing to focus and the region
          would be unreachable by keyboard once it scrolls. The focus ring is
          kept visible for exactly that reason. */}
      <div
        tabIndex={0}
        aria-label="Section navigation"
        className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto py-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500/60 focus-visible:ring-inset"
      >
        {SECTION_GROUPS.map((group, groupIndex) => (
          <div
            // Keyed on the group's first label, which is stable and unique.
            // `?? groupIndex` only satisfies the checker for an empty group —
            // a case the constant above never produces.
            key={group[0]?.label ?? groupIndex}
            className={groupIndex > 0 ? 'mt-2 border-t border-slate-800/70 pt-2' : ''}
          >
            <ul className="flex flex-col gap-0.5 px-2 xl:px-3">
              {group.map((section) => {
                const isCurrent = section.label === CURRENT_SECTION;
                return (
                  <li key={section.label}>
                    <div
                      aria-current={isCurrent ? 'page' : undefined}
                      aria-disabled={isCurrent ? undefined : true}
                      title={isCurrent ? section.label : `${section.label} — not in this build`}
                      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-ui-primary leading-5 transition-colors ${
                        isCurrent
                          ? 'border border-sky-400/45 bg-sky-500/15 font-semibold text-sky-200 shadow-[inset_3px_0_0_0] shadow-sky-400'
                          : 'border border-transparent font-medium text-slate-400 hover:border-slate-700/70 hover:bg-slate-800/50 hover:text-slate-200'
                      }`}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        className={`h-[18px] w-[18px] shrink-0 ${
                          isCurrent ? 'text-sky-300' : 'text-slate-500'
                        }`}
                        strokeLinecap="round"
                      >
                        {section.icon}
                      </svg>
                      <span className="hidden truncate xl:inline">{section.label}</span>
                      {!isCurrent && (
                        <span
                          aria-hidden
                          title="Planned"
                          className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full bg-slate-700 xl:block"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Decoration only. Currently an abstract emblem — see IndiaOutline for
          why no India boundary is drawn and how to supply an official one. */}
      {/* Decoration yields to navigation on a short viewport.
          It is `shrink-0`, so on a 768px-tall screen it would otherwise hold
          its ~244px and force the nav to scroll for no good reason. Standing
          it down below 760px means the nine sections fit outright there, and
          it returns at 800px and above where there is room for both. */}
      <div className="hidden shrink-0 flex-col items-center gap-2.5 border-t border-slate-800/70 px-4 pt-5 pb-5 [@media(max-height:760px)]:!hidden xl:flex">
        <div className="relative flex items-center justify-center">
          <span aria-hidden className="absolute h-20 w-20 rounded-full bg-sky-400/10 blur-xl" />
          <IndiaOutline className="relative h-20 w-auto text-sky-400" />
        </div>
        {/* Decorative motion mark: value moving along a trail to a cash-out. */}
        <TrailPulse className="w-full max-w-[168px]" />
        {/* Tracking is looser than a body label but tighter than the previous
            three-line mark: "PREDICTIVE CASH-OUT" is nineteen characters, and
            at 0.26em it would not clear the 176px of content width the rail has
            at `xl`. */}
        <p className="text-micro text-center leading-[1.6] font-semibold tracking-[0.18em] text-slate-500 uppercase">
          Predictive cash-out
          <br />
          Intelligence
        </p>
      </div>

      <p className="hidden shrink-0 border-t border-slate-800 px-3 py-2.5 text-micro leading-relaxed text-slate-600 xl:block">
        Money Trail is the only section implemented in this build. The rest are labels, not links.
      </p>
    </nav>
  );
}
