# ML Pipeline — Three Tiers and the Recall Ladder

Closes part of issue #9. Covers the predictive analytics engine (master spec §15),
candidate generation and cold start (§16), and the leakage boundary that makes the
whole pipeline trustworthy (§19). See ADR-004 for why three tiers exist instead of one
model, and ADR-012 for candidate generation.

---

## 1. Three-tier pipeline

```mermaid
flowchart TB
    FS[("Point-in-time feature store<br/>joined as-of observed_at only")]

    subgraph T1["Tier 1 — Zone risk forecast (always available, no cold start)"]
        T1M["Hawkes self-exciting baseline<br/>→ LightGBM over cell × time features"]
        T1O["P(≥1 fraud-linked cash-out in H3 cell c<br/>during [T, T+Δ]), Δ ∈ {6h, 24h, 72h}<br/>metric: PAI / PEI"]
        T1M --> T1O
    end

    subgraph T3["Tier 3 — Mule & endpoint risk (always available, feeds T1 & T2)"]
        T3M["Account mule-likelihood<br/>Endpoint cash-out-infrastructure score"]
        T3O["Dynamic entity risk<br/>versioned, decayed, explained<br/>metric: PR-AUC, precision@budget"]
        T3M --> T3O
    end

    subgraph T2["Tier 2 — Case-conditioned ranking (headline capability, degrades honestly)"]
        RL["Recall ladder (§16.1)<br/>candidate generation"]
        LTR["LambdaMART<br/>learning-to-rank over (case, candidate)"]
        HAZ["Discrete-time hazard model<br/>→ predicted time window"]
        RL --> LTR --> T2O["Ranked candidates + calibrated probability<br/>+ evidence_sufficiency band<br/>metric: Recall@K, lead time"]
        HAZ --> T2O
    end

    FS --> T1M
    FS --> T3M
    FS --> RL
    FS --> LTR
    FS --> HAZ

    T3O -->|"entity risk as a feature"| T1M
    T3O -->|"entity risk as a feature"| RL
    T3O -->|"entity risk as a feature"| LTR
    T1O -->|"rung 4: top-N forecast cells"| RL

    T1O --> OUT["Prediction output<br/>(§15.5 schema)"]
    T2O --> OUT
    T3O --> OUT

    OUT -.->|"never averaged into one number"| REPORT["Reported separately, always (§15.4)"]

    classDef tier1 fill:#ecfdf5,stroke:#047857,color:#064e3b;
    classDef tier2 fill:#eef2ff,stroke:#4338ca,color:#1e1b4b;
    classDef tier3 fill:#fff7ed,stroke:#c2410c,color:#7c2d12;
    classDef store fill:#f1f5f9,stroke:#334155,color:#0f172a;

    class T1M,T1O tier1;
    class RL,LTR,HAZ,T2O tier2;
    class T3M,T3O tier3;
    class FS,OUT,REPORT store;
```

**Why three tiers and not one model** (ADR-004): a single case-conditioned ranker
cold-starts to nothing for the common case — most complaints name a mule account the
system has never seen — and it cannot power the heatmap before any live case exists.
Tier 1 has no cold start and answers the problem statement's "predict potential
withdrawal hotspots" directly; Tier 3 is the shared substrate both other tiers consume
as features; Tier 2 is the headline capability and is the only one allowed to say "I
don't have enough evidence" via `evidence_sufficiency`.

**Why the tiers are never blended into one number** (§15.4): Tier 1 always works,
Tier 2 works when evidence supports it and says so when it doesn't, Tier 3 is a
multiplier on the other two. A single blended accuracy figure would hide exactly the
distinction — *is this a ranking failure or a cold-start situation?* — that determines
what an investigator should trust.

---

## 2. Recall ladder (Tier 2 candidate generation, §16)

The recall ladder is what prevents an undisclosed candidate set — the most common
silent failure mode in ranking systems. Rungs are unioned, deduplicated, capped, and
**which rungs contributed is recorded** (`recall_stage_rungs_used`) as part of the
prediction contract, not as debug output.

```mermaid
flowchart TD
    START(["New case: mule account identified"]) --> Q1{"Account seen<br/>before?"}

    Q1 -->|yes| R1["Rung 1<br/>Endpoints in the account's own<br/>historical activity footprint"]
    Q1 -->|"yes, cluster known"| R2["Rung 2<br/>Endpoints used by accounts in the<br/>same detected mule cluster"]
    Q1 -->|no| Q2{"KYC district<br/>known?"}

    Q2 -->|yes| R3["Rung 3<br/>Endpoints near the account's<br/>home branch / KYC district"]
    Q2 -->|no| R4["Rung 4<br/>Top-N cells from the<br/>Tier 1 forecast"]

    R4 --> R5["Rung 5<br/>Endpoints matching the case's<br/>typology signature"]

    R1 --> UNION["Union · dedupe · cap<br/>record rungs used"]
    R2 --> UNION
    R3 --> UNION
    R5 --> UNION

    UNION --> ES{"Which rungs<br/>fired?"}
    ES -->|"1 and 2"| STRONG["evidence_sufficiency = STRONG"]
    ES -->|"1 or 2"| MODERATE["evidence_sufficiency = MODERATE"]
    ES -->|"3 only, or 4+5"| WEAK["evidence_sufficiency = WEAK"]
    ES -->|"none fired"| INSUFF["evidence_sufficiency = INSUFFICIENT<br/>emit NO ranked candidates —<br/>Tier 1 zone forecast only"]

    STRONG --> LTR2["→ LambdaMART ranking"]
    MODERATE --> LTR2
    WEAK --> LTR2
    LTR2 --> RENDER["UI: full ranked list,<br/>solid confidence"]
    WEAK -.-> RENDER2["UI: dimmed list + banner<br/>naming the missing evidence"]
    INSUFF --> RENDER3["UI: no ranked list —<br/>zone forecast + explicit explanation"]

    classDef strong fill:#dcfce7,stroke:#15803d,color:#14532d;
    classDef moderate fill:#fef9c3,stroke:#a16207,color:#713f12;
    classDef weak fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d;
    classDef insuff fill:#f3f4f6,stroke:#374151,color:#111827;

    class STRONG,RENDER strong;
    class MODERATE moderate;
    class WEAK,RENDER2 weak;
    class INSUFF,RENDER3 insuff;
```

**Why cold start degrades confidence rather than hiding it** (§16.2): an unseen
account empties rungs 1 and 2, which is the common case, not the exception. The ladder
falls back to KYC-district proximity and typology signature — real signal, but weaker
— and `evidence_sufficiency` is downgraded accordingly. A `WEAK` prediction is required
to render visibly differently from a `STRONG` one; this is enforced by a UI test
because the failure it prevents — an investigator acting on a guess that looked like
evidence — is the one with real-world consequences (§25.4).

**Why negative sampling matters here** (§16.3): hard negatives are drawn from the same
recall set, stratified by distance band, so LambdaMART learns to discriminate between
*plausible* alternatives rather than between the true answer and random noise. A test
asserts the true endpoint is not preferentially placed in the candidate set relative to
negatives, and that recall-set construction never consults ground truth — otherwise a
Recall@K figure would be measuring the recall stage's own leakage, not the ranker.
