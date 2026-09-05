"""Artefact edges are withheld from the feature pipeline (master spec §14.1, §22.1).

Traceability: ``LEAK-005``.

A ``Prediction`` node linked to a ``Case`` is investigative context. Allowing it
into the feature pipeline lets the model read its own prior output back as
evidence: it predicted this endpoint, an alert was raised, the alert is now a
graph edge, and the edge becomes a feature that makes the next prediction more
confident. Confidence rises, accuracy does not, and nothing in the metrics says
so — because from the model's point of view the feature genuinely predicts the
label.

Enforced by revoking the grant rather than by asking people not to. A comment
saying "do not use this in features" is a comment. A role with no grant is a
boundary, and it holds against a coding error as well as against forgetfulness.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.leakage


async def test_the_feature_role_cannot_read_artefact_links(
    session: AsyncSession,
) -> None:
    result = await session.execute(
        text(
            "SELECT has_table_privilege('atlas_features','graph.artefact_link','SELECT')"
        )
    )
    assert result.scalar() is False, (
        "atlas_features can read graph.artefact_link. A prediction can reach its "
        "own prior output through the graph, and rising confidence will look "
        "like rising skill."
    )


async def test_the_feature_role_can_still_read_the_transaction_graph(
    session: AsyncSession,
) -> None:
    """The assertion above is only meaningful if the role has grants to lose.

    Degree, fan-in and fan-out over *financial* edges are legitimate features
    and the graph module exists partly to supply them. A blanket revoke on the
    schema would pass the test above while removing the reason the schema is
    there — so the boundary is between kinds of edge, not around the module.
    """
    result = await session.execute(
        text(
            "SELECT has_table_privilege('atlas_features','graph.transaction_edge','SELECT')"
        )
    )
    assert result.scalar() is True


async def test_the_serving_role_can_read_artefact_links(session: AsyncSession) -> None:
    """The investigator-facing path must still work.

    Without this, a revoke that broke the traversal entirely would look like a
    passing security test.
    """
    result = await session.execute(
        text("SELECT has_table_privilege('atlas_app','graph.artefact_link','SELECT')")
    )
    assert result.scalar() is True
