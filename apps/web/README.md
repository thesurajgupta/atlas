# ATLAS — Investigator Console (`apps/web`)

Frontend shell for the investigator UI (issue #7, spec §25). Runs entirely on
mock data — no backend dependency. Do not add a live API call here until
`apps/api` actually serves one; see `docs/team/WORKFLOW.md`.

## Setup

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/overview`.

## What's here

- `app/(dashboard)/` — the 8 fixed nav routes from issue #7: Overview,
  Alerts, Cases, Map, Graph, Intelligence, Models, Audit. Only Overview and
  Cases have real content so far; the rest are honest placeholders.
- `components/work-item/` — the shared shell (`FactStrip` + `WorkItemTabs`)
  every case/alert/prediction uses, per §25.2.
- `components/prediction/PredictionAndWhy.tsx` — the §25.3 four-state
  evidence renderer. Read this file's comments before changing it; the
  structural difference between bands is the point, not a colour choice.
- `lib/types.ts` — types mirroring the §15.5 prediction schema.
- `lib/mock-data.ts` — one fixture case per evidence band (STRONG,
  MODERATE, WEAK, INSUFFICIENT). Synthetic identifiers only.

## Testing

```bash
npm run test        # vitest — includes the §25.3 four-state DOM test
npm run typecheck
npm run lint
```

`tests/evidence-band.test.tsx` is the acceptance-criterion-#32 test: it
asserts the DOM genuinely differs across evidence bands, not just a class
name or colour.

## Not done yet (deliberately out of scope for this first PR)

- Alerts / Map / Graph / Intelligence / Models / Audit pages — placeholders
  only.
- Money Trail, Graph, Evidence, and Audit tabs inside the work-item shell —
  stubbed or missing; Summary and Prediction & Why are real.
- No live data — everything reads from `lib/mock-data.ts`.

## The reporting portal (`/ncrp`)

The citizen-facing half of the demonstration. A complaint filed here is filed
into ATLAS for real — it is not a mock hand-off.

### Route

```
/ncrp                     complaint intake (light, deliberately a separate product)
/ncrp/acknowledgement      the reference, the record as filed, and "Send to ATLAS"
```

The portal is **not** the National Cybercrime Reporting Portal, carries no
government emblem, and says so on every screen.

### How the hand-off works

"Send to ATLAS" calls **`runInvestigation()` from `lib/run-investigation`** —
the same function `/demo` and `/new-complaint` call — with the values the
citizen typed. Four of its six stages are real API calls, and the stage list on
the acknowledgement page labels which are which. There is one pipeline; the
portal is another way into it, not a second copy of it.

The join is the complaint reference. `complaint_id` is minted once at filing and
passed in as `caseRef`, so it becomes the reference on the complaint the API
stores, on the transaction chain built for it, on the trail the graph endpoint
walks and on the alert the policy records. Every console screen is keyed on it.

### What crosses the boundary, and what does not

| Sent to ATLAS | Kept on the portal |
|---|---|
| complaint reference, category, amount, incident instant, narrative | bank, masked account, transaction reference, mobile, attachment name |

ATLAS forecasts the cash-out leg of reported fraud and never scores individuals
(`docs/NON-GOALS.md`), so victim identity is data it has no use for. The portal
keeps those fields only so a complainant can be shown what they filed, and both
screens say so.

### Files

- `lib/demo/types.ts` — the portal record. Nothing derived, nothing predicted.
- `lib/demo/store.tsx` — `localStorage` via `useSyncExternalStore`, so a filed
  complaint survives a reload. (`lib/demo-run` uses `sessionStorage`, because a
  walkthrough should not outlive the tab; a filed complaint should.)
- `lib/demo/typology.ts` — NCRP's categories mapped onto the API's vocabulary.
  "Online Financial Fraud" is a category heading covering several typologies, so
  it maps to `OTHER` rather than being nudged into the nearest specific one.
- `lib/demo/defaults.ts` — opening form values, relative to the wall clock.
- `components/ncrp/ComplaintForm.tsx` — mounted `ssr: false`; see the file.

### Requirements

The hand-off needs the API up (`make up`, migrations, `scripts/seed_demo.py`).
`runInvestigation` signs itself in with the seeded development account, so there
is no sign-in step in the walkthrough — but with the API down, "Send to ATLAS"
reports that it could not reach it rather than pretending to succeed.

### Running it again

`Reset demo` in the sidebar or the portal header clears **both** the portal
record and the console walkthrough. It does not delete rows the API already
wrote — those stay on `/cases` and `/alerts`, which is correct: a demonstration
reset is not a database reset.
