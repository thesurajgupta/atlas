<<<<<<< HEAD
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
=======
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
>>>>>>> origin/main
