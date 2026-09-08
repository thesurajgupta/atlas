'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { caseContextFor } from '@/lib/demo/adapters';
import { useDemoCase } from '@/lib/demo/store';
import { SYNTHETIC_CASE } from '@/lib/graph/synthetic-case';
import {
  SYNTHETIC_AS_OF,
  SYNTHETIC_ENTITY_LOCATIONS,
  SYNTHETIC_MAX_DEPTH,
  SYNTHETIC_ORIGIN_ENTITY_ID,
  SYNTHETIC_TRAIL_PATHS,
} from '@/lib/graph/synthetic-trail';

import MoneyTrailGraph from './MoneyTrailGraph';

/**
 * Chooses what the money-trail canvas reconstructs.
 *
 * When a complaint has been referred from the reporting portal, the canvas
 * walks *that* complaint's trail: the origin is the victim account the citizen
 * typed, the hops are the ledger rows joined on the transaction reference they
 * gave, and the amounts are shares of the figure they reported. Nothing about
 * the canvas changes — it was already built against `TrailPath`, and the demo
 * case produces `TrailPath`.
 *
 * With nothing referred it falls back to the development fixture it has always
 * rendered, and the strip above it says which of the two is on screen. A canvas
 * that quietly showed the fixture while a case was open would be the worst
 * failure available here.
 */
export default function MoneyTrailRoute() {
  const { hydrated, activeCase } = useDemoCase();

  /**
   * Open the referred complaint's whole reconstruction on arrival.
   *
   * Every entity with an outgoing hop, which is exactly the set that has
   * something to reveal. The fixture route keeps the one-hop-at-a-time default:
   * there, expanding *is* the thing being demonstrated. Here the reconstruction
   * is the answer to the question the investigator arrived with, and making
   * them click seven nodes to see it is friction, not disclosure.
   */
  const openOnArrival = useMemo(
    () =>
      activeCase === null
        ? undefined
        : [
            ...new Set(
              activeCase.trail_paths.flatMap((path) =>
                path.hops.map((hop) => hop.from_entity_id),
              ),
            ),
          ],
    [activeCase],
  );

  // The server pass and the first client render both have no stored complaint,
  // so the fixture is what hydrates. Rendering nothing until `hydrated` would
  // make the canvas mount twice and re-run its layout.
  const usingCase = hydrated && activeCase !== null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {hydrated && !usingCase && (
        <p className="shrink-0 border-b border-slate-800 bg-slate-900/60 px-4 py-2 text-[11.5px] text-slate-400">
          Development fixture — no complaint has been referred to ATLAS.{' '}
          <Link href="/ncrp" className="text-sky-400 transition-opacity hover:opacity-80">
            File one in the reporting portal
          </Link>{' '}
          and this canvas reconstructs that complaint instead.
        </p>
      )}

      <div className="min-h-0 flex-1">
        {usingCase ? (
          <MoneyTrailGraph
            key={activeCase.case_id}
            originEntityId={activeCase.origin_entity_id}
            asOf={activeCase.as_of}
            maxDepth={activeCase.max_depth}
            paths={activeCase.trail_paths}
            entityLocations={activeCase.entity_locations}
            caseContext={caseContextFor(activeCase)}
            initiallyExpandedEntityIds={openOnArrival}
          />
        ) : (
          <MoneyTrailGraph
            originEntityId={SYNTHETIC_ORIGIN_ENTITY_ID}
            asOf={SYNTHETIC_AS_OF}
            maxDepth={SYNTHETIC_MAX_DEPTH}
            paths={SYNTHETIC_TRAIL_PATHS}
            entityLocations={SYNTHETIC_ENTITY_LOCATIONS}
            caseContext={SYNTHETIC_CASE}
          />
        )}
      </div>
    </div>
  );
}
