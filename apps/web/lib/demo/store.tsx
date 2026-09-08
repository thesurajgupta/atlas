'use client';

/**
 * The demo's persistence layer: one complaint, stored once, read everywhere.
 *
 * ## Why `localStorage` and not React state
 *
 * The requirement the whole feature turns on is that a complaint filed on
 * `/ncrp` is still the same complaint on `/alerts` after three navigations and
 * a browser refresh. Component state does not survive a route change, and a
 * context alone does not survive a reload. So the complaint is written to
 * `localStorage` and everything else reads it.
 *
 * ## Why the complaint and not the case
 *
 * Only the `NcrpComplaint` is stored. The case, trail, network, ranked
 * locations and alert are **derived** on read by `buildDemoCase`, which is a
 * pure function of the complaint. Storing the derived case as well would create
 * a second copy of every amount and identifier, and a second copy is exactly
 * the thing that eventually disagrees with the first. There is nothing to keep
 * in sync because there is only one record.
 *
 * ## Why `useSyncExternalStore`
 *
 * `localStorage` plus a change event is an external store, and this is the hook
 * React provides for reading one. It gets the server pass right for free —
 * `getServerSnapshot` returns "nothing stored", which is the only honest answer
 * on a server that cannot see this browser — and it avoids the read-then-
 * `setState`-in-an-effect pattern, which renders twice and tears if two
 * components read at different moments.
 *
 * ## Why not the ATLAS API
 *
 * `POST /api/v1/complaints` exists and is the right home for this in a
 * deployment. It needs PostgreSQL, Redis, migrations and a seeded operator
 * account — a stack that must be up before a judge sees anything. This store is
 * the console's own data layer for the demo path, and it is a *single* layer:
 * no screen keeps its own copy, and `useDemoCase` is the only way in.
 *
 * Everything stored here is synthetic and typed by the presenter. The portal is
 * a demonstration interface built for SIH; it is not NCRP and is not connected
 * to it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { buildDemoCase } from './case';
import type { DemoCase, NcrpComplaint } from './types';

const STORAGE_KEY = 'atlas.demo.complaint.v1';

/**
 * Broadcast to every subscriber in *this* tab.
 *
 * The `storage` event only fires in other tabs, so without this a submission on
 * `/ncrp` would not reach a component already mounted beside it.
 */
const CHANGE_EVENT = 'atlas-demo-change';

export type DemoStage = 'NONE' | 'SUBMITTED' | 'IN_ATLAS';

interface StoredState {
  readonly complaint: NcrpComplaint;
  readonly stage: Exclude<DemoStage, 'NONE'>;
  /** When the complaint was handed to ATLAS, ISO 8601. */
  readonly sent_to_atlas_at: string | null;
}

function parse(raw: string | null): StoredState | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'complaint' in parsed &&
      'stage' in parsed
    ) {
      return parsed as StoredState;
    }
    return null;
  } catch {
    // A value written by an older build. Treat it as "no demo in progress"
    // rather than crashing the page a presenter is standing in front of.
    return null;
  }
}

/**
 * `getSnapshot` must return a stable reference while nothing has changed, or
 * React re-renders forever. The raw string is the change detector: parsing on
 * every read would hand back a new object each time.
 */
let cachedRaw: string | null = null;
let cachedState: StoredState | null = null;

function readSnapshot(): StoredState | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode, or site data blocked. The demo still runs; it just will not
    // survive a reload.
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parse(raw);
  }
  return cachedState;
}

/** The server cannot see this browser. "Nothing stored" is the honest answer. */
const serverSnapshot = (): StoredState | null => null;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // Fires in *other* tabs. Kept so a presenter with the portal and the console
  // side by side sees one submission in both.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function writeStorage(state: StoredState | null): void {
  try {
    if (state === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — see `readSnapshot` */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Mint a complaint reference.
 *
 * The one value in the whole flow that is not derived — a reference has to be
 * new each filing. Minted exactly once, at submission, and then carried
 * verbatim: the case id, the prediction id and the alert id are all derived
 * from it, so nothing downstream can invent a second identity for the same
 * complaint.
 */
export function mintComplaintId(now: Date = new Date()): string {
  const serial = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  return `NCRP/${now.getFullYear()}/${serial}`;
}

export interface DemoStoreValue {
  /**
   * False during the server pass and the hydration render, true afterwards.
   *
   * Screens use it to tell "nothing has been referred" from "we cannot know
   * yet", so a page does not flash its development fixture over a live case.
   */
  readonly hydrated: boolean;
  readonly stage: DemoStage;
  readonly complaint: NcrpComplaint | null;
  readonly sentToAtlasAt: string | null;
  /**
   * The derived case, available as soon as a complaint exists.
   *
   * Use `activeCase` on ATLAS screens: this one is also non-null while the
   * complaint is still sitting on the acknowledgement page, unreferred.
   */
  readonly demoCase: DemoCase | null;
  /** The case ATLAS has actually received. `null` until "Send to ATLAS". */
  readonly activeCase: DemoCase | null;
  /** Store a submitted complaint. Returns the stored record, reference included. */
  submit(complaint: Omit<NcrpComplaint, 'complaint_id' | 'submitted_at'>): NcrpComplaint;
  /** Hand the stored complaint to ATLAS. Idempotent. */
  sendToAtlas(): void;
  /** Clear the demo so the whole flow can be run again. */
  reset(): void;
}

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

const alwaysTrue = () => true;
const alwaysFalse = () => false;

export function DemoCaseProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, readSnapshot, serverSnapshot);
  const hydrated = useSyncExternalStore(subscribe, alwaysTrue, alwaysFalse);

  const submit = useCallback(
    (input: Omit<NcrpComplaint, 'complaint_id' | 'submitted_at'>): NcrpComplaint => {
      const complaint: NcrpComplaint = {
        ...input,
        complaint_id: mintComplaintId(),
        submitted_at: new Date().toISOString(),
      };
      writeStorage({ complaint, stage: 'SUBMITTED', sent_to_atlas_at: null });
      return complaint;
    },
    [],
  );

  const sendToAtlas = useCallback(() => {
    // Read through the store rather than closing over `state`, so a referral
    // fired from a stale render still lands on what is actually stored.
    const current = readSnapshot();
    if (current === null || current.stage === 'IN_ATLAS') return;
    writeStorage({ ...current, stage: 'IN_ATLAS', sent_to_atlas_at: new Date().toISOString() });
  }, []);

  const reset = useCallback(() => writeStorage(null), []);

  const demoCase = useMemo(
    () => (state === null ? null : buildDemoCase(state.complaint)),
    [state],
  );

  const value = useMemo<DemoStoreValue>(
    () => ({
      hydrated,
      stage: state?.stage ?? 'NONE',
      complaint: state?.complaint ?? null,
      sentToAtlasAt: state?.sent_to_atlas_at ?? null,
      demoCase,
      activeCase: state?.stage === 'IN_ATLAS' ? demoCase : null,
      submit,
      sendToAtlas,
      reset,
    }),
    [hydrated, state, demoCase, submit, sendToAtlas, reset],
  );

  return <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>;
}

/**
 * The only way to read the demo case.
 *
 * Throws rather than returning a null-object if the provider is missing: a page
 * that silently rendered its old fixture because a provider was not mounted is
 * precisely the "ATLAS shows different numbers from NCRP" failure this whole
 * module exists to make impossible.
 */
export function useDemoCase(): DemoStoreValue {
  const value = useContext(DemoStoreContext);
  if (value === null) {
    throw new Error('useDemoCase must be used inside <DemoCaseProvider>');
  }
  return value;
}
