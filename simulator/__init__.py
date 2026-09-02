"""Synthetic financial-crime simulator (master spec §23, ADR-005).

**Nothing in the ATLAS serving path may import this package**, transitively or
otherwise. It holds the hidden ground truth, and a single import from
``atlas.features`` or ``atlas.predict`` would invalidate every metric the project
reports.

That rule is leakage gate 1 of 5, enforced by import-linter in CI
(master spec §19.5). The package exists from the first commit — before it has any
content — precisely so the gate is armed before there is anything to leak.
"""
