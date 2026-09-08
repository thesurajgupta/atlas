'use client';

/**
 * The reporting portal's own record of what a citizen filed.
 *
 * ## What this is not
 *
 * It is **not** a second copy of the case. ATLAS's side — complaint row, money
 * trail, signals, ranking, alert — is produced by `lib/run-investigation`
 * against the real API and held in `lib/demo-run`. Nothing in this module
 * derives, scores or predicts anything, and no ATLAS screen reads it.
 *
 * What it holds is the citizen-facing record: the fields a complainant supplies
 * that the API deliberately has no column for, plus whether the complaint has
 * been referred yet. The portal has to be able to show somebody the complaint
 * they filed after a reload, and that is the whole job.
 *
 * ## Why `localStorage` and `useSyncExternalStore`
 *
 * A complaint filed on `/ncrp` must still be there on `/ncrp/acknowledgement`
 * after a navigation and a refresh. Component state does not survive a route
 * change and a context does not survive a reload. `localStorage` plus a change
 * event is an external store, and this is the hook React provides for reading
 * one: it gets the server pass right for free — `getServerSnapshot` returns
 * "nothing filed", the only honest answer on a server that cannot see this
 * browser — and avoids the read-then-`setState`-in-an-effect pattern, which
 * renders twice and tears if two components read at different moments.
 *
 * `demo-run` uses `sessionStorage` because a walkthrough should not outlive the
 * tab. This one uses `localStorage` because a filed complaint should: a citizen
 * closing the tab has still filed it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { writeRun } from '@/lib/demo-run';

import type { NcrpComplaint } from './types';

const STORAGE_KEY = 'atlas.ncrp.complaint.v2';

/**
 * Broadcast to every subscriber in *this* tab.
 *
 * The `storage` event only fires in other tabs, so without this a submission on
 * `/ncrp` would not reach a component already mounted beside it.
 */
const CHANGE_EVENT = 'atlas:ncrp-complaint';

export type PortalStage = 'NONE' | 'SUBMITTED' | 'REFERRED';

interface StoredRecord {
  readonly complaint: NcrpComplaint;
  readonly stage: Exclude<PortalStage, 'NONE'>;
  /** When the complaint was handed to ATLAS, ISO 8601. */
  readonly referred_at: string | null;
}

function parse(raw: string | null): StoredRecord | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && 'complaint' in parsed && 'stage' in parsed) {
      return parsed as StoredRecord;
    }
    return null;
  } catch {
    // A value written by an older build. Treat it as "nothing filed" rather
    // than crashing the page a presenter is standing in front of.
    return null;
  }
}

/**
 * `getSnapshot` must return a stable reference while nothing has changed, or
 * React re-renders forever. The raw string is the change detector: parsing on
 * every read would hand back a new object each time.
 */
let cachedRaw: string | null = null;
let cachedRecord: StoredRecord | null = null;

function readSnapshot(): StoredRecord | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode, or site data blocked. The portal still works; it just will
    // not survive a reload.
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedRecord = parse(raw);
  }
  return cachedRecord;
}

/** The server cannot see this browser. "Nothing filed" is the honest answer. */
const serverSnapshot = (): StoredRecord | null => null;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function write(record: StoredRecord | null): void {
  try {
    if (record === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* storage unavailable — see `readSnapshot` */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Mint a complaint reference.
 *
 * The one value in the flow that is not derived from something else. It becomes
 * `case_ref` on the API complaint, the trail built for it and the alert raised
 * on it, so nothing downstream can invent a second identity for the same
 * filing.
 */
export function mintComplaintId(now: Date = new Date()): string {
  const serial = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  return `NCRP/${now.getFullYear()}/${serial}`;
}

export interface PortalStoreValue {
  /** False during the server pass and the hydration render, true afterwards. */
  readonly hydrated: boolean;
  readonly stage: PortalStage;
  readonly complaint: NcrpComplaint | null;
  readonly referredAt: string | null;
  /** Record a submitted complaint. Returns it, reference included. */
  submit(complaint: Omit<NcrpComplaint, 'complaint_id' | 'submitted_at'>): NcrpComplaint;
  /** Mark the complaint as handed to ATLAS. Idempotent. */
  markReferred(): void;
  /** Clear the portal record *and* the ATLAS walkthrough, so the demo can run again. */
  reset(): void;
}

const PortalContext = createContext<PortalStoreValue | null>(null);

const alwaysTrue = () => true;
const alwaysFalse = () => false;

export function NcrpPortalProvider({ children }: { children: ReactNode }) {
  const record = useSyncExternalStore(subscribe, readSnapshot, serverSnapshot);
  const hydrated = useSyncExternalStore(subscribe, alwaysTrue, alwaysFalse);

  const submit = useCallback(
    (input: Omit<NcrpComplaint, 'complaint_id' | 'submitted_at'>): NcrpComplaint => {
      const complaint: NcrpComplaint = {
        ...input,
        complaint_id: mintComplaintId(),
        submitted_at: new Date().toISOString(),
      };
      write({ complaint, stage: 'SUBMITTED', referred_at: null });
      return complaint;
    },
    [],
  );

  const markReferred = useCallback(() => {
    // Read through the store rather than closing over `record`, so a referral
    // fired from a stale render still lands on what is actually stored.
    const current = readSnapshot();
    if (current === null || current.stage === 'REFERRED') return;
    write({ ...current, stage: 'REFERRED', referred_at: new Date().toISOString() });
  }, []);

  const reset = useCallback(() => {
    // Both halves, or the console would keep showing a walkthrough for a
    // complaint the portal no longer has — which is the disagreement between
    // two screens that the whole demo is built to avoid.
    write(null);
    writeRun(null);
  }, []);

  const value = useMemo<PortalStoreValue>(
    () => ({
      hydrated,
      stage: record?.stage ?? 'NONE',
      complaint: record?.complaint ?? null,
      referredAt: record?.referred_at ?? null,
      submit,
      markReferred,
      reset,
    }),
    [hydrated, record, submit, markReferred, reset],
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

/**
 * The only way to read the portal record.
 *
 * Throws rather than returning a null-object if the provider is missing: a page
 * that silently rendered an empty complaint because a provider was not mounted
 * is worse than one that fails loudly in development.
 */
export function useNcrpComplaint(): PortalStoreValue {
  const value = useContext(PortalContext);
  if (value === null) {
    throw new Error('useNcrpComplaint must be used inside <NcrpPortalProvider>');
  }
  return value;
}
