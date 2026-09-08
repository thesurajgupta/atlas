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

## The demo path: reporting portal → console

The SIH demonstration runs one complaint end to end, and every screen it
touches renders the *same* case object. There is one record and one
derivation; no screen keeps its own copy of an amount or an identifier.

### Route

```
/ncrp                     citizen-facing complaint intake (light, separate product)
/ncrp/acknowledgement     the reference, the record as filed, and "Send to ATLAS"
/atlas-intake             the handover: complaint → ingestion → trail → analysis
                          → prediction → alert, staged so it can be followed
/investigation?case=…     the console, on that case
/pipeline                 the same pipeline as a record, replayable
```

The portal is **not** the National Cybercrime Reporting Portal, carries no
government emblem, and says so on every screen. It stores only what the
presenter types, in this browser.

### How it holds together

- `lib/demo/types.ts` — the contract. `NcrpComplaint` is the only stored
  record; everything else is derived from it.
- `lib/demo/case.ts` — `buildDemoCase(complaint)`, a **pure function**. Trail,
  network, features, ranking, prediction and alert all come out of here, which
  is what makes "the amount on the portal is the amount in the alert" a
  property of the code rather than something to remember.
- `lib/demo/store.tsx` — persistence. The complaint is written to
  `localStorage` and read through `useSyncExternalStore`, so it survives
  navigation, a reload and a second tab. `useDemoCase()` is the only way in.
- `lib/demo/ledger.ts` — the synthetic transaction ledger, keyed by
  transaction reference. Legs are *fractions* of the disputed amount, so the
  presenter can type any figure and the trail still adds up to it. Seeded
  references are `TXN001`, `TXN002`, `TXN003`; anything else still traces, to
  a chain derived deterministically from the reference, and costs the case one
  evidence band because nothing in the ledger backs it.
- `lib/demo/endpoints.ts` — the cash-out endpoint catalogue, shared by the
  map, the ranked-locations page, the prediction and the alert. It used to
  live inside the map page, which is how those four could name different
  places for the same case.

### What the ranking is

A weighted mean of five stated features, each on 0–1, with constant weights.
It is **not** a trained model and not a calibrated probability — `MODEL_VERSION`
says so, and every screen that shows a score repeats it. `Source data` in the
sidebar shows the complaint, the transaction rows and the per-feature
contributions behind any number on screen.

### Running it again

`Reset demo` in the sidebar (or the portal header) clears the complaint and the
case. The whole flow can then be run from the beginning, as many times as
needed.

### Tests

`tests/demo-case.test.ts` asserts the joins that must not drift: the amount,
the transaction reference, the victim account and the case id are the same
value in the complaint, the case, the prediction and the alert; the trail sums
to the reported figure; the ranking is complete, ordered and reproducible.
