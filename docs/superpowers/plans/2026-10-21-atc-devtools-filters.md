# atc dev tool drawer and filter starters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every technical panel into a developer drawer opened from a thin left rail,
and give the empty state four filter starters, four question starters, and refinement
suggestions in the chat panel.

**Architecture:**
- The existing view models in `shared/src/stream-view.ts` stay; a new framework-free
  `shared/src/dev-tool.ts` turns them into tabs for one selected send.
- Both apps replace "Show the stream" (the switch, `ShowStream`, and the panels under
  answers, under the pill and in tool chips) with a rail toggle and a resizable drawer
  under the map.
- Starters and refinements are shared, pure data/functions; the apps render them.

**Tech Stack:** TypeScript, React 19, Angular (signals, standalone), Leaflet, Vitest,
Playwright, Nx.

**Spec:** `docs/superpowers/specs/2026-10-21-atc-devtools-filters-us-traffic-design.md`
(parts 1 and 2; the US-wide traffic section is deferred and out of scope).

All paths below are relative to `examples/atc/` unless they start with `docs/` or `www/`.

## Global Constraints

- Tests are written failing first. Use top-level `test(...)` only, with arrange/act/assert
  separated by blank lines.
- Add TSDoc to new reusable exports. No new npm dependencies.
- Shared code stays framework-free. The React and Angular apps mirror each other.
- atc invariants (`examples/atc/AGENTS.md`):
  - the map moves only through store view requests;
  - untrusted text is rendered as text, never innerHTML.
- Design rules (`shared/src/design-rules.test.ts`):
  - no uppercase, gradients, shadows or dark-scheme blocks;
  - no em or en dashes in shared `.ts` or styles;
  - new partials are added to `shared/src/styles/atc.css` in cascade order.
- Dev mode is off by default, remembered in localStorage, and wrapped in try/catch.
- The drawer only reports; nothing in it changes app state.
- When dev mode is off, there is no technical UI anywhere.
- Drawer height defaults to about 35% of the map column, clamped between 160 px and 60% of
  the column, and is remembered.
- Starters, verbatim, in this order:
  - **Filters:**
    - "Only jets below 10,000 ft"
    - "Alaska Airlines near Seattle"
    - "Only helicopters"
    - "Arrivals into Portland"
  - **Questions:**
    - "What's the highest plane right now? And the fastest?"
    - "Follow the fastest airliner."
    - "What's flying near Bend?"
    - "Show me Redmond airport."
- Refinements: at most 2, in the chat panel above the composer, shown only while a map
  filter is applied. Clicking one goes straight to the filter route and adds nothing to the
  transcript.
- Each PR is run locally for the maintainer before it is opened (the controller does this).

## Review Focus

1. **Dev mode off after being on:** no stream panel, JSON block or raw tool-call
   arguments are left anywhere in the DOM. Tasks 3 and 4 assert this per app.
2. **Clicking an earlier answer while a newer one streams:** the drawer shows the clicked
   send's router, cards and UI JSON, not the streaming one's, until "Latest" is clicked
   (Task 1 `selectSend`, plus app tests).
3. **Drawer resize on a short window:** the drawer can't push the map below a usable
   height. The 60% clamp holds when the window is resized after the height was stored
   (Task 1 `clampDrawerHeight`, re-applied on resize).
4. **Refinement on a filter that already has that clause:** no suggestion repeats a
   clause the filter has. A refinement for an airline is offered only when an airline is
   common among the matches (Task 6).
5. **Storage throwing or holding garbage** (private mode, a stale `atc.showStream` key):
   the app renders with dev mode off and the default drawer height (Task 1).

---

## PR A: the dev tool drawer

### Task 1: The dev tool view model

**Files:**
- Create: `shared/src/dev-tool.ts`, `shared/src/dev-tool.test.ts`
- Modify: `shared/src/index.ts` (export), `shared/src/stream-view.ts` (remove
  `SHOW_STREAM_KEY`, `readShowStream`, `writeShowStream`; keep `browserStorage` and the
  view models)

**Interfaces:**
- **Consumes** (from `stream-view.ts`):
  - `routerBlock`, `cardsBlock`, `jsonBlock`, `toolBlocks`, `filterBlocks`
  - `TurnShown`, `RouterShown`, `StreamBlock`, `StreamToolCall`
  - `ShowStreamStorage`, renamed to `DevStorage`
