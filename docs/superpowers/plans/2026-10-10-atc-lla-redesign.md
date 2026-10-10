# atc LiveLoveApp Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle atc in the LiveLoveApp brand with an ATC lettermark, a two-panel workbench layout, data-tag plane markers, snappy chat feedback, and an Angular-only deploy.

**Architecture:** Brand tokens and component styles live in the shared `examples/atc/shared/src/styles/atc.css`; the lettermark and marker tags live in shared code; each framework gets thin presentational components so the core files stay ≤150 lines; the Vercel build ships only Angular while keeping both paths.

**Tech Stack:** Angular 22, React 19, Leaflet 1.9.4, Vitest, Playwright, Vercel Build Output API.

**Spec:** `docs/superpowers/specs/2026-10-10-atc-lla-redesign-design.md`

## Global Constraints

- LLA rules: colours only canvas `#f4f4f5`, surface `#ffffff`, border `#e4e4e7`, ink `#0d0d0d`, muted `#52525b`, map background `#e8e8e8`, accent cobalt `#002fa7` (highlight, selection, focus only). No shadows, gradients, glass, glows, uppercase or positive letter-spacing. Sentence case. Hanken Grotesk + JetBrains Mono only (Google Fonts, `display=swap`).
- Radii: panel 14px, card/row 10px, pills 999px. Motion `cubic-bezier(0.22, 1, 0.36, 1)` at 150–200ms; full static state under `prefers-reduced-motion`.
- Core files ≤150 lines: `examples/atc/react/src/assistant.tsx`, `examples/atc/angular/src/app/assistant.ts`.
- Public Hashbrown APIs only; no new dependencies.
- AGENTS.md test style: top-level `test(...)` only, arrange/act/assert, no `describe`/`beforeEach`/`afterEach`. TSDoc on exports.
- React and Angular keep the same DOM hooks (`data-testid`, `data-hex`, `data-status`) used by `examples/atc/e2e`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push or deploy.

## Review Focus

1. Narrow windows between 768px and 1024px: the workbench must not overflow; the chat panel keeps ≥ 360px or the layout switches to the phone sheet.
2. Data tags on many highlighted planes (an ArrivalsBoard with 10 rows): tags must not make the map unreadable; they follow tweened positions.
3. `/` shortcut must not fire while typing in the composer or any input.
4. Tool chip with tool calls that fail or finish out of order: chip state must settle, never spin forever.
5. Reduced motion: no spinner rotation, no glide, no dim transition; everything still readable.

---

### Task 1: Visual system, fonts and design-rules test

**Files:** Modify `examples/atc/shared/src/styles/atc.css`; Modify `examples/atc/angular/src/index.html`, `examples/atc/react/index.html` (Google Fonts links + favicon link placeholder handled in Task 2); Create `examples/atc/shared/src/design-rules.test.ts`.

