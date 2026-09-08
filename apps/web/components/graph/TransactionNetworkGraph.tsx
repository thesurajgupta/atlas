"use client";

/**
 * The transaction network, drawn as a node-link diagram.
 *
 * ## Why the layout is layered and not a force simulation
 *
 * Money has a direction and a depth. A physics layout throws both away: the
 * same network re-renders differently on every visit, so an investigator cannot
 * say "the account on the left" to a colleague and be understood, and a
 * screenshot in a case file stops matching the screen. Columns are hops from
 * the victim — the number an investigator already reasons in — and a node lands
 * in the same place every time.
 *
 * ## Why SVG and not the canvas library
 *
 * `components/money-trail/MoneyTrailGraph` is the interactive Cytoscape canvas,
 * built for progressive expansion of a trail one hop at a time. This view
 * answers a different question — who is *reused* across the whole network — and
 * shows every node at once. At that size SVG is the simpler tool, and it keeps
 * the nodes in the accessibility tree, which a canvas cannot.
 */

import { useMemo } from "react";

export type NetworkRole = "ORIGIN" | "INTERMEDIARY" | "CASH_OUT_ATM" | "CASH_OUT_AGENT";
export type NetworkRisk = "HIGH" | "MEDIUM" | "LOW";
export type LinkColouring = "risk" | "amount" | "time";

export interface NetworkNode {
  readonly id: string;
  readonly label: string;
  readonly caption: string;
  readonly depth: number;
  readonly role: NetworkRole;
  readonly risk: NetworkRisk;
  readonly links: number;
}

export interface NetworkLink {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly amount: number;
  readonly count: number;
  readonly risk: NetworkRisk;
  /** 0 for the earliest transfer in the case, 1 for the latest. */
  readonly recency: number;
}

export interface TransactionNetworkGraphProps {
  readonly nodes: readonly NetworkNode[];
  readonly links: readonly NetworkLink[];
  readonly selectedId: string | null;
  /**
   * One link drawn heavier than the rest, as `source→target`. Set when the
   * selection came from a transfer row, which is a question about a single
   * transfer rather than about everything an entity touches.
   */
  readonly selectedLinkId?: string | null;
  readonly onSelect: (id: string) => void;
  readonly colourBy: LinkColouring;
  readonly zoom: number;
  readonly className?: string;
}

/** Severity tokens from `tailwind.config.ts`; the graph does not invent colours. */
export const RISK_COLOR: Record<NetworkRisk, string> = {
  HIGH: "#E5484D",
  MEDIUM: "#E5A23D",
  LOW: "#3E9B6D",
};

export const ROLE_COLOR: Record<NetworkRole, string> = {
  ORIGIN: "#4A8CD4",
  INTERMEDIARY: "#8E9BB0",
  CASH_OUT_ATM: "#B07CD8",
  CASH_OUT_AGENT: "#E5A23D",
};

export const ROLE_LABEL: Record<NetworkRole, string> = {
  ORIGIN: "Victim account",
  INTERMEDIARY: "Intermediary accounts",
  CASH_OUT_ATM: "ATM cash-out",
  CASH_OUT_AGENT: "Agent cash-out",
};

/* Single-path glyphs, drawn in a 24-unit box and scaled to the node radius.
   Inline rather than an icon dependency, matching the shell's approach. */
const ROLE_GLYPH: Record<NetworkRole, string> = {
  ORIGIN: "M12 11 a3.6 3.6 0 1 0 0-7.2 a3.6 3.6 0 0 0 0 7.2 M4.6 20.4 c0-4 3.3-6.4 7.4-6.4 s7.4 2.4 7.4 6.4",
  INTERMEDIARY: "M3 20 h18 M5.5 20 V10 M10 20 V10 M14 20 V10 M18.5 20 V10 M12 3.2 l8.4 4.8 H3.6 Z",
  CASH_OUT_ATM: "M5 7.5 h14 v11 H5 Z M8.4 11 h7.2 M8.4 14.4 h4",
  CASH_OUT_AGENT: "M12 3.4 v17.2 M8.2 7 h5.6 a2.6 2.6 0 0 1 0 5.2 h-3.6 a2.6 2.6 0 0 0 0 5.2 h5.6",
};

const VIEW_WIDTH = 760;
const VIEW_HEIGHT = 560;
// Asymmetric: the right edge also carries the floating zoom controls, and a
// node under a button is a node that cannot be clicked.
const MARGIN_LEFT = 64;
const MARGIN_RIGHT = 118;
const MARGIN_Y = 76;
const NODE_RADIUS = 21;

interface Placed extends NetworkNode {
  readonly x: number;
  readonly y: number;
}

/**
 * Column per depth, evenly spread down the column.
 *
 * Deterministic by construction: position is a pure function of `(depth, index
 * within depth)`, and the index comes from the fixture's order, so nothing here
 * depends on iteration order of a hash map or on when a node was clicked.
 */
