# DEMO_SCRIPT (3 minutes)

Open **https://franchise-desk-red.vercel.app** in any browser. No login.

## 0:00 to 0:30: upload and the first view
1. Drop the workbook (or press **Try sample data**: clearly labelled SAMPLE DATA, invented applicants).
2. Point at the parse report line: "Read 22 applications and 6 territories · 2 rows ignored". Open **Data notes**: the grey template example rows were dropped because real APP-001 and TER-01 exist.
3. Point at the ledger: "12 of 22 move forward · 8 of 8 usable slots filled · 2 wanted slots blocked by pins that already have our stores" and the **Pin rule verified: 0 conflicts** badge.
4. Point at the territory strips on the left: TER-03 wants 2 stores but has 1 free pin (one ghost block); TER-05 wants 1 and has 0.

Say: "Every row has a status, a one-line reason with numbers, a next step and an owner. Nothing is hidden behind a click."

## 0:30 to 1:15: one decision, end to end
Click **APP-004**.
- "On hold: pin 570009 already has our store ST-06; moving to free pin 570002 or 570008 would rank it 1 of 4 (score 96)."
- Evidence: usable capacity = min(2 slots, 4 free pins), score bars, the funds check arithmetic, nearest store and maturity.
- What would change it: computed by re-running the engine on small changes.
Then click **APP-001** to show the onboarding plan: week-by-week Gantt with owners against the target date, training track in the applicant's language with a buddy store, hub and safety stock, payback, documents, and the message to the applicant in their language with a copy button.

## 1:15 to 2:30: follow-ups in plain language
Type into **Ask the desk**:
1. `Why is APP-001 rejected?` → "APP-001 is not rejected; it is approved." (wrong premise corrected)
2. `APP-007 owned space is 480 sq ft on the ground floor` → On hold → Approved, score and rank movement, knock-on: APP-010 Conditional → Waitlisted (ready sites outrank site-less ones), approved partners stay locked, first next step: verify the claim.
3. `What if APP-004 moves to pin 570008?` → What-if only.

   **How to word the contested case:** "It now qualifies and would outrank APP-003 by 9 points, but I will not revoke an approved partner on my own. Here is the swap recommendation." Then say `apply`, then press **Confirm swap**: APP-004 approved, APP-003 waitlisted with its next-best option, all in the audit trail.
4. `undo` twice, then `APP-001 has withdrawn` → APP-002 promoted automatically, with the reason.
5. `Which territories have unfilled slots?` → all usable capacity allocated; TER-05 has no free pin; TER-03 can host 1 of 2.
6. Optional: `APP-004 होल्ड पर क्यों है?` → answered in Hindi, numbers and IDs checked against the English.

## 2:30 to 3:00: trust
- **Self-test**: shuffles rows, lower-cases IDs, swaps names and languages, re-runs, shows pass for determinism, fairness and the pin rule.
- **How it decides**: the whole method in one minute, generated from the live policy.
- **Policy**: change the approval bar; every decision re-runs from the file and the logged updates replay.
- **Control tower**: who to call first today, expected openings by month, demand gap, training seats by language.

Close with: "The rules decide; the AI only reads the question. It works without the AI and even with the server asleep."
