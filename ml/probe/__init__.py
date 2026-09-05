"""Phase 2.5 — the ML risk probe.

**This package is deliberately throwaway.** Its only job is to answer one
question before the project builds a feature store, three model tiers and an
evaluation harness on top of an unvalidated premise:

    Given a complaint, can we rank cash-out zones better than chance?

If the answer is no, the approach needs to change while changing it is still
cheap. Finding out at Phase 8 — after the graph, the entity resolution and the
ranking ladder are built — is the expensive version of the same discovery.

It reads ground truth for **labels only**, offline, as `atlas_sim`. That is the
legitimate use: evaluation is allowed to see the answer, and the serving path is
not. Nothing here runs in the API, and `atlas.features`/`atlas.predict` cannot
import it — the import contract forbids the whole `simulator` package to them,
and this package reaches truth through the simulator's own models.

Numbers produced here are **not project metrics**. They are a go/no-go signal on
a dataset that has not passed the §23.3 realism gate.
"""