- **Produces:**
  - `DEV_MODE_KEY = 'atc.devMode'` and `DRAWER_HEIGHT_KEY = 'atc.drawerHeight'`.
  - `readDevMode(storage: DevStorage | null): boolean`. Defaults to `false`, and returns
    `false` if storage throws.
  - `writeDevMode(storage, on): void`.
  - `readDrawerHeight(storage): number | null` and `writeDrawerHeight(storage, px): void`.
  - `clampDrawerHeight(px: number | null, columnPx: number): number`.
    - `null` gives `round(0.35 * columnPx)`.
    - The result is clamped between `min(160, columnPx)` and `round(0.6 * columnPx)`.
  - `type DevTabId = 'router' | 'cards' | 'filter' | 'ui' | 'tools'`.
  - `DEV_TABS: readonly { id: DevTabId; label: string }[]`, with the labels "Router",
    "Cards", "Filter", "UI stream", "Tools".
  - `interface DevSelection { readonly follow: boolean; readonly index: number | null }`.
    `follow: true` means the newest send.
  - `selectSend(index: number): DevSelection`, `followLatest(): DevSelection`, and
    `selectedTurn(turns: readonly TurnShown[], selection: DevSelection): number | null`.
  - `devTabBlocks(tab: DevTabId, input: DevToolInput): StreamBlock[]`, where
    `DevToolInput` is:
    ```ts
    {
      typing: RouterShown | null;
      turn: TurnShown | undefined;
      answer: { content: unknown; streaming: boolean } | null;
      tools: readonly StreamToolCall[];
      filter: {
        router: RouterShown | null;
        output: unknown;
        streaming: boolean;
        applied: unknown;
      } | null;
    }
    ```
    - **router:** the typing block is labelled "typing", then the turn's router block.
    - **cards:** `cardsBlock(turn?.cards)`.
    - **filter:** `filterBlocks(...)`, then the applied filter as a json block, or one
      "no filter" block.
    - **ui:** a json block of the answer content.
    - **tools:** `toolBlocks`, or one "no tool calls" block.

- [ ] **Step 1: Write the failing tests** in `shared/src/dev-tool.test.ts`:
  - `test('dev mode is off by default and survives a throwing storage')`
  - `test('an old atc.showStream value does not turn dev mode on')`
  - `test('clampDrawerHeight defaults to 35% and clamps to 160 px and 60%')`. For
    example, with `columnPx` 800:
    - `null` → 280
    - 100 → 160
    - 700 → 480
    - with `columnPx` 200, 500 → 120
  - `test('selection follows the newest send until an earlier one is selected')`
  - `test('a selected send is kept while a newer one streams')` (Review Focus 2)
  - `test('each tab lists its blocks in order')`, one assertion group per `DevTabId`
  - `test('empty tabs say so instead of rendering nothing')`
- [ ] **Step 2:** Run `npx nx test atc-shared -- src/dev-tool.test.ts`. Expect it to FAIL
  because the module is missing.
- [ ] **Step 3: Implement.** Move the storage helpers out of `stream-view.ts`. Then update
  `stream-view.test.ts` and every importer of the removed names. The app files that use
  them are rewritten in Tasks 3 and 4, so leave temporary imports compiling, or stub them
  and note it in the report.
- [ ] **Step 4:** Run `npx nx test atc-shared` and `npx nx lint atc-shared`. Expect PASS.
- [ ] **Step 5: Commit:** `feat(atc): dev tool view model`

### Task 2: Rail and drawer styles

**Files:**
- Create: `shared/src/styles/rail.css` and `shared/src/styles/dev-drawer.css`.
- Delete: `shared/src/styles/stream-panel.css`.
- Modify:
  - `shared/src/styles/shell.css`: the workbench grid gains a rail column, so it reads
    `grid-template-columns: <rail> minmax(360px, 400px) minmax(0, 1fr)`. The map panel
    becomes a column with the map above the drawer.
  - `shared/src/styles/sheet.css`: on phones, hide the rail. The drawer becomes a
    full-width sheet over the map with its own close button.
  - `shared/src/styles/atc.css`: replace the stream-panel partial with the rail and
    dev-drawer partials, in cascade order.

