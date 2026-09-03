# Typology assumptions

Master spec §9 requires every behavioural number a typology generator encodes to be written
down here as an assumption — never invented and silently presented as fact. This file is
updated in the same PR as the generator it documents.

Where a number reflects a real regulatory rule (e.g. an RTGS floor) rather than a modelling
choice, it is marked **[rule]** instead of **[assumption]**.

---

## Digital arrest

`simulator/typologies/digital_arrest.py`

| Parameter | Value | Basis |
|---|---|---|
| Coerced transfer count | 1–3 | **[assumption]** "large single/few transfers" per spec §9 table. |
| Coerced transfer amount | ₹1,00,000 – ₹50,00,000, log-uniform | **[assumption]** Representative of reported digital-arrest losses (lakhs to low crores). Not calibrated against a published distribution yet — flagged in `docs/ml/simulator-limitations.md`. |
| RTGS vs NEFT channel choice | RTGS if amount ≥ ₹2,00,000, else NEFT | **[rule]** RBI's RTGS minimum transaction value is ₹2,00,000. |
| Delay between coerced transfers | mean 20 min, ±40% jitter | **[assumption]** Reflects transfers extracted during one sustained coercion call. |
| Layering hop count | 2–4 | **[assumption]** "rapid layering" per spec §9 table. |
| Delay per layering hop | mean 8 min, ±40% jitter | **[assumption]** "Fast" cash-out signature — minutes, not hours. |
| Skim per layering hop | 3% | **[assumption]** Placeholder for fees/loss during layering. Not calibrated. |
| Layering channel | IMPS | **[assumption]** Fast, commonly used for mule-to-mule hops at this amount range. |
| Cash-out channel weights | Bank branch 50% / ATM 35% / AePS-BC 15% | **[assumption]** Large sums favour counter withdrawal and ATM structuring over AePS/BC, which typically handles smaller amounts. Not calibrated against published cash-out data. |
| Geographic dispersion | Prefer an endpoint whose H3 cell differs from the victim's home cell | **[simplification]** This is a coarse proxy, not a distance calculation. True multi-city dispersion depends on the H3 hierarchy owned by `simulator/generators/` (Issue #4). Revisit once that module exists. |

---

*(Entries for the remaining six typologies are added as their generators are written.)*