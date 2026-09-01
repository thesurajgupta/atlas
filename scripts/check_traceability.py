#!/usr/bin/env python3
"""Verify the requirements traceability matrix is complete and internally consistent.

Master spec §49 criterion 21: every clause of the official problem statement must
map to a module and a passing test. A clause with no Test ID is a clause we have
not delivered, regardless of how much code exists.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MATRIX = REPO / "docs" / "problem-statement" / "requirements-traceability.md"
VALID_STATUS = {"PLANNED", "IN_PROGRESS", "IMPLEMENTED", "VERIFIED"}


def main() -> int:
    if not MATRIX.exists():
        print(f"  ✗ missing {MATRIX.relative_to(REPO)}")
        return 1

    failures: list[str] = []
    rows = 0
    status_counts: dict[str, int] = {}

    for lineno, line in enumerate(MATRIX.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line.startswith("|") or line.startswith("|---"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        # Requirement rows come in two shapes, and BOTH must be validated:
        #   4-column: clause | module | test id | status
        #   5-column: capability | serves-which-clause | module | test id | status
        # An earlier version only handled the 4-column form, which meant a whole
        # table of added capabilities was silently unchecked.
        if len(cells) == 4:
            clause, module, test_id, status = cells
        elif len(cells) == 5:
            clause, _serves, module, test_id, status = cells
        else:
            continue
        if status in ("Status", ""):
            continue

        rows += 1

        if status not in VALID_STATUS:
            failures.append(f"    line {lineno}: bad status {status!r} (expected one of {sorted(VALID_STATUS)})")
        else:
            status_counts[status] = status_counts.get(status, 0) + 1

        if not test_id or test_id in ("-", "TBD", "n/a"):
            failures.append(f"    line {lineno}: clause {clause[:48]!r} has no Test ID")

        if not module:
            failures.append(f"    line {lineno}: clause {clause[:48]!r} has no module")

    if rows == 0:
        failures.append("    no requirement rows parsed — matrix format may have changed")

    if failures:
        print("  ✗ traceability check FAILED")
        for f in failures:
            print(f)
        return 1

    summary = ", ".join(f"{k}={v}" for k, v in sorted(status_counts.items()))
    print(f"  ✓ traceability OK ({rows} clauses tracked: {summary})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
