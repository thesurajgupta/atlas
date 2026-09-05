/**
 * Exact arithmetic and display for the decimal strings the payload carries.
 *
 * Amounts arrive as strings and stay strings for a reason: `NUMERIC(14, 2)`
 * through a JS `number` loses exact rupee arithmetic, and a money trail is
 * where that shows up, as hops along a path that no longer add up. Everything
 * here works on `BigInt` over scaled integers, so a total is exact regardless
 * of how many hops it spans.
 */

/** Split `"182500.55"` into its integer and fractional halves. */
function splitDecimal(value: string): { integer: string; fraction: string; negative: boolean } {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer = '0', fraction = ''] = unsigned.split('.');
  return { integer, fraction, negative };
}

/**
 * Add decimal strings exactly.
 *
 * Scales every value to the widest fraction seen, sums as integers, then puts
 * the point back. `"0.1" + "0.2"` is `"0.3"` here, which is the whole point.
 */
export function sumDecimalStrings(values: readonly string[]): string {
  if (values.length === 0) return '0';

  const parts = values.map(splitDecimal);
  const scale = Math.max(...parts.map((part) => part.fraction.length));

  let total = BigInt(0);
  for (const part of parts) {
    const scaled = BigInt(part.integer + part.fraction.padEnd(scale, '0'));
    total += part.negative ? -scaled : scaled;
  }

  const negative = total < BigInt(0);
  const digits = (negative ? -total : total).toString().padStart(scale + 1, '0');
  const integer = digits.slice(0, digits.length - scale);
  const fraction = scale === 0 ? '' : digits.slice(digits.length - scale);

  return `${negative ? '-' : ''}${integer}${fraction === '' ? '' : `.${fraction}`}`;
}

/**
 * Group an integer string the Indian way: last three digits, then pairs.
 *
 * `284000` → `2,84,000`. Not what `Intl` produces under a default locale, and
 * the difference is the kind of thing an investigator reads as an error.
 */
export function groupIndianDigits(integer: string): string {
  if (integer.length <= 3) return integer;
  const last3 = integer.slice(-3);
  const rest = integer.slice(0, -3);
  const paired = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${paired},${last3}`;
}

/**
 * Render an amount with its currency symbol.
 *
 * Only ever called with a value whose currency is *stated* — synthetic case
 * metadata declares `INR`, so a ₹ there is a fact. A `TrailHop` projects no
 * currency, which is why hop amounts elsewhere print bare.
 */
export function formatCurrencyAmount(value: string, currency: string): string {
  const { integer, fraction, negative } = splitDecimal(value);
  const grouped = groupIndianDigits(integer);
  // Whole amounts read better without a dead `.00` in a dense strip.
  const decimals = /^0*$/.test(fraction) ? '' : `.${fraction}`;
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${negative ? '-' : ''}${symbol}${grouped}${decimals}`;
}
