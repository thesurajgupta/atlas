"""Field masking (master spec §30)."""

from __future__ import annotations

from atlas.core.classification import mask_account


def test_mask_preserves_length() -> None:
    """A mask that shortens the value leaks the fact that it shortened it."""
    assert mask_account("123456789012") == "XXXXXXXX9012"
    assert len(mask_account("123456789012")) == 12


def test_mask_shows_only_last_four_by_default() -> None:
    assert mask_account("123456789012").endswith("9012")
    assert "12345678" not in mask_account("123456789012")


def test_mask_handles_short_input_without_leaking() -> None:
    assert mask_account("123") == "XXX"
