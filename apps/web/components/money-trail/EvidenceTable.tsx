/**
 * The evidence strip: every hop currently drawn, in transaction-time order.
 *
 * A table rather than a set of cards, because this is the surface an
 * investigator reads down a column on — comparing amounts, or looking for the
 * gap between two timestamps. Sequence numbers are positions in this ordering,
 * not identifiers of anything.
 *
 * Amounts are printed exactly as the payload carries them, with no currency
 * symbol: `TrailHop` does not project a currency, so a rupee sign here would
 * assert something the data does not say.
 */

import type { EntityId, MoneyTrailEdge } from '@/lib/graph/types';

import PaymentBadge from './PaymentBadge';
import { isoClock, isoDay, shortId } from './format';

interface EvidenceTableProps {
  /** Visible hops, already ordered by `occurred_at`. */
  readonly hops: readonly MoneyTrailEdge[];
  readonly selectedNodeId: EntityId | null;
  /** Hops matching the current local search. */
  readonly matchedHopIds: ReadonlySet<string>;
}

export default function EvidenceTable({ hops, selectedNodeId, matchedHopIds }: EvidenceTableProps) {
  return (
    <section
      aria-label="Transaction evidence for visible hops"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-900/70 lg:w-[68%] lg:flex-none"
    >
      <div className="flex shrink-0 items-baseline gap-2 border-b border-slate-800 px-3 py-1.5">
        <h2 className="text-ui-secondary font-semibold uppercase tracking-[0.14em] text-slate-300">
          Transaction evidence
        </h2>
        <span className="truncate text-ui-secondary text-slate-500">
          ordered by <code className="font-mono text-slate-400">occurred_at</code> — when the money
          moved, not when ATLAS learned of it
        </span>
        <span className="ml-auto shrink-0 font-mono text-ui-secondary tabular-nums text-slate-500">
          {hops.length} hop{hops.length === 1 ? '' : 's'}
        </span>
      </div>

      {hops.length === 0 ? (
        <p className="px-3 py-3 text-ui-secondary text-slate-500">
          No hops drawn yet. Expand the origin to begin the trail.
        </p>
      ) : (
        // The one region allowed to scroll: the table owns its overflow so a
        // long trail never widens or lengthens the console around it.
        <div className="min-w-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-ui-secondary">
            <thead className="sticky top-0 z-10 bg-slate-900">
              <tr className="text-left text-micro font-semibold uppercase tracking-[0.1em] text-slate-500">
                <th scope="col" className="w-8 px-3 py-1.5 font-semibold">
                  #
                </th>
                <th scope="col" className="px-2 py-1.5 font-semibold">
                  Occurred at
                </th>
                <th scope="col" className="px-2 py-1.5 font-semibold">
                  Source
                </th>
                <th scope="col" className="px-2 py-1.5 font-semibold">
                  Target
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                  Amount
                </th>
                <th scope="col" className="px-3 py-1.5 font-semibold">
                  Rail / channel
                </th>
              </tr>
            </thead>
            <tbody>
              {hops.map((hop, index) => {
                const isWithdrawal = hop.edgeType === 'WITHDREW_AT';
                const isSearchMatch = matchedHopIds.has(hop.id);
                const touchesSelection =
                  selectedNodeId !== null &&
                  (hop.source === selectedNodeId || hop.target === selectedNodeId);
                return (
                  <tr
                    key={hop.id}
                    className={`border-t border-slate-800/70 ${
                      isSearchMatch
                        ? 'bg-fuchsia-500/12'
                        : touchesSelection
                          ? 'bg-sky-500/10'
                          : 'odd:bg-slate-950/30'
                    }`}
                  >
                    {/* A left rule marks the row without tinting a whole band:
                        sky where it touches the selection, amber where the
                        money left the traceable system. */}
                    <td
                      className={`border-l-2 px-3 py-1.5 font-mono tabular-nums ${
                        touchesSelection
                          ? 'border-sky-400 text-sky-300'
                          : isWithdrawal
                            ? 'border-amber-500/70 text-slate-500'
                            : 'border-transparent text-slate-600'
                      }`}
                    >
                      {index + 1}
                    </td>
                    <td className="px-2 py-1.5 text-technical whitespace-nowrap text-slate-400">
                      <time dateTime={hop.occurredAt}>
                        {isoDay(hop.occurredAt)}{' '}
                        <span className="text-slate-200">{isoClock(hop.occurredAt)}</span>
                      </time>
                    </td>
                    <td className="px-2 py-1.5 text-technical text-slate-300">{shortId(hop.source)}</td>
                    <td className="px-2 py-1.5 text-technical text-slate-300">
                      <span className="text-slate-600">→ </span>
                      {shortId(hop.target)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-technical font-semibold tabular-nums text-slate-100">
                      {hop.amount}
                    </td>
                    <td className="px-3 py-1.5">
                      <PaymentBadge method={hop.channel ?? hop.rail} />
                      {isWithdrawal && (
                        <span className="ml-1.5 text-micro uppercase tracking-wider text-amber-400/70">
                          cash-out
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
