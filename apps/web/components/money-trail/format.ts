/**
 * Display helpers shared across the money-trail console.
 *
 * Timestamps are sliced out of the ISO-8601 string rather than formatted.
 * `toLocaleString` would render differently on the server and the client and
 * produce a hydration mismatch, and it would silently shift the instant into
 * the viewer's zone — a hop stamped 10:04 in the payload must read 10:04 on
 * screen, because that is the time an investigator will quote.
 */

import type { IsoDateTime } from '@/lib/graph/types';

/** `2026-03-18` from `2026-03-18T10:04:00+05:30`. */
export const isoDay = (value: IsoDateTime): string => value.slice(0, 10);

/** `10:04` from `2026-03-18T10:04:00+05:30`. */
export const isoClock = (value: IsoDateTime): string => value.slice(11, 16);

/**
 * The eight-character handle an entity is known by on screen.
 *
 * Derived from the id and nothing else — a synthesised bank-like string would
 * put an invented identity in front of an investigator, and a plausible fake
 * identifier is worse than an opaque real one because it invites belief.
 */
export const shortId = (id: string): string => id.slice(0, 8).toUpperCase();
