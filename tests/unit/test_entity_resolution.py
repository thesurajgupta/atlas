"""Entity resolution (master spec §13, ADR-013).

A wrong merge contaminates every case attached to it, so these tests lean hard
on the *negative* cases — the pairs that must not be merged.
"""

from __future__ import annotations

import uuid

from atlas.entity.resolution import (
    AUTO_MERGE_THRESHOLD,
    REVIEW_THRESHOLD,
    EntitySignals,
    block,
    candidate_pairs,
    cluster,
    score_pair,
)


def _acct(number: str, **kw: str) -> EntitySignals:
    return EntitySignals(kind="account", account_number=number, **kw)


# --- blocking -------------------------------------------------------------


def test_blocking_key_survives_formatting_differences() -> None:
    """Two systems describing one account rarely format it identically."""
    a = _acct("1234 5678 9012")
    b = _acct("123456789012")
    assert a.blocking_keys() & b.blocking_keys()


def test_short_identifiers_produce_no_block() -> None:
    """A 3-digit 'account' would bucket half the country together."""
    assert _acct("123").blocking_keys() == set()


def test_phone_blocks_on_last_ten_digits() -> None:
    """+91 prefixes come and go between systems."""
    a = EntitySignals(kind="person", phone="+91 98765 43210")
    b = EntitySignals(kind="person", phone="9876543210")
    assert a.blocking_keys() & b.blocking_keys()


def test_blocks_with_a_single_member_are_dropped() -> None:
    """A block of one produces no pairs and is pure overhead."""
    assert block({uuid.uuid4(): _acct("111111111111")}) == {}


def test_only_blocked_pairs_are_compared() -> None:
    """The property that makes this tractable at national volume."""
    ids = [uuid.uuid4() for _ in range(4)]
    candidates = {
        ids[0]: _acct("111111111111"),
        ids[1]: _acct("111111111111"),
        ids[2]: _acct("999999999999"),
        ids[3]: _acct("888888888888"),
    }
    pairs = candidate_pairs(candidates)
    assert len(pairs) == 1, "unrelated accounts must never be compared"


# --- scoring --------------------------------------------------------------


def test_same_account_and_ifsc_is_near_certain() -> None:
    score = score_pair(
        _acct("123456789012", ifsc="HDFC0001234"),
        _acct("123456789012", ifsc="HDFC0001234"),
    )
    assert score.should_merge


def test_same_account_number_at_different_banks_is_not_a_merge() -> None:
    """Account numbers are unique within a bank, not across banks.

    Merging on the number alone would fuse two unrelated people the first time
    two banks happened to issue the same digits.
    """
    score = score_pair(
        _acct("123456789012", ifsc="HDFC0001234"),
        _acct("123456789012", ifsc="ICIC0005678"),
    )
    assert not score.should_merge


def test_conflicting_account_numbers_push_the_score_down() -> None:
    """A mismatch is evidence *against*, not merely absent evidence for."""
    shared_phone = {"phone": "9876543210"}
    conflict = score_pair(
        _acct("111111111111", **shared_phone), _acct("222222222222", **shared_phone)
    )
    agree = score_pair(
        EntitySignals(kind="account", **shared_phone),
        EntitySignals(kind="account", **shared_phone),
    )
    assert conflict.score < agree.score


def test_different_kinds_never_match() -> None:
    assert (
        score_pair(
            EntitySignals(kind="account", phone="9876543210"),
            EntitySignals(kind="person", phone="9876543210"),
        ).score
        == 0.0
    )


def test_shared_district_alone_is_not_evidence() -> None:
    """Millions share a district. Alone it must not move the needle."""
    score = score_pair(
        EntitySignals(kind="person", kyc_district="Nuh"),
        EntitySignals(kind="person", kyc_district="Nuh"),
    )
    assert score.score < REVIEW_THRESHOLD


def test_shared_phone_alone_lands_in_the_review_band() -> None:
    """Strong but not conclusive — family members share handsets.

    Exactly the case a human should see rather than the system deciding.
    """
    score = score_pair(
        EntitySignals(kind="person", phone="9876543210"),
        EntitySignals(kind="person", phone="9876543210"),
    )
    assert score.needs_review


def test_score_is_symmetric() -> None:
    """Otherwise the result depends on iteration order, which is a lottery."""
    a = _acct("123456789012", ifsc="HDFC0001234", phone="9876543210")
    b = _acct("123456789012", ifsc="HDFC0001234")
    assert score_pair(a, b).score == score_pair(b, a).score


def test_score_stays_within_bounds() -> None:
    a = _acct(
        "123456789012",
        ifsc="HDFC0001234",
        phone="9876543210",
        device_id="d1",
        endpoint_ref="EP-1",
        kyc_district="Nuh",
    )
    assert 0.0 <= score_pair(a, a).score <= 1.0


# --- clustering -----------------------------------------------------------


def test_transitive_merge() -> None:
    """A links to B, B links to C — all three are one actor.

    This is what turns scattered complaints into a visible mule network.
    """
    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    clusters, _ = cluster(
        {
            a: _acct("111111111111", ifsc="HDFC0001234", phone="9000000001"),
            b: _acct("111111111111", ifsc="HDFC0001234", device_id="dev-1"),
            c: _acct(
                "222222222222",
                ifsc="HDFC0009999",
                device_id="dev-1",
                phone="9000000001",
            ),
        }
    )
    merged = [group for group in clusters if len(group) > 1]
    assert merged and merged[0] >= {a, b}


def test_unrelated_entities_stay_separate() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    clusters, _ = cluster({a: _acct("111111111111"), b: _acct("999999999999")})
    assert all(len(group) == 1 for group in clusters)


def test_review_band_pairs_are_surfaced_not_dropped() -> None:
    """Near-misses are where a human adds most value."""
    a, b = uuid.uuid4(), uuid.uuid4()
    _, for_review = cluster(
        {
            a: EntitySignals(kind="person", phone="9876543210"),
            b: EntitySignals(kind="person", phone="9876543210"),
        }
    )
    assert len(for_review) == 1
    assert REVIEW_THRESHOLD <= for_review[0][2].score < AUTO_MERGE_THRESHOLD


def test_every_entity_appears_in_exactly_one_cluster() -> None:
    ids = [uuid.uuid4() for _ in range(5)]
    candidates = {
        ids[0]: _acct("111111111111", ifsc="HDFC0001234"),
        ids[1]: _acct("111111111111", ifsc="HDFC0001234"),
        ids[2]: _acct("222222222222"),
        ids[3]: _acct("333333333333"),
        ids[4]: _acct("444444444444"),
    }
    clusters, _ = cluster(candidates)
    assert sum(len(group) for group in clusters) == len(candidates)
    assert set().union(*clusters) == set(candidates)
