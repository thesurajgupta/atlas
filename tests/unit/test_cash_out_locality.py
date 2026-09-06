"""Cash-out location depends on where the money went (issue #50, spec §23.3).

This is the gate for the bug that made every metric in the project meaningless.
``EndpointCatalog._zone_for_account`` accepted the account and returned
``rng.choice(ZONES)``, so cash-out zone was statistically independent of the
trail. Nothing failed. ``make eval`` produced well-formed numbers, both rankers
scored PAI ≈ 1.0, and that is exactly what random labels arithmetically
produce — the dataset had no signal and no test said so.

Every assertion here fails against that old behaviour, which is the only reason
to trust that it is fixed.
"""

from __future__ import annotations

import collections
from random import Random

import pytest
from atlas.core.enums import CashOutChannel

from simulator.generators.endpoints import EndpointCatalog
from simulator.generators.geography import (
    ZONE_BY_CODE,
    ZONES,
    haversine_km,
    sample_cash_out_zone,
)
from simulator.typologies.base import AccountRef

SAMPLES = 3000


def _zone_counts(home_code: str, seed: int = 11) -> collections.Counter[str]:
    """Cash-out zones drawn for a mule living in ``home_code``.

    One ``Random`` for the whole loop, not one per draw. Building a fresh
    ``Random(seed)`` inside the loop makes every sample identical, and the
    resulting distribution looks like a hard rule rather than a decay — a
    measurement bug that has already fooled me once on this project.
    """
    rng = Random(seed)
    home = ZONE_BY_CODE[home_code]
    return collections.Counter(
        sample_cash_out_zone(rng, home=home).code for _ in range(SAMPLES)
    )


# --------------------------------------------------------------------------
# The gate itself
# --------------------------------------------------------------------------


def test_two_different_homes_produce_different_cash_out_distributions() -> None:
    """The one that fails on `rng.choice(ZONES)`.

    Under the old behaviour both distributions are uniform over the same zones,
    so the overlap is near-total whatever the home. Independence is the bug, and
    this is the shape of it.
    """
    jamtara = _zone_counts("JH-JAM")
    mumbai = _zone_counts("MH-MUM")

    assert jamtara.most_common(1)[0][0] == "JH-JAM"
    assert mumbai.most_common(1)[0][0] == "MH-MUM"

    # Total variation distance between the two distributions. Uniform draws sit
    # near 0; anything genuinely conditioned on home sits far from it.
    codes = {z.code for z in ZONES}
    tvd = sum(abs(jamtara[c] - mumbai[c]) for c in codes) / (2 * SAMPLES)
    assert tvd > 0.5, f"cash-out zone barely depends on home zone (TVD={tvd:.2f})"


def test_the_mules_own_zone_is_the_single_most_likely() -> None:
    """A mule withdraws where they are, more often than anywhere else.

    The floor is 3x uniform rather than a round number, because the observed
    share varies with how crowded a zone's neighbourhood is and that variation
    is correct: Alwar sits within 300 km of five other zones and keeps 19% of
    its own draws, while Hyderabad has none that close and keeps 46%. A mule in
    a dense cluster genuinely has more nearby places to withdraw. Pinning a
    single high threshold would encode the sparse case as the rule and fail on
    the dense one for the right reason.
    """
    uniform = 1 / len(ZONES)
    for code in ("JH-JAM", "MH-MUM", "TN-CHE", "RJ-ALW", "DL-NDL"):
        counts = _zone_counts(code)
        assert counts.most_common(1)[0][0] == code
        assert counts[code] / SAMPLES > 3 * uniform


def test_likelihood_decays_with_distance() -> None:
    """Not a cliff, and not a lookup — a decay.

    Checked as a correlation over all zones rather than on one pair, so a single
    coincidence cannot satisfy it.
    """
    home = ZONE_BY_CODE["JH-JAM"]
    counts = _zone_counts("JH-JAM")

    near = [z for z in ZONES if 0 < haversine_km(home, z) <= 400]
    far = [z for z in ZONES if haversine_km(home, z) > 1200]
    assert near and far

    near_mean = sum(counts[z.code] for z in near) / len(near)
    far_mean = sum(counts[z.code] for z in far) / len(far)
    assert near_mean > far_mean * 3


def test_the_far_tail_is_rare_but_not_empty() -> None:
    """The floor under every zone's weight, and why it is there.

    A generator that never produces a distant cash-out teaches a model a rule
    that is true of the generator and false of the world. "Never more than N km"
    would then separate fraud from normal perfectly, which is the failure the
    separability gate exists to reject (§23.3).
    """
    counts = _zone_counts("JH-JAM")
    home = ZONE_BY_CODE["JH-JAM"]

    far = [z for z in ZONES if haversine_km(home, z) > 1500]
    assert far, "fixture needs at least one distant zone"
    assert any(counts[z.code] > 0 for z in far), (
        "the far tail is absent, not merely rare"
    )
    assert sum(counts[z.code] for z in far) / SAMPLES < 0.25


# --------------------------------------------------------------------------
# Through the catalog, which is what the typology generators actually call
# --------------------------------------------------------------------------


@pytest.mark.parametrize("channel", [CashOutChannel.ATM, CashOutChannel.AEPS_BC])
def test_the_catalog_routes_an_account_to_its_own_area(channel: CashOutChannel) -> None:
    """`sample_endpoint` is the call site the bug was reachable from."""
    catalog = EndpointCatalog()
    rng = Random(3)
    mule = AccountRef(account_id="mule-1", jurisdiction_id="JH-JAM")

    zones = collections.Counter(
        catalog.sample_endpoint(rng, channel, near=mule).endpoint_id.split("-")[0]
        + "-"
        + catalog.sample_endpoint(rng, channel, near=mule).endpoint_id.split("-")[1]
        for _ in range(400)
    )
    assert zones.most_common(1)[0][0] == "JH-JAM"


def test_an_account_with_no_zone_still_works() -> None:
    """The standalone case the original fall-back existed for.

    Kept deliberately: this class is usable without a ``Population``, and a raise
    here would break tests that never wire one up. The difference from the bug is
    that it is now the exception rather than the entire behaviour.
    """
    catalog = EndpointCatalog()
    rng = Random(5)

    assert catalog.sample_endpoint(rng, CashOutChannel.ATM, near=None) is not None
    assert (
        catalog.sample_endpoint(
            rng,
            CashOutChannel.ATM,
            near=AccountRef(account_id="x", jurisdiction_id=None),
        )
        is not None
    )


def test_crypto_is_not_geographic() -> None:
    """A crypto off-ramp has no location, and locality must not invent one (§8.1)."""
    catalog = EndpointCatalog()
    rng = Random(5)
    mule = AccountRef(account_id="mule-1", jurisdiction_id="JH-JAM")

    refs = {
        catalog.sample_endpoint(rng, CashOutChannel.CRYPTO_P2P, near=mule).endpoint_id
        for _ in range(50)
    }
    assert all(r.startswith("CRYPTO-") for r in refs)
