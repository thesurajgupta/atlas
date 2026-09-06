"""PAI-vs-resolution sweep for the Tier 1 lattice (ADR-011).

ADR-011 chose the H3 lattice and deliberately left the *resolution* unchosen,
because picking one before measuring is the kind of asserted decision the ADR
exists to replace. This produces the curve that makes the choice, and — equally
important — refuses to make it when the dataset cannot support one.

## Why the choice is not obvious

Resolution trades two errors against each other, and PAI is the only thing that
prices them jointly:

* **Too coarse** (r6, ~36 km²) — nearly every prediction "hits", because the
  cell is the size of a district. PAI stays near 1.0 and the output is useless
  for tasking: a team cannot be sent to 36 km².
* **Too fine** (r9, ~0.1 km²) — the cell is smaller than the uncertainty. Hits
  become rare, PAI is dominated by noise, and the curve is unstable between
  runs.

The useful resolution is where PAI peaks *and* the cell is still an area a team
can be deployed to. Those two are not the same criterion, which is why this
reports the curve rather than an argmax: the reader chooses with both in view.

## The refusal

PAI is arithmetic. On labels independent of the features it returns 1.0 at every
resolution, and a sweep over that produces a beautiful flat curve and a
confident-looking "chosen" resolution that means nothing at all. So the sweep
asks :mod:`ml.evaluation.quotable` first, and when the answer is no it returns
the curve labelled unquotable with no selection. That is the whole point of
running it now: the machinery is real and exercised, and it cannot emit a number
anybody could mistake for a finding.

Pure over supplied events. It does no I/O and reads no database, so it is fully
testable today — the part that is blocked is the *data*, not the sweep.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from ml.evaluation.metrics import prediction_accuracy_index
from ml.evaluation.quotable import Quotability

#: Candidate resolutions from ADR-011, with the approximate cell area H3
#: documents for each. Area is carried because PAI is area-normalised: comparing
#: two resolutions means comparing what fraction of the map each flags, and a
#: cell count alone cannot express that.
CANDIDATE_RESOLUTIONS: tuple[tuple[int, float], ...] = (
    (6, 36.13),
    (7, 5.16),
    (8, 0.74),
    (9, 0.11),
)


@dataclass(frozen=True)
class ResolutionPoint:
    """One point on the PAI-vs-resolution curve."""

    resolution: int
    cell_area_km2: float
    pai: float
    hits: int
    total_hits: int
    cells_flagged: int
    cells_total: int

    @property
    def flagged_area_km2(self) -> float:
        return self.cells_flagged * self.cell_area_km2


@dataclass(frozen=True)
class SweepResult:
    """The curve, and the choice only when the data can support one.

    ``chosen`` is ``None`` whenever the dataset is not quotable — not the argmax
    with a warning attached. A selected resolution that a reader has to know to
    distrust is worse than no selection, because the caveat and the number get
    separated the first time either is copied anywhere.
    """

    points: tuple[ResolutionPoint, ...]
    quotability: Quotability
    chosen: int | None

    @property
    def is_conclusive(self) -> bool:
        return self.chosen is not None

    def summary(self) -> str:
        if not self.points:
            return "no resolutions swept"
        curve = "  ".join(f"r{p.resolution}={p.pai:.2f}" for p in self.points)
        if self.chosen is None:
            return f"PAI by resolution: {curve}\n  no resolution chosen — {self.quotability.summary}"
        return f"PAI by resolution: {curve}\n  chosen: r{self.chosen}"


def sweep(
    *,
    events_by_resolution: dict[int, Sequence[tuple[str, datetime]]],
    ranked_cells_by_resolution: dict[int, Sequence[str]],
    flag_fraction: float,
    quotability: Quotability,
    resolutions: Sequence[tuple[int, float]] = CANDIDATE_RESOLUTIONS,
) -> SweepResult:
    """Score each candidate resolution and return the curve.

    ``ranked_cells_by_resolution`` is the model's ordering of cells at that
    resolution, best first; ``flag_fraction`` is the share of cells taken as
    flagged. Both are supplied rather than computed here, because the sweep must
    score whatever ranker it is given — a sweep that built its own ranking would
    only ever measure that one.

    A resolution with no events is skipped rather than scored zero. PAI is
    undefined with no ground-truth events (the metric raises), and a zero would
    read as "this resolution performed badly" when the truth is that it was
    never tested.
    """
    if not 0.0 < flag_fraction < 1.0:
        raise ValueError("flag_fraction must lie strictly between 0 and 1")

    points: list[ResolutionPoint] = []
    for resolution, area in resolutions:
        events = events_by_resolution.get(resolution)
        ranked = ranked_cells_by_resolution.get(resolution)
        if not events or not ranked:
            continue

        cells_flagged = max(1, int(len(ranked) * flag_fraction))
        flagged = set(ranked[:cells_flagged])
        hits = sum(1 for cell, _ in events if cell in flagged)

        result = prediction_accuracy_index(
            hits=hits,
            total_hits=len(events),
            flagged_area=cells_flagged * area,
            total_area=len(ranked) * area,
            h3_resolution=resolution,
        )
        points.append(
            ResolutionPoint(
                resolution=resolution,
                cell_area_km2=area,
                pai=result.value,
                hits=hits,
                total_hits=len(events),
                cells_flagged=cells_flagged,
                cells_total=len(ranked),
            )
        )

    # The argmax is computed only when it is allowed to mean something. Ties
    # break towards the coarser cell: at equal PAI the larger area is the one a
    # team can actually be deployed to, and the finer one is precision theatre.
    chosen: int | None = None
    if quotability.quotable and points:
        chosen = max(points, key=lambda p: (p.pai, -p.resolution)).resolution

    return SweepResult(points=tuple(points), quotability=quotability, chosen=chosen)
