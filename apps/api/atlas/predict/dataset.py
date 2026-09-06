"""Build labelled cell observations for Tier 1 (master spec §15, §19.1, §20).

The feature store holds facts about **entities**; Tier 1 predicts over **cells**.
Something has to cross that gap, and this is it. The crossing is not plumbing —
it is a modelling decision — so it is made explicitly here rather than implied by
whichever aggregate someone reached for first.

## How entity features become cell features

A cell contains several cash-out endpoints, and "the features of a cell" is not
defined until you say how they combine. Two summaries carry genuinely different
signal:

* **Sum** — total activity in the cell. Finds a neighbourhood where many agents
  are moderately busy.
* **Max** — the busiest single endpoint. Finds a cell containing one very hot
  agent, which sum drowns among quiet neighbours.

Either alone discards a real pattern, and there is no principled way to pick
between them in advance — the answer depends on how cash-out actually clusters,
which is an empirical question this dataset cannot yet answer (#50). So **both
are emitted**, prefixed, along with the endpoint count that makes a sum
interpretable. A gradient booster is precisely the tool for deciding which
matters; choosing on its behalf, before any evidence, would be the asserted
decision ADR-011 objects to in a different context.

The cost is a wider feature vector. That is cheap, and the alternative is a
silent choice nobody can find later.

## Labels

The label is the count of cash-outs in the cell over the horizon **after** the
prediction instant. A count, not a boolean: three withdrawals and one are
different amounts of evidence, and collapsing them throws the difference away
before the model sees it.

Labels look forward — that is what makes them labels — and every feature looks
back. The two windows never overlap, and :mod:`atlas.predict.splits` keeps whole
observations apart across the train/test boundary with an embargo, so a label
from the training period cannot reach a test feature.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from atlas.entity.resolution import entity_ids_for
from atlas.features.store import read_as_of
from atlas.geo.cells import all_endpoint_cells
from atlas.predict.cells import cash_out_cell_events
from atlas.predict.tier1 import CellObservation

#: Prefixes for the two summaries. Part of the feature name because they are two
#: different features, not one feature computed two ways.
SUM_PREFIX = "cell_sum_"
MAX_PREFIX = "cell_max_"

#: How many endpoints the cell holds. Without it a sum is uninterpretable — ten
#: quiet agents and one busy one can produce the same total, and only the count
#: separates them.
ENDPOINT_COUNT_FEATURE = "cell_endpoint_count"


def cell_feature_names(entity_feature_names: Sequence[str]) -> tuple[str, ...]:
    """The cell-level names produced from a set of entity-level ones.

    Exposed so a caller can declare the model's feature list without rebuilding a
    dataset to discover it. Order is fixed and deterministic: LightGBM consumes
    positional arrays, and a set that iterated differently between training and
    scoring would feed one feature where another was expected.
    """
    names: list[str] = []
    for name in entity_feature_names:
        names.append(f"{SUM_PREFIX}{name}")
        names.append(f"{MAX_PREFIX}{name}")
    names.append(ENDPOINT_COUNT_FEATURE)
    return tuple(names)


@dataclass(frozen=True)
class DatasetSlice:
    """Observations at one prediction instant, with what was skipped.

    ``cells_without_features`` is returned rather than logged for the same reason
    ``CellEvents.unplaced`` is: a lattice that silently shrank is
    indistinguishable from a quiet one, and the difference decides whether a
    result is a finding or a broken join.
    """

    observations: tuple[CellObservation, ...]
    as_of: datetime
    horizon: timedelta
    resolution: int
    cells_without_features: int


async def build_slice(
    session: AsyncSession,
    *,
    as_of: datetime,
    horizon: timedelta,
    resolution: int,
    entity_feature_names: Sequence[str],
    label_window_start: datetime | None = None,
) -> DatasetSlice:
    """One prediction instant: every cell, its features, and its label.

    Features are read from the store at ``as_of`` — so every value carries the
    store's own ``observed_at <= as_of`` guarantee, and this function cannot
    loosen it because it never queries a table directly.

    Labels count cash-outs in ``(as_of, as_of + horizon]``. That window is in the
    future of every feature by construction, which is the property that makes the
    pair a training example rather than a tautology.

    Every cell with at least one endpoint gets an observation, including cells
    with no cash-out at all. Those are the negatives, and a dataset containing
    only cells where value has already left would train a model to rank the
    places it is least likely to leave next.
    """
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware; naive datetimes are ambiguous")
    if horizon <= timedelta(0):
        raise ValueError("horizon must be positive")

    endpoint_to_cell = await all_endpoint_cells(session, as_of=as_of, resolution=resolution)
    if not endpoint_to_cell:
        return DatasetSlice(
            observations=(),
            as_of=as_of,
            horizon=horizon,
            resolution=resolution,
            cells_without_features=0,
        )

    refs_to_entity = await entity_ids_for(
        session, public_refs=sorted(endpoint_to_cell), as_of=as_of
    )
    vectors = await read_as_of(
        session,
        subject_kind="ENTITY",
        subject_ids=sorted(refs_to_entity.values()),
        feature_names=list(entity_feature_names),
        as_of=as_of,
    )

    # Group the entity vectors that belong to each cell.
    per_cell: dict[str, list[dict[str, float]]] = {}
    endpoints_per_cell: dict[str, int] = {}
    for ref, cell in endpoint_to_cell.items():
        endpoints_per_cell[cell] = endpoints_per_cell.get(cell, 0) + 1
        entity_id = refs_to_entity.get(ref)
        vector = vectors.get(entity_id) if entity_id is not None else None
        if vector is not None:
            per_cell.setdefault(cell, []).append(dict(vector.values))

    labels = await _labels(
        session,
        window_start=label_window_start if label_window_start is not None else as_of,
        window_end=as_of + horizon,
        resolution=resolution,
    )

    observations: list[CellObservation] = []
    without_features = 0
    for cell in sorted(endpoints_per_cell):
        vectors_here = per_cell.get(cell, [])
        if not vectors_here:
            # No endpoint in this cell has any feature yet. Skipped rather than
            # zero-filled: the store distinguishes "absent" from "observed zero",
            # and inventing zeroes here would hand the model values nobody
            # measured — see `features.store.read_as_of`.
            without_features += 1
            continue
        observations.append(
            CellObservation(
                cell=cell,
                occurred_at=as_of,
                features=_aggregate(vectors_here, entity_feature_names, endpoints_per_cell[cell]),
                label=labels.get(cell, 0),
            )
        )

    return DatasetSlice(
        observations=tuple(observations),
        as_of=as_of,
        horizon=horizon,
        resolution=resolution,
        cells_without_features=without_features,
    )


def _aggregate(
    vectors: Sequence[dict[str, float]],
    entity_feature_names: Sequence[str],
    endpoint_count: int,
) -> dict[str, float]:
    """Sum and max of each entity feature across a cell's endpoints.

    A feature absent from every vector in the cell contributes 0.0 to both. That
    is a deliberate narrowing of the store's absent/zero distinction and the one
    place it is lost: the model needs a rectangular matrix, and LightGBM cannot
    be handed "no value" without treating the absence itself as signal. It is
    recorded here rather than buried, because it is the weakest link in this
    module.
    """
    aggregated: dict[str, float] = {ENDPOINT_COUNT_FEATURE: float(endpoint_count)}
    for name in entity_feature_names:
        present = [v[name] for v in vectors if name in v]
        aggregated[f"{SUM_PREFIX}{name}"] = float(sum(present)) if present else 0.0
        aggregated[f"{MAX_PREFIX}{name}"] = float(max(present)) if present else 0.0
    return aggregated


async def _labels(
    session: AsyncSession,
    *,
    window_start: datetime,
    window_end: datetime,
    resolution: int,
) -> dict[str, int]:
    """Cash-out counts per cell over the label window.

    Read at ``window_end``: a label is ground truth about what happened, and the
    horizon is exactly the period after which it is knowable. Reading it at the
    prediction instant instead would return nothing, since none of it had
    happened yet.
    """
    events = await cash_out_cell_events(
        session, as_of=window_end, since=window_start, resolution=resolution
    )
    counts: dict[str, int] = {}
    for event in events.events:
        counts[event.cell] = counts.get(event.cell, 0) + 1
    return counts


async def build_dataset(
    session: AsyncSession,
    *,
    instants: Sequence[datetime],
    horizon: timedelta,
    resolution: int,
    entity_feature_names: Sequence[str],
) -> list[CellObservation]:
    """Observations across a grid of prediction instants.

    The grid is supplied rather than generated. Its spacing determines how much
    the label windows of adjacent instants overlap, and an overlap is a
    correlation between rows that no split can undo — so the choice belongs to
    the caller who knows the horizon, not to a default in here.
    """
    observations: list[CellObservation] = []
    for instant in instants:
        result = await build_slice(
            session,
            as_of=instant,
            horizon=horizon,
            resolution=resolution,
            entity_feature_names=entity_feature_names,
        )
        observations.extend(result.observations)
    return observations
