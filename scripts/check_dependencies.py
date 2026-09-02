#!/usr/bin/env python3
"""Verify every third-party import is a declared dependency.

`geoalchemy2` reached `main` undeclared: it was installed by hand into a local
virtualenv, so everything passed locally and CI failed on a clean install. That
failure mode is silent on the machine where the code is written, which is exactly
the machine where it will be missed.
"""

from __future__ import annotations

import ast
import pathlib
import sys
import tomllib

REPO = pathlib.Path(__file__).resolve().parents[1]

# Import name differs from the distribution name for these.
ALIASES = {"jwt": "pyjwt", "yaml": "pyyaml", "dateutil": "python-dateutil", "dotenv": "python-dotenv"}
LOCAL_PACKAGES = {"atlas", "simulator", "ml", "tests"}


def normalise(name: str) -> str:
    """PEP 503 name normalisation: `pydantic_settings` and `pydantic-settings` are one package."""
    return name.replace("_", "-").replace(".", "-").lower()


def declared_distributions() -> set[str]:
    data = tomllib.loads((REPO / "apps/api/pyproject.toml").read_text())
    specs = list(data["project"]["dependencies"])
    for extra in data["project"].get("optional-dependencies", {}).values():
        specs.extend(extra)
    out = set()
    for spec in specs:
        base = spec.split("[")[0]
        for sep in (">=", "<=", "==", "!=", "~=", ">", "<", ";"):
            base = base.split(sep)[0]
        out.add(normalise(base.strip()))
    return out


def imported_modules() -> dict[str, set[str]]:
    stdlib = set(sys.stdlib_module_names)
    found: dict[str, set[str]] = {}
    roots = [REPO / "apps/api", REPO / "tests", REPO / "simulator", REPO / "ml"]
    for root in roots:
        for path in root.rglob("*.py"):
            if any(part in {".venv", "__pycache__", "versions"} for part in path.parts):
                continue
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"))
            except (SyntaxError, UnicodeDecodeError):
                continue
            for node in ast.walk(tree):
                modules: list[str] = []
                if isinstance(node, ast.Import):
                    modules = [a.name.split(".")[0] for a in node.names]
                elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                    modules = [node.module.split(".")[0]]
                for module in modules:
                    if module in stdlib or module in LOCAL_PACKAGES or module.startswith("_"):
                        continue
                    found.setdefault(module, set()).add(str(path.relative_to(REPO)))
    return found


def main() -> int:
    declared = declared_distributions()
    missing: dict[str, set[str]] = {}
    for module, files in imported_modules().items():
        distribution = normalise(ALIASES.get(module, module))
        if distribution not in declared:
            missing[module] = files

    if missing:
        print("  ✗ undeclared dependencies:")
        for module, files in sorted(missing.items()):
            print(f"      {module}  — used in {sorted(files)[0]}")
        print("    Add them to apps/api/pyproject.toml.")
        return 1

    print(f"  ✓ dependencies OK ({len(declared)} declared, all imports satisfied)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
