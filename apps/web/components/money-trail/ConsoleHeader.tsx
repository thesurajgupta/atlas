'use client';

/**
 * The command header: local search, clock, and the demo identity.
 *
 * The search box does a real job. It filters and selects against the trail this
 * screen already holds — the reduced graph, the drawn entities, the synthetic
 * case fixture — and it reaches no network at all. There is no search endpoint
 * yet, and the field says what it actually covers rather than implying it is
 * querying NCRP or CFCFRMS.
 *
 * The clock mounts empty and starts on the client, because rendering a time
 * during the server pass produces markup that cannot match the browser a moment
 * later. The first tick is scheduled rather than run inside the effect body, so
 * the effect only ever subscribes.
 *
 * Still absent by design: connection, service-health and authentication
 * indicators. This build has no backend and no auth, so any of them would be a
 * claim with nothing behind it.
 */

import { useEffect, useRef, useState } from 'react';

import AtlasLogo from './AtlasLogo';
import { usePopover } from './usePopover';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Fabricated events for the notification menu.
 *
 * Written as a fixture rather than generated, so the list is stable across
 * renders and obviously authored. Each line names itself as synthetic: this is
 * the one surface where a reader would otherwise assume a live feed.
 */
const DEMO_NOTIFICATIONS: readonly { text: string; when: string }[] = [
  { text: 'New synthetic cash-out prediction available', when: 'a few minutes ago' },
  { text: 'Synthetic case ATLAS-SYN-1042 updated', when: 'earlier today' },
  { text: 'Synthetic trail reconstruction completed', when: 'earlier today' },
];

export interface ConsoleHeaderProps {
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  /** Enter: select the best match. */
  readonly onSearchSubmit: () => void;
  readonly onSearchClear: () => void;
  /** Counts of what the current query matched, or null when nothing is typed. */
  readonly resultSummary: string | null;
  readonly noMatches: boolean;
}

