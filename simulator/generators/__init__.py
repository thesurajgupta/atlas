"""Geography, endpoint-density and account-pool generators (spec §23.1, issue #4).

Concrete implementations of the ``AccountPool``/``EndpointRegistry`` protocols
``simulator.typologies.base`` (issue #5) was built against. See
``docs/ml/population-assumptions.md`` for the assumptions behind every number here.
"""

from __future__ import annotations

from .endpoints import EndpointCatalog, channel_weights_for, sample_channel_for_zone
from .geography import ZONES, Zone, ZoneDensity, sample_zone, zones_by_density
from .population import Population

__all__ = [
    "ZONES",
    "EndpointCatalog",
    "Population",
    "Zone",
    "ZoneDensity",
    "channel_weights_for",
    "sample_channel_for_zone",
    "sample_zone",
    "zones_by_density",
]
