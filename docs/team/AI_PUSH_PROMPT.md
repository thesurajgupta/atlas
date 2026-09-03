# The push prompt

Everyone works with an AI assistant. This is the prompt to paste when your work is ready to go up.
Copy it as-is — the constraints in it are the ones that actually go wrong.

---

```
Push my work to the ATLAS repo.

Before anything, show me `git status` so I can see what is about to be included.

Rules:
- Never push to main. It is protected. Branch name must be <myname>/<short-task>,
  e.g. sneha/geography-endpoints. One branch per task, not per person.
- Run `make verify` first and it must pass.
- If a check fails, fix the cause. Never weaken or skip a check to make it pass.
- Never commit secrets, credentials, real personal or financial data, or a .env
  file. This repo is public and uses synthetic data only.
- Commit message format: type(scope): what changed
  e.g. feat(simulator): add district and H3 cell generation
- Then push the branch and open a PR with `gh pr create --fill`.
- Tell me to tag @thesurajgupta, because his approval is required to merge.
```

---

## Why each line is there

**"show me `git status` first"** — the most common accident is `git add -A` sweeping up a file nobody
meant to commit. Seeing the list first takes two seconds.

**"Never push to main"** — it is protected, so the push is rejected anyway. The line saves the AI from
trying and then improvising something worse.

**"If a check fails, fix the cause"** — without this, an assistant will helpfully add `--no-verify`,
skip a test, or loosen a threshold to get to green. That is the single most damaging thing that can
happen to this project, because it looks like success.

**Database tests skip themselves** if PostgreSQL is not running, and say so. You only need Docker
(`make up`) if you are working on the backend, ML or the database. Frontend work runs entirely on mock
data — `make verify` passes without it.

**"Never commit secrets"** — the repo is public. A committed credential is compromised the moment it is
pushed, and deleting it later does not un-publish it.

## If your assistant does not have shell access

Ask it for the commands instead, and run them yourself:

```
Give me the exact git commands to push my work as a branch named <myname>/<task>
and open a pull request. I will run them myself.
```
