# Population and geography assumptions

Companion to `docs/ml/typology-assumptions.md`. Covers `simulator/generators/` — the "normal
world" a fraud scenario happens inside: geography, cash-out endpoint density, and the account
pool that `simulator.typologies` samples victims and mules from.

**Status of this document: initial assumptions, not yet calibrated.** As with the typology
profiles, treat every number here as a labelled placeholder until calibrated against published
aggregates (Census 2011 district data, RBI ATM/BC-outlet counts, NPCI merchant-QR density). The
posture is the same one `typology-assumptions.md` asks for: honest about being a placeholder.

## Geography (`simulator/generators/geography.py`)

A small, explicitly **illustrative subset** of Indian states and districts — not a claim of
national coverage. Real district boundaries and codes belong to Census/LGD data, which is out of
scope for a hackathon-timeline simulator; using a real but partial subset (rather than inventing
fictional place names) keeps the geography meaningful without pretending to completeness.

Each zone carries an approximate centroid (for placing endpoints and accounts near it) and a
`density` weight (`URBAN`/`SEMI_URBAN`/`RURAL`) that drives endpoint-channel mix below — this is
the single biggest lever on realism, per spec §8.1's emphasis on AePS/BC as "now a dominant
vector" outside dense urban cores.

## Endpoint density and channel mix (`simulator/generators/endpoints.py`)

Spec §8.1 lists seven channels; the assumption that matters most is *where* each is common:

| Channel | Density assumption |
|---|---|
| `ATM` | Even across urban and semi-urban zones; sparse in rural zones. |
| `AEPS_BC` | **Densest in rural and semi-urban zones** — the India-specific point spec §8.1 calls "the single most India-specific thing in the system." Modelled here as the *majority* channel outside urban zones, not a minor variant of ATM. |
| `BANK_BRANCH` | Present everywhere but low-density; branches don't scale with population the way ATMs/BC agents do. |
| `MERCHANT_QR` | Densest in urban zones (merchant concentration); present but sparser elsewhere. |
| `POS_CASHBACK` | Tied to merchant density, same skew as `MERCHANT_QR` but rarer. |
| `PREPAID_GIFT` | Low density everywhere — a handful of outlets per zone regardless of urbanicity. |
| `CRYPTO_P2P` | Not geographic (spec §8.1: "logical, not geographic") — one pool-wide, zone-independent endpoint set, deliberately not tied to any zone's centroid. |

Operating hours and cash limits are not yet modelled per endpoint (every endpoint is treated as
always-open with no limit). This is a known simplification, not an oversight — recorded here so
it isn't silently assumed away; see "What calibration should change" below.

## Account pool (`simulator/generators/population.py`)

Implements the `AccountPool` protocol from `simulator.typologies.base` — the seam issue #5 was
built against. Two assumptions matter most, both driven directly by spec §23.3's realism gates:

**Accounts are anchored to a home zone.** Every account samples a home `Zone` at creation, and
`sample_mule(rng, near=...)` biases toward mules in or near the victim's zone — this is what
lets typology-level `GeographicDispersion` (LOCAL vs MULTI_CITY vs DISPERSED) mean anything; a
uniform national mule pool would make every typology's dispersion identical by construction.

**Mule accounts are reused, not freshly minted per scenario.** Spec §23.3 requires the account
degree distribution to be **heavy-tailed, not uniform** — a small number of mule accounts should
receive a disproportionate share of hops, mirroring real mule-network structure (and the "few
accounts" side of job/task fraud's fan-in, spec §9). Implemented with a bounded, weighted mule
pool per zone rather than generating a new `AccountRef` on every call: early-sampled mules get
reused with higher probability (a simple preferential-attachment scheme), which produces a
heavy tail without needing a full graph model yet.

## What this does not yet cover

Spec §23.1's "normal population" — salary credits, bills, shopping, ordinary withdrawals with
realistic diurnal/weekly rhythms — is **not** built here. Issue #4's slide scope is geography and
endpoints specifically; ordinary (non-fraud) transaction behaviour is a separate generator this
document deliberately does not claim to cover. Recording the gap here rather than leaving it to
be discovered later.

## What calibration against published aggregates should change

- Which states/districts are included, and their relative population/density weights.
- The exact urban/semi-urban/rural channel-mix ratios (currently hand-assigned to match spec
  §8.1's qualitative description, not fitted to RBI/NPCI outlet counts).
- Endpoint operating hours and cash-limit profiles (not modelled at all yet).
- The mule-pool reuse/preferential-attachment parameters, once real degree-distribution data
  (or at least a target Gini/heavy-tail shape) is available to fit against.

## Cross-reference

- Cash-out endpoint model: master spec §8.1.
- Simulator scope ("what it generates", scale): master spec §23.1.
- Realism validation gates this feeds: master spec §23.3, `simulator/validation/`.
- The protocol this implements: `simulator/typologies/base.py` (`AccountPool`,
  `EndpointRegistry`), built in issue #5 specifically to stay decoupled from this work.
