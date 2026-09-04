# Prompts for working with your AI assistant

Everyone here works with an AI. Two prompts cover the whole cycle: one when you **start** a task, one
when you **push** it. Copy them as they are — the constraints in them are the ones that actually go
wrong.

The project rules load automatically (`CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`,
`AGENTS.md`, `.windsurfrules`), so you do not paste those. These two prompts cover what those files
cannot know: who you are and what you are working on.

---

## 1 · Starting a task

```
I am working on the ATLAS repo (github.com/thesurajgupta/atlas). My GitHub
username is <YOUR-USERNAME>. My task is issue #<N>.

Start by confirming the setup, and tell me what you find:
1. `gh repo view thesurajgupta/atlas --json viewerPermission` — I should have
   WRITE. If it says READ or errors, stop and tell me; I have not accepted the
   collaborator invitation yet.
2. `gh issue view <N>` — read my task.
3. `git config user.email` — it must be my GitHub noreply address, or my commits
   will not be credited to me.
4. `make verify` — must pass before I change anything. Database tests will skip
   if Docker is not running; that is expected and fine unless my task touches
   the backend, ML or the database.

Then read CLAUDE.md, and the spec sections my issue points at. Tell me your plan
before writing code.

Create my branch as <YOUR-USERNAME>/<short-task-name>.
```

**Why each check is there.** The permission check catches an unaccepted invitation before you have
written anything — otherwise you find out at push time, after an hour of work. The git email check
catches commits landing under the wrong account, which is painful to fix later because a closed PR
pins the old commits permanently. And running `make verify` *before* you start means a failure later is
definitely yours, not something you inherited.

---

## 2 · Pushing your work

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

### Why each line is there

**"show me `git status` first"** — the most common accident is `git add -A` sweeping up a file nobody
meant to commit. Seeing the list first takes two seconds.

**"Never push to main"** — it is protected, so the push is rejected anyway. The line saves the AI from
trying and then improvising something worse.

**"If a check fails, fix the cause"** — the most important line here. Without it an assistant will
helpfully add `--no-verify`, skip a test, or loosen a threshold to reach green. That is the single most
damaging thing that can happen to this project, because it looks exactly like success.

**"Never commit secrets"** — the repo is public. A committed credential is compromised the moment it is
pushed, and deleting it later does not un-publish it.

Database tests skip themselves when PostgreSQL is not running, and say so. You only need Docker
(`make up`) for backend, ML or database work — frontend work runs entirely on mock data.

---

## If your assistant cannot run commands

Ask for the commands and run them yourself:

```
Give me the exact git and gh commands to push my work as a branch named
<myname>/<task> and open a pull request. I will run them.
```

## If something looks wrong

Say so in the pull request, or comment on your issue. "I do not understand why this is here" is a
legitimate and useful thing to write — on this project, a question that exposes an unclear decision is
worth more than a silent guess.
