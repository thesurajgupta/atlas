"use client";

import { useMemo } from "react";
import { useDemoRun, type DemoRun, type RankedCandidate } from "@/lib/demo-run";

/**
 * One case, projected into the shapes each page needs.
 *
 * The problem this solves: every page used to carry its own array — a trail
 * page with its own accounts, a network page with different ones, a locations
 * page with its own scores. Six datasets describing one investigation, agreeing
 * about nothing. A judge who compares two screens finds the seams immediately.
 *
 * So the active demo run is the source, and everything below is a **projection**
 * of it. Nothing here invents a number: account labels are derived from the
 * entity ids the graph API returned, amounts come from the hops it walked, and
 * the ranked candidates are the ones the run produced. If a field genuinely does
 * not exist in the data — a bank name, an account holder — it is absent rather
 * than filled in, because a plausible invented name is the thing that makes a
 * demo look real and be false.
 *
 * When no run is active every selector returns null and the pages fall back to
 * their own fixtures, so ordinary browsing is unchanged.
 */

/** Role in the chain, from position rather than from a label somebody typed. */
export type TrailRole = "VICTIM" | "MULE" | "TERMINAL";

export interface CaseTrailNode {
  id: string;
  /** Short, stable, human-readable handle for a UUID entity. */
  label: string;
  role: TrailRole;
  depth: number;
  /** Total received at this node, in rupees. Summed from the hops that reach it. */
  received: number;
  firstSeen: string | null;
}

export interface CaseTrailHop {
  id: string;
  index: number;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  amount: number;
  occurredAt: string;
  depth: number;
}

export interface CaseView {
  caseRef: string;
  startedAt: string;
  reportedAmount: number;
  goldenHourMinutes: number | null;
  typology: string;
  observedAt: string | null;

  hops: CaseTrailHop[];
  nodes: CaseTrailNode[];
  totalMoved: number;

  signals: string[];
  candidates: RankedCandidate[];
  windowStart: string | null;
  windowEnd: string | null;

  alertSeverity: string | null;
  alertReason: string | null;
  alertRaised: boolean;
}

/**
 * A UUID is not something anyone can hold in their head, and truncating it to
 * eight characters gives a judge nothing to compare between two screens. The
 * label is derived from the id, so the same entity reads the same everywhere,
 * and it carries the role so the chain is legible at a glance.
 */
function labelFor(entityId: string, role: TrailRole, index: number): string {
  const suffix = entityId.replace(/-/g, "").slice(0, 4).toUpperCase();
  if (role === "VICTIM") return `VICTIM-${suffix}`;
  if (role === "TERMINAL") return `TERMINAL-${suffix}`;
  return `MULE-${String.fromCharCode(64 + index)}-${suffix}`;
}

function project(run: DemoRun): CaseView | null {
  if (!run.complaint) return null;

  // Every hop once, ordered by depth then time. `paths` share prefixes, so a
  // naive flatMap counts the first hop once per branch and the chain reads as
  // though the victim paid the same account repeatedly.
  const seen = new Set<string>();
  const rawHops = (run.trail?.paths ?? [])
    .flatMap((p) => p.hops)
    .filter((h) => !seen.has(h.edge_id) && seen.add(h.edge_id))
    .sort((a, b) => a.depth - b.depth || a.occurred_at.localeCompare(b.occurred_at));

  // Depth per entity, and what each received. Both read off the hops rather than
  // stored, so they cannot disagree with the trail they came from.
  const depth = new Map<string, number>();
  const received = new Map<string, number>();
  const firstSeen = new Map<string, string>();
  for (const h of rawHops) {
    if (!depth.has(h.from_entity_id)) depth.set(h.from_entity_id, h.depth - 1);
    depth.set(h.to_entity_id, Math.min(depth.get(h.to_entity_id) ?? Infinity, h.depth));
    received.set(
      h.to_entity_id,
      (received.get(h.to_entity_id) ?? 0) + Number(h.amount),
    );
    if (!firstSeen.has(h.from_entity_id)) firstSeen.set(h.from_entity_id, h.occurred_at);
    if (!firstSeen.has(h.to_entity_id)) firstSeen.set(h.to_entity_id, h.occurred_at);
  }

  const maxDepth = Math.max(0, ...[...depth.values()]);
  const paidOut = new Set(rawHops.map((h) => h.from_entity_id));

  const labels = new Map<string, string>();
  let muleIndex = 0;
  const nodes: CaseTrailNode[] = [...depth.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id, d]) => {
      // Terminal = received money and never moved it on. That is the account a
      // cash-out would be drawn from, and it is a property of the graph rather
      // than a flag anybody set.
      const role: TrailRole =
        d === 0 ? "VICTIM" : !paidOut.has(id) && d === maxDepth ? "TERMINAL" : "MULE";
      const label = labelFor(id, role, role === "MULE" ? ++muleIndex : 0);
      labels.set(id, label);
      return {
        id,
        label,
        role,
        depth: d,
        received: received.get(id) ?? 0,
        firstSeen: firstSeen.get(id) ?? null,
      };
    });

  const hops: CaseTrailHop[] = rawHops.map((h, i) => ({
    id: h.edge_id,
    index: i + 1,
    from: h.from_entity_id,
    to: h.to_entity_id,
    fromLabel: labels.get(h.from_entity_id) ?? h.from_entity_id.slice(0, 8),
    toLabel: labels.get(h.to_entity_id) ?? h.to_entity_id.slice(0, 8),
    amount: Number(h.amount),
    occurredAt: h.occurred_at,
    depth: h.depth,
  }));

  return {
    caseRef: run.case_ref,
    startedAt: run.started_at,
    reportedAmount: Number(run.complaint.reported_amount),
    goldenHourMinutes: run.complaint.golden_hour_minutes_elapsed,
    typology: run.complaint.typology,
    observedAt: run.complaint.observed_at,
    hops,
    nodes,
    totalMoved: hops.reduce((sum, h) => sum + h.amount, 0),
    signals: run.signals,
    candidates: run.candidates,
    windowStart: run.window_start,
    windowEnd: run.window_end,
    alertSeverity: run.alert?.severity ?? null,
    alertReason: run.alert?.reason ?? null,
    alertRaised: run.alert?.raised ?? false,
  };
}

/** The active case, or null when no demo run has been started. */
export function useCaseView(): CaseView | null {
  const run = useDemoRun();
  return useMemo(() => (run ? project(run) : null), [run]);
}

export function formatRupees(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
