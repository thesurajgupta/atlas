/**
 * A tiny deterministic hash, used wherever the demo needs a stable arbitrary
 * choice — which ledger template an unseeded transaction reference resolves to,
 * which digits an unnamed account gets.
 *
 * Deterministic is the requirement, not uniformity. `Math.random()` here would
 * mean a presenter who resets the demo and retypes the same complaint gets a
 * different trail, which is precisely the "the numbers changed between two
 * screens" failure the whole data layer exists to prevent.
 *
 * FNV-1a, 32-bit, over UTF-16 code units. Not a cryptographic hash and never
 * used as one.
 */
export function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    // `Math.imul` keeps the multiply in 32-bit space; a plain `*` overflows
    // into a double at the fourth character and the result stops being a hash.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A stable integer in `[0, bound)` derived from `value` and a salt. */
export function hashIndex(value: string, salt: string, bound: number): number {
  if (bound <= 0) return 0;
  return hash32(`${salt}:${value}`) % bound;
}

/** A stable fraction in `[0, 1)` derived from `value` and a salt. */
export function hashUnit(value: string, salt: string): number {
  return hash32(`${salt}:${value}`) / 0x100000000;
}
