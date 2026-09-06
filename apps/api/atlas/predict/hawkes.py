"""Self-exciting baseline for repeat cash-out at a cell (master spec §15, §20).

Cash-out is bursty. An endpoint that paid out twice this morning is a better bet
for this afternoon than one that has been quiet for a month, and not because the
place is intrinsically risky — because a network currently moving money through
it will keep doing so until the account is frozen. A frequency table cannot say
that: it treats a burst last March and a burst an hour ago as the same evidence.

A Hawkes process is the standard shape for exactly this. Each event raises the
intensity at its own cell, and the excitement decays:

    lambda(cell, t) = mu(cell) + sum over past events at cell of
                      alpha * exp(-(t - t_i) / tau)

* ``mu`` — the background rate, estimated per cell from history. What the cell
  does when nothing in particular is happening.
* ``alpha`` — how much one event raises the intensity.
* ``tau`` — how fast that excitement fades.

## Why this is the baseline and not the model

This is deliberately the thing to beat, not the answer. It uses no feature of
the complaint, the victim, the money trail or the account — only the cell's own
history of cash-out. That makes it the honest bar for §20: a LightGBM model with
access to the entire feature store that cannot beat "this place was busy
recently" has not earned its complexity, and reporting its raw accuracy without
that comparison would hide the fact.

It is also the right baseline because it is *hard*. Historical frequency is easy
to beat and beating it proves little. Recency-weighted self-excitation captures
most of the operational signal, and a model that adds two points over it has
genuinely added something.

## What it is not

Not a probability. The intensity is an unnormalised rate, useful for **ranking**
cells and nothing else. Rendering it as "68% likely" would be a claim the system
cannot support (CLAUDE.md rule 4), and the class deliberately offers no method
that converts it into one. Calibration is a separate exercise with its own
metric (ECE), against labels that do not yet exist.

Fitted by moment-matching rather than maximum likelihood. MLE for a Hawkes
process is a real optimisation, and with the current dataset it would be
optimisation against noise (#50) — a precise fit to a signal that is not there.
The estimator here is transparent, has no failure mode that looks like success,
and can be replaced when the data can support the harder one.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

#: Default excitement half-life. Cash-out bursts run over hours, not weeks: a
#: mule network moves money and cashes it out inside the same day, and the
#: account is usually frozen or abandoned soon after. Stated as a parameter
#: because it is an assumption about criminal tempo, not a constant of nature —
#: a deployment that finds a different tempo should change it deliberately.
DEFAULT_HALF_LIFE = timedelta(hours=6)

#: How much one event raises its cell's intensity, relative to background.
#: Above zero or the process is not self-exciting at all.
DEFAULT_EXCITATION = 1.0


@dataclass(frozen=True)
class CashOutEvent:
    """One cash-out, reduced to what a point process needs.

    Carries no amount, no channel, no entity and no complaint. That narrowness
    is the baseline's definition: adding any of them would make it a model with
    features, and it would stop being the bar those models must clear.
    """

    cell: str
    occurred_at: datetime


@dataclass(frozen=True)
class HawkesBaseline:
    """A fitted self-exciting rate per cell.

    Immutable, and holds its own fitting window. An intensity is only meaningful
    relative to the period the background rate was estimated over, and a model
    separated from that period silently compares rates computed on different
    denominators.
    """

    background: dict[str, float]
    excitation: float
    half_life: timedelta
    fitted_from: datetime
    fitted_to: datetime
    #: Event times per cell, ascending. Kept because the intensity at scoring
    #: time depends on the actual history, not on a summary of it.
    history: dict[str, tuple[datetime, ...]]

    @property
    def decay_seconds(self) -> float:
        """Time constant ``tau`` such that excitement halves every half-life."""
        return self.half_life.total_seconds() / math.log(2)

    def intensity(self, cell: str, at: datetime) -> float:
        """Unnormalised rate for ``cell`` at instant ``at``.

        Only events strictly before ``at`` contribute. An event at exactly the
        scoring instant is the thing being predicted, and letting it excite its
        own prediction is the simplest possible leak — it would produce a
        spectacular metric and forecast nothing.

        A cell never seen while fitting scores 0.0. That is a statement about
        evidence, not a claim of safety: it means this baseline has nothing to
        say there, and a ranking built from it will place such cells last.
        """
        if at.tzinfo is None:
            raise ValueError("scoring instant must be timezone-aware")

        rate = self.background.get(cell, 0.0)
        tau = self.decay_seconds
        for event_at in self.history.get(cell, ()):
            if event_at >= at:
                # History is ascending, so nothing later can contribute either.
                break
            elapsed = (at - event_at).total_seconds()
            rate += self.excitation * math.exp(-elapsed / tau)
        return rate

    def rank_cells(self, cells: Sequence[str], at: datetime) -> list[str]:
        """Cells ordered by intensity at ``at``, most intense first.

        Ties break on the cell identifier so the ordering is deterministic. Two
        runs of the same evaluation that disagree because a dict iterated
        differently would make a metric irreproducible, which CLAUDE.md rule 2
        treats as worse than no metric.
        """
        return sorted(cells, key=lambda cell: (-self.intensity(cell, at), cell))


def fit(
    events: Iterable[CashOutEvent],
    *,
    fitted_from: datetime,
    fitted_to: datetime,
    half_life: timedelta = DEFAULT_HALF_LIFE,
    excitation: float = DEFAULT_EXCITATION,
) -> HawkesBaseline:
    """Estimate a background rate per cell from events in a fitting window.

    ``fitted_from`` and ``fitted_to`` are given rather than inferred from the
    events, and that matters: inferring the window from the data makes the
    background rate depend on when the first and last event happened, so a cell
    with one event scores the same background as a cell with one event per day.
    A stated window makes the denominator the period, which is what a rate means.

    Events outside the window are ignored rather than an error. Callers pass a
    training set produced by :mod:`atlas.predict.splits`, and an event landing
    outside is the embargo doing its job.
    """
    if fitted_from.tzinfo is None or fitted_to.tzinfo is None:
        raise ValueError("fitting window must be timezone-aware")
    if fitted_to <= fitted_from:
        raise ValueError("fitting window must be positive")
    if half_life <= timedelta(0):
        raise ValueError("half_life must be positive")
    if excitation <= 0:
        raise ValueError("excitation must be positive; at zero the process is not self-exciting")

    window_seconds = (fitted_to - fitted_from).total_seconds()

    per_cell: dict[str, list[datetime]] = {}
    for event in events:
        if event.occurred_at.tzinfo is None:
            raise ValueError("every event must carry a timezone-aware occurred_at")
        if not (fitted_from <= event.occurred_at <= fitted_to):
            continue
        per_cell.setdefault(event.cell, []).append(event.occurred_at)

    background: dict[str, float] = {}
    history: dict[str, tuple[datetime, ...]] = {}
    for cell, times in per_cell.items():
        times.sort()
        history[cell] = tuple(times)
        # Events per second over the stated window. Left unnormalised across
        # cells on purpose: PAI compares a ranking, and rescaling every cell by
        # the same constant changes no ordering while inviting the reading that
        # the number is a probability.
        background[cell] = len(times) / window_seconds

    return HawkesBaseline(
        background=background,
        excitation=excitation,
        half_life=half_life,
        fitted_from=fitted_from,
        fitted_to=fitted_to,
        history=history,
    )
