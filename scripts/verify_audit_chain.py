#!/usr/bin/env python3
"""Recompute the audit chain and verify every checkpoint signature.

Promised by master spec §32 and ADR-007. Run it on a schedule in production, and
after any incident — the whole point of tamper-evidence is that someone actually
looks.

Exits non-zero on any discrepancy, so it can be wired to alerting.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "apps" / "api"))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

from atlas.audit import checkpoints  # noqa: E402
from atlas.audit.service import count_events, verify_chain  # noqa: E402
from atlas.core.config import get_settings  # noqa: E402


async def _run() -> int:
    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    failures = 0
    async with factory() as session:
        total = await count_events(session)
        if total == 0:
            print("  · audit chain: empty, nothing to verify")
            await engine.dispose()
            return 0

        chain = await verify_chain(session)
        if chain.ok:
            print(f"  ✓ audit chain: {chain.events_checked} events, unbroken")
        else:
            print(
                f"  ✗ audit chain BROKEN at sequence {chain.first_bad_sequence}: {chain.reason}"
            )
            failures += 1

        key_path = REPO / "keys" / "audit-checkpoint.dev.key"
        if not key_path.exists():
            # Not a failure: a fresh clone has no development key yet. Say so
            # explicitly rather than printing a tick that means nothing.
            print("  · checkpoints: no signing key present, signature check skipped")
        else:
            try:
                key = checkpoints.load_signing_key(key_path, key_id="dev")
            except checkpoints.SigningKeyError as exc:
                print(f"  ✗ checkpoints: {exc}")
                failures += 1
            else:
                result = await checkpoints.verify_all_checkpoints(session, key.public_key)
                if result.ok:
                    print(f"  ✓ checkpoints: {result.checkpoints_checked} verified")
                else:
                    print(
                        f"  ✗ checkpoint FAILED at sequence "
                        f"{result.first_bad_sequence}: {result.reason}"
                    )
                    failures += 1

    await engine.dispose()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_run()))
