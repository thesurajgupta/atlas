#!/usr/bin/env python3
"""Block commits of files that look like real financial or personal data.

Heuristic and deliberately conservative — it is a backstop for human error, not a
substitute for judgement (ADR-010). False positives are acceptable; a single real
Aadhaar number reaching a public repository is not.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Paths that must never contain data files at all.
FORBIDDEN_DIRS = ("data/real/", "data/production/", "data/restricted/")

# Aadhaar: 12 digits, first digit 2-9, commonly spaced 4-4-4.
AADHAAR = re.compile(r"\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b")
# PAN: 5 letters, 4 digits, 1 letter.
PAN = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
# IFSC: 4 letters, '0', 6 alphanumerics.
IFSC = re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b")

SCANNABLE = {".csv", ".json", ".txt", ".sql", ".md", ".yaml", ".yml", ".tsv", ".py"}
# Synthetic markers that make a match acceptable.
SYNTHETIC_MARKERS = ("SYN-", "SYNTHETIC", "synthetic", "EXAMPLE", "XXXX", "example")


def check(path: Path) -> list[str]:
    problems: list[str] = []
    posix = path.as_posix()

    if any(posix.startswith(d) for d in FORBIDDEN_DIRS):
        return [f"{posix}: lives under a forbidden data directory"]

    if path.suffix.lower() not in SCANNABLE or not path.exists():
        return problems

    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return problems

    # A file that clearly announces itself as synthetic is allowed to contain
    # identifier-shaped strings.
    if any(marker in text for marker in SYNTHETIC_MARKERS):
        return problems

    for label, pattern in (
        ("Aadhaar-like", AADHAAR),
        ("PAN-like", PAN),
        ("IFSC-like", IFSC),
    ):
        hits = pattern.findall(text)
        if hits:
            problems.append(
                f"{posix}: {len(hits)} {label} value(s), first={hits[0][:4]}…"
            )

    return problems


def main(argv: list[str]) -> int:
    problems: list[str] = []
    for arg in argv:
        problems.extend(check(Path(arg)))

    if problems:
        print("BLOCKED — this looks like real data (ADR-010):")
        for p in problems:
            print(f"  ✗ {p}")
        print()
        print("If it is genuinely synthetic, mark it (e.g. an 'SYN-' identifier prefix")
        print("or a SYNTHETIC header) and commit again.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
