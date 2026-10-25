# ASSUMPTIONS

Every threshold below is **illustrative**. All of them live in `lib/engine/policy.json` and most are editable live in the Policy panel; changing one re-runs every decision from the uploaded file. None of the money figures is market data, and nothing was scraped.

## Brand and format
| Setting | Value | Why |
|---|---|---|
| Product category | "retail store" (a setting) | The case does not name the category, so it is never hardcoded; it is used only in wording. |
| Format profile | retail (or logistics) | A logistics or delivery centre cares less about ground-floor footfall, so floor points change. Shows the engine generalises. |

## Money (₹ lakh unless stated)
| Setting | T1 / T2 / T3 | Why |
|---|---|---|
| Fit-out per sq ft | ₹1,800 / 1,400 / 1,100 | Spec defaults; metro fit-outs cost more. |
| Opening stock per sq ft | ₹1,500 / 1,100 / 900 | Spec defaults. |
| Franchise fee | 4 / 4 / 3 | With the rent deposit at the ideal size, fee + deposit ≈ the spec's 8 / 6 / 4 lakh lump. Split so owned space can drop the deposit. |
| Rent index (₹/sq ft/month) | 120 / 70 / 45 | Seeded, editable, labelled illustrative. Feeds the deposit (6 months) and a 3-month rent runway for rented space. |
| Working-capital buffer | 10% | Spec. |
| Ideal / minimum size (sq ft) | 600 / 450 / 350 and 400 / 300 / 250 | Spec. Site-less applicants are costed at the ideal size. |
| Format cap | 2 × ideal | A franchise fits out its standard format, not a whole 2,500 sq ft hall; oversized spaces are costed at the format maximum and flagged for a site check. (Red-team finding.) |
| Decline below | 70% of estimate | Spec. 70 to 100% is on hold for proof of funds or a co-investor. |
| Space too small | under 70% of the tier minimum | Spec. 70 to 100% scores lower. |

## Score (0 to 100)
| Part | Max | How |
|---|---|---|
| Funds vs estimate | 25 | 15 points at 100% of the estimate, full at 150%, 0 at 70%. |
| Experience | 20 | 14 for years (capped at 8) + 6 if the business text is clearly retail, 3 if partly. |
| Space readiness | 25 | Owned 10 / rented 7; size vs ideal up to 8; ground 7, mall 5, upper 3. No site: 5 credit for a free choice of site. |
| Timing | 10 | Full if the target leaves enough weeks for the plan; scaled down otherwise (minimum 2); 6 if no target. Infeasible timing never declines. |
| Location | 20 | Priority High 10 / Medium 7 / Low 4, plus up to 10 minus a cannibalisation penalty. |

Approval bar 55, decline bar 35. High-priority territories use 50, Low 60 (visible on every card). Names and language never enter the score (property-tested).

## Cannibalisation and spacing
- Distances are haversine kilometres between **pin centroids** built once from OpenStreetMap Nominatim (ODbL) for 266 pins in the allowed prefixes; other pins fall back to a flagged city-level point, and then to a labelled pin-number proxy. **No coordinates or catchment boundaries were provided**, so overlap is judged from pin centres only.
- High overlap ≤ 2 km (8 points), medium ≤ 5 km (4 points); proxy: pin gap ≤ 5 / ≤ 25.
- Weighted by store maturity from "Opened (year)": a store 2 years old or less is still ramping up and most exposed (×1.0), 3 to 4 years ×0.75, 5+ years ×0.5.
- New approvals closer than 1.5 km to each other: better-spaced sites go first; adjacent ones only if slots remain (said in the explanation).
- Density guide per city (stores + approvals): 12 / 5 / 3 by tier. A warning, never a decline.

## Allocation
- Usable capacity = min(open slots, free pins). Ranking: ready site, then score, then investment, then normalised ID.
- Leftover slots go to strong applicants without a site as a 30-day conditional reservation. A site-less applicant never outranks a ready one.
- Approved partners are locked. An update can make someone outrank them; the desk then recommends a swap and a person must confirm it.
- Holds close after 14 days of silence (with a re-apply path); conditional reservations lapse after 30 days to the next in line. Both are simulated, never automatic on real time.

## Timeline, training, supply
- KYC and agreement 2 weeks → site (owned 0, rented 1, none 6) → fit-out 4 (+3 mall, +1 upper) in parallel with training → first stock and POS 2; Tier 3 adds 2 weeks of inbound route set-up. Compared with the target from today's date at runtime.
- Training: 0 years Foundation 3 weeks, 1 to 2 Standard 2 weeks, 3+ Accelerated 1 week; in the preferred language; Tier 3 hybrid; shadowing at a buddy store chosen by maturity (3+ years preferred) and distance; competency sign-off before go-live.
- Hubs (configurable defaults): Bengaluru DC serves 560, 572, 570; Hubballi DC serves 580, 590, 577; Mangaluru DC serves 575. Lead time 1 day in the hub city, 2 otherwise; safety stock 3 days per lead day (minimum 4).
- Payback: revenue ₹1,800 / 1,400 / 1,000 per sq ft per month, gross margin 35%, royalty 5%, other costs 4%, staff ₹1.0 / 0.8 / 0.6 lakh a month, minus rent. Flagged above 36 months. Purely indicative.
- Festival calendar: Diwali 8 Nov 2026 and 29 Oct 2027. Verify dates each year.

## Integrity signals (route, never accuse)
- Near-duplicate names at one pin (shared tokens, reordered, or ≤ 2 edits): counted once, identity check.
- Same property: different names, same pin, **same tenure**, same size and floor, or identical long notes. Same tenure was added after the red team showed two different rented 400 sq ft units in one pin being held together.
- Same name at two pins: one reservation per person.
- Unusual funds: ≥ ₹150 lakh or ≥ 3 × the estimate, with no experience, no site and a target of 2 months or less.
- Loan, weak title, competing brand (notes or business text), cash or third-party funds, legal disputes, a mall unit in a Tier 3 town, a very large kirana: each routes to one named document check.
- Facts given in chat are "claimed": the decision moves at once, tagged pending verification; "Mark verified" re-runs.
- No fee is ever collected or implied before verification and a signed agreement.

## Reason-code extensions
The vocabulary in SPEC 5 is used as given. Six codes were added where none fit: `DATA_MISSING`, `DATA_INVALID`, `DUPLICATE_ID`, `NOTE_CONFLICT`, `EXPERIENCE_CONFLICT`, `PROVEN_OPERATOR`.

## The AI
- Model: `gemini-3.5-flash-lite` via `GEMINI_MODEL` (listed from the key; Flash-Lite answers in about 1.5 s, full Flash took about 4 s and risked the 6 s timeout).
- Rules first: the model is called only when the rule parser cannot read a message. It returns commands only; IDs must appear in the message or the recent conversation; facts must be grounded in the message.
- Hindi and Kannada answers are translated from the English answer and rejected if any number or ID differs.
- Sent to the model: the message, application and territory IDs. Never names, notes or scores.
