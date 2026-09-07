#!/usr/bin/env python3
"""Print a current TOTP code for a demo account.

Exists because the only other way to get one was to re-run the whole seed, which
also re-anchors every timestamp — a heavy side effect when all you wanted was to
sign in again after a code expired.

Prints the *code*, never the secret. A live 6-digit code is worthless 30 seconds
later; the secret is the durable credential, and echoing it would put it in
terminal scrollback, shell history and any CI log that ever runs this.

    .venv/bin/python scripts/demo_code.py [username]
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "apps" / "api"))

import pyotp
from atlas.core.config import Environment, get_settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DEFAULT_ACCOUNTS = ("demo.investigator", "demo.auditor")


async def main() -> int:
    settings = get_settings()
    if settings.env is not Environment.DEVELOPMENT:
        print(f"refusing: ATLAS_ENV is {settings.env.value}, not development")
        return 1

    usernames = sys.argv[1:] or list(DEFAULT_ACCOUNTS)
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as conn:
            for username in usernames:
                secret = (
                    await conn.execute(
                        text(
                            "SELECT mfa_secret FROM iam.investigator WHERE username = :u"
                        ),
                        {"u": username},
                    )
                ).scalar()
                if secret is None:
                    print(f"  {username:<20} no such account — run scripts/seed_demo.py")
                    continue
                print(f"  {username:<20} {pyotp.TOTP(secret).now()}")
    finally:
        await engine.dispose()

    print("\n  valid ~30s. Password: see PASSWORD in scripts/seed_demo.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
