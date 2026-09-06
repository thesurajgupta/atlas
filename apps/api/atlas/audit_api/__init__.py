"""The audit log's HTTP surface, deliberately separate from ``atlas.audit``.

``atlas.audit`` is the second-from-bottom layer in the module graph (ADR-009),
and that position is load-bearing rather than incidental: **everything** writes
audit events, including ``atlas.iam`` — ``iam/router.py`` calls
``audit.service.record`` to log every login. So ``atlas.audit`` must not depend
on anything above it, or the two form a cycle and the audit service becomes
entangled with the modules it exists to record.

An HTTP endpoint needs the opposite. To read the log it has to authenticate the
caller, check a permission and resolve their jurisdiction scope — all of which
live in ``atlas.iam``, above ``atlas.audit``. The two requirements cannot be
satisfied by one module.

So they are two modules. ``atlas.audit`` writes and verifies, and sits at the
bottom where every caller can reach it. ``atlas.audit_api`` reads over HTTP, and
sits near the top where it can authenticate. The split is not bookkeeping — it
is the difference between the thing that records and the thing that shows.

Issue #64 asked for this to live at ``atlas/audit/router.py``. That placement
breaks the layering contract, which ``import-linter`` enforces in CI, and the
alternative fix — an exemption in ``.importlinter`` — would have been the first
hole in a file that has none. Extending the enforced graph was the option that
leaves the check stronger than it found it.
"""
