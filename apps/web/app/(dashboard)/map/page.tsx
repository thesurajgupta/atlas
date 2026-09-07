"use client";

import { PageHeader } from "@/components/nav/PageHeader";
import CashOutMap, {
  KIND_COLOR as MARKER_KIND_COLOR,
  RISK_COLOR as MARKER_RISK_COLOR,
  type CashOutMapPoint,
} from "@/components/map/CashOutMap";
import { destinationPoint } from "@/lib/geo";

import { useMemo, useState, type ReactNode } from "react";

/**
 * ATM / branch cash-out map (spec §24, §25.1, issue #8).
 *
 * Layout, panel set and stat row follow @luckykhan933-byte's design in PR #35.
 * This port drops the duplicate app scaffold from that PR — the shell landed
 * in #36 — and keeps the dark operations surface he designed, which is the
 * conventional treatment for a geospatial view and reads correctly against
 * spec §25.5 (information-dense, semantic colour, no decoration).
 *
 * Three things differ from the draft, all deliberate:
 *
 * 1. **Endpoints are synthetic.** The draft named real branches at real
 *    addresses and marked them fraud-likely. This repository is public; the
 *    rule is synthetic data only (CLAUDE.md rule 3).
 * 2. **Every figure is labelled illustrative.** Nothing is calibrated yet, so
 *    the probability column is mock data wearing the shape of the real thing.
 *    That is fine for interface work and is stated on the panel, rather than
 *    left for a reader to assume (CLAUDE.md rule 4).
 * 3. **The geography is real; what is placed on it is not.** The schematic
 *    ward diagram this page carried first was honest about being a sketch, but
 *    it could not answer the question the screen exists for — how far, in
 *    which direction, at what scale. `components/map/CashOutMap` draws Google
 *    satellite imagery instead, and the caption under it separates the ground,
 *    which is real, from the endpoints, which are not.
 *
 * Not wired to a prediction service, because there is not one yet.
 */

type Priority = "high" | "medium" | "low";

type Endpoint = {
  id: string;
  ref: string;
  kind: "ATM" | "Branch";
  operator: string;
  area: string;
  distanceKm: number;
  /**
   * Bearing from the last confirmed hop, clockwise from true north. The map
   * position is derived from this and `distanceKm` rather than stored beside
   * them: two fields that must agree and are not derived from each other will
   * eventually disagree, and here the disagreement would be a marker sitting
   * at a distance the table denies.
   */
  bearing: number;
  probability: number;
  priority: Priority;
  factors: { label: string; weight: number }[];
  activity: { at: string; amount: string; account: string; status: string }[];
};

/**
 * The last confirmed hop: the centre of the search, and the point every
 * distance on this screen is measured from.
 *
 * A synthetic location, at a real coordinate in the Delhi NCR region. Real, so
 * that the scale bar and the distance column mean something against the ground
 * under them; synthetic in that no complaint put it there.
 *
 * Deliberately not the New Delhi city point: the basemap labels that, and an
 * origin sitting exactly on it would put the place name underneath the marker
 * cluster where neither can be read.
 */
const ORIGIN = { latitude: 28.664, longitude: 77.312, label: "the last confirmed hop" } as const;

/** Search-radius rings, in kilometres — the same 2 / 5 / 10 the schematic drew. */
const RING_RADII_KM = [2, 5, 10] as const;

