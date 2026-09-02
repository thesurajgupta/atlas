"""No protected attribute or close proxy may exist in the schema.

Master spec §22.2 requires this "enforced by a failing test, not by promise".
The check runs against every mapped column across every module, so a `caste`,
`religion` or `surname` column cannot enter the database in the first place —
which is a stronger guarantee than filtering it out of a feature vector later.

This is deliberately live from Phase 1, before the feature pipeline exists. A
gate added after the thing it guards has usually already failed once.
"""

from __future__ import annotations

import pytest

# The `noqa: F401` imports below are unused by name on purpose: importing them
# registers their tables on Base.metadata, which is what the schema scan walks.
from atlas.audit import models as _audit  # noqa: F401
from atlas.cases import models as _cases  # noqa: F401
from atlas.complaints import models as _complaints  # noqa: F401
from atlas.core.database import Base
from atlas.core.fairness import PROHIBITED, find_prohibited, is_prohibited
from atlas.entity import models as _entity  # noqa: F401
from atlas.geo import models as _geo  # noqa: F401
from atlas.iam import models as _iam  # noqa: F401

pytestmark = pytest.mark.fairness


def test_metadata_is_populated() -> None:
    """Without this the schema scan below would pass vacuously."""
    assert len(Base.metadata.tables) >= 15, (
        "models not registered; the scan proves nothing"
    )


def test_no_prohibited_columns_in_any_table() -> None:
    """The assertion that matters."""
    offenders: dict[str, list[str]] = {}
    for name, table in Base.metadata.tables.items():
        bad = find_prohibited(c.name for c in table.columns)
        if bad:
            offenders[name] = bad
    assert not offenders, (
        f"protected attributes or proxies found in the schema: {offenders}. "
        f"ATLAS must never use these as features (master spec §3, §22.2)."
    )


@pytest.mark.parametrize("attribute", sorted(PROHIBITED))
def test_every_prohibited_attribute_is_detected(attribute: str) -> None:
    """Prove the detector fires on each term it claims to cover."""
    assert is_prohibited(attribute)
    assert is_prohibited(f"victim_{attribute}")
    assert is_prohibited(f"{attribute}_code")


def test_detector_does_not_flag_legitimate_names() -> None:
    """A check with false positives gets suppressed, which is worse than none.

    `community_detection` is a graph algorithm (master spec §14). Substring
    matching would flag it for containing "community" and the whole gate would
    end up muted.
    """
    for legitimate in (
        "community_detection",
        "community_id",
        "jurisdiction_id",
        "typology",
        "amount_at_risk",
        "observed_at",
        "h3_r7",
        "cash_limit",
    ):
        assert not is_prohibited(legitimate), f"false positive on {legitimate}"


def test_gate_would_fail_if_a_protected_column_were_added() -> None:
    """Prove the gate fires, rather than trusting that it would."""
    assert find_prohibited(["complaint_id", "victim_caste", "amount"]) == [
        "victim_caste"
    ]
    assert find_prohibited(["surname"]) == ["surname"]
    assert find_prohibited(["complaint_id", "amount"]) == []
