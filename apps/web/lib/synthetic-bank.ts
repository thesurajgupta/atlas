/**
 * The fictional banking layer: institutions, accounts, IFSC-style codes, rails.
 *
 * ## Why this file exists
 *
 * The graph API returns entity UUIDs and amounts. It does not return a bank, an
 * account number or a holder, because ATLAS has no bank feed — that is #65.
 * Pages were rendering those as "—", which is honest but leaves a demo unable
 * to show what an investigator actually reads.
 *
 * So the banking layer is generated here, **once**, and every page reads it.
 * The alternative — each page inventing its own — is what produced six
 * datasets that agreed about nothing.
 *
 * ## Everything here is deliberately fictional, and checkably so
 *
 * Institutions are "Meridian Bank", "Kaveri Cooperative" and so on: plausible
 * in shape, not the name of any real bank. `CLAUDE.md` rule 3 and
 * `scripts/seed_demo.py` both refuse to name a real institution beside a mule
 * account, and this repository is public — a real bank rendered under "Primary
 * Mule Account" is a defamation risk before it is a data-protection one.
 *
 * IFSC-style codes use the `ZZ` prefix. Real IFSC codes are issued by RBI and
 * begin with a registered bank's four-letter code; no real code starts `ZZ`, so
 * these cannot collide with one. Account numbers are masked to the last four
 * digits in the same way a real console would.
 *
 * ## Deterministic, not random
 *
 * Everything is derived from the entity id via a stable hash. The same account
 * therefore reads the same on the trail page, the network graph and the report,
 * across reloads, and a judge who asks to see the case again sees the same
 * accounts. A `Math.random()` here would produce a system that contradicts
 * itself between two screens, which is the exact failure this file exists to
 * prevent.
 */

export interface SyntheticInstitution {
  name: string;
  /** Fictional IFSC-style prefix. `ZZ` is unissued, so it cannot collide. */
  ifscPrefix: string;
}

/** Fictional institutions. Plausible in shape, none of them real. */
export const INSTITUTIONS: SyntheticInstitution[] = [
  { name: "Meridian Bank", ifscPrefix: "ZZMB" },
  { name: "Kaveri Cooperative Bank", ifscPrefix: "ZZKC" },
  { name: "Deccan Commercial Bank", ifscPrefix: "ZZDC" },
  { name: "Sarayu Grameen Bank", ifscPrefix: "ZZSG" },
  { name: "Nilgiri Union Bank", ifscPrefix: "ZZNU" },
  { name: "Pallava Savings Bank", ifscPrefix: "ZZPS" },
];

/** Payment rails, weighted the way the typology profiles use them. */
const RAILS = ["UPI", "IMPS", "NEFT", "RTGS", "AEPS", "CARD"] as const;
export type Rail = (typeof RAILS)[number];

export interface SyntheticAccount {
  entityId: string;
  institution: string;
  ifsc: string;
  /** Masked, as a real console would show it. */
  accountNumber: string;
  /** Fictional holder. Absent for the victim, who is not named in ATLAS. */
  holder: string | null;
  rail: Rail;
  /** UPI-style handle, only where the rail is UPI. */
  upiHandle: string | null;
}

/**
 * FNV-1a. Small, stable, and — the part that matters — identical between
 * reloads and machines, unlike anything seeded from a clock.
 */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Fictional holder names, assembled from two lists so no full name is fixed. */
const GIVEN = [
  "Arun", "Meera", "Kabir", "Divya", "Rohan", "Anita",
  "Vikas", "Sneha", "Imran", "Lata", "Nikhil", "Farah",
];
const FAMILY = [
  "Raghavan", "Bhattacharya", "Menon", "Deshpande", "Qureshi",
  "Sengupta", "Iyengar", "Chaturvedi", "Barman", "Pillai",
];

/**
 * The banking identity for one entity.
 *
 * `isVictim` suppresses the holder name: ATLAS never scores individuals and
 * does not collect victim identity (`docs/NON-GOALS.md`), so putting a name on
 * the victim node would be showing a field the product deliberately does not
 * have.
 */
export function syntheticAccount(
  entityId: string,
  options: { isVictim?: boolean } = {},
): SyntheticAccount {
  const h = hash(entityId);
  const institution = INSTITUTIONS[h % INSTITUTIONS.length]!;
  const rail = RAILS[(h >>> 3) % RAILS.length]!;
  const given = GIVEN[(h >>> 7) % GIVEN.length]!;
  const family = FAMILY[(h >>> 11) % FAMILY.length]!;
  const branch = String(((h >>> 5) % 9000) + 1000);
  const last4 = String(((h >>> 13) % 9000) + 1000);

  return {
    entityId,
    institution: institution.name,
    ifsc: `${institution.ifscPrefix}0${branch}`,
    accountNumber: `XXXXXX${last4}`,
    holder: options.isVictim ? null : `${given} ${family}`,
    rail,
    upiHandle:
      rail === "UPI"
        ? `${given.toLowerCase()}.${last4}@${institution.ifscPrefix.toLowerCase()}`
        : null,
  };
}

/**
 * A transaction reference in the shape the rail would produce.
 *
 * Derived from the edge id, so the same hop carries the same reference on the
 * trail table, in the report and in an exported package.
 */
export function syntheticTransactionRef(edgeId: string, rail: Rail): string {
  const h = hash(edgeId);
  const digits = String(h).padStart(12, "0").slice(0, 12);
  return rail === "UPI" ? `UPI/${digits}` : `${rail}${digits}`;
}
