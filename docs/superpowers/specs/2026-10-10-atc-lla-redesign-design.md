# atc: LiveLoveApp Redesign

Date: 2026-10-10
Status: design approved in conversation (brainstorm with visual companion)
Builds on: `2026-10-09-atc-flagship-demo-design.md`

## Goal

Make atc look and feel like a LiveLoveApp product, modern and snappy, with a
simple "ATC" lettermark. Deploy only the Angular app for now.

Success: a first-time visitor sees a polished LLA product (not a template
demo); input, answers and the map feel instant; nothing breaks the LLA
design rules.

## Brand source

The LLA revision-3 brand (`~/repos/liveloveapp/.claude/worktrees/lla-brand-website-redesign-5ce9b0`,
`docs/design-rules.md`) and B4 navlog's LLA shell (`dawn` `examples/navlog/web/app/theme.css`),
which applied the same brand to a Leaflet map app.

## Decisions

| Topic | Decision |
| --- | --- |
| Logo | Monoline lettermark: A drawn as the LLA peak (no crossbar), T, and C as an open arc; one stroke weight, round caps and joins, one colour. Header lockup: mark + "built with Hashbrown" in muted 12px. Favicon: the A peak in white on an ink tile, corner radius 22%. |
| Layout | Two-panel workbench (navlog): `#f4f4f5` canvas, 12px gutter; chat panel left (≈ 400px, min 360px), map panel right; both white with a 1px border and 14px radius; the window never scrolls, panels do. |
| Phones (< 768px) | Map full screen; chat becomes a bottom sheet with a peek height and a drag handle; 44px tap targets. |
| Plane markers | Ink silhouettes; cobalt when highlighted or selected; dimmed when filtered out; highlighted or selected planes get a white pill data tag with callsign and altitude (mono, tabular). Hover shows the tag for any plane. |
| Framework | Remove the Angular/React switcher from both apps. Vercel output keeps the `/angular` and `/react` paths but ships only Angular; `/` serves Angular. React stays in the repo (tests, e2e) and inherits the shared visual system. |

## Visual system (shared `atc.css`)

Tokens as CSS custom properties:

- Colour: canvas `#f4f4f5`, surface `#ffffff`, border `#e4e4e7`, ink `#0d0d0d`,
  muted `#52525b`, map background `#e8e8e8`, accent cobalt `#002fa7` (highlight,
  selection, focus ring only). No other hues; "Data delayed" is a muted chip.
- Type: Hanken Grotesk 400/500/600/700 for everything; JetBrains Mono with
  `font-variant-numeric: tabular-nums` for every figure. Loaded from Google
  Fonts with `display=swap`. Sentence case only; negative tracking only.
- Shape: panel radius 14px, row/card radius 10px, pills 999px, 1px borders, no
  shadows, gradients, glass or glows.
- Motion: `--atc-ease: cubic-bezier(0.22, 1, 0.36, 1)`, 150–200ms. Complete
  static state under `prefers-reduced-motion`.
- Focus: `outline: 2px solid var(--atc-accent); outline-offset: 2px`.
- Map: `.leaflet-tile-pane { filter: grayscale(1) contrast(0.92) brightness(1.04) }`,
  map background `#e8e8e8`, zoom control and attribution as white bordered pills
  bottom-right.

A `design-rules.test.ts` in `atc-shared` scans atc's CSS and component
templates and fails on `uppercase`, positive letter-spacing, `gradient`,
`box-shadow`, `drop-shadow`, `backdrop-filter`, dark-mode media queries and
fonts other than Hanken Grotesk and JetBrains Mono (comments stripped first).

## Chat panel

- Header row (56px, bottom border): lettermark, "built with Hashbrown", and a
  status chip on the right: `● Live · 312 aircraft`, `Data delayed`, or
  `Connecting…`.
- Empty state: one 20px/600 sentence ("Ask about the planes over the Pacific
  Northwest.") and the four starter prompts as pills.
- User messages: ink bubbles, right-aligned.
- Tool progress: while a browser tool runs, a small grey chip shows its name
  and a short argument summary (for example `findAircraft · approaching SEA`)
  with a spinner; it settles into a static chip when done.
- Prose streams with Magic Text and a caret.
- Cards (FlightCard, ArrivalsBoard, AircraftCompare): 10px radius, 1px border,
  callsign 15px/650, mono tabular figures, muted secondary text. The hold-back
  fallback is a quiet "Identifying aircraft…" skeleton.
- Composer: a pill with a round ink send button; `/` focuses it from anywhere;
  the message appears immediately on Enter and the composer keeps focus.
- Errors: inline muted card with a Retry pill (behaviour unchanged).

The core files stay ≤150 lines; presentational pieces (header, empty state,
tool chip, composer) move into small components.

## Testing

- Shared: design-rules test; view-model tests for new chip and tag text.
- Angular and React: component tests for the header status chip, empty state,
  tool chip and composer shortcut.
- e2e: `/` focuses the composer; a tool chip appears during a tool call; the
  switcher is gone; existing scenarios still pass.
- Manual: browser check at desktop (1440×900) and phone (375×812) widths.

## Out of scope

Dark mode, a React deployment, and new assistant features.
