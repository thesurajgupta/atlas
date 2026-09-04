import type { ContributingFactor } from "@/lib/types";

/**
 * §25.4: "Contributing factors render as sentences containing a quantity and
 * a window... not 'velocity_score: 0.82'." This component only ever reads
 * `factor.sentence` — `feature`/`contribution`/`direction` exist on the type
 * for audit and model-debug tooling and must not be threaded through here.
 */
export function ContributingFactors({
  factors,
}: {
  factors: ContributingFactor[];
}) {
  if (factors.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1">
      {factors.map((factor, i) => (
        <li key={i} className="flex gap-2 text-sm text-ink-700">
          <span aria-hidden className="text-ink-300">
            ·
          </span>
          <span>{factor.sentence}</span>
        </li>
      ))}
    </ul>
  );
}
