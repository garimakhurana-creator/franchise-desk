# PROGRESS

## Phase 0, foundations: DONE (2026-10-25)
- Repo at `Desktop/coding/franchise-engine` (separate from the python-101 repo, so the kargo branch is untouched).
- Next.js 15 + TypeScript 5 + Tailwind 4 + Vitest 3 + Playwright. SheetJS 0.20.3 from the official CDN tarball (the npm `xlsx` package is stale).
- `.gitignore` excludes `.env*` except `.env.example`. `.env.local` holds GEMINI_API_KEY (copied from the user's flatmatch project); never tracked.
- `lib/engine/policy.json` (all thresholds), `reference.json` (template's allowed values and fixed stores, used only as fallback), `glossary.json`, `codes.ts` (reason-code vocabulary), `types.ts`.
- Parser `lib/parse/parse.ts` finds sheets and headers by name, drops the grey example row on BOTH Applications and Territories when a real row with the same ID exists (template has an example TER-01 too).
- Generators: `python scripts/gen_golden.py` writes `tests/golden/golden.xlsx`, `stress500.xlsx` and `public/sample/sample-golden.xlsx` from the real template (keeps grey row, dropdowns).
- User asked (chat): the globe must show India only.

## Next step
Phase 1: engine (`lib/engine/decide.ts`), golden status tests, property and metamorphic tests.