**Interfaces:**
- **Produces class names**, which Tasks 3 and 4 use verbatim:
  - Rail: `.atc-rail`, `.atc-rail-button`, `.atc-rail-button[aria-pressed="true"]`.
  - Drawer: `.atc-dev-drawer`, `.atc-dev-resize` (the drag handle), `.atc-dev-tabs`,
    `.atc-dev-tab[aria-selected="true"]`, `.atc-dev-body`, `.atc-dev-block`,
    `.atc-dev-latest`, `.atc-dev-close` (phone only).
  - Header and map column: `.atc-header-dev` (the header icon button on phones) and
    `.atc-map-column`.
- **Drawer look:** dark (`--atc-ink` background, `--atc-surface` text) in the mono font.
  - No shadow and no gradient.
  - The drawer body scrolls; the page never scrolls sideways at 320 px.
  - The drawer height comes from a custom property, `--atc-drawer-height`, that the apps
    set.

- [ ] **Step 1: Write a failing test.** Extend `shared/src/design-rules.test.ts`, or the
  existing style tests that list partials, so the new partials are required in `atc.css`
  and `stream-panel.css` is gone.
- [ ] **Step 2:** Run it and expect FAIL.
- [ ] **Step 3: Write the CSS.**
- [ ] **Step 4:** Run `npx nx test atc-shared`. Expect PASS, including the design rules.
- [ ] **Step 5: Commit:** `feat(atc): rail and dev drawer styles`

### Task 3: The drawer in React

**Files:**
- Create:
  - `react/src/rail.tsx`
  - `react/src/dev-drawer.tsx`
  - `react/src/dev-mode.tsx`, which replaces `react/src/show-stream.tsx` and provides
    `{ on, toggle }` and the selection
  - `react/src/dev-drawer.test.tsx`
- Delete: `react/src/show-stream.tsx` and `react/src/stream-panel.tsx`.
- Modify:
  - `react/src/app.tsx`: the rail, the map column with the drawer, the dev-mode state, and
    removal of the filter stream panel.
  - `react/src/panel-header.tsx`: remove the switch, and add the phone icon button
    `.atc-header-dev` with an accessible name of "Developer tools".
  - `react/src/transcript.tsx`: remove the answer panels. While dev mode is on, clicking
    an answer calls `selectSend(index)`.
  - `react/src/tool-chips.tsx`: remove the argument panels.
  - The tests that referenced the switch: `react/src/assistant.test.tsx` and
    `react/src/shell.test.tsx`.

**Interfaces:**
- **Consumes:** everything Task 1 produces, plus the existing router, filter, narrowed
  chat and turns state that `app.tsx` and `assistant.tsx` already hold. Feed the drawer the
  same data the panels used.
- **Produces:**
  - DOM contracts: the rail button `data-testid="dev-toggle"` and the drawer
    `data-testid="dev-drawer"`.
  - Tabs with `role="tab"`, and the "Latest" button.
  - Dev mode is on when `aria-pressed="true"`.

- [ ] **Step 1: Write the failing tests** in `react/src/dev-drawer.test.tsx`:
  - `test('the rail toggles the drawer and remembers it')`
  - `test('with dev mode off there is no technical UI')`. Assert that no `.atc-dev-*`,
    `.atc-stream*`, JSON text or tool arguments appear anywhere in the app after toggling
    on and then off (Review Focus 1).
  - `test('the drawer follows the newest send and keeps a clicked earlier answer')`
    (Review Focus 2)
  - `test('dragging the handle resizes within the clamp and is remembered')`
  - `test('JSON renders as text')`, using a `<b>` inside the content.
  - `test('the drawer is aria-live off')`
- [ ] **Step 2:** Run `npx nx test atc-react`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - Use pointer events on `.atc-dev-resize` and clamp with `clampDrawerHeight`, using the
    map column height measured on each drag.
  - Re-clamp on window resize (Review Focus 3).
  - Write the height on pointer up.
  - Leaflet needs `map.invalidateSize()` when the drawer opens, closes or resizes. Find
    the existing map handle and call it.
- [ ] **Step 4:** Run `npx nx run-many -t test,lint,build -p atc-react`. Expect PASS.
- [ ] **Step 5: Commit:** `feat(atc): dev tool drawer in React`

### Task 4: The drawer in Angular

