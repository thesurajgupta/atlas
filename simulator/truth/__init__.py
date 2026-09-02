"""Hidden ground truth. Isolated from the serving path by three mechanisms.

1. This package is unimportable from ``atlas.*`` (import-linter, gate 1).
2. Its data lives in the ``truth`` PostgreSQL schema, on which the serving and
   feature roles have no grant (gate 2, master spec §19.2).
3. CI plants a canary that must never appear in a feature vector (gate 5).

One mechanism would be defeated by an ordinary mistake. Three is the point.
"""
