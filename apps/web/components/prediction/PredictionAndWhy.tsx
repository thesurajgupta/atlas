import type { Prediction } from "@/lib/types";
import {
  formatChannel,
  formatProbability,
  formatWindow,
} from "@/lib/format";
import { describeMissingEvidence } from "@/lib/evidence-copy";
import { EvidenceBadge } from "./EvidenceBadge";
import { ConfidenceBar } from "./ConfidenceBar";
import { ContributingFactors } from "./ContributingFactors";

/**
 * §25.3, verbatim: "An investigator must be unable to mistake a weak
 * prediction for a strong one... enforced by a UI test asserting that
 * evidence_sufficiency changes the rendering, not merely a tooltip."
 *
 * This component is that enforcement point. Each branch below returns a
 * genuinely different DOM shape — not the same markup with a colour prop —
 * so a test can assert on structure (e.g. "no candidate list node exists in
 * the INSUFFICIENT case") rather than on a class name alone, which a future
 * edit could silently break.
 */
export function PredictionAndWhy({ prediction }: { prediction: Prediction }) {
  const { evidence_sufficiency: band } = prediction;

  return (
    <section
      aria-label="Prediction and why"
      data-testid="prediction-and-why"
      data-evidence-band={band}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">
          Prediction &amp; why
        </h2>
        <EvidenceBadge band={band} />
      </div>

      {band === "INSUFFICIENT" ? (
        <InsufficientState />
      ) : (
        <>
          {band === "WEAK" && (
            <MissingEvidenceBanner
              rungsUsed={prediction.recall_stage_rungs_used}
            />
          )}
          <ol
            data-testid="candidate-list"
            className={
              "space-y-3 " + (band === "WEAK" ? "opacity-60" : "opacity-100")
            }
          >
            {prediction.candidates.map((candidate) => (
              <li
                key={candidate.endpoint_id}
                className="rounded-sm border border-line bg-surface p-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-ink-900">
                    #{candidate.rank} · {candidate.endpoint_id}
                  </span>
                  <span className="text-xs text-ink-500">
                    {formatChannel(candidate.channel)}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <span className="w-10 shrink-0 text-sm tabular-nums text-ink-900">
                    {formatProbability(candidate.probability)}
                  </span>
                  <ConfidenceBar
                    probability={candidate.probability}
                    band={band}
                  />
                  <MapCellSwatch band={band} />
                </div>

                <div className="mt-1.5 text-xs text-ink-500">
                  {formatWindow(
                    candidate.predicted_window.start,
                    candidate.predicted_window.end,
                  )}
                </div>

                <ContributingFactors factors={candidate.contributing_factors} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function MissingEvidenceBanner({ rungsUsed }: { rungsUsed: number[] }) {
  const text = describeMissingEvidence(rungsUsed);
  if (!text) return null;
  return (
    <div
      role="note"
      data-testid="weak-evidence-banner"
      className="mb-3 rounded-sm border border-severity-medium/40 bg-severity-medium/5 px-3 py-2 text-sm text-ink-700"
    >
      {text}
    </div>
  );
}

/**
 * §25.3: "map cells at full opacity" (STRONG) vs "outlined not filled"
 * (WEAK). No live map in this scaffold yet (§8 owns that), so this swatch
 * stands in for the same rule and will be the thing §8's map component
 * reads from once it exists.
 */
function MapCellSwatch({
  band,
}: {
  band: "STRONG" | "MODERATE" | "WEAK";
}) {
  const filled = band !== "WEAK";
  return (
    <span
      aria-hidden
      data-testid="map-cell-swatch"
      data-filled={filled}
      className={
        "h-3 w-3 shrink-0 rounded-[2px] " +
        (filled
          ? "border border-ink-900 bg-ink-900/70"
          : "border border-ink-900 bg-transparent")
      }
    />
  );
}

function InsufficientState() {
  return (
    <div
      data-testid="insufficient-state"
      className="rounded-sm border border-line bg-surface p-4"
    >
      <p className="text-sm text-ink-700">
        No case-specific evidence is available for this account yet — it has
        not been seen before, and it does not belong to a known mule cluster.
      </p>
      <p className="mt-2 text-sm text-ink-700">
        Showing the <span className="font-medium">Tier 1 zone forecast</span>{" "}
        only. No ranked candidates are emitted at this evidence level (spec
        §16.2) — a guess here would look like a finding, and it would not be
        one.
      </p>
    </div>
  );
}
