"""Geography (spec §23.1, issue #4).

An illustrative subset of Indian states and districts, not a claim of national coverage — see
``docs/ml/population-assumptions.md``. Each ``Zone`` carries an approximate centroid and a
density tier that drives endpoint-channel mix in ``endpoints.py`` and mule locality in
``population.py``.
"""

from __future__ import annotations

import math
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


#: Zone by code, so an ``AccountRef.jurisdiction_id`` can be resolved back to the zone
#: that produced it without a reference to the ``Population`` that assigned it.
ZONE_BY_CODE: dict[str, Zone] = {z.code: z for z in ZONES}

#: Distance at which a zone is half as likely to host a cash-out as the mule's own.
#: Chosen so a neighbouring district stays plausible and the far side of the country
#: is rare but never impossible — long cash-outs do happen, and a hard cut-off would
#: make "was it local?" perfectly predictive, which is the separability failure §23.3
#: warns about.
_HALF_WEIGHT_KM = 180.0

#: Floor under every zone's weight. Without it the tail is not merely unlikely, it is
#: absent — and a model would learn "never more than N km" as a fact about the world
#: rather than an artefact of the generator.
_MIN_WEIGHT = 0.02


def haversine_km(a: Zone, b: Zone) -> float:
    """Great-circle distance between two zone centroids."""
    r = 6371.0
    p1, p2 = math.radians(a.centroid_lat), math.radians(b.centroid_lat)
    dp = p2 - p1
    dl = math.radians(b.centroid_lon - a.centroid_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def sample_cash_out_zone(rng: Random, *, home: Zone) -> Zone:
    """Where money reaching a mule in ``home`` is most likely withdrawn.

    **This is the function issue #50 was about.** Cash-out location has to depend on
    where the money actually went, or there is nothing for a model to learn and every
    metric computes to exactly chance — which is what ``make eval`` was reporting.

    The shape is a distance decay with a floor, not a lookup:

    * the mule's own zone is most likely, because a mule withdraws where they are;
    * likelihood halves roughly every :data:`_HALF_WEIGHT_KM`;
    * every zone keeps :data:`_MIN_WEIGHT`, so the far tail is rare rather than absent.

    The floor is the part that matters for honesty. A generator that never produces a
    distant cash-out teaches a model a rule that is true of the generator and false of
    the world, and the separability gate would be right to reject it.
    """
    weights = [
        max(_MIN_WEIGHT, 0.5 ** (haversine_km(home, z) / _HALF_WEIGHT_KM)) for z in ZONES
    ]
    chosen: Zone = rng.choices(ZONES, weights=weights, k=1)[0]
    return chosen


#: Relative likelihood that a zone hosts mule accounts, over and above its share of
#: victims. Mule infrastructure is geographically concentrated in a way victims are
#: not: recruitment runs through local networks, so a district that produces mules
#: keeps producing them. The districts weighted up here are the ones repeatedly named
#: in NCRP and press reporting on cyber-fraud mule recruitment.
#:
#: **These are documented assumptions, not fitted parameters**, and the weights are
#: deliberately modest. The temptation is to make the concentration dramatic, and that
#: would be wrong twice over: it would overstate what is known, and it would make
#: "which district" trivially predictable — a model would learn the constant rather
#: than anything about a case, and the separability gate would be right to reject it.
#:
#: Rationale per district is in ``docs/ml/population-assumptions.md``.
MULE_HOSTING_WEIGHT: dict[str, float] = {
    "JH-JAM": 4.0,  # Jamtara
    "HR-NUH": 3.5,  # Nuh / Mewat
    "RJ-ALW": 3.0,  # Alwar
    "BR-GAY": 2.0,  # Gaya
    "UP-JHA": 1.8,  # Jhansi
    "WB-KOL": 1.5,  # Kolkata
    "BR-PAT": 1.5,  # Patna
    "UP-GZB": 1.4,  # Ghaziabad
    "DL-NDL": 1.3,  # New Delhi
}
_DEFAULT_MULE_WEIGHT = 1.0


def sample_mule_zone(rng: Random, *, near: Zone | None = None) -> Zone:
    """Where a mule account is opened.

    Separate from :func:`sample_zone` because mules and victims are not drawn from the
    same geography, and treating them as if they were is what made every zone equally
    likely to see a cash-out — no zone preferred, so no zone rankable, which the probe
    reports as "near-uniform: no zone can be ranked".

    ``near`` still applies: a fraud recruits its next hop close to the last one, so
    locality composes with the hosting prior rather than replacing it.
    """
    candidates = ZONES
    if near is not None:
        same_state = tuple(z for z in ZONES if z.state == near.state)
        if same_state and rng.random() < 0.6:
            candidates = same_state
    weights = [
        MULE_HOSTING_WEIGHT.get(z.code, _DEFAULT_MULE_WEIGHT) for z in candidates
    ]
    chosen: Zone = rng.choices(candidates, weights=weights, k=1)[0]
    return chosen


def zones_by_density(density: ZoneDensity) -> tuple[Zone, ...]:
    return tuple(z for z in ZONES if z.density is density)