const ENDPOINTS: Endpoint[] = [
  {
    id: "EP_DEL_0783",
    ref: "Bank A ATM – Sector 12",
    kind: "ATM",
    operator: "Bank A",
    area: "Ward 3, North district",
    distanceKm: 2.4,
    probability: 92,
    priority: "high",
    bearing: 34,
    factors: [
      { label: "Multiple mule accounts linked", weight: 25 },
      { label: "High-value cash withdrawals", weight: 20 },
      { label: "Transactions in short time frame", weight: 18 },
      { label: "Matches known mule pattern", weight: 15 },
      { label: "Proximity to other flagged endpoints", weight: 14 },
    ],
    activity: [
      { at: "05 Sep, 10:24", amount: "₹40,000", account: "XXXX6789", status: "Flagged" },
      { at: "05 Sep, 09:18", amount: "₹25,000", account: "XXXX4321", status: "Flagged" },
      { at: "04 Sep, 19:11", amount: "₹50,000", account: "XXXX9876", status: "Under review" },
      { at: "04 Sep, 18:33", amount: "₹20,000", account: "XXXX3456", status: "Normal" },
      { at: "03 Sep, 11:12", amount: "₹30,000", account: "XXXX7890", status: "Flagged" },
    ],
  },
  {
    id: "EP_DEL_1092",
    ref: "Bank B ATM – Ward 4",
    kind: "ATM",
    operator: "Bank B",
    area: "Ward 4, Central district",
    distanceKm: 4.8,
    probability: 78,
    priority: "high",
    bearing: 118,
    factors: [
      { label: "Two trail accounts withdrew here", weight: 22 },
      { label: "Night-window volume above median", weight: 19 },
      { label: "Shared operator device fingerprint", weight: 16 },
    ],
    activity: [
      { at: "05 Sep, 08:02", amount: "₹35,000", account: "XXXX1122", status: "Flagged" },
      { at: "04 Sep, 22:47", amount: "₹45,000", account: "XXXX7788", status: "Under review" },
    ],
  },
  {
    id: "EP_DEL_2210",
    ref: "Bank C Branch – Ward 9",
    kind: "Branch",
    operator: "Bank C",
    area: "Ward 9, South district",
    distanceKm: 6.1,
    probability: 64,
    priority: "medium",
    bearing: 205,
    factors: [
      { label: "One trail account holds an account here", weight: 20 },
      { label: "Counter withdrawals rising over 14 days", weight: 14 },
    ],
    activity: [
      { at: "03 Sep, 11:12", amount: "₹30,000", account: "XXXX7890", status: "Flagged" },
    ],
  },
  {
    id: "EP_DEL_3341",
    ref: "Bank A BC agent – Ward 7",
    kind: "Branch",
    operator: "Bank A",
    area: "Ward 7, North district",
    distanceKm: 9.3,
    probability: 52,
    priority: "medium",
    bearing: 302,
    factors: [
      { label: "AePS volume above agent median", weight: 17 },
      { label: "Proximity only — no trail account seen", weight: 9 },
    ],
    activity: [],
  },
  {
    id: "EP_DEL_4408",
    ref: "Bank D ATM – Ward 12",
    kind: "ATM",
    operator: "Bank D",
    area: "Ward 12, West district",
    distanceKm: 12.7,
    probability: 31,
    priority: "low",
    bearing: 248,
    factors: [{ label: "Within outer search radius only", weight: 8 }],
    activity: [],
  },
  {
    id: "EP_DEL_5127",
    ref: "Bank B Branch – Ward 5",
    kind: "Branch",
    operator: "Bank B",
    area: "Ward 5, East district",
    distanceKm: 14.2,
    probability: 26,
    priority: "low",
    bearing: 76,
    factors: [{ label: "Within outer search radius only", weight: 7 }],
    activity: [],
  },

  /* --- out-of-district candidates ---------------------------------------
   *
   * A cash-out is not bounded by the district the complaint was filed in.
   * Mule networks move value between states precisely because that is where
   * a jurisdiction boundary sits, so a screen that only ever drew the local
   * ring would hide the case's most interesting candidates and would make the
   * national basemap pointless.
   *
   * These are the same synthetic construction as the block above — a ward and
   * a bearing, not a premises. The region names are geography, which is real;
   * nothing about the endpoint is.
   */
  {
    id: "EP_MUM_2841",
    ref: "Bank B ATM – Ward 2",
    kind: "ATM",
    operator: "Bank B",
    area: "Ward 2, Maharashtra region",
    distanceKm: 1149,
    probability: 71,
    priority: "high",
    bearing: 203.8,
    factors: [
      { label: "Trail account opened in this circle", weight: 21 },
      { label: "Operator seen in two earlier cases", weight: 18 },
      { label: "Withdrawal window matches the pattern", weight: 15 },
    ],
    activity: [
      { at: "05 Sep, 07:41", amount: "₹48,000", account: "XXXX2244", status: "Flagged" },
      { at: "04 Sep, 21:05", amount: "₹42,000", account: "XXXX9911", status: "Under review" },
    ],
  },
  {
    id: "EP_LKO_3390",
    ref: "Bank C ATM – Ward 8",
    kind: "ATM",
    operator: "Bank C",
    area: "Ward 8, Uttar Pradesh region",
    distanceKm: 412.7,
    probability: 58,
    priority: "medium",
    bearing: 117.3,
    factors: [
      { label: "One trail account withdrew in this circle", weight: 19 },
      { label: "Volume above circle median", weight: 12 },
    ],
    activity: [
      { at: "04 Sep, 16:22", amount: "₹28,000", account: "XXXX5510", status: "Under review" },
    ],
  },
  {
    id: "EP_JAI_4712",
    ref: "Bank A Branch – Ward 1",
    kind: "Branch",
    operator: "Bank A",
    area: "Ward 1, Rajasthan region",
    distanceKm: 244.1,
    probability: 55,
    priority: "medium",
    bearing: 220.3,
    factors: [
      { label: "Counter withdrawals rising over 14 days", weight: 16 },
      { label: "Shared operator device fingerprint", weight: 13 },
    ],
    activity: [],
  },
  {
    id: "EP_KOL_5508",
    ref: "Bank D ATM – Ward 11",
    kind: "ATM",
    operator: "Bank D",
    area: "Ward 11, West Bengal region",
    distanceKm: 1299,
    probability: 47,
    priority: "medium",
    bearing: 118.6,
    factors: [{ label: "AePS volume above agent median", weight: 15 }],
    activity: [],
  },
  {
    id: "EP_PAT_6134",
    ref: "Bank C BC agent – Ward 14",
    kind: "Branch",
    operator: "Bank C",
    area: "Ward 14, Bihar region",
    distanceKm: 846.3,
    probability: 38,
    priority: "low",
    bearing: 111.2,
    factors: [{ label: "AePS volume above agent median", weight: 11 }],
    activity: [],
  },
  {
    id: "EP_NAG_6820",
    ref: "Bank A ATM – Ward 6",
    kind: "ATM",
    operator: "Bank A",
    area: "Ward 6, Madhya Pradesh region",
    distanceKm: 849.3,
    probability: 34,
    priority: "low",
    bearing: 167,
    factors: [{ label: "Corridor endpoint only — no trail account seen", weight: 9 }],
    activity: [],
  },
  {
    id: "EP_HYD_7266",
    ref: "Bank B Branch – Ward 10",
    kind: "Branch",
    operator: "Bank B",
    area: "Ward 10, Telangana region",
    distanceKm: 1252.1,
    probability: 29,
    priority: "low",
    bearing: 174,
    factors: [{ label: "Corridor endpoint only — no trail account seen", weight: 8 }],
    activity: [],
  },
  {
    id: "EP_BLR_8093",
    ref: "Bank D ATM – Ward 13",
    kind: "ATM",
    operator: "Bank D",
    area: "Ward 13, Karnataka region",
    distanceKm: 1738.8,
    probability: 24,
    priority: "low",
    bearing: 178.8,
    factors: [{ label: "Corridor endpoint only — no trail account seen", weight: 7 }],
    activity: [],
  },
];

