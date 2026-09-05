/**
 * The selected-entity panel.
 *
 * Presentational: every fact shown is passed in, and the only things it can do
 * are toggle one node's expansion and clear the selection. The reducer decides
 * what a node's state *is*; this panel decides how plainly it is said.
 *
 * Nothing here is a rating. Counts are counts, amounts are the payload's own
 * decimal strings, and where the trail does not carry a fact the panel says so
 * rather than filling the gap.
 */

import type { EntityLocation } from '@/lib/graph/entity-location';
import { formatCoordinates } from '@/lib/graph/entity-location';
import type { EntityId, MoneyTrailEdge, MoneyTrailNode } from '@/lib/graph/types';

import EntityLocationMap from './EntityLocationMap';
import PaymentBadge from './PaymentBadge';
import RoleIcon from './RoleIcon';
import { isoClock, isoDay, shortId } from './format';


/** How each expansion state is explained in words, not only in pixels. */
const EXPANSION_COPY: Record<MoneyTrailNode['expansion'], string> = {
  EXPANDED: 'Opened. Onward hops from this entity are on the canvas.',
  COLLAPSED: 'Onward hops are known and not drawn yet.',
  TERMINAL: 'The reconstructed trail ends here — no onward hop was found.',
  SEARCH_TRUNCATED:
    'The search stopped here at the depth ceiling. Whether the money moved further is unknown.',
};

const EXPANSION_TAG: Record<MoneyTrailNode['expansion'], string> = {
  EXPANDED: 'Opened',
  COLLAPSED: 'Collapsed',
  TERMINAL: 'Trail ends here',
  SEARCH_TRUNCATED: 'Search truncated',
};

const ROLE_COPY: Record<MoneyTrailNode['role'], string> = {
  ORIGIN: 'Origin account',
  INTERMEDIARY: 'Intermediary',
  CASH_OUT: 'Cash-out endpoint',
};

/** Chip colours match the node on the canvas, so panel and graph agree.
 *  Categorical — what the entity is on this trail, not how dangerous it is. */
const ROLE_TONE: Record<MoneyTrailNode['role'], string> = {
  ORIGIN: 'border-sky-500/50 bg-sky-500/10 text-sky-200',
  INTERMEDIARY: 'border-slate-600 bg-slate-700/40 text-slate-200',
  CASH_OUT: 'border-red-600/60 bg-red-600/12 text-red-300',
};

/**
 * One incident hop. The amount leads at the largest size in the panel body —
 * it is the evidence the panel is being read for; counterparty and transaction
 * time sit beneath as supporting detail.
 */
