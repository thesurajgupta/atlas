/**
 * Categorical colours for payment rails and cash-out channels.
 *
 * One mapping, used by the graph, the entity panel, the evidence table, the
 * entity list and the legend — so a colour means the same thing wherever it
 * appears, and an investigator can learn it once.
 *
 * **These encode payment method, never risk.** Amber marks an ATM because ATM
 * is a category, not because a withdrawal at one is worse than a transfer over
 * IMPS. Nothing here is ordered, weighted, or a severity: there is no
 * calibrated number behind any of it. Red is absent for exactly that reason —
 * it reads as danger no matter what the legend says.
 */

/** Every method the synthetic data and the backend enums can produce. */
export const PAYMENT_METHOD_ORDER = ['UPI', 'IMPS', 'NEFT', 'RTGS', 'ATM', 'AEPS_BC'] as const;

export type PaymentMethod = (typeof PAYMENT_METHOD_ORDER)[number];

/**
 * The mapping. Hues are spread far enough apart to stay distinguishable on a
 * dark ground, and none of them is red.
 */
export const PAYMENT_METHOD_COLOR: Readonly<Record<PaymentMethod, string>> = {
  UPI: '#a78bfa', // purple
  IMPS: '#60a5fa', // blue
  NEFT: '#22d3ee', // cyan
  RTGS: '#818cf8', // indigo
  ATM: '#fbbf24', // amber
  AEPS_BC: '#2dd4bf', // teal
};

/** Anything the mapping does not cover — including a hop with no rail at all. */
export const UNKNOWN_METHOD_COLOR = '#64748b';

/**
 * The method a hop moved over.
 *
 * Channel wins where there is one: a withdrawal's channel is the fact that
 * matters about it, and the rail underneath is incidental. A transfer has no
 * channel, so its rail is the answer.
 */
export function paymentMethodOf(edge: {
  readonly channel: string | null;
  readonly rail: string | null;
}): string | null {
  return edge.channel ?? edge.rail;
}

export function paymentMethodColor(method: string | null | undefined): string {
  if (method === null || method === undefined) return UNKNOWN_METHOD_COLOR;
  return (
    PAYMENT_METHOD_COLOR[method as PaymentMethod] ??
    // A rail this build has not seen is storable and displayable rather than
    // rejected — payment rails are added faster than deployment cycles.
    UNKNOWN_METHOD_COLOR
  );
}

/** `#a78bfa` → `#a78bfa26`, for a chip background at ~15% opacity. */
export function withAlpha(hex: string, alpha: number): string {
  const clamped = Math.min(255, Math.max(0, Math.round(alpha * 255)));
  return `${hex}${clamped.toString(16).padStart(2, '0')}`;
}
