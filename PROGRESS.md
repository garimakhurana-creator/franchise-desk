# PROGRESS

## Phase 0, foundations: DONE (2026-10-25)
- Repo at `Desktop/coding/franchise-engine` (separate from the python-101 repo, so the kargo branch is untouched).
- Next.js 15 + TypeScript 5 + Tailwind 4 + Vitest 3 + Playwright. SheetJS 0.20.3 from the official CDN tarball (the npm `xlsx` package is stale).
- `.gitignore` excludes `.env*` except `.env.example`. `.env.local` holds GEMINI_API_KEY (copied from the user's flatmatch project); never tracked.
- `lib/engine/policy.json` (all thresholds), `reference.json` (template's allowed values and fixed stores, used only as fallback), `glossary.json`, `codes.ts` (reason-code vocabulary), `types.ts`.
- Parser `lib/parse/parse.ts` finds sheets and headers by name, drops the grey example row on BOTH Applications and Territories when a real row with the same ID exists (template has an example TER-01 too).
- Generators: `python scripts/gen_golden.py` writes `tests/golden/golden.xlsx`, `stress500.xlsx` and `public/sample/sample-golden.xlsx` from the real template (keeps grey row, dropdowns).
- User asked (chat): the globe must show India only.

## Phase 1, engine: DONE
- `lib/engine/decide.ts` (evaluation, integrity routing, allocation with pinned approvals and contested detection), `assess.ts` (capex, score), `explain.ts` (one-liners, next steps, plans), `plan.ts`, `signals.ts` (rule-based note reader), `geo.ts`, `session.ts` (update log, replay, undo, diff), `lint.ts`.
- Tests: 214 green. Golden 22/22 statuses plus every assertion; invariants; F4, F5 (incl. confirm swap), F6 (incl. exact undo), F7, F10 at engine level; 60-seed property tests; metamorphic on golden plus 5 random sets; explanation lint on golden, stress500, random sets and post-update states.
- GOLDEN_DIVERGENCES: 0.
- Decisions: extension codes DATA_MISSING, DATA_INVALID, DUPLICATE_ID, NOTE_CONFLICT, EXPERIENCE_CONFLICT (no vocabulary code fits). Pin centroids: GeoNames and a GitHub dataset were too coarse (all Bengaluru pins on one point), so a one-off polite Nominatim build is running (`scripts/build_centroids.py`); until it lands the engine uses the labelled pin-number proxy.
- Metamorphic caveats (documented in tests): spacing is greedy, so "removing an applicant never worsens another" skips ADJACENCY cases; "making a site ready" skips funds-limited applicants (revealing size can correctly turn unknown into a funding decline).
- Perf: stress500 parse 130 ms, run 330 ms.

## Next step
Phase 2: walking skeleton UI (upload, parse report, summary strip, results table, decision card, policy panel, how-it-decides, export, sample data, rule-based chat), then first public deploy.
