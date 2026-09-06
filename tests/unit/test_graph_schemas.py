"""Contract invariants of the graph API schemas (master spec §14.2).

These are statements about *declarations*, not about behaviour: no database, no
client, no traversal. They live in the unit suite so a contract that has drifted
fails in the fast loop, before anyone waits for Docker to find out.

The behaviour those declarations describe is tested over HTTP in
``tests/integration/test_graph_api.py``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import get_args

import pytest
from atlas.core.enums import EdgeType
from atlas.graph.schemas import MoneyEdgeType, TrailHopOut, TrailPathOut
from pydantic import ValidationError


def test_the_published_hop_edge_types_match_moves_money() -> None:
    """``MoneyEdgeType`` is hand-written; ``EdgeType.moves_money`` is the truth.

    A ``Literal`` cannot be computed from a property, so the schema restates the
    membership — and a restatement is a thing that drifts. Adding a third
    money-moving edge type without widening the schema would give a traversal
    that walks the new type and a response model that refuses to serialise it:
    a 500 on exactly the hops the new type was added for. This fails first.
    """
    assert set(get_args(MoneyEdgeType)) == {t for t in EdgeType if t.moves_money}


def test_a_hop_refuses_a_non_money_edge_type() -> None:
    """The narrowing is enforced, not merely advertised.

    ``TrailHopOut.from_domain`` casts, because ``TrailHop.edge_type`` is the full
    enum and the traversal's guarantee is not visible to the type checker. A cast
    that nothing checked would be a lie; this is what checks it.
    """
    with pytest.raises(ValidationError):
        TrailHopOut(
            edge_id=uuid.uuid4(),
            from_entity_id=uuid.uuid4(),
            to_entity_id=uuid.uuid4(),
            edge_type=EdgeType.SHARES_DEVICE,  # type: ignore[arg-type]
            amount=Decimal("1.00"),
            occurred_at=datetime(2026, 4, 6, tzinfo=UTC),
            channel=None,
            rail=None,
            depth=1,
        )


def test_no_path_field_reads_as_a_confidence() -> None:
    """There is no labelled ground truth to calibrate one against.

    ``TrailPath`` omits a confidence deliberately, and a serialiser that added
    one — under any of these names — would put a claim the system cannot support
    onto an investigator's screen (CLAUDE.md rule 4). Asserted on the model
    rather than only on a response body, so it holds even for a path shape no
    test happens to exercise.
    """
    forbidden = {
        "confidence",
        "score",
        "likelihood",
        "probability",
        "risk",
        "certainty",
    }
    assert not forbidden & set(TrailPathOut.model_fields)
