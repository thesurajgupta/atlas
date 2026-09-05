import type { Metadata } from 'next';

import MoneyTrailGraph from '@/components/money-trail/MoneyTrailGraph';
import { SYNTHETIC_CASE } from '@/lib/graph/synthetic-case';
import {
  SYNTHETIC_AS_OF,
  SYNTHETIC_ENTITY_LOCATIONS,
  SYNTHETIC_MAX_DEPTH,
  SYNTHETIC_ORIGIN_ENTITY_ID,
  SYNTHETIC_TRAIL_PATHS,
} from '@/lib/graph/synthetic-trail';

export const metadata: Metadata = {
  title: 'Money Trail Explorer · ATLAS',
  description: 'Money-trail reconstruction console. Synthetic data only.',
};

/**
 * Development route for the money-trail console.
 *
 * A Server Component that hands synthetic paths to the client canvas. It exists
 * to exercise the console before the trail endpoint is available; when the API
 * lands, the fixture import is what gets replaced.
 *
 * Rendered full-bleed — the component is an application shell that owns the
 * viewport, not a card on a page.
 */
export default function MoneyTrailPage() {
  return (
    <MoneyTrailGraph
      originEntityId={SYNTHETIC_ORIGIN_ENTITY_ID}
      asOf={SYNTHETIC_AS_OF}
      maxDepth={SYNTHETIC_MAX_DEPTH}
      paths={SYNTHETIC_TRAIL_PATHS}
      entityLocations={SYNTHETIC_ENTITY_LOCATIONS}
      caseContext={SYNTHETIC_CASE}
    />
  );
}