**Files:** mirror Task 3.
- Create:
  - `angular/src/app/rail.ts`
  - `angular/src/app/dev-drawer.ts`
  - `angular/src/app/dev-mode.ts` (a service that replaces `show-stream.ts`)
  - `angular/src/app/dev-drawer.spec.ts`
- Delete: `angular/src/app/show-stream.ts` and `angular/src/app/stream-panel.ts`.
- Modify:
  - `angular/src/app/app.ts`
  - `angular/src/app/panel-header.ts`
  - `angular/src/app/transcript.ts`
  - `angular/src/app/tool-chips.ts`
  - `angular/src/app/shell.spec.ts`

**Interfaces:** the same DOM contracts as Task 3. Use signals, `input()` and `output()`,
and `host` metadata.

- [ ] **Step 1:** Write the same six tests as Task 3, in `dev-drawer.spec.ts`.
- [ ] **Step 2:** Run `npx nx test atc-angular`. Expect FAIL.
- [ ] **Step 3:** Implement, mirroring React.
- [ ] **Step 4:** Run `npx nx run-many -t test,lint,build -p atc-angular`. Expect PASS.
- [ ] **Step 5: Commit:** `feat(atc): dev tool drawer in Angular`

### Task 5: e2e and docs for the drawer

**Files:**
- Modify:
  - `e2e/src/atc.spec.ts`: replace the "Show the stream" cases and the `atc.showStream`
    init script. Dev mode is off by default, so existing tests need no seeding.
  - `README.md` and `AGENTS.md`: file map, the drawer, and remove "Show the stream".
  - `e2e/demo/storyboard.ts`: any beat that showed the stream.
  - `www/content/blog/2026-10-10-building-atc.md`: only if the dated note mentions
    "Show the stream". Change that wording to the dev tool.

- [ ] **Step 1: Write the failing e2e cases**, for both projects:
  - `test('the dev tool opens from the rail, shows each tab, and is remembered')`
  - `test('with dev mode off the map and transcript have no technical panels')`
  - `test('at 375 px the header button opens the drawer as a sheet and closes it')`
- [ ] **Step 2:** Run `npx nx e2e atc-e2e`. Expect the new cases to FAIL.
- [ ] **Step 3:** Update the docs and the storyboard.
- [ ] **Step 4:** Run these and expect all PASS:
  - `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc`
  - `npx nx e2e atc-e2e`
  - `npx nx typecheck atc-e2e`
  - `npx nx test atc-e2e`
- [ ] **Step 5: Commit:** `test(atc): e2e and docs for the dev tool`

---

## PR B: filter starters and refinements

### Task 6: Starters and the refinement rules

**Files:**
- Modify:
  - `shared/src/contracts.ts`: `STARTER_PROMPTS` takes the exact eight starters above,
    filters first. Add `FILTER_SYSTEM_PROMPT` mapping "helicopters" to `kind: rotor`.
    `starterPrompts` keeps `SELECTED_PROMPT` first when a plane is selected.
  - `shared/src/contracts.test.ts`
- Create: `shared/src/refinements.ts` and `shared/src/refinements.test.ts`.

**Interfaces:**
- **Consumes:**
  - `AppliedMapFilter` and `MapFilter` from `store.ts` and `find-aircraft.ts`
  - `matchesResolved`
  - `Aircraft`
  - airline names from `shared/src/names.ts`
- **Produces:**
  - `interface Refinement { readonly text: string }`, where `text` is what's sent to the
    filter route and shown on the button.
  - `refinements(applied: AppliedMapFilter | null, aircraft: readonly Aircraft[]): readonly Refinement[]`
    - It returns at most 2 and is deterministic.
    - It returns `[]` when `applied` is null.
    - Rules, in priority order:
      1. No altitude clause: "Below 5,000 ft".
      2. No airline clause, and one airline operates at least 40% of the matching
         aircraft (with at least 3 matches): "Only <airline name>".
      3. A `near` clause with a radius over 10: "Within 10 nm".
      4. No kind clause: "Only jets".
    - Never suggest a clause the filter already has (Review Focus 4).

- [ ] **Step 1: Write the failing tests:**
  - `test('starters are four filters then four questions, verbatim')`
  - `test('no refinements without a filter')`
  - `test('refinements follow the rules in order and never repeat a clause')`
  - `test('an airline is suggested only when it is common among the matches')`
