# SELF_SCORE (SPEC section 14)

Scored honestly against the rubric; gaps listed under each part.

## A. Decisions and hard rules: 24 / 25
| Item | Score | Evidence |
|---|---|---|
| Pin rule never violated | 8 / 8 | Property tests on 60 random datasets, golden, red team, stress500 and every post-update state; live badge "Pin rule verified: 0 conflicts"; integrity self-test re-checks in the browser. |
| Every contradiction caught and held with exact asks | 6 / 6 | City vs pin vs territory, space status vs size/floor/notes, floor vs notes, experience vs business text, note amount vs form, units, negatives, duplicates. Each names both facts and who must send what (lint-enforced). |
| Allocation under competition, ties, zero slots | 6 / 6 | Usable capacity = min(slots, free pins); ready-first ranking with stable tie-breaks; spacing; zero slots and zero free pins; pinned approvals with contested detection and human-confirmed swap. |
| Robust, order-independent parsing | 4 / 5 | Fuzzy sheets and headers, grey example rows on both sheets, ₹ formats, ranges, crore, sq m, enum typos; row order and ID case tested. Gap: two rows sharing an ID are labelled by row, so which one becomes "#2" depends on row order (both are held, so no decision depends on it). |

## B. Explanation quality: 19 / 20
| Item | Score | Evidence |
|---|---|---|
| Identical card anatomy | 8 / 8 | Status + sentence, evidence, confidence, what would change it, plan, applicant message, audit trail, for every status. |
| Specific evidence and lint clean | 6 / 6 | Every one-liner has a number or ID, at most 28 words, no codes or field names, banned phrases blocked, neutral integrity wording; lint runs over golden, stress500, red team, random sets and post-update states. |
| Computed counterfactual, confidence, stability | 5 / 6 | Counterfactuals re-run the engine on candidate changes; robust/borderline with the flip condition; "held in N% of 16 policy variations". Gap: candidate changes are a fixed menu, not a search; held % is skipped above 250 rows for speed. |

## C. Next steps and preparation: 14 / 15
| Item | Score | Evidence |
|---|---|---|
| Owner-tagged, week-numbered timeline vs target | 5 / 5 | Gantt with owners, target marker, earliest realistic month, festival check. |
| Training by experience, language, tier, buddy store, sign-off | 5 / 5 | Foundation / Standard / Accelerated, preferred language, Tier 3 hybrid, buddy store by maturity and distance, competency sign-off. |
| Ops depth | 4 / 5 | Hub, lead time, safety stock, milk-run cluster, payback (flagged > 36 months), documents, applicant message in Kannada script, Hindi or English. Gap: hub map and payback inputs are illustrative defaults. |

## D. Follow-ups: 19 / 20
| Item | Score | Evidence |
|---|---|---|
| Intent coverage | 7 / 8 | Explain, next steps, what it would take, compare, rank, territory, queue, list/aggregate, summary, updates, withdraw, territory change, policy, what-if, apply, undo, reset, swap, verify, simulate days; pronouns, multi-update, unknown IDs, wrong premise, partial and worsening news; Hindi, Kannada and Hinglish (rules with IDs, model otherwise, answers translated and number-checked). Gap: the rule path's free-form coverage is English-centric. |
| Re-decision with before/after and knock-ons | 8 / 8 | Status, score, rank and queue movement; knock-on list; rank-only shifts summarised; approved partners stated as locked. |
| Simulate / apply / undo and pinned swap | 4 / 4 | What-if never applies; "apply" commits; undo is an exact replay; contested outcome leads with the reasoning; Confirm swap logged. |

## E. Robustness and access: 9 / 10
| Item | Score | Evidence |
|---|---|---|
| Public no-login link verified | 3 / 3 | https://franchise-desk-red.vercel.app, checked anonymously with curl and Playwright on every release. |
| Usable with no key, no server or a model outage | 3 / 3 | Acceptance passes in four modes on the live URL: live, API 503, API unreachable, slow network. |
| Security and performance | 3 / 4 | Text escaped by React; exports sanitised against formula injection; model gets IDs and the message only; zod validation and ID grounding; key server-side only; 500 rows decided in 0.33 s, rendered under 1 s. Gap: rate limits and the daily budget are in-memory per serverless instance, so they are soft limits. |

## F. Insight and design: 9 / 10
| Item | Score | Evidence |
|---|---|---|
| Design excellence and map with fallback | 4 / 5 | Ledger-first page, one gold, custom icons and status shapes, serif decisions, light and dark, phone layout, 3D India map with slot towers, stones, discs and contested arcs, lazy-loaded with automatic fallback. Gap: no overlap lenses or update ripples; no presentation mode. |
| Control tower and call-first list | 2 / 2 | Who to call first, expected openings by month (risk-adjusted), demand gap, capital, training seats by language, field visits, waves, simulate 14/30 days. |
| Self-test, methodology panel, docs | 3 / 3 | In-browser integrity self-test; "How it decides" generated from the live policy; README, ASSUMPTIONS, EDGE_CASES, DEMO_SCRIPT, ROADMAP, DESIGN_DECISIONS, JUDGE_READINESS. |

## Total: 94 / 100

## Numbers
- Golden pass rate: **22 / 22 statuses and every mandatory assertion** (`tests/golden.test.ts`); follow-up scripts F1 to F16 pass on the rule path (`tests/followups.test.ts`), and F1 to F9 plus F13 to F16 pass in a real browser against the live URL in four modes (`scripts/acceptance.ts`).
- Metamorphic: 7 properties on 6 datasets, all green; two documented caveats (greedy spacing; revealing a size can correctly turn "unknown" into a funding decline).
- Property tests: 60 seeds for invariants and determinism, 20 for order/case independence, fairness and pinned approvals.
- Explanation lint: 0 findings on golden, stress500, red team, 6 random sets and post-update states.
- GOLDEN_DIVERGENCES: **0**.
- Total automated tests: 261.
