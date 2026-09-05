"""Machine-learning code: evaluation harness, the Phase 2.5 probe, and models.

A package rather than a bare directory so `ml.evaluation.metrics` has exactly
one module name. Without this file mypy resolves the same file as both
`evaluation.metrics` and `ml.evaluation.metrics` and refuses to check either.

Nothing under `atlas.*` may import this. The dependency runs the other way:
evaluation reads what the serving path produced, and the import contract keeps
the serving path away from anything that can reach ground truth.
"""
