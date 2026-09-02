"""Foundation layer: configuration, clock, identifiers, errors, base models.

`atlas.core` depends on no other ATLAS module. That is enforced in CI by
import-linter (ADR-009): if core starts importing a domain module the dependency
graph has inverted, and the boundaries erode from there.
"""