- [ ] **Step 2:** Run `npx nx test atc-shared`. Expect FAIL.
- [ ] **Step 3: Implement.** Check `shared/src/kinds.ts` for the rotor kind name, and
  check how the filter schema spells altitude and radius fields.
- [ ] **Step 4:** Run `npx nx test atc-shared` and `npx nx lint atc-shared`. Expect PASS.
- [ ] **Step 5: Commit:** `feat(atc): filter starters and refinement rules`

### Task 7: Grouped starters and refinements in both apps

**Files:**
- Modify:
  - `react/src/empty-state.tsx`: show two groups, labelled "Filter the map" and "Ask a
    question" (sentence case).
  - `react/src/assistant.tsx`: the refinement row above the composer.
  - `angular/src/app/empty-state.ts` and `angular/src/app/assistant.ts`: the same.
  - `shared/src/styles/chat.css`: `.atc-refinements` and `.atc-refinement`.
  - The app tests: `react/src/shell.test.tsx`, `react/src/assistant.test.tsx`,
    `angular/src/app/shell.spec.ts` and `angular/src/app/assistant.spec.ts`.

**Interfaces:**
- **Consumes:**
  - `refinements` (Task 6)
  - the store's `mapFilter` and `aircraft`
  - `useMapFilter().apply` / `injectMapFilter().apply`
- **Produces:** DOM contracts, `data-testid="refinements"` and buttons with
  `role="button"` whose text equals `Refinement.text`.

- [ ] **Step 1: Write the failing tests** (both apps):
  - `test('starters are grouped as filters and questions')`
  - `test('a refinement appears once a filter is applied and refines it without a transcript entry')`.
    Assert `apply` was called with the refinement text, no chat request was made, and the
    transcript is still empty.
  - `test('refinements disappear when the filter is cleared')`
- [ ] **Step 2:** Run `npx nx test atc-react` and `npx nx test atc-angular`. Expect FAIL.
- [ ] **Step 3: Implement.** Derive the refinements during render (React `useMemo`,
  Angular `computed`). Don't store them in state.
- [ ] **Step 4:** Run `npx nx run-many -t test,lint,build -p atc-react atc-angular atc-shared`.
  Expect PASS, including the design rules.
- [ ] **Step 5: Commit:** `feat(atc): grouped starters and filter refinements`

### Task 8: e2e, evals, demo and docs for the starters

**Files:**
- Modify:
  - `e2e/src/model.ts`: `PROMPTS` follow the new starter indices. Script `/api/filter`
    turns for the new filter starters ("Alaska Airlines near Seattle", "Only
    helicopters", "Arrivals into Portland") and for a refinement ("Below 5,000 ft").
  - `e2e/src/stubs.ts`: `scriptedCards` must no longer depend on the removed
    Seattle-arrivals starter. Route the new texts.
  - `e2e/src/atc.spec.ts`: update the cases that used the removed starters, and add the
    new cases.
  - `e2e/demo/storyboard.ts` and `e2e/demo/record.ts`: replace beats that used the
    removed starters.
  - `e2e/decide/probes.ts`: keep the removed phrasings as typed probes, and add the new
    starters with their routes.
  - `e2e/prose/*`, if any check names the removed starters.
  - `README.md` and `AGENTS.md`: list the starters.

- [ ] **Step 1: Write the failing e2e cases**, for both projects:
  - `test('each filter starter streams chips without a transcript entry')`
  - `test('a refinement adds a chip and keeps the existing ones')`
- [ ] **Step 2:** Run `npx nx e2e atc-e2e`. Expect FAIL.
- [ ] **Step 3:** Update the scripts, stubs, demo, probes and docs.
- [ ] **Step 4:** Run these and expect all PASS:
  - `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc`
  - `npx nx e2e atc-e2e`
  - `npx nx typecheck atc-e2e`
  - `npx nx test atc-e2e`
  - `npx nx demo atc-e2e`: run once and report whether it recorded. Do not publish.

  Live checks, only if keys are available (load `/Users/blove/repos/hashbrown/.env`
  without printing it): `npx nx decide-eval atc-e2e` and `npx nx prose-eval atc-e2e`, once
  each. Report the results.
- [ ] **Step 5: Commit:** `test(atc): e2e, evals and docs for the new starters`
