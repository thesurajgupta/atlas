"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ExternalLink,
  FileText,
  Layers,
  MapPin,
  Minus,
  Plus,
  Route,
  Scan,
  Target,
  TriangleAlert,
  Users,
} from "lucide-react";

import {
  SYNTHETIC_ENTITY_LOCATIONS,
  SYNTHETIC_TRAIL_PATHS,
} from "@/lib/graph/synthetic-trail";
import { SYNTHETIC_CASE } from "@/lib/graph/synthetic-case";
import { formatCoordinates, type EntityLocationIndex } from "@/lib/graph/entity-location";
import type { TrailHop, TrailPath } from "@/lib/graph/types";
import { useDemoCase } from "@/lib/demo/store";
import { CaseBanner } from "@/components/demo/CaseBanner";
import { PageHeader } from "@/components/nav/PageHeader";
import { Card, MockNotice, RiskChip, StatTile } from "@/components/ui/Card";
import TransactionNetworkGraph, {
  ROLE_COLOR,
  ROLE_LABEL,
  type LinkColouring,
  type NetworkLink,
  type NetworkNode,
  type NetworkRisk,
  type NetworkRole,
} from "@/components/graph/TransactionNetworkGraph";

/**
 * Transaction network graph (spec §14) — who is connected to whom, and how much
 * moved.
 *
 * This view answers a different question from `/money-trail`. That page asks
 * *where did the money go*, one hop at a time; this one asks *who is reused*,
 * which is what makes an account infrastructure rather than a one-off.
 *
 * Three things are load-bearing and easy to undo by accident:
 *
 * 1. **The layout is layered, not force-directed.** See the note in
 *    `components/graph/TransactionNetworkGraph`. A network that redraws itself
 *    differently every visit cannot be discussed, screenshotted or cited.
 * 2. **Risk here is reuse, and says so.** Degree is a property of the graph in
 *    front of you, and it is reproducible from it. It is not a model score —
 *    there is no trained model — and every panel that shows it repeats that
 *    rather than letting a red chip imply a calibrated finding (CLAUDE.md
 *    rule 4).
 * 3. **The entities are the shared fixture.** Same accounts as the transaction
 *    trail and investigation pages, so an account carries the same identity
 *    across all three. Nothing is invented locally to make the picture fuller.
 */

const ROLE_ORDER: NetworkRole[] = ["ORIGIN", "INTERMEDIARY", "CASH_OUT_ATM", "CASH_OUT_AGENT"];

const COLOURING_LABEL: Record<LinkColouring, string> = {
  risk: "Risk level",
  amount: "Amount",
  time: "Time (old → new)",
};

