import type { EvidenceSufficiency } from "@/lib/types";

/**
 * §25.3's rendering table, implemented structurally rather than by a single
 * shared bar with a colour swap:
 *   STRONG   → solid fill
 *   MODERATE → hatched fill (diagonal stripes — a different fill pattern,
 *              not just a lighter shade of the same solid)
 *   WEAK     → dimmed solid fill, reduced opacity
 * INSUFFICIENT never reaches this component — §16.2 forbids emitting a
 * ranked candidate at all in that band, enforced in CandidateList.
 */
export function ConfidenceBar({
  probability,
  band,
}: {
  probability: number;
  band: Exclude<EvidenceSufficiency, "INSUFFICIENT">;
}) {
  const widthPct = Math.round(probability * 100);

  const fillStyle: React.CSSProperties =
    band === "MODERATE"
      ? {
          width: `${widthPct}%`,
          backgroundImage:
            "repeating-linear-gradient(45deg, #4A6FA5 0, #4A6FA5 3px, transparent 3px, transparent 6px)",
          backgroundColor: "transparent",
        }
      : {
          width: `${widthPct}%`,
          backgroundColor: band === "WEAK" ? "#9A6700" : "#1D6F5C",
          opacity: band === "WEAK" ? 0.45 : 1,
        };

  return (
    <div
      role="img"
      aria-label={`Probability ${probability.toFixed(2)}, ${band.toLowerCase()} evidence`}
      className="h-2 w-full overflow-hidden rounded-sm bg-line"
      data-evidence-band={band}
      data-rendering={band === "MODERATE" ? "hatched" : "solid"}
    >
      <div className="h-full" style={fillStyle} />
    </div>
  );
}
