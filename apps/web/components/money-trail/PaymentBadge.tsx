/**
 * A rail or channel, in its categorical colour.
 *
 * One component for the panel, the evidence table and the entity list, so a
 * method cannot end up two different colours in two places. Colour is applied
 * inline because the palette is data, not a fixed set of utility classes.
 *
 * The colour says which payment method — never how dangerous. There is no
 * ordering here and nothing behind it to rank.
 */

import { paymentMethodColor, withAlpha } from '@/lib/graph/payment-method';

export default function PaymentBadge({
  method,
  className,
}: {
  method: string | null;
  className?: string;
}) {
  if (method === null) return <span className="text-slate-600">—</span>;
  const color = paymentMethodColor(method);
  return (
    <span
      className={`inline-block rounded-sm px-1.5 py-0.5 text-micro font-semibold tracking-wider uppercase ${className ?? ''}`}
      style={{ color, backgroundColor: withAlpha(color, 0.14), border: `1px solid ${withAlpha(color, 0.35)}` }}
    >
      {method}
    </span>
  );
}
