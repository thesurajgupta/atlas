# ATLAS — developer entry points.
# Every target here is meant to be runnable from a clean clone.

.DEFAULT_GOAL := help
SHELL := /bin/bash

# Prefer the project venv when it exists, so `make verify` behaves identically
# whether or not the developer has activated it.
VENV := $(CURDIR)/.venv
ifneq ($(wildcard $(VENV)/bin/python),)
  PY   ?= $(VENV)/bin/python
  BIN  := $(VENV)/bin/
else
  PY   ?= python3
  BIN  :=
endif

.PHONY: help
help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------- environment
.PHONY: up down logs psql redis-cli reset
up: ## Start the core stack (postgres + redis)
	docker compose up -d postgres redis
	@echo "waiting for health..."
	@docker compose ps

down: ## Stop the stack
	docker compose down

reset: ## Stop the stack and DESTROY all local data volumes
	docker compose down -v

logs: ## Tail stack logs
	docker compose logs -f

psql: ## Open a psql shell on the ATLAS database
	docker compose exec postgres psql -U atlas -d atlas

redis-cli: ## Open a redis-cli shell
	docker compose exec redis redis-cli

# ---------------------------------------------------------------- verification
.PHONY: verify verify-docs verify-secrets verify-compose lint typecheck test
verify: verify-docs verify-compose verify-secrets lint typecheck verify-boundaries test ## Full pre-push check
	@echo ""
	@echo "  ✅  verify passed"

verify-docs: ## Check spec cross-references, traceability and declared dependencies
	@$(PY) scripts/check_spec_refs.py
	@$(PY) scripts/check_traceability.py
	@$(PY) scripts/check_dependencies.py
	@$(PY) scripts/check_ai_context.py

verify-compose: ## Validate the docker-compose definition
	@docker compose config --quiet && echo "  ✓ docker-compose valid"

verify-secrets: ## Scan the repository (full history) for secrets
	@bash scripts/check_secrets.sh

lint: ## Lint Python and TypeScript
	@if [ -n "$$(find apps/api simulator ml tests -name '*.py' -not -path '*/.*' 2>/dev/null | head -1)" ]; then \
	   $(BIN)ruff check apps/api simulator ml tests; \
	 else echo "  ⏭  lint: no Python sources yet (phase 1)"; fi

typecheck: ## Static type checking
	@if [ -n "$$(find apps/api -name '*.py' -not -path '*/.*' 2>/dev/null | head -1)" ]; then \
	   $(BIN)mypy apps/api; \
	 else echo "  ⏭  typecheck: no Python sources yet (phase 1)"; fi

test: ## Run the test suite
	@if [ -n "$$(find tests -name 'test_*.py' 2>/dev/null | head -1)" ]; then \
	   $(BIN)pytest tests -q; \
	 else echo "  ⏭  test: no tests yet (phase 1)"; fi

# ---------------------------------------------------------------- boundaries
.PHONY: verify-boundaries
verify-boundaries: ## Enforce module import boundaries (ADR-009) + leakage gate 1
	@if [ -f .importlinter ] && [ -d apps/api/atlas ]; then \
	   $(BIN)lint-imports --verbose 2>/dev/null | tail -6 || $(BIN)lint-imports; \
	 else echo "  ⏭  boundaries: not configured yet"; fi

# ---------------------------------------------------------------- honesty gates
.PHONY: test-leakage verify-audit-chain
test-leakage: ## The three ground-truth leakage gates (spec §18) — MUST fail loudly
	@if [ -d tests/leakage ] && [ -n "$$(ls -A tests/leakage 2>/dev/null)" ]; then \
	   $(BIN)pytest tests/leakage -q; \
	 else echo "  ⏭  leakage gates: not implemented yet (phase 5)"; fi

verify-audit-chain: ## Recompute the audit hash chain and verify checkpoint signatures (ADR-007)
	@$(PY) scripts/verify_audit_chain.py

# ---------------------------------------------------------------- data & ML
.PHONY: simulate eval demo load-test
simulate: ## Generate the synthetic dataset from the committed seed
	@if [ -f simulator/__main__.py ]; then $(PY) -m simulator; \
	 else echo "  ⏭  simulator: not implemented yet (phase 2)"; fi

eval: ## Regenerate the evaluation report (deterministic, git-sha stamped)
	@if [ -d ml/evaluation/harness ] && [ -n "$$(ls -A ml/evaluation/harness 2>/dev/null)" ]; then \
	   $(PY) -m ml.evaluation.harness; \
	 else echo "  ⏭  eval: harness not implemented yet (phase 6)"; fi

demo: ## Run the full end-to-end demo, offline and reproducible
	@if [ -f scripts/run-demo.sh ]; then bash scripts/run-demo.sh; \
	 else echo "  ⏭  demo: not implemented yet (phase 14)"; fi

load-test: ## Sustained ingest at 5x the PS volume (40k complaints/day)
	@if [ -f tests/performance/load.py ]; then $(PY) tests/performance/load.py; \
	 else echo "  ⏭  load test: not implemented yet (phase 13)"; fi

# ---------------------------------------------------------------- housekeeping
.PHONY: fmt install-hooks
fmt: ## Auto-format
	@if [ -f apps/api/pyproject.toml ]; then $(BIN)ruff format apps/api simulator ml tests; fi

install-hooks: ## Install pre-commit hooks (MANDATORY before first commit)
	pre-commit install
