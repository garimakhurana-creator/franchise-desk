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

## Phase 2, walking skeleton: DONE
- UI: empty state, parse report, summary strip with pin-rule badge, territory slot strips, results table (cards below 1280 px), decision card (all 7 parts), Ask the desk, Policy (live re-run as a new baseline), How it decides, Data notes, Excel export (sanitised), sample data labelled SAMPLE.
- Public production deploy: https://franchise-desk-red.vercel.app (Vercel project garima20/franchise-desk). Verified anonymously (curl, Playwright, no cookies).

## Phase 3, follow-ups and hardening: DONE, tagged rc1
- Pinned approvals, contested detection, Confirm swap (logged), undo, reset, verify, simulate days, audit trail.
- F1-F16 pass on the rule path (tests/followups.test.ts). Gemini layer: lib/llm.ts adapter, /api/chat (rate limit 12/min/IP, daily budget 400, 3 in flight, cache by message + state hash, 6 s timeout), /api/health. Model: gemini-3.5-flash-lite (1.5 s vs 4 s for full Flash; full Flash timed out with thinking tokens). Model output is zod-validated, IDs must be grounded in the message or recent context, facts are grounded by multilingual keywords and merged with the rule extractor.
- Rules first: the model is only called when the rules cannot read the message (fast, deterministic, quota-safe). Rules handle Hindi/Kannada/Hinglish updates and questions that include an ID.
- scripts/acceptance.ts passes in live, no-key and no-server modes, locally (prod build) and on the live URL. stress500 renders in under 0.9 s.

## Phase 3b, red team: DONE
- 41 adversarial rows + 6 messy territories (tests/redteam). 10 defects found and fixed (same-property needs same tenure, 1st floor, injection in English/Hindi/Kannada, competing brand in business text, format cap for oversized spaces, no decline on implausible size, outlier threshold, negative wording, zero-slot wording, proven-operator code). Regression tests in tests/redteam.test.ts; EDGE_CASES.md.

## Phase 4, design: DONE (with known gaps)
- 3D India-only Expansion Map (MapLibre globe intro -> tilted 54° map with deck.gl slot towers, stones, discs, contested arcs), lazy-loaded, falls back to the table on any failure. Ledger summary, header and card polish over three screenshot rounds (docs/screens). DESIGN_DECISIONS.md.
- Known gaps: overlap lenses, update ripples, presentation mode.

## Phase 5, extras: PARTIAL
- Done: control tower (call-first, openings, gap, capacity), integrity self-test, simulate 14/30 days, Hindi/Kannada answers with post-checked translation, held-in-N% stability, print decision pack, 404.
- Not built: Places/footfall enrichment (optional keys), simulated telemetry toggle, presentation mode.

## Phase 6, review and release: DONE
- SELF_SCORE.md (94/100), JUDGE_READINESS.md, DEMO_SCRIPT.md (numbers checked against the engine), ROADMAP.md.
- Release incident: a build passed locally but failed live acceptance (Enter lost while the map loaded on a slow connection). Production promoted back to the last good deployment within a minute; fixed with an uncontrolled input; slow-network acceptance mode added.

## Next step
Optional polish only: overlap lenses and update ripples on the map, presentation mode.
