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
