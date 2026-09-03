# Typology assumptions

Master spec §9 requires every typology's behavioural parameters to be documented as **assumptions**,
not fact, and calibrated against published aggregate statistics wherever such statistics exist.

**Status of this document: initial assumptions, not yet calibrated.** The numbers below were chosen to
be internally consistent with the qualitative money-movement and cash-out signatures in spec §9 — they
are a starting point for the simulator, not a claim about real fraud rates. Before any metric derived
from these generators is reported outside the team, calibrate against published aggregates (RBI annual
report, I4C/NCRP public statistics, banking-sector fraud disclosures) and update this file in the same
commit as the corresponding `TypologyProfile` in `simulator/typologies/`. Until that calibration lands,
treat every number here as a placeholder that is honest about being a placeholder.

Each profile lives in `simulator/typologies/<typology>.py` as a `TypologyProfile` — this document
explains *why* those numbers were chosen; the code is the single source of truth for the numbers
themselves. If the two drift, the code wins and this file is stale and needs fixing.

## Shared parameters, per typology

| Typology | Layering depth | Inter-hop delay | Amount signature | Preferred channels | Dispersion | Fan-in |
|---|---|---|---|---|---|---|
| Digital arrest | 1–3 hops | 5–90 min (fast) | Large, low variance — victim moves most of what coercion extracted in one or few transfers | BANK_BRANCH, ATM | MULTI_CITY | No |
| Investment / trading scam | 3–6 hops | 12h–4 days (slow, victim-paced) | Moderate per transfer, repeated — aggregates to a large total over the scenario | BANK_BRANCH, CRYPTO_P2P, ATM | REGIONAL | Yes (aggregation-first) |
| UPI collect-request / QR fraud | 1–2 hops | 1–30 min (fast) | Small, high frequency | MERCHANT_QR, AEPS_BC | DISPERSED | Yes (many victims, dispersed accounts) |
| Customer-care impersonation | 1–2 hops | 5–60 min (fast) | Moderate | ATM, AEPS_BC | LOCAL | No |
| Loan-app extortion | 4–10 repeated debits | 30–240 min | Small per debit | PREPAID_GIFT, MERCHANT_QR, POS_CASHBACK | DISPERSED | No |
| Job / task fraud | 2–3 hops | 15–180 min | Small onboarding payments, many victims per collection account | AEPS_BC, MERCHANT_QR, ATM | REGIONAL | Yes (strong) |
| Sextortion | 1 hop | 5–45 min (urgent, fast) | Small, single payment | AEPS_BC, MERCHANT_QR | LOCAL | No |

## Rationale by typology

**Digital arrest** — spec §9: *"Large single/few transfers under sustained coercion"* → *"Fast,
high-value, often multi-city; RTGS/NEFT then rapid layering."* Short layering depth and fast inter-hop
delay model a victim acting under continuous psychological pressure with no time to reconsider between
hops. `MULTI_CITY` dispersion models the observed pattern of mule accounts and cash-out points spread
across states to slow investigation.

**Investment / trading scam** — *"Repeated victim-initiated transfers over days–weeks"* → *"Slower,
aggregation-first, higher-value endpoints."* Long inter-hop delay (hours to days) models the victim
being drip-fed fabricated returns and self-initiating further transfers over an extended period.
`fan_in = True` models multiple victim transfers converging into a smaller number of aggregation
accounts before a higher-value cash-out — consistent with "aggregation-first."

**UPI collect-request / QR fraud** — *"Many small transfers, high frequency"* → *"Fast, small,
dispersed; merchant QR and AePS heavy."* Short chain, fast delay, small amounts, and
`DISPERSED` geography model a high-volume, low-value-per-victim operation.

**Customer-care impersonation** — *"One-to-few, remote-access assisted"* → *"Fast, ATM/AePS, near the
mule's home district."* `LOCAL` dispersion is the distinguishing assumption versus digital arrest —
remote-access scams are modelled as operating closer to the mule network's home base rather than
spreading cash-out across states.

**Loan-app extortion** — *"Small repeated debits"* → *"Wallet/merchant heavy, dispersed."* This is the
one typology whose topology a linear layering chain cannot express, so its generator overrides hop
construction: repeated small debits from the victim into a single collection account, rather than a
chain of distinct mule hops. `layering_depth` is repurposed here to mean debit *count*, not hop count —
noted in the generator's docstring.

**Job / task fraud** — *"Small onboarding payments, many victims → few accounts"* → *"Strong fan-in,
then structured withdrawal."* `fan_in = True` is strongest here. **Known limitation:** this first pass
generates one scenario per victim with a short chain into a small mule pool; it does not yet implement
cross-scenario mule-account reuse (the actual mechanism of fan-in) or multi-endpoint structured
withdrawal — both are population/batch-level concerns that belong with the account-pool implementation
(issue #4), not a single scenario's topology. Recorded here rather than silently assumed away; see
`docs/ml/simulator-limitations.md` once that file exists.

**Sextortion** — *"Small, urgent, single"* → *"Wallet/UPI, fast."* Single hop, fastest delay of any
typology, smallest amount range — models a single panicked payment with no layering.

## What calibration against published aggregates should change

- Exact amount ranges and distribution shape per typology (currently a bounded lognormal — plausible
  but not fitted to any published data).
- Inter-hop delay distributions (currently uniform ranges — real timing is unlikely to be uniform).
- Channel mix weights (currently hand-assigned to match the qualitative spec §9 description).
- Whether `fan_in` should be a boolean or a continuous parameter (e.g. victims-per-mule-account ratio).

## Cross-reference

- Money-movement/cash-out signature table: master spec §9.
- Simulator architecture and lineage (AMLSim/AMLworld): ADR-005.
- Realism validation gate (separability sanity gate must pass on data generated from these profiles):
  master spec §23.3, `simulator/validation/`.
