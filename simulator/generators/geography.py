"""Geography (spec §23.1, issue #4).

An illustrative subset of Indian states and districts, not a claim of national coverage — see
``docs/ml/population-assumptions.md``. Each ``Zone`` carries an approximate centroid and a
density tier that drives endpoint-channel mix in ``endpoints.py`` and mule locality in
``population.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from random import Random


class ZoneDensity(StrEnum):
    """Urbanicity tier — the single biggest lever on channel mix (spec §8.1)."""

    URBAN = "URBAN"
    SEMI_URBAN = "SEMI_URBAN"
    RURAL = "RURAL"


@dataclass(frozen=True)
class Zone:
    """An administrative area a scenario's accounts and endpoints are anchored to.

    Mirrors the shape of ``apps.api.atlas.geo.models.GeographicZone`` closely enough to map onto
    it later, without importing it — the simulator stays decoupled from the serving-side ORM
    (leakage gate 1, ``simulator/__init__.py``).
    """

    code: str
    name: str
    state: str
    density: ZoneDensity
    centroid_lat: float
    centroid_lon: float


# A small, explicitly illustrative subset — one or two districts per state across a spread of
# density tiers, not an attempt at national coverage. See docs/ml/population-assumptions.md.
ZONES: tuple[Zone, ...] = (
    Zone("MH-MUM", "Mumbai", "Maharashtra", ZoneDensity.URBAN, 19.0760, 72.8777),
    Zone("MH-PUN", "Pune", "Maharashtra", ZoneDensity.URBAN, 18.5204, 73.8567),
    Zone("MH-NAN", "Nandurbar", "Maharashtra", ZoneDensity.RURAL, 21.3667, 74.2500),
    Zone("DL-NDL", "New Delhi", "Delhi", ZoneDensity.URBAN, 28.6139, 77.2090),
    Zone("HR-GUR", "Gurugram", "Haryana", ZoneDensity.URBAN, 28.4595, 77.0266),
    Zone("HR-NUH", "Nuh", "Haryana", ZoneDensity.RURAL, 28.1120, 77.0000),
    Zone("KA-BLR", "Bengaluru Urban", "Karnataka", ZoneDensity.URBAN, 12.9716, 77.5946),
    Zone("KA-KOL", "Kolar", "Karnataka", ZoneDensity.SEMI_URBAN, 13.1367, 78.1298),
    Zone("TN-CHE", "Chennai", "Tamil Nadu", ZoneDensity.URBAN, 13.0827, 80.2707),
    Zone("TN-VLR", "Vellore", "Tamil Nadu", ZoneDensity.SEMI_URBAN, 12.9165, 79.1325),
    Zone(
        "UP-LKO", "Lucknow", "Uttar Pradesh", ZoneDensity.SEMI_URBAN, 26.8467, 80.9462
    ),
    Zone(
        "UP-GZB", "Ghaziabad", "Uttar Pradesh", ZoneDensity.SEMI_URBAN, 28.6692, 77.4538
    ),
    Zone("UP-JHA", "Jhansi", "Uttar Pradesh", ZoneDensity.RURAL, 25.4484, 78.5685),
    Zone("BR-PAT", "Patna", "Bihar", ZoneDensity.SEMI_URBAN, 25.5941, 85.1376),
    Zone("BR-GAY", "Gaya", "Bihar", ZoneDensity.RURAL, 24.7955, 84.9994),
    Zone("WB-KOL", "Kolkata", "West Bengal", ZoneDensity.URBAN, 22.5726, 88.3639),
    Zone("RJ-JAI", "Jaipur", "Rajasthan", ZoneDensity.SEMI_URBAN, 26.9124, 75.7873),
    Zone("RJ-ALW", "Alwar", "Rajasthan", ZoneDensity.RURAL, 27.5530, 76.6346),
    Zone("TG-HYD", "Hyderabad", "Telangana", ZoneDensity.URBAN, 17.3850, 78.4867),
    Zone("JH-JAM", "Jamtara", "Jharkhand", ZoneDensity.RURAL, 23.9600, 86.8000),
)


def sample_zone(rng: Random, *, near: Zone | None = None) -> Zone:
    """Pick a zone. With ``near`` set, heavily favours the same state (spec §9's LOCAL/REGIONAL
    dispersion only means something if mule locality is actually modelled — see
    docs/ml/population-assumptions.md)."""
    if near is not None:
        same_state = [z for z in ZONES if z.state == near.state]
        if same_state and rng.random() < 0.75:
            return rng.choice(same_state)
    return rng.choice(ZONES)


def zones_by_density(density: ZoneDensity) -> tuple[Zone, ...]:
    return tuple(z for z in ZONES if z.density is density)