const TONE: Record<Priority, { dot: string; text: string; chipBg: string; chipFg: string }> = {
  high: { dot: "#E5484D", text: "#F2686C", chipBg: "#3B1517", chipFg: "#F2686C" },
  medium: { dot: "#D9A21B", text: "#E5B84B", chipBg: "#332608", chipFg: "#E5B84B" },
  low: { dot: "#3E9B6D", text: "#5FBE8C", chipBg: "#0F2A1D", chipFg: "#5FBE8C" },
};

const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };

// `noUncheckedIndexedAccess` is on, so ENDPOINTS[0] is Endpoint | undefined.
// A guarded helper gives the constant a non-optional *return type*, which
// survives into the component body — a plain `if (!x) throw` at module scope
// does not, because the narrowing is not carried into a nested closure.
function requireFirst(list: readonly Endpoint[]): Endpoint {
  const first = list[0];
  if (!first) throw new Error("ENDPOINTS fixture must not be empty");
  return first;
}
const DEFAULT_ENDPOINT = requireFirst(ENDPOINTS);

/**
 * Distances here run from 2 km to over 1,700, so a fixed unit reads badly at
 * one end or the other: "1738.8 km" is false precision on a candidate nobody
 * will drive to, and "2 km" loses the detail that matters most on the one they
 * will. Metres below a kilometre, one decimal inside the local ring, whole
 * kilometres beyond it.
 */
