"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Pause, Play, Square } from "lucide-react";

/**
 * Auto-advance through the investigation, with a pause.
 *
 * The pause is the important control, not the timer. A presenter gets asked a
 * question in the middle of a walkthrough, and a demo that keeps moving while
 * they answer it is worse than one that never moved on its own — so the default
 * dwell is long, Next is always available for someone talking quickly, and
 * Pause holds the current page indefinitely.
 *
 * State lives in `sessionStorage` and is read on each page, because advancing is
 * a real navigation. A React context would be dropped by the router.
 *
 * Manual navigation keeps working throughout: this drives the same router the
 * sidebar does, and clicking a sidebar link while it runs simply moves the tour
 * to that page.
 */

const KEY = "atlas.presentation";
const EVENT = "atlas:presentation";

/** The order a case is explained in, which is the order the pipeline runs. */
export const TOUR = [
  { href: "/demo", label: "Pipeline" },
  { href: "/transaction-trail", label: "Transaction trail" },
  { href: "/network-graph", label: "Network graph" },
  { href: "/predicted-locations", label: "Predicted locations" },
  { href: "/map", label: "Map" },
  { href: "/alerts", label: "Alert" },
  { href: "/investigation", label: "Investigation" },
  { href: "/reports", label: "Report" },
] as const;

/** Long enough to say two sentences about a page before it moves. */
const DWELL_MS = 12_000;

interface PresentationState {
  running: boolean;
  paused: boolean;
}

function read(): PresentationState {
  if (typeof window === "undefined") return { running: false, paused: false };
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PresentationState) : { running: false, paused: false };
  } catch {
    return { running: false, paused: false };
  }
}

function write(state: PresentationState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — presentation mode simply will not persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

function usePresentation(): PresentationState {
  const [state, setState] = useState<PresentationState>({ running: false, paused: false });
  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return state;
}

/** The start/pause/next control. Rendered in a page header. */
export function PresentationControls() {
  const { running, paused } = usePresentation();
  const router = useRouter();
  const pathname = usePathname();

  const advance = useCallback(() => {
    const index = TOUR.findIndex((t) => t.href === pathname);
    const next = TOUR[(index + 1) % TOUR.length];
    if (next) router.push(next.href);
  }, [pathname, router]);

  if (!running) {
    return (
      <button
        type="button"
        onClick={() => {
          write({ running: true, paused: false });
          router.push(TOUR[0].href);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink-700 transition-colors hover:text-ink-900"
      >
        <Play className="h-3 w-3" aria-hidden /> Presentation mode
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => write({ running: true, paused: !paused })}
        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[12px] text-accent transition-opacity hover:opacity-80"
      >
        {paused ? (
          <>
            <Play className="h-3 w-3" aria-hidden /> Resume
          </>
        ) : (
          <>
            <Pause className="h-3 w-3" aria-hidden /> Pause
          </>
        )}
      </button>
      <button
        type="button"
        onClick={advance}
        className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-ink-700 transition-colors hover:text-ink-900"
      >
        Next <ChevronRight className="h-3 w-3" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => write({ running: false, paused: false })}
        aria-label="Stop presentation"
        className="rounded-md border border-line bg-raised p-1.5 text-ink-500 transition-colors hover:text-ink-900"
      >
        <Square className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

/**
 * The timer and the progress strip. Mounted once in the dashboard layout, so
 * every page participates without each one wiring it up.
 */
export function PresentationRunner() {
  const { running, paused } = usePresentation();
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!running || paused) return;

    // Restart the dwell on every navigation, including a manual one — clicking
    // a sidebar link mid-tour moves the tour rather than fighting it.
    timer.current = setTimeout(() => {
      const index = TOUR.findIndex((t) => t.href === pathname);
      // A page outside the tour resumes at the start rather than stopping, so a
      // detour to Audit does not end the walkthrough.
      const next = TOUR[index === -1 ? 0 : (index + 1) % TOUR.length];
      if (next) router.push(next.href);
    }, DWELL_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [running, paused, pathname, router]);

  if (!running) return null;

  const index = TOUR.findIndex((t) => t.href === pathname);

  return (
    <div className="border-b border-accent/30 bg-accent/5 px-6 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider">
        <span className="text-accent">Presentation</span>
        {TOUR.map((stop, i) => (
          <span key={stop.href} className="flex items-center gap-2">
            {i > 0 && <span className="text-ink-300">›</span>}
            <button
              type="button"
              onClick={() => router.push(stop.href)}
              className={i === index ? "text-ink-900" : "text-ink-500 hover:text-ink-700"}
            >
              {stop.label}
            </button>
          </span>
        ))}
        {paused && <span className="ml-auto text-severity-medium">paused</span>}
      </div>
    </div>
  );
}
