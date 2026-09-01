# Incumbent Landscape — what already exists, and where ATLAS fits

The evaluators for SIH26184 are the **Indian Cyber Crime Coordination Centre (I4C), CIS Division**.
They operate the systems below. A submission that does not know these exist reads as naive; one that
positions precisely in the gap they leave reads as credible.

This document exists so that no one on the team ever claims ATLAS does something I4C already has.

## The systems in production today

| System | What it does | Nature |
|---|---|---|
| **NCRP** (National Cybercrime Reporting Portal, cybercrime.gov.in) | Citizens file complaints; LEAs act on them; banks/FIs act on them; daily reports and graphs are pulled. ~8,000 complaints/day. | Intake + workflow |
| **1930** helpline | Toll-free 24×7 cyber-fraud line. Operator captures details and pushes a ticket into CFCFRMS. | Intake |
| **CFCFRMS** (Citizen Financial Cyber Fraud Reporting and Management System) | Launched 2021 under I4C. Routes a fraud report to the beneficiary bank/wallet so funds can be lien-marked or debit-frozen inside the "golden hour". | Reactive interdiction |
| **Samanvay** | MIS platform, data repository and coordination layer for LEAs — inter-state linkage of mobile/IMEI numbers and bank accounts, CCTV requests to banks. | Coordination + data sharing |
| **Pratibimb** | **GIS-based** module that maps mobile numbers involved in cybercrime across a country map in real time, so LEAs can locate and dismantle networks. Credited with 6,046 arrests, 17,185 linkages identified, 36,296 investigation-assistance requests processed. | Reactive geospatial mapping |

## The gap ATLAS fills

Note carefully what Pratibimb is: it is already a GIS map of cybercrime for LEAs. **"We built a GIS
dashboard for cybercrime" is not a contribution.** I4C has one.

Every system above is **reactive**. They answer:

> *Where is the criminal infrastructure that has already been used?*

They are triggered by an event that has already happened — a complaint filed, a number reported, a
transfer completed. CFCFRMS races the money after it has moved. Pratibimb maps handsets after they
have offended.

The problem statement asks for something none of them do — it says so explicitly: *"This approach goes
beyond merely reacting to complaints."* ATLAS answers a different question:

> *Where and when is the money most likely to be taken out as cash next, and what is the confidence?*

| Dimension | Incumbents | ATLAS |
|---|---|---|
| Trigger | An event that already occurred | Evidence available so far, evaluated forward |
| Time direction | Backward (reconstruct) | Forward (forecast a window) |
| Primary object | Handsets, accounts, complaints | **Cash-out endpoints and geographic cells** |
| LEA action enabled | Investigate, trace, arrest after the fact | **Pre-position** teams, pre-alert banks/ATMs in a window |
| Bank action enabled | Freeze after a complaint arrives | Prioritise which accounts and endpoints to watch *before* the complaint |
| Output | Locations of known entities | Ranked candidates + probability + confidence + lead time + explanation |

## How ATLAS is designed to complement, not replace

ATLAS is specified as an **intelligence layer that sits on top of the existing stack**, consuming
what they already produce and feeding back into their existing action channels:

- **Consumes** NCRP complaints, CFCFRMS ticket/fund-flow data, and Samanvay linkage data — modelled as
  `DataConnector` ports with synthetic implementations in the public repo (`atlas.ingest`).
- **Feeds** its bank-facing output back through the **CFCFRMS** channel shape, because the PS names
  CFCFRMS as the route by which intelligence reaches banks and "enables faster fund blocking and
  increases the chances of recovery" (`atlas.intel`).
- **Feeds** cross-jurisdiction hand-offs in the shape Samanvay uses, since the PS requires "real-time
  actionable intelligence sharing across jurisdictions" (`atlas.intel`).
- **Complements Pratibimb** rather than duplicating it: Pratibimb plots where reported criminal
  infrastructure *is*; ATLAS plots where cash-out is *forecast to occur*. Those are different layers
  of the same map and are strictly more useful together.

## Standing rule for the team

When describing ATLAS to a judge, never say "we built a cybercrime dashboard". Say:

> I4C already has reactive coverage — CFCFRMS races the money, Pratibimb maps the handsets. What
> nothing in the stack does is put a defensible probability on *where the cash comes out next*, early
> enough to act. That is the only thing ATLAS claims to add, and we measure it by lead time.

## Sources

- Pratibimb module and its reported figures — I4C/MHA launch coverage, 2024–2025.
- Samanvay platform — MHA/I4C coverage of the inter-state cybercrime data-exchange portal.
- CFCFRMS — I4C, launched 2021; golden-hour and lien-marking mechanics.
- Complaint volume — the official SIH26184 text itself (~8,000/day).

Figures are as reported in public sources at the time of writing and should be re-verified before the
final pitch. Do not present them as current without checking.