function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString("en-IN")} km`;
}

/** An endpoint nobody has seen a withdrawal at is a prediction and nothing else. */
const isPredictedOnly = (endpoint: Endpoint) => endpoint.activity.length === 0;

/**
 * Every endpoint as a map point, resolved once at module scope.
 *
 * Not in a `useMemo`: the fixture never changes, and the identity has to be
 * stable across renders — the map builds one marker per entry and would
 * otherwise rebuild all of them on every keystroke elsewhere on the page.
 *
 * The distance is formatted here rather than in the map so the popup and the
 * table's distance column cannot drift apart.
 */
const MAP_POINTS: readonly CashOutMapPoint[] = ENDPOINTS.map((endpoint) => ({
  ...destinationPoint(ORIGIN, endpoint.bearing, endpoint.distanceKm),
  id: endpoint.id,
  label: endpoint.ref,
  kind: endpoint.kind,
  operator: endpoint.operator,
  area: endpoint.area,
  priority: endpoint.priority,
  probability: endpoint.probability,
  distanceLabel: formatDistance(endpoint.distanceKm),
}));

/* --- small inline icons; no new dependency, matching the shell's approach --- */
const I = {
  pin: "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z M12 10 m-2.2 0 a2.2 2.2 0 1 0 4.4 0 a2.2 2.2 0 1 0 -4.4 0",
  warn: "M12 3 L22 20 H2 Z M12 10 v4 M12 17 v.5",
  atm: "M4 8 h16 v11 H4 Z M4 8 l8-5 8 5 M9 19 v-5 h6 v5",
  bank: "M3 20 h18 M5 20 V10 M9.5 20 V10 M14.5 20 V10 M19 20 V10 M12 3 l9 5 H3 Z",
  target: "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M12 12 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M12 1 v3 M12 20 v3 M1 12 h3 M20 12 h3",
};

function Icon({ d, tone }: { d: string; tone: string }) {
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
      style={{ background: `${tone}1F` }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke={tone} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

/* --- map legend controls -------------------------------------------------
 *
 * Every checkbox below filters the map and the ranked table through the same
 * predicate. A control that changes only one of the two would be worse than no
 * control at all, because both are on screen at once.
 */

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-[#5A6E88]">
        {label}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-[#4A8CD4]"
      />
      {children}
    </label>
  );
}

function Stat({ icon, tone, value, label }: { icon: string; tone: string; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-raised px-3.5 py-3">
      <Icon d={icon} tone={tone} />
      <div className="min-w-0">
        <div className="text-[19px] font-semibold leading-none tabular-nums text-ink-900">{value}</div>
        <div className="mt-1 truncate text-[11px] text-ink-500">{label}</div>
      </div>
    </div>
  );
}

type Kind = Endpoint["kind"];
/** Whether anyone has actually seen a withdrawal here, or the endpoint is only predicted. */
type Evidence = "predicted" | "observed";

export default function MapPage() {
  const [selectedId, setSelectedId] = useState(DEFAULT_ENDPOINT.id);
  const [riskShown, setRiskShown] = useState<Record<Priority, boolean>>({
    high: true,
    medium: true,
    low: true,
  });
  const [kindShown, setKindShown] = useState<Record<Kind, boolean>>({ ATM: true, Branch: true });
  const [evidenceShown, setEvidenceShown] = useState<Record<Evidence, boolean>>({
    predicted: true,
    observed: true,
  });
  const [showPaths, setShowPaths] = useState(true);

  // One predicate for both surfaces. The map is handed the whole fixture and a
  // set of ids to show rather than a filtered list, so a filter toggle changes
  // marker visibility instead of rebuilding every marker.
  const shown = useMemo(
    () =>
      ENDPOINTS.filter(
        (e) =>
          riskShown[e.priority] &&
          kindShown[e.kind] &&
          evidenceShown[isPredictedOnly(e) ? "predicted" : "observed"],
      ),
    [riskShown, kindShown, evidenceShown],
  );
  const ranked = useMemo(() => [...shown].sort((a, b) => b.probability - a.probability), [shown]);
  const visibleIds = useMemo(() => new Set(shown.map((e) => e.id)), [shown]);
  const selected = ENDPOINTS.find((e) => e.id === selectedId) ?? DEFAULT_ENDPOINT;
  const tone = TONE[selected.priority];

  const circ = 2 * Math.PI * 42;

  return (
    <>
      <PageHeader
        title="ATM / branch map"
        subtitle="Actual and predicted cash-out locations from transaction analysis"
        searchPlaceholder="Search locations, endpoints…"
        actions={
          <>
            <span className="rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] tabular-nums text-ink-700">
              01 Sep 2026 → 05 Sep 2026
            </span>
            <span className="rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] text-ink-700">
              All banks
            </span>
          </>
        }
      />
      <div className="px-5 py-5 text-ink-900">
      {/* ---------------- stat row ---------------- */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <Stat icon={I.pin} tone="#4A8CD4" value="1,842" label="Total locations" />
        <Stat icon={I.warn} tone="#E5484D" value="284" label="High-risk locations" />
        <Stat icon={I.atm} tone="#4A8CD4" value="1,237" label="ATMs" />
        <Stat icon={I.bank} tone="#8E9BB0" value="605" label="Bank branches" />
        <Stat icon={I.target} tone="#3E9B6D" value="76" label="Predicted (today)" />
      </div>

      {/* ---------------- map + ranked list ---------------- */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Column height is set by the ranked list beside this one, which grows
            with the candidate count. The map takes whatever that leaves rather
            than sitting at a fixed height above dead space. */}
        <section className="relative flex min-h-[480px] flex-col overflow-hidden rounded-lg border border-line bg-surface">
          <CashOutMap
            className="w-full flex-1"
            points={MAP_POINTS}
            visibleIds={visibleIds}
            origin={ORIGIN}
            ringRadiiKm={RING_RADII_KM}
            showPaths={showPaths}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          {/* legend overlay, as in the design */}
          <div className="absolute left-3 top-3 w-[172px] rounded-lg border border-[#22354C] bg-[#0A1420]/95 p-2.5 backdrop-blur">
            <div className="mb-2 text-[11px] font-semibold text-[#C6D4E4]">Show on map</div>

            <FilterGroup label="Risk">
              {(["high", "medium", "low"] as Priority[]).map((p) => (
                <Check
                  key={p}
                  checked={riskShown[p]}
                  onChange={() => setRiskShown((v) => ({ ...v, [p]: !v[p] }))}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: MARKER_RISK_COLOR[p] }}
                  />
                  {PRIORITY_LABEL[p]}-risk locations
                </Check>
              ))}
            </FilterGroup>

            <FilterGroup label="Type">
              <Check
                checked={kindShown.ATM}
                onChange={() => setKindShown((v) => ({ ...v, ATM: !v.ATM }))}
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-[#4C5A6E]"
                  style={{ borderColor: MARKER_KIND_COLOR.ATM }}
                />
                ATMs
              </Check>
              <Check
                checked={kindShown.Branch}
                onChange={() => setKindShown((v) => ({ ...v, Branch: !v.Branch }))}
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-[1px] border-2 bg-[#4C5A6E]"
                  style={{ borderColor: MARKER_KIND_COLOR.Branch }}
                />
                Bank branches
              </Check>
            </FilterGroup>

            <FilterGroup label="Evidence">
              <Check
                checked={evidenceShown.predicted}
                onChange={() => setEvidenceShown((v) => ({ ...v, predicted: !v.predicted }))}
              >
                Predicted only
              </Check>
              <Check
                checked={evidenceShown.observed}
                onChange={() => setEvidenceShown((v) => ({ ...v, observed: !v.observed }))}
              >
                With recorded activity
              </Check>
            </FilterGroup>

            <FilterGroup label="Overlay">
              <Check checked={showPaths} onChange={() => setShowPaths((on) => !on)}>
                <span className="inline-block h-[2px] w-2.5 shrink-0 bg-accent" />
                Lines to last hop
              </Check>
            </FilterGroup>

            {/* The rings and the origin dot are drawn but not toggleable, so the
                key says what they are rather than offering a control. */}
            <div className="mt-2 border-t border-[#22354C] pt-2 text-[10px] leading-relaxed text-ink-500">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
              Last confirmed hop, with 2 / 5 / 10 km rings
              <span className="mt-1 block">Fill is risk; outline is ATM or branch.</span>
            </div>
          </div>

          <p className="border-t border-line px-3 py-2 text-[11px] text-[#5A6E88]">
            Satellite basemap and place names © Google — real geography. The endpoints, wards and
            scores placed on that ground are synthetic: no complaint put them there, and no
            calibrated model scored them.
          </p>
        </section>

        <section className="rounded-lg border border-line bg-raised p-3">
          <h2 className="mb-1 text-[15px] font-semibold">Predicted cash-out locations</h2>
          <p className="mb-3 text-[11px] leading-relaxed text-ink-500">
            Mock figures for interface development. Live values come only from a validated,
            calibrated model run — there is no trained model yet.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#22354C] text-[10px] uppercase tracking-wider text-[#5A6E88]">
                  <th className="pb-2 pr-2 font-medium">#</th>
                  <th className="pb-2 pr-2 font-medium">Location</th>
                  <th className="pb-2 pr-2 font-medium">Type</th>
                  <th className="pb-2 pr-2 text-right font-medium">Score</th>
                  <th className="pb-2 pr-2 font-medium">Risk</th>
                  <th className="pb-2 text-right font-medium">Distance</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((e, i) => {
                  const t = TONE[e.priority];
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelectedId(e.id)}
                      aria-current={e.id === selected.id}
                      className={`cursor-pointer border-b border-[#18273A] last:border-0 ${
                        e.id === selected.id ? "bg-[#16273C]" : "hover:bg-[#142234]"
                      }`}
                    >
                      <td className="py-2 pr-2 tabular-nums text-[#5A6E88]">{i + 1}</td>
                      <td className="py-2 pr-2 font-medium text-[#DCE6F2]">{e.ref}</td>
                      <td className="py-2 pr-2 text-ink-500">{e.kind}</td>
                      <td className="py-2 pr-2 text-right font-semibold tabular-nums" style={{ color: t.text }}>
                        {e.probability}%
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: t.chipBg, color: t.chipFg }}
                        >
                          {PRIORITY_LABEL[e.priority]}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink-700">{formatDistance(e.distanceKm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {ranked.length === 0 && (
              <p className="py-8 text-center text-[12px] text-[#5A6E88]">
                No locations match the current filter.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* ---------------- detail row ---------------- */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <section className="rounded-lg border border-line bg-raised p-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <h2 className="text-[14px] font-semibold">Location details</h2>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: tone.chipBg, color: tone.chipFg }}
            >
              {PRIORITY_LABEL[selected.priority]} risk
            </span>
          </div>
          <p className="text-[17px] font-semibold leading-snug text-ink-900">{selected.ref}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12px]">
            <div className="col-span-2">
              <dt className="text-[10px] uppercase tracking-wider text-[#5A6E88]">Area</dt>
              <dd className="mt-0.5 text-[#C6D4E4]">{selected.area}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-[#5A6E88]">Endpoint ID</dt>
              <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">{selected.id}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-[#5A6E88]">Type</dt>
              <dd className="mt-0.5 text-[#C6D4E4]">{selected.kind}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-[#5A6E88]">Operator</dt>
              <dd className="mt-0.5 text-[#C6D4E4]">{selected.operator}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-[#5A6E88]">From last hop</dt>
              <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">{formatDistance(selected.distanceKm)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-line bg-raised p-3.5">
          <h2 className="mb-2.5 text-[14px] font-semibold">Risk analysis</h2>
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 100 100" className="h-[104px] w-[104px] shrink-0" role="img" aria-label={`Score ${selected.probability} out of 100`}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="#1B2B3F" strokeWidth="9" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={tone.dot}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${(selected.probability / 100) * circ} ${circ}`}
                transform="rotate(-90 50 50)"
              />
              <text x="50" y="50" textAnchor="middle" fill="#E8EEF6" fontSize="21" fontWeight="600" className="tabular-nums">
                {selected.probability}%
              </text>
              <text x="50" y="64" textAnchor="middle" fill="#7A8CA3" fontSize="8.5">
                score
              </text>
            </svg>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-[#5A6E88]">
                Key risk factors
              </div>
              <ul className="flex flex-col gap-1.5">
                {selected.factors.map((f) => (
                  <li key={f.label} className="text-[11.5px] leading-snug text-[#C6D4E4]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0">{f.label}</span>
                    </div>
                    <div className="mt-1 h-[3px] w-full rounded-full bg-[#1B2B3F]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(f.weight / 25) * 100}%`, background: tone.dot }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-raised p-3.5">
          <h2 className="mb-2.5 text-[14px] font-semibold">Recent activity at this location</h2>
          {selected.activity.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-[#5A6E88]">
              No withdrawals recorded in the retained window.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#22354C] text-[10px] uppercase tracking-wider text-[#5A6E88]">
                    <th className="pb-2 pr-2 font-medium">When</th>
                    <th className="pb-2 pr-2 text-right font-medium">Amount</th>
                    <th className="pb-2 pr-2 font-medium">Account</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.activity.map((a) => (
                    <tr key={`${a.at}-${a.account}`} className="border-b border-[#18273A] last:border-0">
                      <td className="py-2 pr-2 tabular-nums text-ink-700">{a.at}</td>
                      <td className="py-2 pr-2 text-right font-medium tabular-nums text-[#DCE6F2]">
                        {a.amount}
                      </td>
                      <td className="py-2 pr-2 tabular-nums text-ink-500">{a.account}</td>
                      <td className="py-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={
                            a.status === "Flagged"
                              ? { background: TONE.high.chipBg, color: TONE.high.chipFg }
                              : a.status === "Under review"
                                ? { background: TONE.medium.chipBg, color: TONE.medium.chipFg }
                                : { background: "#16202E", color: "#8E9BB0" }
                          }
                        >
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      </div>
    </>
  );
}
