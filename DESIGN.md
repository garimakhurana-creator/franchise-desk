# DESIGN

## Ambition and bar
Build the most striking, memorable and genuinely useful interface you can for an expansion team: something a company executive would want to show others and a judge would remember. Design deserves real depth and iteration; do not rush it and do not settle for a competent dashboard. The direction below is a strong starting point, not a cage: if exploration finds a better idea, pursue it, provided the non-negotiables hold. The test of success is that it feels like a product a company would pay for, and that each flourish earns its place by making the data easier to read or the decisions easier to trust.

## Non-negotiables
- Every application is visible with status, one-line why, next step and owner without needing the 3D view (the results table is one click away and is the default when WebGL is unavailable).
- The Decision Card anatomy (SPEC 7) is preserved.
- The table view has full parity with the 3D view; the app works fully with the map or 3D layer disabled; failure of any visual layer never breaks decisions.
- Honesty is visible: "estimated, relative" for enrichment, "SAMPLE DATA" for fixtures, "SIMULATED DATA" for simulation.
- Restraint: one orchestrated memorable element, quiet everywhere else. No decoration that carries no information.
- Avoid the generic: no stock dashboard grid of identical rounded cards, no neon on near-black, no cream with terracotta, no tracked all-caps eyebrow labels, no gradients as decoration, no glassmorphism, no mixed icon packs.

## Process (follow it, and record the reasoning in DESIGN_DECISIONS.md)
1. Explore. Using the real golden data, prototype at least three genuinely different hero concepts for the main view and screenshot them: A, the Expansion Table described below; B, a spatial "control room" schematic with extruded territory plates, flow lines and a calm instrument-panel feel; C, a typographic, data-forward "ledger wall" with a small 3D inset. Critique each for three audiences (an expansion head working all day, a judge with five minutes, an executive seeing a demo). Choose one or fuse the best parts, and explain why.
2. Design system first. Define tokens (colour, type scale, spacing, radius, elevation, motion durations and easings), a component inventory, one coherent custom icon set, and the status language (shape plus colour plus label, never colour alone). Keep them in code so the whole UI inherits them.
3. Build, then critique in rounds. After each feature capture Playwright screenshots at 1440x900 and 390x844, light and dark, in at least three states (fresh upload, a selected application with the detail panel open, after a follow-up update). View them. Critique hierarchy, density, rhythm, contrast, motion budget, copy, and anything that looks templated. Fix the worst problems and re-capture. Do at least three full rounds on the hero view. Keep the final screenshots in /docs/screens.
4. Craft pass. Easing curves and camera choreography; micro-interactions (hover, select, confirm swap, copy message); loading skeletons; empty, error and offline states; focus states; the transition between 3D and table; a print and PDF-friendly decision pack; a considered 404 and a considered "map unavailable" state. Sweat the details people notice without knowing why.

## Starting concept: "The Expansion Table"
A night-time tabletop model of the brand's network that you can fly into: a globe that settles on India, then Karnataka, rising into a softly lit relief where every territory is a plate, every existing store a solid monolith, and every application a stone that lands, waits or is refused. The memorable element is the SLOT TOWER: scarcity made physical.
1. Slot towers: each territory raises a column of blocks, one per open slot, in warm gold light. Filled slots are solid (approved), provisional slots are translucent with a hatch (conditional), open slots are outlined glass. Effective capacity is the tower's real height, and a dim ghost block marks slots the brand wants but free pins cannot support.
2. The pin rule as physics: each pin cell holds one stone. A second stone aimed at an occupied cell snaps back to waitlist orbit with a small thud and a label naming the winner. Approved (pinned) stones carry a thin bolt ring so "approved is locked" is visible.
3. Cannibalisation lenses: each existing store projects a translucent catchment disc in real kilometres; where a candidate's disc overlaps, the overlap lens is shaded and its area is the risk, with the number in the detail panel.
4. Landing choreography: on upload, applications fall from orbit as thin trails and land in their pin cells in status order (approved first), under about 2.5 seconds, skippable.
5. Updates land visibly: after a follow-up the camera eases to the affected pin, the stone slides to its new state, a ripple travels to every knock-on stone, and a ghost trail shows old state to new. Contested outcomes show a dashed arc from the newcomer to the pinned stone it outranks, with "Confirm swap" on the arc.
6. Presentation mode [W]: an autoplay guided tour (globe, India, each territory in priority order, one decision highlight per territory, a closing view of unfilled slots) with captions generated from the engine's actual data; stops on any key.
You may add, replace or refine any of these if exploration shows something better (for example sound-free haptic-like feedback through motion, a time scrubber for the 30-day simulation, or a before/after split view for updates).

## Look (starting palette; evolve it, keep contrast and meaning)
Dusk, not neon: base ink-teal #0D1B24; land plate #17313C; plate edge #2A4B59; text ivory #EFE9DD; muted text #9FB1B8; slot-light gold #F2C14E (reserved for slot towers and the single primary action); status: approved sea-green #2FBF8F, conditional glass-teal #4FC3D9 (hatched), hold amber #E39A3B, waitlist slate-lavender #8E9BC7, declined brick #D5584F, withdrawn grey #6E7C83. Text contrast at least 4.5:1. Light theme on warm paper #F3F1EA with the same hues darkened. Respect prefers-color-scheme with a manual toggle.
Type: choose one distinctive family (or two clearly distinct) that is not a default pick, with a fallback stack; tabular numerals for scores and money; a clear scale; sentence case; decision sentences set larger than their evidence.
Materials: matte plates with soft ambient occlusion, thin emissive edges, subtle fog toward the horizon, a restrained bloom on gold only.

## Layout (starting point)
Desktop: full-bleed canvas; left rail with territories as slot strips; bottom-centre command bar "Ask the desk" with example chips and a short transcript; right detail panel with the Decision Card and a Table tab; top-left run chip (runId, policy version, AI-assisted or Rule-based, enrichment status); top-right Policy, How it decides, Control tower, Presentation, Export, theme. Mobile: tilted flat map by default, territory chips, bottom sheet with snap points, docked command bar. You may reorganise if a better information architecture emerges, keeping the non-negotiables.

## Technology and the fallback ladder
MapLibre GL with a deck.gl overlay (ColumnLayer for towers, ScatterplotLayer and PolygonLayer for discs and lenses, ArcLayer for contested and redirect arcs, IconLayer for stones); three.js or custom layers where they genuinely improve the result. First verify that deck.gl interleaves correctly with MapLibre globe in the installed versions. If not, use a tilted 3D flat map (pitch about 55 degrees) with the same layers and keep the globe for the intro. Ladder: globe, tilted 3D, flat 2D, table. Drop one rung automatically on missing WebGL, on measured frame rate below 30 for 3 seconds, or on small screens. Lazy-load the map. Base tiles from OpenStreetMap-compatible sources (no key); satellite on deep zoom via the Google Maps Embed only if a key exists.

## Performance and accessibility
60 fps target on a mid-range laptop with 500 stones; cap particle effects; efficient layers; no layout thrash. Honour prefers-reduced-motion (flights become cuts and fades). Keyboard path for everything: arrow keys move between stones, Enter opens the detail panel, "/" focuses the command bar, Esc closes. Visible focus rings. The table view is the default for screen readers. Every animation answers an action or marks a single orchestrated moment; no idle motion beyond a very slow ambient light drift that stops in reduced-motion mode.

## Copy
Plain verbs, active voice, sentence case. Name things by what the user does: "Hold: needs one detail" not "Triage". Errors say what happened and what to do. Empty states invite an action ("Drop an Excel file here, or try the sample data").
