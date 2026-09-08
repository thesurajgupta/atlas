import type { Metadata } from 'next';

import MoneyTrailRoute from '@/components/money-trail/MoneyTrailRoute';

export const metadata: Metadata = {
  title: 'Money Trail Explorer · ATLAS',
  description: 'Money-trail reconstruction console. Synthetic data only.',
};

/**
 * The money-trail console.
 *
 * A Server Component so the route keeps its metadata; the choice between the
 * referred complaint's trail and the development fixture is a client decision
 * — it depends on what is in this browser's store — and lives in
 * `MoneyTrailRoute`.
 *
 * Rendered full-bleed: the component is an application shell that owns the
 * viewport, not a card on a page.
 */
export default function MoneyTrailPage() {
  return <MoneyTrailRoute />;
}
