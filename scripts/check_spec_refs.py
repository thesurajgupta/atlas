#!/usr/bin/env python3
"""Verify that every internal cross-reference in the master spec resolves.

The predecessor document accumulated stale section references as it was edited.
A dangling reference in a specification is a small thing that erodes trust in a
large thing, so this runs in CI.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SPEC = REPO / "docs" / "ATLAS_MASTER_SPEC.md"


def main() -> int:
    if not SPEC.exists():
        print(f"  ✗ missing {SPEC.relative_to(REPO)}")
        return 1

    text = SPEC.read_text(encoding="utf-8")
    sections = {int(m.group(1)) for m in re.finditer(r"^## (\d+)\.", text, re.M)}
    subsections = {
        (int(m.group(1)), int(m.group(2)))
        for m in re.finditer(r"^### (\d+)\.(\d+)", text, re.M)
    }
    if not sections:
        print("  ✗ no numbered sections found in the spec")
        return 1

    failures: list[str] = []

    # Every `### N.M` heading must sit under its own `## N.` section. Renumbering
    # the spec once left 32 subsection headings pointing at the wrong parent, and
    # a top-level-only check did not notice.
    current: int | None = None
    for lineno, line in enumerate(text.split("\n"), 1):
        m = re.match(r"^## (\d+)\.", line)
        if m:
            current = int(m.group(1))
            continue
        m3 = re.match(r"^### (\d+)\.(\d+)", line)
        if m3 and current is not None and int(m3.group(1)) != current:
            failures.append(
                f"    line {lineno}: heading {m3.group(1)}.{m3.group(2)} "
                f"sits under section {current}"
            )

    for m in re.finditer(r"§(\d+)(?:\.(\d+))?", text):
        top = int(m.group(1))
        line = text[: m.start()].count("\n") + 1
        if top not in sections:
            failures.append(f"    line {line}: {m.group(0)} -> no such section")
        elif m.group(2) is not None and (top, int(m.group(2))) not in subsections:
            failures.append(f"    line {line}: {m.group(0)} -> no such subsection")

    # Referenced ADRs must exist on disk.
    adr_dir = REPO / "docs" / "adr"
    for m in re.finditer(r"ADR-(\d{3})", text):
        num = m.group(1)
        if not list(adr_dir.glob(f"ADR-{num}-*.md")):
            failures.append(f"    ADR-{num} referenced but no file in docs/adr/")

    # Repo-wide audit. Stale §refs were found in .env.example and two SQL files
    # that a spec-only check could never see, because they live outside docs/.
    skip_files = {
        "docs/ATLAS_MASTER_SPEC.md",                          # checked above
        "docs/architecture/reference-systems-and-design.md",   # own numbering
        "docs/archive/original-brief.md",                      # superseded
        "scripts/check_spec_refs.py",                          # this file
    }
    skip_dirs = {".git", ".venv", "node_modules", "__pycache__", "reports"}
    scanned = 0
    for path in REPO.rglob("*"):
        if not path.is_file() or path.suffix in {".png", ".jpg", ".pdf", ".gitkeep"}:
            continue
        rel = path.relative_to(REPO).as_posix()
        if rel in skip_files or any(d in path.parts for d in skip_dirs):
            continue
        try:
            body = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if "§" not in body:
            continue
        scanned += 1
        for m in re.finditer(r"§(\d+)(?:\.(\d+))?", body):
            n = int(m.group(1))
            if n > 100:          # legal citations such as §314(a)
                continue
            line = body[: m.start()].count("\n") + 1
            if n not in sections:
                failures.append(f"    {rel}:{line}: {m.group(0)} -> no such section")
            elif m.group(2) is not None and (n, int(m.group(2))) not in subsections:
                failures.append(f"    {rel}:{line}: {m.group(0)} -> no such subsection")

    if failures:
        print("  ✗ spec cross-reference check FAILED")
        for f in sorted(set(failures)):
            print(f)
        return 1

    print(f"  ✓ spec cross-references OK "
          f"({len(sections)} sections, {len(subsections)} subsections, "
          f"{scanned} other files referencing them)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
