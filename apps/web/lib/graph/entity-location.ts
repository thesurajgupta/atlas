/**
 * Optional geographic metadata about an entity.
 *
 * This lives in its own module, and deliberately not in `types.ts`, because it
 * is not part of the trail. `TrailHop` says that value moved between two entity
 * *ids* at a point in time; it says nothing about where anything is, and adding
 * a coordinate to it would put a fact on the wire contract that the backend
 * does not send. Location arrives from somewhere else — an endpoint registry,
 * eventually — and is joined to the graph by id at the view boundary.
 *
 * The separation is the point. A money trail rendered without this module is
 * still complete and correct; a location shown here is an annotation on a node,
 * never a hop, and never something the reducer reasons about.
 *
 * A coordinate is geography, not judgement. Nothing here ranks, scores or
 * implies anything about the entity that happens to sit at it.
 */

import type { EntityId } from './types';

export interface EntityLocation {
  /** Degrees north, WGS 84. */
  readonly latitude: number;
  /** Degrees east, WGS 84. */
  readonly longitude: number;
  /** Human-readable place name, where one is known. */
  readonly displayLabel?: string;
  /**
   * Whether the coordinate is fabricated for development.
   *
   * Not a debug flag: a synthetic coordinate must be labelled as such wherever
   * it is displayed, so nobody mistakes a development fixture for a real
   * cash-out location (PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md).
   */
  readonly isSynthetic: boolean;
}

/** Locations keyed by the entity they annotate. Sparse by nature — most
 *  entities on a trail have no known location, and that is a normal state. */
export type EntityLocationIndex = ReadonlyMap<EntityId, EntityLocation>;

/** `22.5000° N, 78.5000° E` — fixed precision so the value never jitters. */
export function formatCoordinates(location: EntityLocation): string {
  const northSouth = location.latitude >= 0 ? 'N' : 'S';
  const eastWest = location.longitude >= 0 ? 'E' : 'W';
  return (
    `${Math.abs(location.latitude).toFixed(4)}° ${northSouth}, ` +
    `${Math.abs(location.longitude).toFixed(4)}° ${eastWest}`
  );
}
