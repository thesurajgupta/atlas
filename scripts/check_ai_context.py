#!/usr/bin/env python3
"""Keep the AI-assistant context files in sync.

Different tools read different files: Claude Code reads CLAUDE.md, Cursor reads
.cursorrules, Copilot reads .github/copilot-instructions.md, and so on. A
teammate using any of them must get the same non-negotiable rules.

The pointer files are generated copies of one another. If one drifts, some
teammate's assistant is working from stale rules and nobody will notice, because
nothing visibly breaks.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
CANONICAL = REPO / "CLAUDE.md"
POINTERS = [
    REPO / ".cursorrules",
    REPO / ".github" / "copilot-instructions.md",
    REPO / "AGENTS.md",
    REPO / ".windsurfrules",
]

# Rules that must appear verbatim in every pointer file, however it is worded
# around them.
REQUIRED = [
    "Never weaken a check",
    "Never hand-write a metric",
    "Never commit a secret",
    "Never claim certainty",
    "Green locally means nothing",
    "observed_at <= as_of",
]


def main() -> int:
    failures: list[str] = []

    if not CANONICAL.exists():
        print(f"  ✗ {CANONICAL.name} is missing — it is the canonical context file")
        return 1

    digests: dict[str, str] = {}
    for path in POINTERS:
        rel = path.relative_to(REPO).as_posix()
        if not path.exists():
            failures.append(f"    {rel} missing — that tool's users get no project rules")
            continue
        body = path.read_text(encoding="utf-8")
        digests[rel] = hashlib.sha256(body.encode()).hexdigest()
        for rule in REQUIRED:
            if rule not in body:
                failures.append(f"    {rel} is missing the rule: {rule!r}")
        if "CLAUDE.md" not in body:
            failures.append(f"    {rel} does not point at CLAUDE.md")

    if len(set(digests.values())) > 1:
        failures.append("    pointer files have drifted apart — regenerate them from one source")

    if failures:
        print("  ✗ AI context check FAILED")
        for f in failures:
            print(f)
        return 1

    print(f"  ✓ AI context OK (CLAUDE.md + {len(POINTERS)} tool pointers, in sync)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
