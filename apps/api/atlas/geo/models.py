"""Geospatial reference data: cash-out endpoints and the H3 risk lattice."""

from __future__ import annotations

import uuid
from datetime import time
from decimal import Decimal

from geoalchemy2 import Geometry
from sqlalchemy import Enum, ForeignKey, Index, Numeric, String, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from atlas.core.database import Base
from atlas.core.enums import CashOutChannel
from atlas.core.mixins import ObservationBase

SCHEMA = "geo"


class CashOutEndpoint(ObservationBase, Base):
    """A point where value can leave the traceable banking system.

    The prediction target. Note this is *not* "an ATM" — modelling it that way
    would miss AePS/Business-Correspondent cash-out, which is now a dominant
    vector in India and behaves quite differently (master spec §8.1).

    ``geom`` is nullable and that nullability is meaningful: a ``CRYPTO_P2P``
    endpoint is logical rather than geographic. Its lack of coordinates is a
    modelled fact, not missing data to be imputed.
    """

    __tablename__ = "cash_out_endpoint"
    __table_args__ = (
        UniqueConstraint("public_ref", name="uq_endpoint_public_ref"),
        Index("ix_endpoint_geom", "geom", postgresql_using="gist"),
        Index("ix_endpoint_h3_r7", "h3_r7"),
        Index("ix_endpoint_h3_r8", "h3_r8"),
        Index("ix_endpoint_channel", "channel"),
        Index("ix_endpoint_observed_at_id", "observed_at", "id"),
        {"schema": SCHEMA},
    )

    public_ref: Mapped[str] = mapped_column(String(32), nullable=False)
    channel: Mapped[CashOutChannel] = mapped_column(
        Enum(CashOutChannel, name="cash_out_channel", schema=SCHEMA), nullable=False
    )
    operator: Mapped[str] = mapped_column(String(160), nullable=False)

    geom: Mapped[str | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=True
    )
    # H3 cells stored at several resolutions. The prediction resolution is chosen
    # empirically by a PAI sweep (ADR-011), so we index more than one and pick later
    # rather than baking the choice into the schema.
    h3_r6: Mapped[str | None] = mapped_column(String(16), nullable=True)
    h3_r7: Mapped[str | None] = mapped_column(String(16), nullable=True)
    h3_r8: Mapped[str | None] = mapped_column(String(16), nullable=True)

    jurisdiction_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)

    opens_at: Mapped[time | None] = mapped_column(Time, nullable=True)
    closes_at: Mapped[time | None] = mapped_column(Time, nullable=True)
    cash_limit: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)


class GeographicZone(ObservationBase, Base):
    """An administrative boundary — state, district, police-station area."""

    __tablename__ = "geographic_zone"
    __table_args__ = (
        UniqueConstraint("code", name="uq_zone_code"),
        Index("ix_zone_boundary", "boundary", postgresql_using="gist"),
        Index("ix_geographic_zone_observed_at_id", "observed_at", "id"),
        {"schema": SCHEMA},
    )

    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    level: Mapped[str] = mapped_column(String(32), nullable=False)
    boundary: Mapped[str | None] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False), nullable=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.geographic_zone.id", ondelete="RESTRICT")
    )
