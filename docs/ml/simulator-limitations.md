# Simulator limitations

What `simulator/` does not (yet) do, stated plainly rather than discovered later. Referenced from
`typology-assumptions.md`, `population-assumptions.md`, and `simulator/validation/`.

## No synthetic-normal population yet

Spec §23.1 describes a "normal population" generator — salary credits, bills, shopping, ordinary
withdrawals, with realistic diurnal and weekly rhythms. **This does not exist.** Everything built
so far (`simulator/typologies/`, `simulator/generators/`) produces fraud-linked scenarios only.

This is the single biggest gap in the simulator, because of what it blocks: the **separability
sanity gate** (spec §23.3, `simulator/validation/separability.py`) — "no single feature may
separate synthetic-fraud from synthetic-normal above a threshold" — cannot run end-to-end without
labelled normal transactions to compare against. The gate's mechanism is built and tested against
synthetic inputs, but no dataset produced by this simulator should be considered validated on the
strength of the other four realism checks alone. `simulator.validation.run_realism_checks`
reports this explicitly as `NOT_RUN`, not as a silent pass.

## What is checked, and against what

| Check | What it verifies | What it does *not* verify |
|---|---|---|
| Benford conformance (`benford.py`) | Leading-digit distribution of amounts matches Benford's law | Whether the *magnitude* distribution matches real fraud amounts — only the digit pattern |
| Degree distribution (`degree_distribution.py`) | Mule accounts are reused with heavy-tailed concentration, not uniformly | Whether the *shape* of that tail matches a real mule network — only that it isn't flat |
| Amount sanity (`amounts.py`) | Amounts stay inside their typology's own declared bounds, exact to paise | Whether those bounds themselves are realistic — see `typology-assumptions.md`, uncalibrated |
| Timing sanity (`timing.py`) | Hop timestamps are monotonic and roughly inside the typology's declared delay range | Whether the delay *distribution shape* (currently uniform) matches real timing patterns |
| Separability (`separability.py`) | Mechanism only — not yet run end-to-end (see above) | Everything, until synthetic-normal data exists |

Every threshold in this package (the Benford critical value, the Gini/top-decile-share cutoffs,
the 0.80 separability ceiling) is a deliberately generous, hand-chosen bar meant to catch gross
violations — not a value fitted against a real dataset. Same posture as the other two assumptions
docs: labelled placeholders, not facts.

## Endpoint realism not modelled

`simulator/generators/endpoints.py` treats every endpoint as always-open with no cash limit
(noted already in `population-assumptions.md`). Realism validation has nothing to check here yet
because the generator doesn't produce the relevant data (operating hours, limits) to check.

## What adding the normal-population generator should unblock

- Running `check_separability` end-to-end and reporting a real pass/fail instead of `NOT_RUN`.
- A degree-distribution comparison between fraud-linked and ordinary accounts, not just within
  the mule pool.
- A timing check against ordinary transaction rhythms (spec §23.1's diurnal/weekly pattern),
  which nothing here currently has a baseline to compare against.