function layout(nodes: readonly NetworkNode[]): Placed[] {
  const byDepth = new Map<number, NetworkNode[]>();
  for (const node of nodes) {
    const column = byDepth.get(node.depth) ?? [];
    column.push(node);
    byDepth.set(node.depth, column);
  }

  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const usableWidth = VIEW_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const usableHeight = VIEW_HEIGHT - MARGIN_Y * 2;

  const placed: Placed[] = [];
  depths.forEach((depth, columnIndex) => {
    const column = byDepth.get(depth) ?? [];
    const x =
      depths.length === 1
        ? VIEW_WIDTH / 2
        : MARGIN_LEFT + (usableWidth * columnIndex) / (depths.length - 1);

    column.forEach((node, rowIndex) => {
      const y =
        column.length === 1
          ? VIEW_HEIGHT / 2
          : MARGIN_Y + (usableHeight * rowIndex) / (column.length - 1);
      placed.push({ ...node, x, y });
    });
  });

  return placed;
}

/** Amount ramp: one hue, four steps. Sequential data gets a sequential scale. */
function amountColour(amount: number, max: number): string {
  const share = max === 0 ? 0 : amount / max;
  if (share > 0.66) return "#4A8CD4";
  if (share > 0.33) return "#3E72AC";
  return "#2C5480";
}

/** Time ramp: old links recede, recent ones come forward. */
function timeColour(recency: number): string {
  if (recency > 0.66) return "#5FBE8C";
  if (recency > 0.33) return "#3E9B6D";
  return "#2A6B4C";
}

function linkColour(link: NetworkLink, colourBy: LinkColouring, maxAmount: number): string {
  if (colourBy === "amount") return amountColour(link.amount, maxAmount);
  if (colourBy === "time") return timeColour(link.recency);
  return RISK_COLOR[link.risk];
}

