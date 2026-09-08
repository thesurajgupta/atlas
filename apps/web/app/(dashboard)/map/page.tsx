"use client";

import { CaseContextBar } from "@/components/demo/CaseContextBar";
import { PipelineRail } from "@/components/demo/PipelineRail";
import { useCaseView } from "@/lib/case-view";
import { EndpointMap, type MapEndpoint } from "@/components/map/EndpointMap";
import { listEndpoints, type ApiEndpoint } from "@/lib/api";
import { useSignedIn } from "@/lib/use-signed-in";

import { PageHeader } from "@/components/nav/PageHeader";

import { useEffect, useMemo, useState } from "react";

/**
 * ATM / branch cash-out map (spec §24, §25.1, issue #8).
 *
 * Layout, panel set and stat row follow @luckykhan933-byte's design in PR #35.
 * This port drops the duplicate app scaffold from that PR — the shell landed
 * in #36 — and keeps the dark operations surface he designed, which is the
 * conventional treatment for a geospatial view and reads correctly against
 * spec §25.5 (information-dense, semantic colour, no decoration).
 *
 * Two things differ from the draft, both deliberate:
 *
 * 1. **Endpoints are synthetic.** The draft named real branches at real
 *    addresses with real coordinates and marked them fraud-likely. This
 *    repository is public; the rule is synthetic data only (CLAUDE.md rule 3).
 * 2. **Every figure is labelled illustrative.** Nothing is calibrated yet, so
 *    the probability column is mock data wearing the shape of the real thing.
 *    That is fine for interface work and is stated on the panel, rather than
 *    left for a reader to assume (CLAUDE.md rule 4).
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
  probability: number;
  priority: Priority;
  x: number;
  y: number;
  factors: { label: string; weight: number }[];
  activity: { at: string; amount: string; account: string; status: string }[];
};

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
    x: 152,
    y: 98,
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
    x: 252,
    y: 164,
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
    x: 112,
    y: 184,
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
    x: 308,
    y: 104,
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
    x: 86,
    y: 230,
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
    x: 340,
    y: 212,
    factors: [{ label: "Within outer search radius only", weight: 7 }],
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

const WARDS = [
  "M18 16 L150 10 L166 84 L60 108 L14 70 Z",
  "M150 10 L300 18 L316 80 L166 84 Z",
  "M300 18 L404 26 L400 100 L316 80 Z",
  "M14 70 L60 108 L74 200 L20 208 Z",
  "M60 108 L166 84 L200 184 L74 200 Z",
  "M166 84 L316 80 L322 180 L200 184 Z",
  "M316 80 L400 100 L404 198 L322 180 Z",
  "M20 208 L74 200 L110 256 L26 254 Z",
  "M74 200 L200 184 L232 254 L110 256 Z",
  "M200 184 L322 180 L330 252 L232 254 Z",
];

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

export default function MapPage() {
  const caseView = useCaseView();
  const [selectedId, setSelectedId] = useState(DEFAULT_ENDPOINT.id);
  const [visible, setVisible] = useState<Record<Priority, boolean>>({ high: true, medium: true, low: true });

  // When a case is active its scores win. The schematic positions only exist in
  // this fixture — the endpoint registry has real lat/lon and no ward geometry —
  // so the map keeps its own layout and takes the *ranking* from the case. That
  // is what stops this page and /predicted-locations disagreeing about which
  // endpoint is first, which was the whole problem.
  //
  // Matched on the numeric part of the reference: this fixture uses
  // `EP_DEL_0783`, the API returns `EP-0783`.
  const endpoints = useMemo(() => {
    if (!caseView) return ENDPOINTS;
    const scored = new Map(
      caseView.candidates.map((c) => [c.endpoint_ref.replace(/\D/g, ""), c]),
    );
    return ENDPOINTS.map((e) => {
      const match = scored.get(e.id.replace(/\D/g, ""));
      if (!match) return { ...e, probability: 0, priority: "low" as Priority };
      return {
        ...e,
        probability: Math.round(match.score * 100),
        priority: (match.risk === "HIGH"
          ? "high"
          : match.risk === "MEDIUM"
            ? "medium"
            : "low") as Priority,
      };
    });
  }, [caseView]);

  // Real coordinates for the map, from the endpoint registry rather than from
  // this file's schematic x/y. Fetched once; a failure leaves the map empty
  // rather than the page broken, and the ranked table beside it still works.
  const [registry, setRegistry] = useState<ApiEndpoint[]>([]);
  const signedIn = useSignedIn();
  useEffect(() => {
    if (!signedIn) return;
    listEndpoints()
      .then((r) => setRegistry(r.items))
      .catch(() => setRegistry([]));
  }, [signedIn]);

  const shown = useMemo(() => endpoints.filter((e) => visible[e.priority]), [endpoints, visible]);

  // Scores come from the same place the ranked table reads, matched on the
  // numeric part of the reference — this page's ids are `EP_DEL_0783`, the API
  // returns `EP-0783`. One source, so the map and the table cannot disagree
  // about which endpoint is first.
  const mapEndpoints = useMemo<MapEndpoint[]>(() => {
    const scored = new Map(endpoints.map((e) => [e.id.replace(/\D/g, ""), e]));
    return registry
      .filter((e) => e.is_geolocatable && e.lat !== null && e.lon !== null)
      .map((e) => {
        const local = scored.get(e.public_ref.replace(/\D/g, ""));
        const priority = local?.priority ?? "low";
        return {
          id: local?.id ?? e.public_ref,
          label: `${e.public_ref} · ${e.operator}`,
          lat: e.lat as number,
          lon: e.lon as number,
          kind:
            e.channel === "ATM"
              ? ("ATM" as const)
              : e.channel === "BANK_BRANCH"
                ? ("Branch" as const)
                : ("Other" as const),
          risk: (priority === "high"
            ? "HIGH"
            : priority === "medium"
              ? "MEDIUM"
              : "LOW") as MapEndpoint["risk"],
          // On the current case's ranked list. Drawn in its own colour and
          // given the pulse — "the model ranked this for this case" is a
          // different statement from "this location carries risk", and an
          // officer has to be able to tell them apart.
          predicted: caseView?.candidates.some(
            (c) => c.endpoint_ref.replace(/\D/g, "") === e.public_ref.replace(/\D/g, ""),
          ),
          score: local ? local.probability / 100 : undefined,
        };
      })
      // A predicted location is never hidden by the risk checkboxes. Those
      // filter the historical risk bands; a candidate the model produced for
      // the open case is the reason to be on this page, and silently dropping
      // it because it happens to sit in an unticked band is how an operator
      // concludes the prediction produced nothing.
      .filter((e) => e.predicted || visible[e.risk.toLowerCase() as Priority]);
  }, [registry, endpoints, visible, caseView]);
  const ranked = useMemo(() => [...shown].sort((a, b) => b.probability - a.probability), [shown]);
  const found = endpoints.find((e) => e.id === selectedId) ?? DEFAULT_ENDPOINT;

  // With a case active the activity table shows *that case's* hops, not the
  // fixture's. A withdrawal table listing amounts from no case in the system is
  // the stray-number problem this integration exists to remove — and ATLAS has
  // no withdrawal feed, so the honest content is the money that reached this
  // trail, labelled as such.
  const selected = caseView
    ? {
        ...found,
        activity: caseView.hops.slice(0, 5).map((h) => ({
          at: new Date(h.occurredAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
          amount: `₹${h.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
          account: h.toLabel,
          status: h.depth >= 3 ? "Under review" : "Traced",
        })),
      }
    : found;
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
      <CaseContextBar stage="ATM / branch map" />
      <PipelineRail current="Prediction" />
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
        <section className="relative overflow-hidden rounded-lg border border-line bg-surface">
          {/* A real projection with real coordinates, in place of the ward
              schematic. The endpoints come from `GET /api/v1/geo/endpoints`,
              so a marker only appears where the registry actually has a
              latitude and longitude — a crypto off-ramp has no physical
              place and is absent rather than given a plausible one. */}
          <EndpointMap
            endpoints={mapEndpoints}
            selectedId={selectedId}
            onSelect={setSelectedId}
            className="h-[340px] w-full"
          />

          {/* legend overlay, as in the design */}
          <div className="absolute left-3 top-3 rounded-lg border border-[#22354C] bg-[#0A1420]/95 p-2.5 backdrop-blur">
            <div className="mb-2 text-[11px] font-semibold text-[#C6D4E4]">Show on map</div>
            <div className="flex flex-col gap-1.5">
              {(["high", "medium", "low"] as Priority[]).map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-700">
                  <input
                    type="checkbox"
                    checked={visible[p]}
                    onChange={() => setVisible((v) => ({ ...v, [p]: !v[p] }))}
                    className="h-3.5 w-3.5 accent-[#4A8CD4]"
                  />
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: TONE[p].dot }} />
                  {PRIORITY_LABEL[p]}-risk locations
                </label>
              ))}

              {/* Not a checkbox: predicted candidates are always drawn. The
                  legend still has to name the colour, or a purple pulsing
                  marker is an unexplained one. */}
              {caseView && caseView.candidates.length > 0 && (
                <div className="mt-1 flex items-center gap-2 border-t border-line pt-1.5 text-[11px] text-ink-700">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: "#8B5CF6" }}
                  />
                  Predicted cash-out ({caseView.candidates.length})
                </div>
              )}
              <p className="mt-1 text-[10px] leading-snug text-ink-500">
                Pulsing markers are actionable — predicted, or high risk.
              </p>
            </div>
          </div>

          <p className="border-t border-line px-3 py-2 text-[11px] text-[#5A6E88]">
            OpenStreetMap basemap. Markers sit at the coordinates the endpoint registry
            carries — endpoints without one, such as a crypto off-ramp, are not drawn
            rather than placed somewhere plausible.
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
                        {e.probability > 0 ? `${e.probability}%` : "not ranked"}
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: t.chipBg, color: t.chipFg }}
                        >
                          {PRIORITY_LABEL[e.priority]}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink-700">{e.distanceKm} km</td>
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
              <dd className="mt-0.5 tabular-nums text-[#C6D4E4]">{selected.distanceKm} km</dd>
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
                {selected.probability > 0 ? `${selected.probability}%` : "—"}
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
          <h2 className="mb-2.5 text-[14px] font-semibold">
            {caseView ? "Money that reached this trail" : "Recent activity at this location"}
          </h2>
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
