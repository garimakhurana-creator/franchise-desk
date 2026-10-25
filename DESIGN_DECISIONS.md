# DESIGN_DECISIONS

## The three concepts and the choice

| Concept | Expansion head, all day | Judge, five minutes | Executive, demo |
|---|---|---|---|
| A. Expansion Table (3D map, slot towers, stones) | Beautiful but slow to scan 22 or 500 rows; needs the table anyway | Memorable; shows scarcity and the pin rule at a glance | Strongest wow |
| B. Control-room schematic (extruded plates, flow lines) | Abstract; loses real geography and distances | Needs explaining | Calm, but generic "ops dashboard" risk |
| C. Ledger wall (typographic, data-forward) | Best for daily work: every reason readable, sortable | Fastest to judge: nothing behind a click | Credible, less spectacle |

**Choice: fuse C as the working surface with A as the one orchestrated element.** The page is a ledger: the parse report, then one sentence ("8 of 22 move forward"), a single proportional bar for statuses, the territory slot strips, and the full table where every row carries its status, reason, next step and owner. The 3D Expansion Table sits above it as the memorable piece (India only, per the user), and is optional: any failure hides it and the table carries everything.

Honest note: concepts B and C were critiqued as sketches against the three audiences rather than built as separate screens; A was built in full and screenshotted (`docs/screens/map-*`).

## Design system (in code, `app/globals.css`)
- **Colour:** dusk, not neon. Ink-teal base `#0D1B24`, plates `#17313C`, ivory text. Gold `#F2C14E` is reserved for slot towers, slot strips and the single primary action. Status hues: approved sea-green, conditional glass-teal (always hatched), hold amber, waitlist slate-lavender, declined brick, withdrawn grey. Light theme on warm paper `#F3F1EA` with darker hues for 4.5:1 contrast. Follows `prefers-color-scheme` with a manual toggle.
- **Status language:** shape + colour + label, never colour alone: solid disc with tick (approved), hatched disc (conditional), pause bars in a rounded square (hold), queue lines (waitlisted), crossed ring (declined), dashed ring (withdrawn).
- **Type:** Newsreader (serif) for decision sentences and headlines, set larger than their evidence; Schibsted Grotesk for interface text with tabular numerals for scores and money. Noto Sans Kannada and Devanagari for applicant messages and translated answers.
- **Icons:** one custom set on a 16 px grid with 1.5 px strokes (`components/icons.tsx`); no mixed packs.
- **Motion:** 120 / 220 / 420 ms with an ease-out curve; panels rise; the map flies once (globe to Karnataka) and stones land once, skippable. `prefers-reduced-motion` turns flights into cuts.

## Rounds of critique (screenshots in `docs/screens`)
1. **First pass:** the status counts were a row of identical rounded cards, the banned stock-dashboard look. Replaced with one proportional ledger bar whose segments filter the table. The table's sticky header floated over the first row inside an overflow-hidden wrapper; fixed. Table text columns crushed below 1280 px; cards take over there.
2. **Second pass:** seven header labels wrapped onto two lines at 1440 px; they became icons with tooltips below 1536 px, and the run chip stopped repeating "SAMPLE DATA". The card listed taken pins as "free"; it now says "570002 open, 570004 (APP-003)". TER-06 broke across two lines in the rail.
3. **Third pass:** on phones the header tools pushed the theme toggle off screen; the tool row now scrolls. Light theme and map checked; mobile card verified.

## Decisions worth defending
- **Table first, map second.** A judge must see what happens and why for every application without touching the 3D view; the map adds geography and scarcity, never information the table lacks.
- **One gold.** Gold only means "a slot": towers, strips, the primary button. That makes scarcity visible across the page.
- **The decision sentence is the hero of every card,** in serif, with the status word in its colour; evidence is smaller and below.
- **Honesty is visible:** SAMPLE DATA labels, "illustrative" on every money figure, "pin centres are approximate; no catchment boundaries were provided" on the map, "Rule-based" or "AI" on every answer, "translated, numbers and IDs checked" on Hindi and Kannada replies.

## Known design gaps
- The map has catchment discs but no shaded overlap lenses, and update choreography is a camera ease to the affected pin rather than ripples and ghost trails.
- Presentation mode (guided tour) is not built.
- At city zoom the map has no streets (no third-party tiles, by choice, so nothing external can fail).

## Revision: internal dashboard, map-first (after user review)
- The user asked for a dark interface; a game-style HUD was tried and rejected as too cluttered for an internal company tool. The final design is a calm dark dashboard: one sidebar with Applications and Territories tabs, a slim KPI strip, the map filling the rest, sentence-case type and no glow.
- The map is India in 3D relief (EOX Sentinel-2 imagery on AWS terrain tiles, masked to India) with territories as callout tags showing request counts and slots. A Satellite/Map toggle adds OpenStreetMap streets; Esri reference labels name places and roads over the satellite view. Relief softens as you zoom (2.6x at state level, 1x at street level) so labels stay readable; zoom goes to street level (18).
- Bug fixed during review: a long sidebar stretched the page so the map was framed for an invisible 2,000 px canvas; the layout is now pinned to the viewport.
- Licensing note: OpenStreetMap tiles are for light use with attribution; Esri reference labels and EOX imagery are credited on the map and suitable for this non-commercial demo, not for commercial production without a licence.
