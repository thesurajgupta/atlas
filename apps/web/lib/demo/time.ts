/**
 * The portal collects an incident date and a time, separately, in IST.
 *
 * `new Date("2026-09-08T18:00")` parses as *the browser's* local time, which is
 * the machine's zone and not the one the complaint was filed in. Stating the
 * offset makes the instant the same fact everywhere: the API stores it, the
 * trail is built from it, and a hop timestamp on the console traces back to
 * what the citizen actually typed.
 */
const IST_OFFSET = '+05:30';

/** `2026-09-08` + `18:00` → `2026-09-08T18:00:00+05:30`. */
export function istInstant(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}:00${IST_OFFSET}`;
}