- [ ] Write `design-rules.test.ts` first (it should fail against today's CSS where it uses `box-shadow`/other banned patterns, or pass if none — record which). It reads every `.css` under `examples/atc/shared/src/styles`, every Angular component `.ts` (inline templates/styles) under `examples/atc/angular/src`, and every `.tsx` under `examples/atc/react/src`, strips comments, and fails on: `text-transform: uppercase`, `uppercase` class, positive `letter-spacing`, `gradient(`, `box-shadow`, `drop-shadow`, `backdrop-filter`, `prefers-color-scheme: dark`, and any `font-family` naming a font other than Hanken Grotesk, JetBrains Mono or generic families.
- [ ] Rewrite `atc.css` around custom properties (`--atc-canvas`, `--atc-surface`, `--atc-border`, `--atc-ink`, `--atc-muted`, `--atc-map`, `--atc-accent`, `--atc-radius`, `--atc-radius-row`, `--atc-gutter: 12px`, `--atc-ease`, `--atc-fast: 150ms`, `--atc-motion: 200ms`, `--atc-font`, `--atc-mono`). Keep every class the apps and map already use, restyled. Add: tile filter, map background, Leaflet zoom/attribution pills, focus ring, base type (body 15px Hanken, `-webkit-font-smoothing: antialiased`), mono tabular figures helper.
- [ ] Add Google Fonts `<link rel="preconnect">` + stylesheet for Hanken Grotesk 400;500;600;700 and JetBrains Mono 400;500 with `display=swap` to both `index.html` files.
- [ ] `npx nx test atc-shared && npx nx build atc-angular && npx nx build atc-react`, commit `feat(atc): LiveLoveApp visual system and design rules`.

### Task 2: ATC lettermark and favicon

**Files:** Create `examples/atc/shared/src/brand/atc-mark.ts` (exports SVG path data and dimensions), `examples/atc/shared/public/brand/atc-favicon.svg`; Angular `src/app/atc-logo.ts`; React `src/atc-logo.tsx`; both `index.html` favicon links; Angular project.json/React vite config if assets need wiring (shared/public is no longer served after replay removal — re-add an assets/publicDir mapping only for `brand/`).

- [ ] Geometry (viewBox `0 0 250 80`, stroke width 10, round caps and joins, `fill="none"`, `stroke="currentColor"`): A `M8 72 L40 8 L72 72`; T `M92 8 H148 M120 8 V72`; C `M232 20 A32 32 0 1 0 232 60`. Export as `ATC_MARK = { viewBox, strokeWidth, paths }` with a unit test asserting the three paths and viewBox.
- [ ] `AtcLogo` component in each framework renders an inline SVG from `ATC_MARK` with `role="img"` and `aria-label="ATC"`, sized by a `height` input/prop (default 18).
- [ ] Favicon: 64×64 SVG, ink `#0d0d0d` rounded square (rx 14), white A peak stroke. Link it from both `index.html` files.
- [ ] Component tests (render, aria-label). Commit `feat(atc): ATC lettermark and favicon`.

### Task 3: Map markers with data tags

**Files:** Modify `examples/atc/shared/src/map/airspace-map.ts` (+ tests), `atc.css`.

- [ ] Pure helper `planeTagText(aircraft): string` → `"ASA123 · 4,200"` (callsign, altitude in hundreds formatted with thousands separator, or `"GND"`/`"—"`), tested.
- [ ] Highlighted or selected planes render a white pill tag next to the silhouette (inside the marker icon HTML so it moves with the glide); hover shows the tag for any plane (CSS `:hover`). Tag text is from validated data only (no injection). Highlighted/selected silhouettes are cobalt; dimmed planes keep the existing opacity rule with a 200ms transition (none under reduced motion).
- [ ] Keep `data-hex`/classes used by e2e. Unit tests for the class/tag logic; run `npx nx test atc-shared` and `npx nx e2e atc-e2e`. Commit `feat(atc): data tags on highlighted planes`.

### Task 4: Angular workbench shell

**Files:** Modify `examples/atc/angular/src/app/app.ts`, `assistant.ts`, `feed-badge.ts`; Create small presentational components as needed (`atc-panel-header.ts`, `empty-state.ts`, `tool-chip.ts`, `composer.ts`); update `components.spec.ts` or add specs.

- [ ] Layout B: canvas grid with 12px gutter; chat panel left (`minmax(360px, 400px)`), map panel right; both bordered 14px panels; window never scrolls; panel bodies scroll.
- [ ] Remove the framework switcher. Header row: `AtcLogo`, "built with Hashbrown", status chip on the right (`● Live · N aircraft` from store aircraft count, `Data delayed`, `Connecting…`).
- [ ] Empty state: "Ask about the planes over the Pacific Northwest." + starter pills.
- [ ] Tool chip: for the in-flight assistant message, show one chip per tool call with name + short argument summary from a shared pure helper `toolCallLabel(name, args)` (add to `shared/src/views.ts` with tests: findAircraft → filters summary such as `approaching SEA` / `sorted by altitude`; lookupRoute → callsign; highlightAircraft → `3 aircraft`; followAircraft → hex/callsign; others → name). Spinner while running, static when done; inspect Hashbrown's Angular message/tool-call types to read status (public API only). Must settle on error.
- [ ] Composer pill: round ink send button; `/` focuses it unless focus is already in an input/textarea/contenteditable; Enter sends; input clears and keeps focus.
- [ ] Keep `assistant.ts` ≤150 lines. Component specs for header chip, empty state, tool chip, `/` shortcut. Run `npx nx build atc-angular && npx nx test atc-angular && npx nx lint atc-angular`. Commit `feat(atc): Angular workbench shell`.

### Task 5: Phone layout (Angular)

**Files:** `atc.css`, Angular shell components.

- [ ] Below 768px: map full screen, chat as a bottom sheet with a peek height (header + composer visible) and a drag handle (pointer + keyboard toggle), 44px tap targets. No scroll of the window. Reduced motion: sheet snaps without animation.
- [ ] Verify in the browser at 375×812 and 1440×900. Commit `feat(atc): phone bottom sheet`.

### Task 6: React parity

**Files:** React `app.tsx`, `assistant.tsx`, `feed-badge.tsx`, new presentational components mirroring Task 4/5, tests.

- [ ] Mirror Tasks 4–5 in React (same DOM structure and classes, same hooks/test ids), remove the switcher, keep `assistant.tsx` ≤150 lines, component tests. Run React build/test/lint. Commit `feat(atc): React workbench shell parity`.

### Task 7: Angular-only deploy, docs and e2e

**Files:** `examples/atc/tools/build-vercel-output.mts`, `examples/atc/README.md`, `www/content/docs/{angular,react}/start/sample.md`, `examples/atc/e2e/src/atc.spec.ts`.

- [ ] Vercel output ships only `static/angular`; routes keep `/angular` (and its no-slash redirect) and serve Angular at `/` (rewrite `/` → `/angular/index.html` or redirect `/` → `/angular/`; prefer serving Angular at `/angular/` with `/` → 307 `/angular/` as today); `/react` returns 404. Rebuild and inspect `config.json`.
- [ ] Docs: React sample page says the React version runs locally and is not hosted yet; README hosting section updated.
- [ ] e2e: assert no framework switcher, `/` focuses the composer, a tool chip appears during a tool call (both frameworks). Run `npx nx e2e atc-e2e` twice. Commit `feat(atc): deploy Angular only; e2e for the new shell`.

### Task 8: Final verification

- [ ] `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-react atc-angular atc-e2e atc www` and `npx nx e2e atc-e2e`.
- [ ] Browser check of the running Angular app at 1440×900 and 375×812 against the spec; core-file line counts; `grep` for `ɵ` and banned styles.
