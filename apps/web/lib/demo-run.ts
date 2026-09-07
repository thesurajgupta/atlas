"use client";

import { useEffect, useState } from "react";
import type { ApiAlert, ApiComplaint, TrailResponse } from "@/lib/api";

/**
 * The state one demo investigation leaves behind.
 *
 * Every page reads the *same* run, which is the point: a walkthrough where the
 * cases page shows one id, the trail another and the alert a third is a set of
 * screenshots, not a system. The case reference minted at the start is the key
 * everything downstream is keyed on.
 *
 * Kept in `sessionStorage` rather than a React context so it survives a full
 * page load — a judge clicking a sidebar link gets a real navigation, and state
 * that lives only in memory would be gone by the time the next page renders.
 * It is cleared with the tab, which is the right lifetime for a demo.
 */

const KEY = "atlas.demo_run";
const EVENT = "atlas:demo-run";

/** Which stages actually reached the API, and which are acknowledged stand-ins. */
export type StageSource = "live" | "simulated";

export interface RankedCandidate {
  rank: number;
  endpoint_ref: string;
  channel: string;
  operator: string;
  /** Relative model score, not a calibrated probability. Nothing here is calibrated. */
  score: number;
  risk: "HIGH" | "MEDIUM" | "LOW";
  distance_km: number;
}

export interface DemoRun {
  started_at: string;
  case_ref: string;
  complaint: ApiComplaint | null;
  origin_entity_id: string | null;
  trail: TrailResponse | null;
  signals: string[];
  candidates: RankedCandidate[];
  window_start: string | null;
  window_end: string | null;
  alert: ApiAlert | null;
  /** Stage name -> whether that stage was a real API call. Rendered, not hidden. */
  provenance: Record<string, StageSource>;
}

export function readRun(): DemoRun | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DemoRun) : null;
  } catch {
    // Private mode, or blocked site data. No run is a valid state — the pages
    // simply show their ordinary content.
    return null;
  }
}

export function writeRun(run: DemoRun | null): void {
  if (typeof window === "undefined") return;
  try {
    if (run === null) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    /* storage unavailable — the run simply will not survive a reload */
  }
  // `storage` only fires in *other* tabs, so same-tab listeners need this.
  window.dispatchEvent(new Event(EVENT));
}

/** Subscribe to the active run. Returns null when no demo has been started. */
export function useDemoRun(): DemoRun | null {
  const [run, setRun] = useState<DemoRun | null>(null);

  useEffect(() => {
    const sync = () => setRun(readRun());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return run;
}