function HopRow({ edge, direction }: { edge: MoneyTrailEdge; direction: 'in' | 'out' }) {
  const qualifier = edge.channel ?? edge.rail;
  const counterparty = shortId(direction === 'in' ? edge.source : edge.target);
  const isWithdrawal = edge.edgeType === 'WITHDREW_AT';
  return (
    <li
      className={`flex flex-col gap-1 rounded-sm border-l-2 py-1 pl-2.5 ${
        isWithdrawal ? 'border-amber-500 bg-amber-500/5' : 'border-slate-600'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-value font-semibold tabular-nums text-slate-50">
          {edge.amount}
        </span>
        <PaymentBadge method={qualifier} />
      </div>
      <div className="flex items-baseline justify-between gap-2 font-mono text-ui-secondary text-slate-500">
        <span>
          {direction === 'in' ? '←' : '→'} {counterparty}
        </span>
        <time dateTime={edge.occurredAt}>
          {isoDay(edge.occurredAt)} {isoClock(edge.occurredAt)}
        </time>
      </div>
    </li>
  );
}

export interface EntityPanelProps {
  readonly node: MoneyTrailNode | null;
  readonly incomingEdges: readonly MoneyTrailEdge[];
  readonly outgoingEdges: readonly MoneyTrailEdge[];
  /** Onward hops the reducer knows about and the canvas is not drawing. */
  readonly hiddenHops: number;
  /** Geographic annotation for this entity, where any is known. Joined by id at
   *  the view boundary — never carried on a hop. */
  readonly location: EntityLocation | null;
  readonly onToggleExpansion: (id: EntityId) => void;
  readonly onClose: () => void;
}

export default function EntityPanel({
  node,
  incomingEdges,
  outgoingEdges,
  hiddenHops,
  location,
  onToggleExpansion,
  onClose,
}: EntityPanelProps) {
  // The channel belongs to the withdrawal hop, not to the entity, so it is read
  // off the arriving edge rather than assumed from the node.
  const cashOutChannel =
    incomingEdges.find((edge) => edge.edgeType === 'WITHDREW_AT')?.channel ?? null;

  if (node === null) {
    return (
      <aside className="flex max-h-[38dvh] w-full shrink-0 flex-col overflow-y-auto border-t border-slate-800 bg-slate-900 lg:max-h-none lg:w-[312px] lg:border-t-0 lg:border-l">
        <div className="flex flex-col gap-2 p-4">
          <h2 className="text-ui-secondary font-semibold uppercase tracking-[0.14em] text-slate-400">
            Entity detail
          </h2>
          <p className="text-ui-primary leading-relaxed text-slate-300">
            Select a node to inspect the trail and expand one hop.
          </p>
          <p className="text-ui-secondary leading-relaxed text-slate-500">
            The trail opens one hop at a time. Only the entities you have opened are drawn — the
            rest of the reconstruction stays off the canvas until you ask for it.
          </p>
        </div>
      </aside>
    );
  }


  const canExpand = node.expansion === 'COLLAPSED' || node.expansion === 'EXPANDED';

  // Activity spans the hops actually drawn at this entity. Derived from their
  // `occurred_at` values and nothing else — no inferred dormancy, no gap
  // scoring, just the first and last time value moved here.
  const incidentTimes = [...incomingEdges, ...outgoingEdges]
    .map((edge) => edge.occurredAt)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const firstActivity = incidentTimes.at(0) ?? null;
  const lastActivity = incidentTimes.at(-1) ?? null;

  return (
    <aside className="flex max-h-[38dvh] w-full shrink-0 flex-col overflow-hidden border-t border-slate-800 bg-slate-900 lg:max-h-none lg:w-[312px] lg:border-t-0 lg:border-l">
      {/* 1. Role badge — what this entity is on the trail, before anything else. */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-800 px-3 py-2.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* The same Font Awesome glyph the node carries on the canvas, so
                the panel and the graph are visibly about one thing. */}
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border ${ROLE_TONE[node.role]}`}
            >
              <RoleIcon role={node.role} className="h-3 w-3" />
            </span>
            <span
              className={`rounded-sm border px-1.5 py-0.5 text-micro font-semibold tracking-[0.1em] uppercase ${ROLE_TONE[node.role]}`}
            >
              {ROLE_COPY[node.role]}
            </span>
            {cashOutChannel !== null && <PaymentBadge method={cashOutChannel} />}
            <span className="text-ui-secondary text-slate-500">depth {node.depth}</span>
          </div>
          <p className="font-mono text-value leading-none tracking-tight text-slate-50">{node.label}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close entity detail"
          className="shrink-0 rounded-sm border border-slate-700 px-2 py-0.5 text-ui-secondary text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          Close
        </button>
      </div>

      {/* Scrolls independently; the action bar below stays put. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 2. The full synthetic identifier. */}
        <section className="border-b border-slate-800 px-3 py-2.5">
          <h3 className="mb-1 text-micro font-semibold tracking-[0.12em] text-slate-500 uppercase">
            Synthetic entity id
          </h3>
          <p className="rounded-sm border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-technical leading-relaxed break-all text-slate-300">
            {node.id}
          </p>
        </section>

        {/* 3. State. Terminal and search-truncated are never styled alike. */}
        <section className="border-b border-slate-800 px-3 py-2.5">
          <h3 className="mb-1.5 text-micro font-semibold tracking-[0.12em] text-slate-500 uppercase">
            Trail state
          </h3>
          <div
            className={`rounded-sm border px-2.5 py-2 text-ui-secondary leading-relaxed ${
              node.expansion === 'SEARCH_TRUNCATED'
                ? 'border-dashed border-slate-500 bg-slate-800/50 text-slate-200'
                : 'border-slate-700 bg-slate-800/40 text-slate-300'
            }`}
          >
            <span className="mb-0.5 block text-micro font-semibold tracking-[0.12em] text-slate-400 uppercase">
              {EXPANSION_TAG[node.expansion]}
            </span>
            {EXPANSION_COPY[node.expansion]}
          </div>
        </section>

        {/* 4. Network facts — counts only, nothing weighted into a rating. */}
        <section className="border-b border-slate-800 px-3 py-2.5">
          <h3 className="mb-1.5 text-micro font-semibold tracking-[0.12em] text-slate-500 uppercase">
            Network
          </h3>
          <dl className="flex flex-col gap-1.5 text-ui-secondary">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-500">Entity type</dt>
              <dd className="text-right text-slate-200">
                {node.type ?? 'not carried by the trail'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-500">Hops in</dt>
              <dd className="font-mono tabular-nums text-slate-200">{incomingEdges.length}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-500">Hops out (drawn)</dt>
              <dd className="font-mono tabular-nums text-slate-200">{outgoingEdges.length}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-500">Hops out (not drawn)</dt>
              <dd className="font-mono tabular-nums text-slate-200">{hiddenHops}</dd>
            </div>
            {cashOutChannel !== null && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">Cash-out channel</dt>
                <dd>
                  <PaymentBadge method={cashOutChannel} />
                </dd>
              </div>
            )}
          </dl>
        </section>

        {/* 5. Location — geographic annotation, joined by entity id. Not part
               of the trail: a hop carries no coordinate, so most entities have
               nothing here and the section says so rather than going blank. */}
        <section className="border-b border-slate-800 px-3 py-2.5">
          <h3 className="mb-1.5 text-micro font-semibold tracking-[0.12em] text-slate-500 uppercase">
            Location
          </h3>
          {location === null ? (
            <p className="text-ui-secondary leading-relaxed text-slate-500">
              Location not available from the current data.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <EntityLocationMap
                latitude={location.latitude}
                longitude={location.longitude}
                displayLabel={location.displayLabel}
                isSynthetic={location.isSynthetic}
                accent={node.role === 'CASH_OUT' ? 'amber' : 'sky'}
              />
              {location.displayLabel !== undefined && (
                <p className="text-ui-secondary font-medium text-slate-200">{location.displayLabel}</p>
              )}
              <p className="font-mono text-ui-secondary tabular-nums text-slate-400">
                {formatCoordinates(location)}
              </p>
              {location.isSynthetic && (
                <p className="rounded-sm border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-micro leading-relaxed text-amber-200/90">
                  Synthetic coordinates. This point describes no real premises, agent or device.
                </p>
              )}
            </div>
          )}
        </section>

        {/* 6. Money arriving. */}
        {incomingEdges.length > 0 && (
          <section className="border-b border-slate-800 px-3 py-2.5">
            <h3 className="mb-1.5 text-micro font-semibold tracking-[0.12em] text-slate-500 uppercase">
              Money arriving
            </h3>
            <ul className="flex flex-col gap-2">
              {incomingEdges.map((edge) => (
                <HopRow key={edge.id} edge={edge} direction="in" />
              ))}
            </ul>
          </section>
        )}

        {/* 7. Connections and activity — counts and timestamps from the drawn
               hops. Nothing inferred about dormancy or pattern. */}
        {firstActivity !== null && lastActivity !== null && (
          <section className="border-b border-slate-800 px-3 py-2.5">
            <h3 className="mb-1.5 text-micro font-semibold tracking-[0.12em] text-slate-500 uppercase">
              Connections · activity
            </h3>
            <dl className="flex flex-col gap-1.5 text-ui-secondary">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">Hops drawn here</dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {incomingEdges.length + outgoingEdges.length}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">First value movement</dt>
                <dd className="font-mono text-ui-secondary text-slate-300">
                  <time dateTime={firstActivity}>
                    {isoDay(firstActivity)} {isoClock(firstActivity)}
                  </time>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500">Last value movement</dt>
                <dd className="font-mono text-ui-secondary text-slate-300">
                  <time dateTime={lastActivity}>
                    {isoDay(lastActivity)} {isoClock(lastActivity)}
                  </time>
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-micro text-slate-600">
              From <code className="font-mono">occurred_at</code> on the hops currently drawn.
            </p>
          </section>
        )}

        {/* 8. Money leaving. */}
        {outgoingEdges.length > 0 && (
          <section className="border-b border-slate-800 px-3 py-2.5">
            <h3 className="mb-1.5 text-micro font-semibold tracking-[0.12em] text-slate-500 uppercase">
              Money leaving
            </h3>
            <ul className="flex flex-col gap-2">
              {outgoingEdges.map((edge) => (
                <HopRow key={edge.id} edge={edge} direction="out" />
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* 9. The primary action. Last in the reading order, but pinned so it is
             reachable without scrolling past the evidence above it. */}
      {canExpand && (
        <div className="shrink-0 border-t border-slate-800 bg-slate-900 p-2.5">
          {/* Expanding is the forward investigative move, so it is the filled
              primary. Collapsing only undoes it — a secondary treatment, which
              also means the two states never look interchangeable at a glance.
              Amber is not used here; it is reserved for cash-out. */}
          <button
            type="button"
            onClick={() => onToggleExpansion(node.id)}
            className={`w-full rounded-sm px-3 py-2 text-ui-primary font-semibold focus-visible:ring-2 focus-visible:outline-none ${
              node.expansion === 'EXPANDED'
                ? 'border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white focus-visible:ring-slate-400'
                : 'bg-sky-600 text-white hover:bg-sky-500 focus-visible:ring-sky-300'
            }`}
          >
            {node.expansion === 'EXPANDED'
              ? 'Collapse this hop'
              : `Expand one hop${hiddenHops > 0 ? ` (${hiddenHops})` : ''}`}
          </button>
        </div>
      )}
    </aside>
  );
}
