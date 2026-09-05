/**
 * The drawn entities, as a selectable list.
 *
 * Every row is an entity currently on the canvas — the same set, in the same
 * order the reducer produced, so the list and the graph can never disagree
 * about what is visible. Selecting a row selects the node: one piece of state,
 * two views of it.
 *
 * The channel is shown only where a withdrawal hop states one. Nothing here is
 * ranked or scored; depth is a position on the trail, not a severity.
 */

import type { CashOutChannel, EntityId, MoneyTrailNode } from '@/lib/graph/types';

import PaymentBadge from './PaymentBadge';
import RoleIcon from './RoleIcon';

/** Title case rather than shouting: at 12px beside a monospace id, uppercase
 *  tracking competed with the identifier instead of supporting it. */
const ROLE_LABEL: Record<MoneyTrailNode['role'], string> = {
  ORIGIN: 'Victim · Origin',
  INTERMEDIARY: 'Intermediary',
  CASH_OUT: 'Cash-out',
};

const ROLE_TONE: Record<MoneyTrailNode['role'], string> = {
  ORIGIN: 'text-sky-300',
  INTERMEDIARY: 'text-slate-400',
  CASH_OUT: 'text-red-500',
};

export interface EntityListProps {
  readonly nodes: readonly MoneyTrailNode[];
  /** Cash-out channel per entity, read off the withdrawal hop that reaches it. */
  readonly channelById: ReadonlyMap<EntityId, CashOutChannel>;
  readonly selectedNodeId: EntityId | null;
  /** Entities matching the current local search. */
  readonly matchedEntityIds: readonly EntityId[];
  readonly onSelect: (id: EntityId) => void;
}

export default function EntityList({
  nodes,
  channelById,
  selectedNodeId,
  matchedEntityIds,
  onSelect,
}: EntityListProps) {
  return (
    <section
      aria-label="Entities currently drawn"
      className="flex min-h-0 w-full flex-col border-slate-800 lg:w-[32%] lg:border-l"
    >
      <div className="flex shrink-0 items-baseline gap-2 border-b border-slate-800 px-3 py-1.5">
        <h2 className="text-ui-secondary font-semibold tracking-[0.14em] text-slate-300 uppercase">
          Entity list
        </h2>
        <span className="ml-auto font-mono text-ui-secondary tabular-nums text-slate-500">
          {nodes.length}
        </span>
      </div>

      {nodes.length === 0 ? (
        <p className="px-3 py-3 text-ui-secondary text-slate-500">No entities drawn yet.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {nodes.map((node) => {
            const channel = channelById.get(node.id);
            const isSelected = node.id === selectedNodeId;
            const isSearchMatch = matchedEntityIds.includes(node.id);
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => onSelect(node.id)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`flex w-full items-center gap-2.5 border-b border-l-2 border-b-slate-800/70 px-3 py-1.5 text-left ${
                    isSelected
                      ? 'border-l-sky-400 bg-sky-500/10'
                      : isSearchMatch
                        ? 'border-l-fuchsia-400 bg-fuchsia-500/10'
                        : 'border-l-transparent hover:bg-slate-800/40'
                  }`}
                >
                  <RoleIcon
                    role={node.role}
                    className={`h-3.5 w-3.5 shrink-0 ${ROLE_TONE[node.role]}`}
                  />
                  {/* Id first and monospaced — it is the identifier an
                      investigator matches against the canvas. The role sits
                      beside it rather than beneath, so a row is one line. */}
                  <span className="text-technical shrink-0 leading-none text-slate-100">
                    {node.label}
                  </span>

                  {/* The dot is decoration; the role is spelled out beside it,
                      so severity is never carried by colour alone. */}
                  <span
                    className={`flex min-w-0 items-center gap-1.5 ${ROLE_TONE[node.role]}`}
                    title={ROLE_LABEL[node.role]}
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
                    />
                    <span className="text-ui-secondary truncate leading-none font-medium">
                      {ROLE_LABEL[node.role]}
                    </span>
                  </span>

                  {/* At `lg` this list is only ~32% of the bottom row, and a
                      cash-out row is the busiest: icon, id, role, badge, depth.
                      The badge is the least load-bearing of those — the channel
                      still shows in the detail panel and the evidence table — so
                      it stands down until there is room, rather than squeezing
                      the role into an ellipsis. */}
                  {channel !== undefined && (
                    <PaymentBadge method={channel} className="hidden shrink-0 xl:inline-block" />
                  )}

                  <span className="text-micro ml-auto shrink-0 font-mono tabular-nums text-slate-500">
                    Depth {node.depth}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
