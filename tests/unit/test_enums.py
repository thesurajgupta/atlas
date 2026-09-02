"""Domain enum behaviour that carries real meaning."""

from __future__ import annotations

from atlas.core.enums import CashOutChannel


def test_aeps_bc_is_a_modelled_channel() -> None:
    """AePS/BC cash-out is a dominant vector in India; ATM-only would be wrong."""
    assert CashOutChannel.AEPS_BC in set(CashOutChannel)


def test_crypto_is_not_geolocatable() -> None:
    """Its lack of coordinates is a modelled fact, not missing data.

    The evaluation must exclude these rather than score them as a miss.
    """
    assert CashOutChannel.CRYPTO_P2P.is_geolocatable is False


def test_physical_channels_are_geolocatable() -> None:
    for channel in (
        CashOutChannel.ATM,
        CashOutChannel.AEPS_BC,
        CashOutChannel.BANK_BRANCH,
        CashOutChannel.MERCHANT_QR,
    ):
        assert channel.is_geolocatable is True