function rupees(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function TransactionNetworkGraph({
  nodes,
  links,
  selectedId,
  selectedLinkId = null,
  onSelect,
  colourBy,
  zoom,
  className,
}: TransactionNetworkGraphProps) {
  const placed = useMemo(() => layout(nodes), [nodes]);
  const position = useMemo(
    () => new Map(placed.map((node) => [node.id, node])),
    [placed],
  );
  const maxAmount = useMemo(
    () => links.reduce((peak, link) => Math.max(peak, link.amount), 0),
    [links],
  );

  // Only links whose endpoints are both currently shown. A half-drawn edge
  // running off to a hidden node would read as a connection to nothing.
  const drawable = links.filter(
    (link) => position.has(link.source) && position.has(link.target),
  );

  const neighbours = useMemo(() => {
    if (selectedId === null) return null;
    const set = new Set<string>([selectedId]);
    for (const link of drawable) {
      if (link.source === selectedId) set.add(link.target);
      if (link.target === selectedId) set.add(link.source);
    }
    return set;
    // `drawable` is derived fresh each render; depending on the inputs it is
    // built from keeps this from recomputing on every unrelated state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, links, position]);

  const scale = zoom;
  const centreX = VIEW_WIDTH / 2;
  const centreY = VIEW_HEIGHT / 2;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-full w-full"
        role="group"
        aria-label={`Transaction network: ${nodes.length} entities, ${drawable.length} links. Columns are hops from the victim account.`}
      >
        <defs>
          {/* One marker per colour actually used, because SVG markers cannot
              inherit the stroke of the path they terminate. */}
          {[...new Set(drawable.map((l) => linkColour(l, colourBy, maxAmount)))].map(
            (colour) => (
              <marker
                key={colour}
                id={`arrow-${colour.replace("#", "")}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                // Direction is the whole point of a money-trail edge, so the
                // head is sized to be read at a glance rather than inferred.
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" fill={colour} />
              </marker>
            ),
          )}
        </defs>

        <g transform={`translate(${centreX} ${centreY}) scale(${scale}) translate(${-centreX} ${-centreY})`}>
          {/* Column rules, so "hop 2" is readable as a place on the diagram. */}
          {[...new Set(placed.map((node) => node.x))].map((x) => (
            <line
              key={x}
              x1={x}
              y1={MARGIN_Y - 34}
              x2={x}
              y2={VIEW_HEIGHT - MARGIN_Y + 34}
              stroke="#1E2B3D"
              strokeWidth="1"
              strokeDasharray="3 5"
            />
          ))}
          {[...new Map(placed.map((node) => [node.depth, node])).values()].map((node) => (
            <text
              key={`depth-${node.depth}`}
              x={node.x}
              y={MARGIN_Y - 44}
              textAnchor="middle"
              fill="#55647A"
              fontSize="10"
              letterSpacing="0.08em"
            >
              {node.depth === 0 ? "VICTIM" : `HOP ${node.depth}`}
            </text>
          ))}

          {drawable.map((link) => {
            const from = position.get(link.source);
            const to = position.get(link.target);
            if (from === undefined || to === undefined) return null;

            const colour = linkColour(link, colourBy, maxAmount);
            const dim = neighbours !== null && !(neighbours.has(link.source) && neighbours.has(link.target));
            // Three states, not two: unrelated, related to the selected entity,
            // and the one transfer a table row actually named.
            const related =
              selectedId !== null && (link.source === selectedId || link.target === selectedId);
            const named = link.id === selectedLinkId;
            const baseWidth = link.count > 2 ? 2 : 1.4;
            const strokeWidth = named ? baseWidth + 1.6 : related ? baseWidth + 0.8 : baseWidth;

            // Trim the line to the node edge so the arrowhead lands on the
            // circle rather than under it.
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const length = Math.hypot(dx, dy) || 1;
            const gap = NODE_RADIUS + 7;
            const x1 = from.x + (dx / length) * gap;
            const y1 = from.y + (dy / length) * gap;
            const x2 = to.x - (dx / length) * gap;
            const y2 = to.y - (dy / length) * gap;

            return (
              <g key={link.id} className="atlas-graph-fade" opacity={dim ? 0.16 : 1}>
                {named && (
                  // A wider stroke in the surface colour behind the line, so the
                  // named transfer separates from anything crossing it without
                  // adding a glow.
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#0D1724"
                    strokeWidth={strokeWidth + 3}
                    strokeLinecap="round"
                  />
                )}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={colour}
                  strokeWidth={strokeWidth}
                  markerEnd={`url(#arrow-${colour.replace("#", "")})`}
                />
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 6}
                  textAnchor="middle"
                  fill={related || named ? "#E8EEF6" : "#A9BACB"}
                  fontSize="11"
                  fontWeight={named ? 600 : 500}
                  className="tabular-nums"
                  // A dark outline under the label, so an amount stays readable
                  // where it crosses an edge. Cheaper and calmer than a plate.
                  style={{ paintOrder: "stroke", stroke: "#0D1724", strokeWidth: 3 }}
                >
                  {rupees(link.amount)}
                </text>
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 + 7}
                  textAnchor="middle"
                  fill="#7A8CA3"
                  fontSize="9.5"
                  style={{ paintOrder: "stroke", stroke: "#0D1724", strokeWidth: 3 }}
                >
                  {link.count} {link.count === 1 ? "transfer" : "transfers"}
                </text>
              </g>
            );
          })}

          {placed.map((node) => {
            const selected = node.id === selectedId;
            const dim = neighbours !== null && !neighbours.has(node.id);
            const colour = ROLE_COLOR[node.role];
            // Where value left the traceable system is the thing an operator is
            // looking for, so a cash-out node is drawn a size up. A few pixels,
            // not a glow: the severity ring already carries the urgency.
            const isCashOut = node.role === "CASH_OUT_ATM" || node.role === "CASH_OUT_AGENT";
            const radius = isCashOut ? NODE_RADIUS + 4 : NODE_RADIUS;

            return (
              <g
                key={node.id}
                className="atlas-graph-fade"
                opacity={dim ? 0.24 : 1}
                role="button"
                tabIndex={0}
                aria-label={`${node.caption} ${node.label}, ${node.risk.toLowerCase()} risk, ${node.links} links`}
                aria-pressed={selected}
                style={{ cursor: "pointer" }}
                onClick={() => onSelect(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(node.id);
                  }
                }}
              >
                {selected && (
                  // Two rings rather than a halo: a dark separator, then a
                  // bright hairline. Reads as selected at any zoom and does not
                  // borrow the severity colours.
                  <>
                    <circle cx={node.x} cy={node.y} r={radius + 9} fill="none" stroke="#0D1724" strokeWidth="3.5" />
                    <circle cx={node.x} cy={node.y} r={radius + 9} fill="none" stroke="#E8EEF6" strokeWidth="1.8" />
                  </>
                )}
                <circle cx={node.x} cy={node.y} r={radius + 3} fill={RISK_COLOR[node.risk]} opacity="0.16" />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius}
                  fill="#101B29"
                  stroke={RISK_COLOR[node.risk]}
                  strokeWidth={isCashOut ? 2.2 : 1.6}
                />
                <g
                  transform={`translate(${node.x - 11} ${node.y - 11}) scale(${isCashOut ? 1.02 : 0.92})`}
                  fill="none"
                  stroke={colour}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={ROLE_GLYPH[node.role]} />
                </g>
                <text
                  x={node.x}
                  y={node.y + radius + 16}
                  textAnchor="middle"
                  fill={selected ? "#FFFFFF" : "#DCE6F2"}
                  fontSize="12"
                  fontWeight={selected ? 600 : 500}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                  style={{ paintOrder: "stroke", stroke: "#0D1724", strokeWidth: 3 }}
                >
                  {node.label}
                </text>
                <text
                  x={node.x}
                  y={node.y + radius + 29}
                  textAnchor="middle"
                  // The entity type is what tells an operator whether a node is
                  // an account or the place cash left the system, so it is lifted
                  // out of the muted tier the old caption sat in.
                  fill={isCashOut ? colour : "#8E9BB0"}
                  fontSize="10.5"
                  letterSpacing="0.02em"
                  style={{ paintOrder: "stroke", stroke: "#0D1724", strokeWidth: 3 }}
                >
                  {node.caption}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
