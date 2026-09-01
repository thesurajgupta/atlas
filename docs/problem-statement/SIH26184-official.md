# SIH26184 — Official Problem Statement (verbatim)

> **Do not paraphrase this file.** The original project brief (`docs/archive/original-brief.md`) was
> written from a paraphrase, and that paraphrase silently dropped binding requirements — see
> `docs/problem-statement/requirements-traceability.md`. Any requirement discussion starts here.

## Metadata

| Field | Value |
|---|---|
| Problem Statement ID | **SIH26184** |
| Title | Development of a Predictive Analytics Framework for Cybercrime Complaints to Forecast Likely Cash Withdrawal Locations in Advance, Enabling Generation of Actionable Intelligence for Timely and Proactive Cybercrime Intervention. |
| Organisation | Ministry of Home Affairs |
| Department | Indian Cyber Crime Coordination Centre (I4C),CIS Division |
| Category | Software |
| Theme | Blockchain & Cybersecurity |
| Dataset supplied by organiser | **None** |
| Event | Smart India Hackathon 2026 (9th edition) |

Retrieved 2026-09-01 from the SIH 2026 problem-statement catalogue
(<https://github.com/NoBugNinja/Smart-India-Hackathon-SIH-2026-Problem-Statements>), which mirrors
<https://sih.gov.in/sih2026PS>. Verify against the official portal before final submission.

Because no dataset is supplied, a **synthetic data strategy is mandatory, not a fallback**. See
`docs/adr/ADR-005-synthetic-data-strategy.md`.

## Full description (verbatim)

### Background

The National Cybercrime Reporting Portal is the centralized Portal, which is serving the whole country. Currently, the Portal facilitates citizens in filing complaints, LEAs act on complaints, Banking/Financial Institutions for their actions along with reports/graphs being pulled on daily basis. Presently, the Portal is receiving approximately 8000 complaints on daily basis. The number of complaints has increased manifold during the past months, and this will continue to rise in future. To address the issue of increasing cybercrimes, the proactive approach shall be adopted.

### Description

This framework focuses on the mitigation of cybercrimes by adopting a proactive approach. The framework's output will enable the prediction of likely cash withdrawal locations, which, in turn, will allow law enforcement agencies (LEAs)
at the state and local levels, coordinated by I4C, to implement proactive interventions. These interventions could include deploying special teams or alerting local banks and ATMs in high-risk areas. The intelligence generated would also help banks and financial institutions (FIs) through the Citizen Financial Cyber Fraud Reporting and Management System, enabling faster fund blocking and increasing the chances of recovery. By supporting real-time actionable intelligence sharing across jurisdictions, law enforcement agencies and Banks/FIs will be able to respond faster and more effectively to cyber threats. This approach goes beyond merely reacting to complaints and creates a powerful, data-driven defense against financial cyber frauds, strengthening India's overall cybersecurity posture.
Enhancing coordination between law enforcement and financial entities will ensure better detection and prevention of financial crimes, creating a more unified and efficient approach to combating cybercrime.

### Key Deliverables

Component:- Description a. Predictive Analytics Engine :-AI/ML-based system to analyse historical cybercrime and financial data to predict potential withdrawal hotspots. Features include pattern detection, geospatial risk modelling, and real-time alerts.
b. Risk Heatmap Dashboard:-GIS-enabled dashboard visualizing real-time and potential risk zones with drill-down filters by time, location, and crime category etc.
c. Law Enforcement Interface:-Secure interface for investigators to access alerts, intelligence reports, and evidence documentation.
d. Alert & Notification System:-Real-time notifications to law enforcements, banks, and I4C officers via SMS,email, API, or dashboard triggers.

## Deliverables, restated as a checklist

| # | Deliverable | Official wording | ATLAS module |
|---|---|---|---|
| a | Predictive Analytics Engine | "AI/ML-based system to analyse historical cybercrime and financial data to predict potential withdrawal hotspots. Features include pattern detection, geospatial risk modelling, and real-time alerts." | `atlas.predict`, `atlas.features` |
| b | Risk Heatmap Dashboard | "GIS-enabled dashboard visualizing real-time and potential risk zones with drill-down filters by time, location, and crime category etc." | `atlas.geo`, `apps/web` |
| c | Law Enforcement Interface | "Secure interface for investigators to access alerts, intelligence reports, and evidence documentation." | `atlas.cases`, `atlas.iam`, `apps/web` |
| d | Alert & Notification System | "Real-time notifications to law enforcements, banks, and I4C officers via SMS, email, API, or dashboard triggers." | `atlas.alerts`, `atlas.intel` |

## Requirements the original brief missed

These are stated or directly implied by the text above and were absent from `docs/archive/original-brief.md`:

1. **CFCFRMS is a named integration target.** "The intelligence generated would also help banks and
   financial institutions (FIs) through the Citizen Financial Cyber Fraud Reporting and Management
   System, enabling faster fund blocking and increasing the chances of recovery." Fund blocking and
   recovery are therefore *outcome measures of this system*, not out of scope.
2. **Cross-jurisdiction sharing is a requirement, not a restriction.** "By supporting real-time
   actionable intelligence sharing across jurisdictions..."
3. **Banks/FIs are first-class consumers**, alongside LEAs and I4C officers — see deliverable (d).
4. **Interventions are named and therefore typed**: "deploying special teams or alerting local banks
   and ATMs in high-risk areas."
5. **Volume and growth**: "approximately 8000 complaints on daily basis... has increased manifold
   during the past months, and this will continue to rise in future." Capacity planning must target a
   multiple of 8,000/day, not 8,000/day.
6. **"Coordinated by I4C" at "state and local levels"** — the operating model is federated, which
   drives the jurisdiction model in `atlas.iam` and the hand-off in `atlas.intel`.