function rupees(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Compact rupees for the stat row, where a full figure would not fit. */
function rupeesShort(value: number): string {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`;
  return rupees(value);
}

/**
 * Reuse is the signal. An account seen once is a hop; an account seen
 * repeatedly is infrastructure.
 */
function riskOfDegree(degree: number): NetworkRisk {
  if (degree >= 4) return "HIGH";
  if (degree >= 2) return "MEDIUM";
  return "LOW";
}

interface DerivedNetwork {
  readonly nodes: readonly NetworkNode[];
  readonly links: readonly NetworkLink[];
  readonly hops: readonly TrailHop[];
  readonly totalAmount: number;
  readonly maxDepth: number;
}

/**
 * Fold the trail paths into a node/link graph.
 *
 * Every attribute below is read off the fixture or counted from it. The one
 * derived value is `risk`, which is degree — stated as such wherever it is
 * shown.
 */
function deriveNetwork(paths: readonly TrailPath[]): DerivedNetwork {
  const hops: TrailHop[] = paths.flatMap((path) => [...path.hops]);

  // Paths overlap, so the same edge arrives more than once. De-duplicate on the
  // edge id: counting a shared hop twice would inflate both the transaction
  // count and every amount on screen.
  const uniqueHops = [...new Map(hops.map((hop) => [hop.edge_id, hop])).values()].sort(
    (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
  );

  interface Draft {
    depth: number;
    inbound: number;
    outbound: number;
    received: number;
    sent: number;
    cashOut: "ATM" | "AGENT" | null;
    firstSeen: string;
    lastSeen: string;
  }

  const drafts = new Map<string, Draft>();
  const ensure = (id: string, depth: number, at: string): Draft => {
    const existing = drafts.get(id);
    if (existing !== undefined) {
      existing.depth = Math.min(existing.depth, depth);
      if (at < existing.firstSeen) existing.firstSeen = at;
      if (at > existing.lastSeen) existing.lastSeen = at;
      return existing;
    }
    const draft: Draft = {
      depth,
      inbound: 0,
      outbound: 0,
      received: 0,
      sent: 0,
      cashOut: null,
      firstSeen: at,
      lastSeen: at,
    };
    drafts.set(id, draft);
    return draft;
  };

  for (const hop of uniqueHops) {
    const from = ensure(hop.from_entity_id, hop.depth - 1, hop.occurred_at);
    const to = ensure(hop.to_entity_id, hop.depth, hop.occurred_at);
    const amount = Number(hop.amount);

    from.outbound += 1;
    from.sent += amount;
    to.inbound += 1;
    to.received += amount;

    // The only node kind a trail establishes on its own: the target of a
    // `WITHDREW_AT` hop is where value left the traceable system. Everything
    // else stays an account rather than being guessed at.
    if (hop.edge_type === "WITHDREW_AT") {
      to.cashOut = hop.channel === "AEPS_BC" ? "AGENT" : "ATM";
    }
  }

  const earliest = Date.parse(uniqueHops[0]?.occurred_at ?? new Date().toISOString());
  const latest = Date.parse(
    uniqueHops[uniqueHops.length - 1]?.occurred_at ?? new Date().toISOString(),
  );
  const span = Math.max(1, latest - earliest);

  const nodes: NetworkNode[] = [...drafts.entries()].map(([id, draft]) => {
    const role: NetworkRole =
      draft.cashOut === "ATM"
        ? "CASH_OUT_ATM"
        : draft.cashOut === "AGENT"
          ? "CASH_OUT_AGENT"
          : draft.depth === 0
            ? "ORIGIN"
            : "INTERMEDIARY";

    return {
      id,
      // The first hex block of the entity id, which is how this fixture's
      // accounts are named on every other screen.
      label: id.slice(0, 8).toUpperCase(),
      caption: ROLE_LABEL[role].replace(" accounts", "").replace(" account", ""),
      depth: draft.depth,
      role,
      risk: riskOfDegree(draft.inbound + draft.outbound),
      links: draft.inbound + draft.outbound,
    };
  });

  // One link per ordered pair, carrying the transfer count, so two transfers
  // between the same accounts read as a stronger relationship rather than as
  // two lines drawn on top of each other.
  const grouped = new Map<string, { hops: TrailHop[]; source: string; target: string }>();
  for (const hop of uniqueHops) {
    const key = `${hop.from_entity_id}→${hop.to_entity_id}`;
    const bucket = grouped.get(key) ?? {
      hops: [],
      source: hop.from_entity_id,
      target: hop.to_entity_id,
    };
    bucket.hops.push(hop);
    grouped.set(key, bucket);
  }

  const degreeOf = new Map(nodes.map((node) => [node.id, node.links]));
  const links: NetworkLink[] = [...grouped.entries()].map(([key, bucket]) => {
    const amount = bucket.hops.reduce((sum, hop) => sum + Number(hop.amount), 0);
    const newest = bucket.hops.reduce(
      (peak, hop) => Math.max(peak, Date.parse(hop.occurred_at)),
      earliest,
    );
    // A link is as risky as the more-reused account it touches: a transfer into
    // an account that appears five times is the interesting one.
    const risk = riskOfDegree(
      Math.max(degreeOf.get(bucket.source) ?? 0, degreeOf.get(bucket.target) ?? 0),
    );

    return {
      id: key,
      source: bucket.source,
      target: bucket.target,
      amount,
      count: bucket.hops.length,
      risk,
      recency: (newest - earliest) / span,
    };
  });

  return {
    nodes,
    links,
    hops: uniqueHops,
    totalAmount: uniqueHops.reduce((sum, hop) => sum + Number(hop.amount), 0),
    maxDepth: uniqueHops.reduce((peak, hop) => Math.max(peak, hop.depth), 0),
  };
}

/**
 * The fixture network, folded once at module scope.
 *
 * Kept as a constant rather than recomputed, because with nothing referred it
 * never changes and its node identities have to be stable across renders — the
 * canvas builds one element per node and would otherwise rebuild all of them on
 * every keystroke elsewhere on the page.
 */
const FIXTURE_NETWORK = deriveNetwork(SYNTHETIC_TRAIL_PATHS);

export default function NetworkGraphPage() {
  const { activeCase } = useDemoCase();

  /**
   * The graph draws the referred complaint's accounts when there is one.
   *
   * Same fold, same reuse-as-risk rule, different input: the trail the case was
   * reconstructed from. Nothing on this page is invented for the case — every
   * node is an account that appears on a hop, and every link is a transfer the
   * ledger recorded.
   */
  const NETWORK = useMemo(
    () => (activeCase === null ? FIXTURE_NETWORK : deriveNetwork(activeCase.trail_paths)),
    [activeCase],
  );
  const entityLocations: EntityLocationIndex =
    activeCase?.entity_locations ?? SYNTHETIC_ENTITY_LOCATIONS;
  const caseRef = activeCase?.case_id ?? SYNTHETIC_CASE.caseId;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * The one transfer a table row click was about, as `source→target`.
   *
   * Selecting an entity from the graph highlights everything it touches, which
   * is the right answer for "who is this". A row click is a narrower question —
   * *this* transfer — so it also names the edge, and the graph draws that one
   * heavier. Cleared whenever the selection is made from the graph instead.
   */
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [colourBy, setColourBy] = useState<LinkColouring>("risk");
  const [zoom, setZoom] = useState(1);
  const [visibleRoles, setVisibleRoles] = useState<Record<NetworkRole, boolean>>({
    ORIGIN: true,
    INTERMEDIARY: true,
    CASH_OUT_ATM: true,
    CASH_OUT_AGENT: true,
  });

  const shownNodes = useMemo(
    () => NETWORK.nodes.filter((node) => visibleRoles[node.role]),
    [NETWORK, visibleRoles],
  );

  const selected = NETWORK.nodes.find((node) => node.id === selectedId) ?? null;

  const selectedHops = useMemo(
    () =>
      selected === null
        ? []
        : NETWORK.hops.filter(
            (hop) =>
              hop.from_entity_id === selected.id || hop.to_entity_id === selected.id,
          ),
    [NETWORK, selected],
  );

  /**
   * Everything the detail panel shows about the selection.
   *
   * Every field is counted from the hops already on screen or read from the
   * location index. Nothing is defaulted: an entity with no known location gets
   * `location: null` and the panel says so, because "no location on file" is a
   * normal state for an account (see `lib/graph/entity-location`) and inventing
   * a placeholder coordinate would put a fact on screen that nothing supports.
   */
  const selectedDetail = useMemo(() => {
    if (selected === null) return null;

    let incoming = 0;
    let outgoing = 0;
    const counterparties = new Set<string>();

    for (const hop of selectedHops) {
      if (hop.to_entity_id === selected.id) {
        incoming += Number(hop.amount);
        counterparties.add(hop.from_entity_id);
      }
      if (hop.from_entity_id === selected.id) {
        outgoing += Number(hop.amount);
        counterparties.add(hop.to_entity_id);
      }
    }

    const times = selectedHops.map((hop) => hop.occurred_at).sort();

    return {
      incoming,
      outgoing,
      transfers: selectedHops.length,
      connected: counterparties.size,
      firstSeen: times[0],
      lastSeen: times[times.length - 1],
      location: entityLocations.get(selected.id) ?? null,
    };
  }, [entityLocations, selected, selectedHops]);

  const roleCounts = useMemo(() => {
    const counts = new Map<NetworkRole, number>();
    for (const node of NETWORK.nodes) {
      counts.set(node.role, (counts.get(node.role) ?? 0) + 1);
    }
    return counts;
  }, [NETWORK]);

  const highRiskCount = NETWORK.nodes.filter((node) => node.risk === "HIGH").length;
  const cashOutCount = NETWORK.nodes.filter(
    (node) => node.role === "CASH_OUT_ATM" || node.role === "CASH_OUT_AGENT",
  ).length;
  const largestHop = NETWORK.hops.reduce(
    (peak, hop) => Math.max(peak, Number(hop.amount)),
    0,
  );

  const formatTime = (value: string) =>
    new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <PageHeader
        title="Transaction network graph"
        subtitle="How value moved across accounts, agents and cash-out endpoints"
        searchPlaceholder="Search accounts, endpoints…"
        actions={
          <>
            <span className="rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-ink-700">
              {caseRef}
            </span>
            <Link
              href="/money-trail"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink-700 transition-colors hover:text-ink-900"
            >
              Open the interactive trail
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          </>
        }
      />

      <div className="px-6 py-5">
        <CaseBanner page="The network graph" />

        {/* ---------------- stat row ---------------- */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <StatTile
            value={NETWORK.nodes.length}
            label="Entities"
            icon={<Users className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={NETWORK.hops.length}
            label="Transfers"
            icon={<ArrowLeftRight className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={rupeesShort(NETWORK.totalAmount)}
            label="Value moved"
            hint="Sum of transfers drawn"
            icon={<Layers className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={NETWORK.maxDepth}
            label="Hops deep"
            icon={<Layers className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={highRiskCount}
            label="Most-reused accounts"
            // Nothing to act on is not a warning. A red zero reads as an alert
            // that resolved, rather than as a count that never fired.
            tone={highRiskCount > 0 ? "critical" : "neutral"}
            hint="4 or more links"
            icon={<TriangleAlert className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            value={cashOutCount}
            label="Cash-out points"
            tone="warning"
            icon={<Target className="h-4 w-4" aria-hidden />}
          />
        </div>

        <div className="mb-4">
          <MockNotice>
            {activeCase === null ? (
              <>
                Mock trail for interface development — the same fixture the transaction trail and
                investigation pages read, so the accounts match across all three.
              </>
            ) : (
              <>
                Accounts and transfers are the reconstruction for {activeCase.case_id}, the same
                hops the transaction trail draws. Risk here is <em>reuse</em> — a degree count off
                this graph, reproducible from it — and not a model score.
              </>
            )}
          </MockNotice>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          {/* ---------------- graph ---------------- */}
          <section className="relative flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex min-h-0 flex-1">
            {/* Legend, filters and the link-colour choice.
                A rail rather than the overlay the reference design uses: the
                leftmost graph column is the victim, and an overlay sits exactly
                on top of it at every width the card takes. Reserving the space
                is the only version that cannot cover a node. */}
            <div className="w-[11.5rem] shrink-0 border-r border-line p-2.5">
              <div className="mb-2 text-[11px] font-semibold text-[#C6D4E4]">Show on graph</div>
              <div className="flex flex-col gap-1.5">
                {ROLE_ORDER.map((role) => (
                  <label
                    key={role}
                    className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-700"
                  >
                    <input
                      type="checkbox"
                      checked={visibleRoles[role]}
                      onChange={() =>
                        setVisibleRoles((current) => ({ ...current, [role]: !current[role] }))
                      }
                      className="h-3.5 w-3.5 accent-[#4A8CD4]"
                    />
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: ROLE_COLOR[role] }}
                    />
                    <span className="min-w-0 truncate">{ROLE_LABEL[role]}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-ink-500">
                      {roleCounts.get(role) ?? 0}
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-2.5 border-t border-[#22354C] pt-2.5">
                <div className="mb-1.5 text-[11px] font-semibold text-[#C6D4E4]">
                  Link colour by
                </div>
                <div className="flex flex-col gap-1">
                  {(Object.keys(COLOURING_LABEL) as LinkColouring[]).map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-700"
                    >
                      <input
                        type="radio"
                        name="link-colour"
                        checked={colourBy === option}
                        onChange={() => setColourBy(option)}
                        className="h-3 w-3 accent-[#4A8CD4]"
                      />
                      {COLOURING_LABEL[option]}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <TransactionNetworkGraph
              className="min-w-0 flex-1"
              nodes={shownNodes}
              links={NETWORK.links}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedLinkId(null);
                setSelectedId((current) => (current === id ? null : id));
              }}
              selectedLinkId={selectedLinkId}
              colourBy={colourBy}
              zoom={zoom}
            />
            </div>

            {/* zoom controls, matching the map page's treatment */}
            <div className="absolute bottom-12 right-3 flex flex-col overflow-hidden rounded-md border border-line shadow-lg">
              {[
                { label: "Zoom in", icon: Plus, apply: () => setZoom((z) => Math.min(2.4, z + 0.2)) },
                { label: "Zoom out", icon: Minus, apply: () => setZoom((z) => Math.max(0.6, z - 0.2)) },
                { label: "Reset zoom", icon: Scan, apply: () => setZoom(1) },
              ].map(({ label, icon: Icon, apply }, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={apply}
                  aria-label={label}
                  title={label}
                  className={`grid h-8 w-8 place-items-center bg-[#0A1420]/90 text-ink-700 backdrop-blur transition-colors hover:text-ink-900 ${
                    index < 2 ? "border-b border-line" : ""
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              ))}
            </div>

            <p className="border-t border-line px-3 py-2 text-[11px] text-[#5A6E88]">
              Columns are hops from the victim, so a node sits in the same place every
              visit. Node ring and link colour show <strong className="text-ink-700">reuse</strong>,
              counted from this graph — not a model score.
            </p>
          </section>

          {/* ---------------- transfers ---------------- */}
          <Card
            title={`Transfers (${NETWORK.hops.length})`}
            bodyClassName="p-0"
            className="flex flex-col"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-wider text-ink-500">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">From → to</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Rail</th>
                  </tr>
                </thead>
                <tbody>
                  {NETWORK.hops.map((hop, index) => {
                    const linkId = `${hop.from_entity_id}→${hop.to_entity_id}`;
                    const touchesSelection =
                      selected !== null &&
                      (hop.from_entity_id === selected.id || hop.to_entity_id === selected.id);
                    // The row whose own edge is named, as opposed to a row that
                    // merely touches the selected entity.
                    const isNamedTransfer = linkId === selectedLinkId;
                    return (
                      <tr
                        key={hop.edge_id}
                        // The receiving end is the subject: a transfer is
                        // interesting because of where the money arrived, and
                        // that is the account an investigator acts on next.
                        onClick={() => {
                          setSelectedId(hop.to_entity_id);
                          setSelectedLinkId(linkId);
                        }}
                        aria-current={isNamedTransfer}
                        className={`cursor-pointer border-b border-line/60 last:border-0 ${
                          isNamedTransfer
                            ? "bg-[#1B3350] shadow-[inset_2px_0_0_0_#4A8CD4]"
                            : touchesSelection
                              ? "bg-[#16273C]"
                              : "hover:bg-raised"
                        }`}
                      >
                        <td className="px-3 py-2 tabular-nums text-ink-500">{index + 1}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-ink-900">
                          {hop.from_entity_id.slice(0, 8).toUpperCase()}
                          <span className="mx-1 text-ink-500">→</span>
                          {hop.to_entity_id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-900">
                          {rupees(Number(hop.amount))}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-ink-500">
                          {new Date(hop.occurred_at).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-2 text-ink-700">
                          {hop.edge_type === "WITHDREW_AT"
                            ? (hop.channel ?? "cash-out").replace(/_/g, " ")
                            : (hop.rail ?? "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* ---------------- detail row ---------------- */}
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Card title={selected ? "Entity detail" : "Select an entity"}>
            {selected === null || selectedDetail === null ? (
              <p className="text-[12px] leading-relaxed text-ink-500">
                Pick a node on the graph, or a row in the transfer list, to see every
                transfer it touches and why it is drawn the way it is.
              </p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[14px] text-ink-900">{selected.label}</p>
                    <p className="mt-0.5 text-[11px] text-ink-500">{ROLE_LABEL[selected.role]}</p>
                  </div>
                  <RiskChip level={selected.risk} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12px]">
                  <div className="col-span-2">
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">Entity ID</dt>
                    <dd className="mt-0.5 truncate font-mono text-[11px] text-[#C6D4E4]" title={selected.id}>
                      {selected.id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">Hop depth</dt>
                    <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">{selected.depth}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">Transfers</dt>
                    <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">{selectedDetail.transfers}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">Received</dt>
                    <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">
                      {rupees(selectedDetail.incoming)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">Sent on</dt>
                    <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">
                      {rupees(selectedDetail.outgoing)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">
                      Connected entities
                    </dt>
                    <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">{selectedDetail.connected}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">Links drawn</dt>
                    <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">{selected.links}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">First seen</dt>
                    <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">
                      {selectedDetail.firstSeen ? formatTime(selectedDetail.firstSeen) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">Last seen</dt>
                    <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">
                      {selectedDetail.lastSeen ? formatTime(selectedDetail.lastSeen) : "—"}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[10px] uppercase tracking-wider text-ink-500">Location</dt>
                    <dd className="mt-0.5 text-[#C6D4E4]">
                      {selectedDetail.location === null ? (
                        // Sparse by nature, not an error: most accounts on a
                        // trail have no location, and saying so beats a blank.
                        <span className="text-ink-500">No location on file</span>
                      ) : (
                        <>
                          {selectedDetail.location.displayLabel}
                          <span className="ml-1.5 font-mono text-[11px] tabular-nums text-ink-500">
                            {formatCoordinates(selectedDetail.location)}
                          </span>
                          {selectedDetail.location.isSynthetic && (
                            <span className="ml-1.5 rounded border border-severity-medium/40 px-1 py-px text-[9px] uppercase tracking-wider text-severity-medium">
                              synthetic
                            </span>
                          )}
                        </>
                      )}
                    </dd>
                  </div>
                </dl>

                {/* Investigation actions.
                    Only routes that exist are links. `/map` takes no entity
                    target yet, so it is offered only for an entity that has a
                    coordinate — a cash-out endpoint, which is what that screen
                    is about — and it opens the map rather than centring on this
                    point. An account with no location gets a disabled control
                    that says why, not a link that goes somewhere unrelated. */}
                <div className="mt-3.5 flex flex-wrap gap-2 border-t border-line pt-3">
                  <Link
                    href={`/cases/${caseRef}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[11.5px] text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    View in case
                  </Link>
                  <Link
                    href="/money-trail"
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[11.5px] text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
                  >
                    <Route className="h-3.5 w-3.5" aria-hidden />
                    Trace further
                  </Link>
                  {selectedDetail.location === null ? (
                    <span
                      aria-disabled
                      title="This entity has no coordinate on file, so there is nothing to show on the map."
                      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[11.5px] text-ink-300"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      Show on map
                    </span>
                  ) : (
                    <Link
                      href="/map"
                      title="Opens the ATM / branch map. That view does not take an entity target yet, so it does not centre on this point."
                      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[11.5px] text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      Show on map
                    </Link>
                  )}
                </div>
              </>
            )}
          </Card>

          <Card title={selected ? "Transfers touching this entity" : "Entity mix"}>
            {selected === null ? (
              <ul className="flex flex-col gap-2">
                {ROLE_ORDER.map((role) => {
                  const count = roleCounts.get(role) ?? 0;
                  const share = Math.round((count / NETWORK.nodes.length) * 100);
                  return (
                    <li key={role} className="text-[11.5px]">
                      <div className="flex items-baseline justify-between gap-2 text-[#C6D4E4]">
                        <span className="min-w-0 truncate">{ROLE_LABEL[role]}</span>
                        <span className="shrink-0 tabular-nums text-ink-500">
                          {count} · {share}%
                        </span>
                      </div>
                      <div className="mt-1 h-[3px] w-full rounded-full bg-[#1B2B3F]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${share}%`, background: ROLE_COLOR[role] }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="flex flex-col gap-2">
                {selectedHops.map((hop) => {
                  const outgoing = hop.from_entity_id === selected.id;
                  const other = outgoing ? hop.to_entity_id : hop.from_entity_id;
                  return (
                    <li key={hop.edge_id} className="text-[11.5px]">
                      <span className="block font-mono text-ink-700">
                        {outgoing ? "→ " : "← "}
                        {other.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="mt-0.5 block tabular-nums text-ink-500">
                        {rupees(Number(hop.amount))} · {formatTime(hop.occurred_at)}
                        {hop.rail ? ` · ${hop.rail}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Flow summary">
            <dl className="grid grid-cols-2 gap-2.5">
              {[
                { label: "Largest transfer", value: rupees(largestHop) },
                { label: "Value moved", value: rupees(NETWORK.totalAmount) },
                { label: "Deepest hop", value: String(NETWORK.maxDepth) },
                { label: "Distinct links", value: String(NETWORK.links.length) },
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-line bg-raised p-2.5">
                  <dt className="text-[10px] uppercase tracking-wider text-ink-500">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-[15px] font-semibold tabular-nums text-ink-900">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-500">
              Every figure here is counted from the transfers drawn above. There is no
              network risk score, because scoring a network needs a calibrated model and
              there is not one yet.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
