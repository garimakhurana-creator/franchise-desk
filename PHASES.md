# PHASES (ordered by dependency; commit after each; update PROGRESS.md after each)

Phase 0, foundations. Inspect the template. Scaffold Next.js plus TypeScript plus Tailwind plus Vitest plus Playwright. Create .gitignore and .env.example first, policy.json, types, the reason-code enum, the glossary file, and the golden.xlsx and stress500.xlsx generators. Exit: project builds, golden.xlsx opens, parser smoke test passes, no secret is tracked by git.

Phase 1, engine. Parser plus engine (client-side, pure) plus golden status tests plus property tests plus metamorphic tests. Exit: every golden expectation passes or is documented in GOLDEN_DIVERGENCES.md; property and metamorphic tests green.

Phase 2, walking skeleton. Product UI in table mode: upload, parse report and Data notes, summary strip with the pin-rule badge, results table (every application, one-line why, next step, owner), decision cards with full anatomy, filters, Policy panel with live re-run, "How it decides" panel, Excel export with sanitising, "Try sample data" (labelled SAMPLE), rule-based follow-up chat running in the browser. Explanation lint test green. FIRST PUBLIC DEPLOY: production deployment, protection disabled, verified in an incognito window. If deploy credentials are missing, write USER_ACTIONS.md and continue. Exit: a Playwright test uploads golden.xlsx and stress500.xlsx and asserts statuses and performance; the live URL (or a local production build if blocked) passes it with no login and no key.

Phase 3, follow-ups and hardening. Pinned-approvals flow with Confirm swap, undo and audit log; follow-up scripts F1 to F16 on the rule-based path; then the Gemini layer behind lib/llm.ts (model discovered from the key, caching, concurrency limit, 6-second timeout, /api/health) with the adapter mocked in tests. Redeploy with GEMINI_API_KEY set in the host environment. Exit: scripts/acceptance.ts passes F1 to F9 and F13 to F16 with the key present, with it removed, and with the server unreachable (rule-based path). Tag rc1 and follow the Release discipline in CLAUDE.md from here on.

Phase 3b, red team. Write at least 30 further adversarial rows of your own, run them, read every explanation critically, fix defects, add regression tests. Exit: lint and all tests green; defects logged in EDGE_CASES.md.

Phase 4, design excellence. Carry out the full process in DESIGN.md: explore three concepts, record the choice, build the design system, then build the experience (fallback ladder first, then the signature elements, the detail panel, command bar and update choreography, catchment discs and lenses from centroids), with the visual verification loop and the craft pass. This phase is not finished until the screenshots look genuinely excellent in desktop, mobile, light and dark, the table parity holds, reduced-motion is respected, frame rate is healthy, and a map failure leaves the app fully usable. Features go ON when they meet these criteria.

Phase 5, enrichment and extras. Enrichment (cached, advisory, off if keys are missing), presentation mode, control tower, integrity self-test, simulated-telemetry toggle (watermarked, off by default). Exit: with all optional keys removed the app behaves identically except for the map-data note.

Phase 6, review and release. Documentation set, DEMO_SCRIPT.md, DESIGN_DECISIONS.md, SELF_SCORE.md and JUDGE_READINESS.md against SPEC section 14; fix the largest gaps; run acceptance on a local production build of the exact commit; redeploy only if green; re-verify the live URL in incognito.

Begin Phase 0 now, and continue through the phases without waiting for me.
