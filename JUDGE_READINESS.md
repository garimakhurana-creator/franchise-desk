# JUDGE_READINESS

The product reviewed through four pairs of eyes. "Fixed" means changed in the product before submission.

## A strict head of operations
| Criticism | Response |
|---|---|
| "A 2,500 sq ft kirana was declined because you costed fit-out for the whole hall." | Fixed: fit-out is costed on the store format (at most 2 × ideal) and the size goes to a field check. |
| "Two different people renting 400 sq ft shops in the same pin were frozen as 'the same property'." | Fixed: a same-property claim now needs the same tenure as well as pin, size and floor. |
| "A 50,000 sq ft typo produced a funding decline." | Fixed: implausible sizes are held for confirmation; nothing is declined on them. |
| "I don't trust money figures I can't see." | Every card shows the full estimate arithmetic; every figure is editable in Policy and labelled illustrative. |
| "Will it take an approved partner away from me when someone better turns up?" | Never on its own: the newcomer is waitlisted #1 as contested, the card leads with the reasoning, and a person must press Confirm swap (logged). |
| "What do I do at 9 a.m.?" | Control tower: who to call first, ranked by money at stake and time left. |
| Remaining: payback and hub lead times are defaults, not our data. | Stated as illustrative; ROADMAP lists the data that would replace them. |

## A sceptical engineer
| Criticism | Response |
|---|---|
| "The LLM is making the decisions." | It cannot: it returns commands only, validated by zod; IDs must appear in the message or recent context; facts are grounded in the message; the engine decides. Without a key the app is identical, rule-based. |
| "It works on your laptop." | Acceptance runs a real browser against the live URL in four modes before every release. A build that passed locally once failed live; production was promoted back within a minute, the race (Enter lost while the map loaded) was fixed, and a slow-network mode was added. |
| "Is it deterministic?" | Pure engine, no clock or randomness; runId in the header; property and self-tests re-run with shuffled rows, lower-case IDs and swapped names. |
| "Prompt injection through notes or chat?" | Notes are data: injection phrases in English, Hindi and Kannada are flagged and have zero effect on scores (tested); chat injection changes nothing. |
| Remaining: rate limits are per serverless instance. | Acknowledged in SELF_SCORE; the model path is optional, so exhausting it only switches to rules. |

## An evaluator working through the rubric
| Criticism | Response |
|---|---|
| "Show me every application, what happens, why, the next step and the owner." | One table row each, no click needed; cards on phones carry the same fields. |
| "Prepared to run the store?" | Week-by-week plan with owners vs target, training in their language with a buddy store and sign-off, first stock and safety stock, payback, documents, and a message in their language. |
| "Follow-ups: change something and explain it." | Before/after, score and rank movement, knock-ons, locked approvals stated, what-if vs apply, undo. |
| "Hindi or Kannada?" | Answered in kind; translations are rejected if any number or ID differs from the English. |
| Remaining: presentation mode and enrichment (Places, footfall) are not built. | These were lowest in the scope order; enrichment also needs optional keys. |

## A design director
| Criticism | Response |
|---|---|
| "Identical rounded stat cards: every dashboard has them." | Fixed: one proportional ledger bar and a serif headline. |
| "Header labels wrap; it looks crowded." | Fixed: icon buttons with tooltips below 1536 px. |
| "Colour alone carries status." | Status uses shape + colour + label everywhere; conditional is always hatched. |
| "Gold everywhere cheapens it." | Gold is reserved for slots and the single primary action. |
| "The map is decoration." | It shows what tables can't: geography, scarcity (towers, blocked ghost slots) and contested arcs; it is optional and never the only place information lives. |
| Remaining: overlap lenses, update ripples, a guided tour. | Listed in DESIGN_DECISIONS as known gaps. |