export default function ConsoleHeader({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onSearchClear,
  resultSummary,
  noMatches,
}: ConsoleHeaderProps) {
  const [now, setNow] = useState<Date | null>(null);
  // Destructured rather than used as `notificationsRef`: the React
  // compiler lint treats a member access on a ref-bearing object during render
  // as a ref read, and a plain binding says what is meant.
  const {
    isOpen: notificationsOpen,
    toggle: toggleNotifications,
    containerRef: notificationsRef,
    triggerRef: notificationsTriggerRef,
  } = usePopover();
  const {
    isOpen: profileOpen,
    toggle: toggleProfile,
    containerRef: profileRef,
    triggerRef: profileTriggerRef,
  } = usePopover();
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Scheduled, not called synchronously here: an effect subscribes, it does
    // not set state on the way past.
    const first = setTimeout(() => setNow(new Date()), 0);
    const ticking = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(ticking);
    };
  }, []);

  // Ctrl+K / Cmd+K focuses the field from anywhere on the screen.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Formatted by hand rather than through `toLocaleString`, so the output does
  // not shift with the viewer's locale settings mid-demo.
  const clock =
    now === null ? '--:--:--' : `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const date =
    now === null ? '' : `${pad(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900 px-4">
      {/* The full lockup lives in the rail; this shows only when the rail is hidden. */}
      <div className="flex shrink-0 items-center gap-2 md:hidden">
        <AtlasLogo size={26} />
        <span className="text-ui-primary font-bold tracking-[0.2em] text-slate-50">ATLAS</span>
      </div>

      <div className="relative mx-auto flex min-w-0 flex-1 items-center justify-center">
        <div className="relative w-full max-w-[650px] md:min-w-[320px]">
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500"
          >
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="m10.5 10.5 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSearchSubmit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onSearchClear();
              }
            }}
            aria-label="Search cases, accounts, transactions, entities in this demo"
            placeholder="Search cases, accounts, transactions, entities..."
            className="h-9 w-full rounded-md border border-slate-700 bg-slate-950/70 pr-20 pl-9 text-ui-primary text-slate-100 placeholder:text-slate-600 focus:border-sky-500/70 focus:ring-1 focus:ring-sky-500/40 focus:outline-none"
          />
          <div className="absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-1.5">
            {searchQuery !== '' && (
              <button
                type="button"
                onClick={onSearchClear}
                aria-label="Clear search"
                className="rounded border border-slate-700 px-1.5 text-ui-secondary leading-5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                ✕
              </button>
            )}
            <kbd className="pointer-events-none rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-micro text-slate-500">
              Ctrl+K
            </kbd>
          </div>

          {/* What the query actually matched. Scoped wording, so nobody reads
              this as a query against a national system. */}
          {searchQuery.trim() !== '' && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-ui-secondary shadow-lg">
              {noMatches ? (
                <span className="text-slate-400">
                  No matching entity, hop, or case in this demo.
                </span>
              ) : (
                <span className="text-slate-300">
                  {resultSummary}
                  <span className="ml-2 text-slate-600">
                    Enter selects · Esc clears · searches this demo only
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div className="hidden flex-col items-end leading-none sm:flex">
          <time className="font-mono text-value tabular-nums text-slate-100">{clock}</time>
          <span className="mt-1 font-mono text-micro text-slate-500">{date}</span>
        </div>

        <span aria-hidden className="hidden h-8 w-px bg-slate-800 sm:block" />

        {/* Notifications: a real local interaction over fabricated events. The
            panel says so in its own header, because a notification list is
            exactly the surface someone would otherwise assume is live. */}
        <div className="relative" ref={notificationsRef}>
          <button
            ref={notificationsTriggerRef}
            type="button"
            onClick={toggleNotifications}
            aria-expanded={notificationsOpen}
            aria-controls="atlas-notifications"
            aria-label="Demo notifications"
            title="Demo notifications"
            className={`relative rounded-md border p-1.5 transition-colors ${
              notificationsOpen
                ? 'border-sky-500/50 bg-sky-500/10 text-sky-300'
                : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
              <path
                d="M4 6.8a4 4 0 0 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="M6.6 13.2a1.6 1.6 0 0 0 2.8 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            {/* A dot, not a count: an unread number would be a fabricated fact. */}
            <span
              aria-hidden
              className="absolute top-1 right-1 h-2 w-2 rounded-full border border-slate-900 bg-amber-400"
            />
          </button>

          {notificationsOpen && (
            <div
              id="atlas-notifications"
              role="dialog"
              aria-label="Demo notifications"
              className="absolute top-full right-0 z-40 mt-2 w-72 overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-xl"
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-slate-800 px-3 py-2">
                <span className="text-ui-secondary font-semibold text-slate-100">
                  {DEMO_NOTIFICATIONS.length} synthetic investigation events
                </span>
                <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-micro font-semibold tracking-[0.1em] text-amber-300 uppercase">
                  Demo
                </span>
              </div>
              <ul className="max-h-60 overflow-y-auto">
                {DEMO_NOTIFICATIONS.map((item) => (
                  <li
                    key={item.text}
                    className="border-b border-slate-800/70 px-3 py-2 last:border-b-0"
                  >
                    <p className="text-ui-secondary leading-snug text-slate-200">{item.text}</p>
                    <p className="mt-0.5 font-mono text-micro text-slate-500">{item.when}</p>
                  </li>
                ))}
              </ul>
              <p className="border-t border-slate-800 bg-slate-950/60 px-3 py-1.5 text-micro leading-relaxed text-slate-500">
                Demo UI events generated in the browser. Not NCRP, CFCFRMS or I4C notifications.
              </p>
            </div>
          )}
        </div>

        {/* Profile: an openly labelled demo identity, with a menu that does not
            pretend to authenticate anything. */}
        <div className="relative" ref={profileRef}>
          <button
            ref={profileTriggerRef}
            type="button"
            onClick={toggleProfile}
            aria-expanded={profileOpen}
            aria-controls="atlas-profile-menu"
            className={`flex items-center gap-2 rounded-md border px-1 py-1 transition-colors ${
              profileOpen
                ? 'border-sky-500/50 bg-sky-500/10'
                : 'border-transparent hover:border-slate-700 hover:bg-slate-800/60'
            }`}
          >
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-md border border-sky-500/40 bg-sky-500/10 text-ui-secondary font-bold text-sky-300"
            >
              DI
            </span>
            <span className="hidden flex-col text-left leading-none lg:flex">
              <span className="text-ui-primary font-semibold text-slate-100">Demo Inspector</span>
              <span className="mt-1 text-micro tracking-wide text-slate-500">
                I4C • Investigator
              </span>
            </span>
          </button>

          {profileOpen && (
            <div
              id="atlas-profile-menu"
              role="dialog"
              aria-label="Demo profile"
              className="absolute top-full right-0 z-40 mt-2 w-60 overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-xl"
            >
              <div className="border-b border-slate-800 px-3 py-2.5">
                <p className="text-ui-primary font-semibold text-slate-50">Demo Inspector</p>
                <p className="mt-0.5 text-micro tracking-wide text-slate-500">
                  I4C • Investigator
                </p>
              </div>
              <div className="border-b border-slate-800 px-3 py-2">
                <p className="text-ui-secondary text-slate-300">Demo session</p>
                <p className="text-ui-secondary text-slate-500">Synthetic environment</p>
              </div>
              <div className="flex flex-col py-1">
                <button
                  type="button"
                  disabled
                  title="Profile settings — not implemented in this build"
                  className="flex cursor-not-allowed items-center justify-between px-3 py-1.5 text-left text-ui-secondary text-slate-500"
                >
                  Profile settings
                  <span className="text-micro text-slate-600">not implemented</span>
                </button>
                <button
                  type="button"
                  disabled
                  title="There is no session to end — this build has no authentication"
                  className="flex cursor-not-allowed items-center justify-between px-3 py-1.5 text-left text-ui-secondary text-slate-500"
                >
                  Sign out
                  <span className="text-micro text-slate-600">demo only</span>
                </button>
              </div>
              <p className="border-t border-slate-800 bg-slate-950/60 px-3 py-1.5 text-micro leading-relaxed text-slate-500">
                No authentication in this build, so there is no session to end.
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
