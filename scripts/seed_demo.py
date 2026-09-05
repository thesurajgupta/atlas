#!/usr/bin/env python3
"""Seed a local demo: one jurisdiction tree, one investigator, a few complaints.

Development convenience only. It refuses to run outside ``development``, because
the whole point of it is a known password — creating that account anywhere else
would be handing out a working credential.

Idempotent: re-running updates the existing rows rather than duplicating them,
so it is safe to call repeatedly while working on the UI.

    .venv/bin/python scripts/seed_demo.py
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "apps" / "api"))

import pyotp
from atlas.core.config import Environment, get_settings
from atlas.core.enums import (
    CaseStatus,
    CashOutChannel,
    FraudTypology,
    JurisdictionLevel,
    Role,
)
from atlas.iam import mfa, passwords
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

USERNAME = "demo.investigator"
PASSWORD = "atlas-demo-password"
DISPLAY_NAME = "Demo Investigator"

COMPLAINTS = [
    (
        FraudTypology.DIGITAL_ARREST,
        "820000.00",
        38,
        "Caller claimed to be from a courier firm, then a police officer.",
    ),
    (
        FraudTypology.UPI_COLLECT_FRAUD,
        "46000.00",
        142,
        "Victim approved a collect request believing it was a refund.",
    ),
    (
        FraudTypology.CUSTOMER_CARE_IMPERSONATION,
        "128000.00",
        301,
        "Number found via a search result posing as bank support.",
    ),
    (
        FraudTypology.JOB_TASK_FRAUD,
        "15000.00",
        9,
        "Task-based earning scheme; deposits requested to 'unlock' payout.",
    ),
    (
        FraudTypology.INVESTMENT_SCAM,
        "560000.00",
        77,
        "Group chat promising guaranteed returns on a trading app.",
    ),
]

# Endpoint positions are inside Delhi's bounding box so the map renders somewhere
# sensible, but the operators and refs are invented. Naming a real branch and
# marking it fraud-adjacent is exactly what CLAUDE.md rule 3 forbids, and this
# repository is public.
ENDPOINTS = [
    ("EP-0783", CashOutChannel.ATM, "Bank A", 28.6139, 77.2090),
    ("EP-1092", CashOutChannel.ATM, "Bank B", 28.6448, 77.2167),
    ("EP-2210", CashOutChannel.BANK_BRANCH, "Bank C", 28.5921, 77.2290),
    ("EP-3341", CashOutChannel.AEPS_BC, "Bank A", 28.6692, 77.1830),
    ("EP-4408", CashOutChannel.ATM, "Bank D", 28.5355, 77.3910),
    ("EP-5127", CashOutChannel.BANK_BRANCH, "Bank B", 28.7041, 77.1025),
    ("EP-6033", CashOutChannel.AEPS_BC, "Bank C", 28.4595, 77.0266),
    # No coordinates: a crypto off-ramp has no physical location, and inventing
    # one would put a marker on a map where nothing exists (spec §8.1).
    ("EP-7781", CashOutChannel.CRYPTO_P2P, "Exchange P", None, None),
]

CASES = [
    (
        "CASE-2026-0914",
        "Digital arrest — layered to AePS",
        CaseStatus.INVESTIGATING,
        "820000.00",
        0,
    ),
    (
        "CASE-2026-0915",
        "UPI collect fraud — single hop",
        CaseStatus.TRIAGED,
        "46000.00",
        1,
    ),
    ("CASE-2026-0916", "Customer-care impersonation", CaseStatus.NEW, "128000.00", 2),
]


async def main() -> int:
    settings = get_settings()
    if settings.env is not Environment.DEVELOPMENT:
        print(f"refusing to seed: ATLAS_ENV is {settings.env.value}, not development")
        return 1

    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        # --- jurisdiction tree: state -> district ---
        state_id = await _upsert_jurisdiction(
            session, code="DL", name="Delhi", level=JurisdictionLevel.STATE, parent=None
        )
        district_id = await _upsert_jurisdiction(
            session,
            code="DL-CYB",
            name="Delhi Cyber Cell",
            level=JurisdictionLevel.DISTRICT,
            parent=state_id,
        )

        # --- investigator ---
        secret = mfa.generate_secret()
        existing = await session.execute(
            text("SELECT id, mfa_secret FROM iam.investigator WHERE username = :u"),
            {"u": USERNAME},
        )
        row = existing.first()
        if row is None:
            investigator_id = uuid.uuid4()
            await session.execute(
                text(
                    "INSERT INTO iam.investigator "
                    "(id, username, display_name, password_hash, mfa_secret, mfa_enrolled, "
                    " role, jurisdiction_id, is_active, failed_login_count) "
                    "VALUES (:id, :u, :dn, :ph, :ms, true, CAST(:role AS iam.role), :j, true, 0)"
                ),
                {
                    "id": investigator_id,
                    "u": USERNAME,
                    "dn": DISPLAY_NAME,
                    "ph": passwords.hash_password(PASSWORD),
                    "ms": secret,
                    "role": Role.DISTRICT_INVESTIGATOR.value,
                    "j": district_id,
                },
            )
        else:
            investigator_id, secret = row[0], row[1]
            await session.execute(
                text(
                    "UPDATE iam.investigator SET password_hash = :ph, is_active = true, "
                    "failed_login_count = 0, locked_until = NULL WHERE id = :id"
                ),
                {"ph": passwords.hash_password(PASSWORD), "id": investigator_id},
            )

        # --- complaints ---
        now = datetime.now(UTC)
        created = 0
        for i, (typology, amount, minutes_ago, narrative) in enumerate(COMPLAINTS):
            ref = f"NCRP/2026/{100200 + i}"
            reported_at = now - timedelta(minutes=minutes_ago)
            result = await session.execute(
                text("SELECT 1 FROM complaints.complaint WHERE public_ref = :r"),
                {"r": ref},
            )
            if result.first():
                continue
            await session.execute(
                text(
                    "INSERT INTO complaints.complaint "
                    "(id, public_ref, reported_at, fraud_initiated_at, observed_at, "
                    " typology, reported_amount, currency, victim_jurisdiction_id, narrative, "
                    " source_system, source_record_id, classification, is_synthetic) "
                    "VALUES (:id, :ref, :rep, :fraud, :obs, "
                    " CAST(:typ AS complaints.fraud_typology), :amt, 'INR', :j, :narr, "
                    " 'seed_demo', :srec, 'SENSITIVE', true)"
                ),
                {
                    "id": uuid.uuid4(),
                    "ref": ref,
                    "rep": reported_at,
                    "fraud": reported_at - timedelta(minutes=25),
                    "obs": reported_at,
                    "typ": typology.value,
                    "amt": Decimal(amount),
                    "j": district_id,
                    "narr": narrative,
                    "srec": ref,
                },
            )
            created += 1

        # --- cash-out endpoints ---
        endpoints_created = 0
        for ref, channel, operator, lat, lon in ENDPOINTS:
            exists = await session.execute(
                text("SELECT 1 FROM geo.cash_out_endpoint WHERE public_ref = :r"),
                {"r": ref},
            )
            if exists.first():
                continue
            geom = (
                "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)"
                if lat is not None
                else "NULL"
            )
            await session.execute(
                text(
                    "INSERT INTO geo.cash_out_endpoint "
                    "(id, public_ref, channel, operator, geom, jurisdiction_id, observed_at, "
                    " source_system, source_record_id, classification, is_synthetic) "
                    f"VALUES (:id, :ref, CAST(:ch AS geo.cash_out_channel), :op, {geom}, "
                    " :j, :obs, 'seed_demo', :ref, 'SENSITIVE', true)"
                ),
                {
                    "id": uuid.uuid4(),
                    "ref": ref,
                    "ch": channel.value,
                    "op": operator,
                    "j": district_id,
                    "obs": now,
                    **({"lat": lat, "lon": lon} if lat is not None else {}),
                },
            )
            endpoints_created += 1

        # --- cases, each linked to one of the complaints above ---
        cases_created = 0
        complaint_ids = list(
            (
                await session.execute(
                    text(
                        "SELECT id FROM complaints.complaint WHERE source_system = 'seed_demo' "
                        "ORDER BY public_ref"
                    )
                )
            ).scalars()
        )
        for i, (ref, title, status, amount, complaint_index) in enumerate(CASES):
            exists = await session.execute(
                text("SELECT 1 FROM cases.case WHERE public_ref = :r"), {"r": ref}
            )
            if exists.first():
                continue
            case_id = uuid.uuid4()
            await session.execute(
                text(
                    "INSERT INTO cases.case "
                    "(id, public_ref, status, title, opened_at, owning_jurisdiction_id, "
                    " assigned_to_id, amount_at_risk) "
                    "VALUES (:id, :ref, CAST(:st AS cases.case_status), :t, :op, :j, :a, :amt)"
                ),
                {
                    "id": case_id,
                    "ref": ref,
                    "st": status.value,
                    "t": title,
                    "op": now - timedelta(hours=i + 1),
                    "j": district_id,
                    "a": investigator_id,
                    "amt": Decimal(amount),
                },
            )
            if complaint_index < len(complaint_ids):
                await session.execute(
                    text(
                        "INSERT INTO cases.case_complaint_link "
                        "(id, case_id, complaint_id, owning_jurisdiction_id) "
                        "VALUES (:id, :c, :cx, :j)"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "c": case_id,
                        "cx": complaint_ids[complaint_index],
                        "j": district_id,
                    },
                )
            cases_created += 1

        await session.commit()

    await engine.dispose()

    # Neither the password nor the TOTP secret is printed, and CodeQL was right
    # to flag the version that did (py/clear-text-logging-sensitive-data). The
    # password is a constant in this file, so echoing it added exposure and no
    # information. The secret is generated per account and is the durable
    # credential — printing it puts it in terminal scrollback, shell history
    # files and any CI log that ever runs this.
    #
    # A live 6-digit code is enough to sign in and is worthless 30 seconds later,
    # which is the whole point of TOTP.
    code = pyotp.TOTP(secret).now() if secret else "------"
    print("seeded.\n")
    print(f"  username     {USERNAME}")
    print("  password     see PASSWORD in scripts/seed_demo.py")
    print(f"  code now     {code}   (valid ~30s — re-run for a fresh one)")
    print(f"  jurisdiction Delhi Cyber Cell ({district_id})")
    print(f"  complaints   {created} new, {len(COMPLAINTS)} total")
    print(f"  endpoints    {endpoints_created} new, {len(ENDPOINTS)} total")
    print(f"  cases        {cases_created} new, {len(CASES)} total")
    return 0


async def _upsert_jurisdiction(
    session, *, code: str, name: str, level: JurisdictionLevel, parent: uuid.UUID | None
) -> uuid.UUID:
    found = await session.execute(
        text("SELECT id FROM iam.jurisdiction WHERE code = :c"), {"c": code}
    )
    row = found.first()
    if row:
        return row[0]
    new_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO iam.jurisdiction (id, code, name, level, parent_id) "
            "VALUES (:id, :c, :n, CAST(:l AS iam.jurisdiction_level), :p)"
        ),
        {"id": new_id, "c": code, "n": name, "l": level.value, "p": parent},
    )
    return new_id


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
