"""Whether a number computed on this dataset may be reported (CLAUDE.md rule 2).

Every metric in this project is arithmetic — it will produce a float for any
input at all, including inputs where the float means nothing. PAI on labels
independent of the features comes out at 1.0, not as an error; a Benford-failing
amount distribution yields a perfectly well-formed uplift figure. Neither
announces itself, and once a number is in a slide deck nobody re-derives the
conditions it was computed under.

So the check is made explicit and put in front of the reporting, rather than
being left to whoever reads the caveats. A caller asks whether the dataset can
support a quotable number, and gets a reason when it cannot.

## What this does not do

It does not decide whether a *model* is good. It decides whether the dataset can
answer that question at all. A model can be built, trained and scored against a
dataset that fails here — that is useful engineering — but the resulting figure
is a smoke test, not a measurement, and it must not be published as one.

The two blockers below are the current, specific reasons, each with an issue
number so the gate can be removed when its cause is fixed rather than becoming
permanent scenery:

* **#45** — simulator amounts fail Benford, so the dataset is not validated.
* **#50** — cash-out location is statistically independent of everything a
  complaint knows, so both rankers already score PAI ≈ 1.0, which is what
  random labels arithmetically produce.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Quotability:
    """A verdict on whether metrics from this dataset may be published.

    ``blockers`` carries a sentence per reason rather than a flag, because the
    reader of a refused report needs to know *what* to fix. A boolean would send
    them to the source.
    """

    quotable: bool
    blockers: tuple[str, ...] = field(default_factory=tuple)

    def __bool__(self) -> bool:
        return self.quotable

    @property
    def summary(self) -> str:
        if self.quotable:
            return "dataset supports quotable metrics"
        return "; ".join(self.blockers)


def assess(
    *,
    has_data: bool,
    realism_passed: bool,
    has_signal: bool,
    distinct_event_times: int,
) -> Quotability:
    """Decide whether a metric computed on this dataset means anything.

    Every argument is a fact the caller already established — this deliberately
    performs no checks of its own and reads no database. It is the one place the
    *policy* lives, so that "may we publish this" has a single answer rather than
    one per report.

    ``distinct_event_times`` is separate from ``has_signal`` because it fails
    differently. One timestamp across the whole dataset does not make a ranking
    metric meaningless — PAI is spatial — but it makes every *temporal* claim
    vacuous: a lead time, a forecast horizon, a self-exciting baseline all
    collapse when nothing is spread over time. It is the specific symptom
    recorded under #50.
    """
    blockers: list[str] = []

    if not has_data:
        blockers.append(
            "no dataset: `make simulate` has produced nothing to score (issue #45)"
        )
    if not realism_passed:
        blockers.append(
            "dataset fails the realism checks, so it is not validated (issue #45, spec §23.3)"
        )
    if not has_signal:
        blockers.append(
            "cash-out location is independent of everything a complaint knows, so "
            "any ranking scores at chance by construction (issue #50)"
        )
    if distinct_event_times < 2:
        blockers.append(
            "every event shares one timestamp, so no temporal claim — lead time, "
            "horizon, self-excitation — can be evaluated (issue #50)"
        )

    return Quotability(quotable=not blockers, blockers=tuple(blockers))


#: The verdict to use when a caller has not established the facts at all.
#:
#: Deliberately not "quotable until proven otherwise". A gate that defaults open
#: is a gate that is open, and the failure mode — a published number nobody
#: checked — is exactly the one this module exists to prevent.
UNKNOWN = Quotability(
    quotable=False,
    blockers=("dataset quotability was never assessed, so nothing may be published",),
)
