# Franchise Desk

Live: **https://franchise-desk-red.vercel.app** (public, no login)

Upload the case workbook (Applications, Territories, Existing stores). Every application gets a decision, a one-line reason with evidence, a next step and an owner. Partners who move forward get a week-by-week onboarding plan, training, first-stock set-up and a message in their language. Then ask follow-ups in plain language, or give new facts and watch the decision change, with knock-on effects and a human-confirmed swap when an approved partner is outranked.

## Architecture

```
browser (everything that decides)                 server (optional)
┌───────────────────────────────────────────┐     ┌──────────────────────────┐
│ SheetJS parse ─► lib/parse                │     │ /api/health              │
│ deterministic engine ─► lib/engine        │     │ /api/chat ─► lib/llm.ts  │
│   decide · assess · explain · plan        │◄───►│  (Gemini, JSON commands  │
│   session (update log, replay, undo)      │     │   only; rate-limited,    │
│ rule-based desk ─► lib/chat/rules,respond │     │   cached, 6 s timeout)   │
│ UI ─► components/                         │     └──────────────────────────┘
└───────────────────────────────────────────┘
```

- **The engine decides, nothing else does.** `lib/engine` is pure TypeScript: no I/O, no clock, no randomness. Same file, same policy, same date: same output (`runId` in the header).
- **The model never decides or scores.** It only turns a message the rules cannot read into a validated command. IDs it returns must appear in the message or recent context. Only the message and application IDs are sent, never names or notes.
- **Every state is a replay.** The uploaded dataset plus an ordered log of updates. Undo drops the last entry; a policy change re-runs from the file and replays the log; approved partners stay locked unless a person confirms a swap.

## How it degrades

| Failure | What still works |
|---|---|
| No `GEMINI_API_KEY`, quota hit, model outage | Everything. The desk badge says Rule-based; English, Hindi and Kannada updates with IDs are still parsed by rules. |
| Server asleep or unreachable | Everything: parsing, decisions, cards, table, export and the rule-based desk run in the browser. |
| Bad file | A friendly message naming exactly what is missing; unreadable cells become flagged issues, never a crash. |

Verified by `scripts/acceptance.ts` in four modes: live, API returning 503, API unreachable, and a slow high-latency connection.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: add GEMINI_API_KEY and GEMINI_MODEL
npm run dev
```

Tests:

```bash
npm test                                            # unit, golden, property, metamorphic, lint, follow-ups
npx next build && npx next start -p 3211            # local production build
BASE_URL=http://localhost:3211 npx tsx scripts/acceptance.ts
```

Regenerate the fixtures: `python scripts/gen_golden.py`.

## Deploy and roll back

Deploy only after acceptance passes on a local production build of the same commit:

```bash
vercel deploy --prod
```

One-command rollback: promote the previous good deployment (list them with `vercel ls --prod`):

```bash
vercel promote https://franchise-desk-<previous>-garima20.vercel.app --yes
```

This was exercised for real once: a build that passed locally failed live acceptance (a typing race while the map loaded on a slow connection), production was promoted back within a minute, the bug was fixed, and a slow-network mode was added to acceptance.

## Documents

SPEC.md · DESIGN.md · GOLDEN.md · PHASES.md · PROGRESS.md · ASSUMPTIONS.md · GOLDEN_DIVERGENCES.md
