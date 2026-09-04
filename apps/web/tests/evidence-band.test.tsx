import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PredictionAndWhy } from "@/components/prediction/PredictionAndWhy";
import { MOCK_CASES } from "@/lib/mock-data";
import type { Prediction } from "@/lib/types";

function predictionFor(band: Prediction["evidence_sufficiency"]) {
  const found = MOCK_CASES.find(
    (c) => c.fact_strip.evidence_sufficiency === band,
  );
  if (!found) throw new Error(`No fixture case for band ${band}`);
  return found.prediction;
}

/**
 * Spec §25.3, acceptance criterion #32: "evidence_sufficiency changes the
 * rendering, not merely a tooltip." Every assertion below checks structure
 * (which nodes exist, or a data attribute encoding a genuinely different
 * fill mechanism) — never just text content or a colour — so a future
 * refactor that quietly reduces this to a single colour swap will fail
 * these tests.
 */
describe("PredictionAndWhy — evidence_sufficiency renders structurally", () => {
  it("STRONG: shows a full candidate list with solid confidence bars and filled map cells", () => {
    render(<PredictionAndWhy prediction={predictionFor("STRONG")} />);

    const list = screen.getByTestId("candidate-list");
    expect(list).toBeInTheDocument();
    expect(list).toHaveClass("opacity-100");
    expect(screen.queryByTestId("weak-evidence-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("insufficient-state")).not.toBeInTheDocument();

    const bar = within(list).getAllByRole("img")[0];
    expect(bar).toHaveAttribute("data-rendering", "solid");
    expect(bar).toHaveAttribute("data-evidence-band", "STRONG");

    const swatch = within(list).getAllByTestId("map-cell-swatch")[0];
    expect(swatch).toHaveAttribute("data-filled", "true");
  });

  it("MODERATE: shows a candidate list with hatched (not solid) confidence bars", () => {
    render(<PredictionAndWhy prediction={predictionFor("MODERATE")} />);

    const list = screen.getByTestId("candidate-list");
    expect(list).toBeInTheDocument();
    expect(screen.queryByTestId("weak-evidence-banner")).not.toBeInTheDocument();

    const bar = within(list).getAllByRole("img")[0];
    expect(bar).toHaveAttribute("data-rendering", "hatched");
  });

  it("WEAK: dims the list, names the missing evidence, and outlines map cells", () => {
    render(<PredictionAndWhy prediction={predictionFor("WEAK")} />);

    const list = screen.getByTestId("candidate-list");
    expect(list).toBeInTheDocument();
    expect(list).toHaveClass("opacity-60");
    expect(list).not.toHaveClass("opacity-100");

    expect(screen.getByTestId("weak-evidence-banner")).toBeInTheDocument();

    const swatch = within(list).getAllByTestId("map-cell-swatch")[0];
    expect(swatch).toHaveAttribute("data-filled", "false");
  });

  it("INSUFFICIENT: renders no ranked candidate list at all", () => {
    render(<PredictionAndWhy prediction={predictionFor("INSUFFICIENT")} />);

    expect(screen.queryByTestId("candidate-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("weak-evidence-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("insufficient-state")).toBeInTheDocument();
    expect(screen.getByText(/Tier 1 zone forecast/i)).toBeInTheDocument();
  });

  it("all four bands produce genuinely different DOM shapes from one another", () => {
    const shapes = (
      ["STRONG", "MODERATE", "WEAK", "INSUFFICIENT"] as const
    ).map((band) => {
      const { container, unmount } = render(
        <PredictionAndWhy prediction={predictionFor(band)} />,
      );
      const shape = container.innerHTML;
      unmount();
      return shape;
    });

    const unique = new Set(shapes);
    expect(unique.size).toBe(4);
  });
});
