#!/usr/bin/env bash
# Secret scan (ADR-010). Two passes, because they catch different things:
#   1. FULL GIT HISTORY  — a secret committed and later removed is still compromised.
#   2. WORKING TREE      — catches a secret before it is ever committed.
# A repository with no commits yet would otherwise pass pass 1 trivially.
set -uo pipefail

fail=0

if command -v gitleaks >/dev/null 2>&1; then
  if git rev-parse --git-dir >/dev/null 2>&1; then
    commits=$(git rev-list --all --count 2>/dev/null || echo 0)
    if [ "$commits" -gt 0 ]; then
      gitleaks git . --no-banner --redact --exit-code 1 >/dev/null 2>&1 \
        && echo "  ✓ gitleaks history: clean ($commits commits)" \
        || { echo "  ✗ gitleaks: SECRET FOUND IN GIT HISTORY"; \
             gitleaks git . --no-banner --redact --exit-code 0 2>&1 | tail -30; fail=1; }
    else
      echo "  · gitleaks history: skipped (no commits yet)"
    fi
  fi

  # Working tree — always run.
  if gitleaks dir . --no-banner --redact --exit-code 1 >/dev/null 2>&1; then
    echo "  ✓ gitleaks working tree: clean"
  else
    echo "  ✗ gitleaks: SECRET FOUND IN WORKING TREE"
    gitleaks dir . --no-banner --redact --exit-code 0 2>&1 | tail -30
    fail=1
  fi
else
  echo "  ⚠  gitleaks not installed — coarse grep fallback only."
  echo "     Install before making this repository public:  brew install gitleaks"
  if grep -rInE --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.venv \
       --exclude='*.lock' --exclude='check_secrets.sh' \
       -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
       -e '(aws_secret_access_key|api[_-]?key|secret[_-]?key|password|token)[[:space:]]*[=:][[:space:]]*['"'"'"][A-Za-z0-9/+=_-]{24,}' \
       . 2>/dev/null | grep -v '\.env\.example' | grep -v 'change-me-locally'; then
    echo "  ✗ potential secret found above"
    fail=1
  else
    echo "  ✓ coarse secret grep: clean"
  fi
fi

# .env must never be tracked.
if git rev-parse --git-dir >/dev/null 2>&1; then
  if git ls-files --error-unmatch .env >/dev/null 2>&1; then
    echo "  ✗ .env is tracked by git — remove it and rotate every value in it"
    fail=1
  fi
fi

exit "$fail"
