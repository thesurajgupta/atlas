"""Path assembly from recursive-CTE rows (master spec §14.2).

A recursive CTE emits one row per recursion level, which means every *prefix* of
every path comes back as its own result. Collapsing those into the paths an
investigator should actually see is pure logic, so it is tested without a
database — this is where a silent truncation would live, and a truncated money
trail is a wrong answer wearing the shape of a complete one.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from atlas.core.enums import CashOutChannel, EdgeType
from atlas.graph.trail import TrailHop, assemble_paths

BASE = datetime(2026, 3, 1, 9, 0, tzinfo=UTC)


def _hop(
    frm: uuid.UUID,
    to: uuid.UUID,
    depth: int,
    *,
    minutes: int = 0,
    amount: str = "100000.00",
    edge_type: EdgeType = EdgeType.TRANSFERRED_TO,
    channel: CashOutChannel | None = None,
) -> TrailHop:
    return TrailHop(
        edge_id=uuid.uuid4(),
        from_entity_id=frm,
        to_entity_id=to,
        edge_type=edge_type,
        amount=Decimal(amount),
        occurred_at=BASE + timedelta(minutes=minutes),
        channel=channel,
        rail="IMPS",
        depth=depth,
    )


def _chain(*hops: TrailHop) -> list[tuple[list[uuid.UUID], TrailHop]]:
    """Turn hops into the (edge_path, hop) rows the CTE would emit.

    Every prefix is emitted, exactly as the database does.
    """
    rows = []
    for i, hop in enumerate(hops):
        rows.append(([h.edge_id for h in hops[: i + 1]], hop))
    return rows


def test_prefixes_collapse_into_one_maximal_path() -> None:
    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    rows = _chain(_hop(a, b, 1, minutes=0), _hop(b, c, 2, minutes=30))

    paths = assemble_paths(rows, max_depth=6)

    assert len(paths) == 1, "A→B→C is one trail, not two"
    assert len(paths[0].hops) == 2
    assert paths[0].origin_entity_id == a
    assert paths[0].terminal_entity_id == c


def test_a_fork_yields_two_paths_sharing_a_prefix() -> None:
    a, b, c, d = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    h1 = _hop(a, b, 1, minutes=0)
    h2 = _hop(b, c, 2, minutes=10)
    h3 = _hop(b, d, 2, minutes=20)
    rows = [
        ([h1.edge_id], h1),
        ([h1.edge_id, h2.edge_id], h2),
        ([h1.edge_id, h3.edge_id], h3),
    ]

    paths = assemble_paths(rows, max_depth=6)

    assert len(paths) == 2
    assert {p.terminal_entity_id for p in paths} == {c, d}
    # The shared first hop must appear on both, not be consumed by one.
    assert all(p.hops[0].edge_id == h1.edge_id for p in paths)


def test_cash_out_paths_rank_above_transfers() -> None:
    a, b, c, d = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    h1 = _hop(a, b, 1, minutes=0)
    transfer = _hop(b, c, 2, minutes=10)
    cash_out = _hop(
        b,
        d,
        2,
        minutes=20,
        edge_type=EdgeType.WITHDREW_AT,
        channel=CashOutChannel.AEPS_BC,
    )
    rows = [
        ([h1.edge_id], h1),
        ([h1.edge_id, transfer.edge_id], transfer),
        ([h1.edge_id, cash_out.edge_id], cash_out),
    ]

    paths = assemble_paths(rows, max_depth=6)

    assert paths[0].reaches_cash_out, (
        "a cash-out is the answer to the question being asked"
    )
    assert paths[0].terminal_entity_id == d


def test_depth_capped_path_is_marked_truncated() -> None:
    """The flag that stops a search limit from reading as a finding.

    A trail that stops at an account because the *search* stopped there looks
    identical to one where the *money* stopped there — and those two facts
    warrant opposite investigative responses.
    """
    ids = [uuid.uuid4() for _ in range(3)]
    rows = _chain(_hop(ids[0], ids[1], 1), _hop(ids[1], ids[2], 2, minutes=5))

    paths = assemble_paths(rows, max_depth=2)

    assert paths[0].truncated is True


def test_cash_out_at_max_depth_is_not_truncated() -> None:
    """Money leaving the system is a real terminal, whatever the depth cap says."""
    ids = [uuid.uuid4() for _ in range(3)]
    rows = _chain(
        _hop(ids[0], ids[1], 1),
        _hop(
            ids[1],
            ids[2],
            2,
            minutes=5,
            edge_type=EdgeType.WITHDREW_AT,
            channel=CashOutChannel.ATM,
        ),
    )

    paths = assemble_paths(rows, max_depth=2)

    assert paths[0].truncated is False
    assert paths[0].reaches_cash_out is True


def test_longest_dwell_is_the_gap_not_the_total() -> None:
    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    rows = _chain(_hop(a, b, 1, minutes=0), _hop(b, c, 2, minutes=600))

    path = assemble_paths(rows, max_depth=6)[0]

    assert path.longest_dwell == timedelta(minutes=600)
    assert path.elapsed == timedelta(minutes=600)


def test_single_hop_has_no_dwell() -> None:
    path = assemble_paths(_chain(_hop(uuid.uuid4(), uuid.uuid4(), 1)), max_depth=6)[0]

    assert path.longest_dwell == timedelta(0)


def test_retained_fraction_reports_how_much_of_the_sum_survived() -> None:
    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    rows = _chain(
        _hop(a, b, 1, amount="200000.00"),
        _hop(b, c, 2, minutes=5, amount="50000.00"),
    )

    path = assemble_paths(rows, max_depth=6)[0]

    assert path.retained_fraction == Decimal("0.25")


def test_no_rows_is_no_paths_not_an_error() -> None:
    """An origin with no outgoing edges is a normal answer.

    It means the money has not moved on, which is actionable — the account may
    still be freezable. Raising here would turn the best possible news into an
    error page.
    """
    assert assemble_paths([], max_depth=6) == []
