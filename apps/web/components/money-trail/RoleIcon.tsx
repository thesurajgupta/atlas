/**
 * The role glyph, matched to what the canvas draws.
 *
 * All three roles come from Font Awesome definitions, rendered from their path
 * data rather than through `@fortawesome/react-fontawesome`, which is not a
 * dependency here and would not earn its weight for three icons.
 *
 * **Containment.** The glyph is drawn on a square canvas with the path centred
 * on it, and `preserveAspectRatio="xMidYMid meet"` then fits that square inside
 * whatever box the caller sizes — so the icon is centred on both axes and can
 * never be stretched, whatever the caller's aspect ratio. Font Awesome glyphs
 * are not square (`faUser` is 448×512, `faStore` 576×512), which is exactly why
 * the square canvas is needed: without it, `meet` would centre the icon's own
 * viewBox and leave it visually off-centre against a circular border.
 *
 * Callers are responsible for leaving clear space inside their own outline; the
 * Cytoscape side derives that from node geometry in `cytoscape-adapter.ts`.
 *
 * Like the canvas, the intermediary's columns mark generalises: a hop does not
 * establish that an entity is a financial institution. The text beside it
 * always reads `INTERMEDIARY`, which is what the trail actually supports.
 */

import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faBuildingColumns, faStore, faUser } from '@fortawesome/free-solid-svg-icons';

import type { MoneyTrailNode } from '@/lib/graph/types';

const ICON_BY_ROLE: Record<MoneyTrailNode['role'], IconDefinition> = {
  ORIGIN: faUser,
  INTERMEDIARY: faBuildingColumns,
  CASH_OUT: faStore,
};

export default function RoleIcon({
  role,
  className,
}: {
  role: MoneyTrailNode['role'];
  className?: string;
}) {
  const [width, height, , , pathData] = ICON_BY_ROLE[role].icon;
  const d = Array.isArray(pathData) ? pathData.join(' ') : pathData;

  // The same square-canvas trick the Cytoscape glyphs use, so a role's icon is
  // optically identical in the graph, the entity list and the detail panel.
  const side = Math.max(width, height);
  const offsetX = (side - width) / 2;
  const offsetY = (side - height) / 2;

  return (
    <svg
      viewBox={`0 0 ${side} ${side}`}
      aria-hidden
      className={className}
      fill="currentColor"
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={d} transform={`translate(${offsetX} ${offsetY})`} />
    </svg>
  );
}
