# atc: Decide, Filter, Generate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make atc teach decide / structured output / generate. It adds a Jev router in the single composer, a structured-output map filter held in app state, an assistant narrowed with UI selection, and a "Show the stream" switch. Before any of that, a Hashbrown change adds non-selectable UI kits.

**Architecture:**
- **Hashbrown (PR 1).** UI kits gain one `selectable` flag. Chat-mode UI selection and `createSelectionSchema` skip non-selectable members and always send them.
- **atc shared code (framework-free).** It owns:
  - the filter fields;
  - the filter predicate;
  - `AtcState.mapFilter`;
  - the router schema and the card groups;
  - the view models for chips and the stream panels.
- **atc apps.** The Angular and React apps stay thin mirrors.
- **atc server.** It pins every model route: `/api/run`, plus the new `/api/filter` (OpenAI) and `/api/decide` (TypeSafe Jev).

**Tech Stack:** TypeScript, Nx, Skillet (`s`), Hashbrown core/react/angular/typesafe/openai, Leaflet, Jest (core), Vitest (react, angular, atc), Playwright and aimock (atc-e2e).

**Spec:** `docs/superpowers/specs/2026-10-20-atc-decisions-showcase-design.md`

## Global Constraints

- **Tests:** written failing first, top-level `test(...)` only, with arrange/act/assert separated by blank lines.
- **Code quality:** TSDoc on new public or reusable code. No new npm dependencies.
- **Architecture:** shared atc code stays framework-free, and the Angular and React apps mirror each other.
- **Core exports:** cross-package internals are exported from core with the `ɵ` prefix. React and Angular public signatures never reference `ɵ` types.
- **atc invariants (`examples/atc/AGENTS.md`):**
  - The map moves only through store view requests, and the newest wins.
  - Markers update in place.
  - Component IDs never stream.
  - Untrusted text is rendered as text.
- **Styling:**
  - `shared/src/design-rules.test.ts` stays green: no uppercase, gradients, shadows or dark scheme, and no em or en dashes in shared `.ts` or styles.
  - Chart colours appear only in `styles/chart.css` and `map/chart/`.
  - New stylesheet partials are added to `shared/src/styles/atc.css` in cascade order.
- **Router:**
  - Confidence threshold 0.7.
  - Debounce about 150 ms.
  - `clear` acts at probability ≥ 0.5, and only when `intent` is `filter`.
  - Enter waits for the router up to about 1 s, then goes to chat.
- **Card selection:** `{ max: 2 }`, over the four cards. Markdown is always sent through the non-selectable `prose` kit.
- **Jev model:** `jev-1.14.0`.
- **Key:** `TYPESAFE_API_KEY`. It's already set on the `hashbrown-atc` Vercel project, and comes from the root `.env` locally. If it's missing, `/api/decide` answers 503, and the client sends to chat with all cards.
- **Server pinning:**
  - `/api/run` accepts narrowed UI schemas only from an allowlist: subsets of the four cards, always including Markdown, in pinned order.
  - `/api/filter` and `/api/decide` pin their own system prompts and schemas.
  - `/api/decide` also pins the decision context per `kind`.
- **"Show the stream":** on by default for a first visit, remembered in localStorage inside try/catch.
- **Plane tags:** another session may work on `shared/src/map/tag-*.ts`. Don't edit those files.

## Review Focus

1. **Half-streamed airport codes.** A code like `"KSE"`, cut off before `"KSEA"`, must never resolve to a different airport. Only complete strings are validated, and anything incomplete shows as a dashed chip. *Test: Task 6.*
2. **Decide unavailable while typing** (503, network error). The badge must go to a neutral "chat" state with no error UI, and Enter must send to chat with all cards. *Test: Task 13.*
3. **A filter that matches no aircraft.** The pill shows the filter, and the map dims everything except pointed-at planes. `findAircraft` returns `{ mapFilter, aircraft: [] }`, so the assistant can say nothing matches. *Test: Task 8.*
4. **A stale route on Enter.** If the text changed after the last decision, Enter must use a decision for the current text, waiting up to about 1 s, and never a decision about older text. *Test: Task 13.*
5. **A filter applied before new traffic arrives.** Aircraft that arrive or move after the filter was applied must dim or undim on the next snapshot, without re-running the model. *Test: Task 7.*

---

## PR 1: Hashbrown, non-selectable UI kits

### Task 1: The `selectable` flag on kits (core)

**Files:**
- Modify: `packages/core/src/ui/ui-kit.ts`: `UiKitOptions` (:22-27), the `UiKit` interface (:32-55), and the `createUiKit` flatten loop (:80-87).
- Modify: `packages/core/src/public_api.ts`, only if a new ɵ export is needed.
- Test: `packages/core/src/ui/ui-kit.spec.ts`

**Interfaces:**
- **Produces:**
  - `UiKitOptions.selectable?: boolean` (default `true`).
  - `UiKit.ɵnonSelectable: ReadonlySet<string>`: the names of the members that a decision must never choose among.
- **Rules:**
  - When `selectable: false`, every flattened member, children included, is non-selectable.
  - A nested kit's `ɵnonSelectable` names carry into the outer kit.
  - If a name appears in both a selectable and a non-selectable kit, non-selectable wins.

- [ ] **Step 1: Write the failing tests**

  - `test('a non-selectable kit marks every member, including children, as non-selectable')`: `expect([...kit.ɵnonSelectable].sort()).toEqual(['Markdown', 'Row', 'Table'])`.
  - `test('a nested non-selectable kit carries into a selectable outer kit')`
  - `test('a name in both a selectable and a non-selectable kit is non-selectable')`
  - `test('kits are selectable by default')`: `expect(kit.ɵnonSelectable.size).toBe(0)`.
  - `test('selectable does not change the schema')`: `serializedSchema` is equal with and without the flag.

- [ ] **Step 2: Run them and confirm they fail**

  Run: `npx nx test core --testPathPatterns=ui-kit.spec`. Expected: FAIL (the property is undefined).

- [ ] **Step 3: Implement** in `createUiKit`. Track the names per input, and union in an inner kit's `ɵnonSelectable`. Give it TSDoc.

- [ ] **Step 4: Run the tests and confirm they pass**

  Run the same command. Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(core): non-selectable UI kits`

### Task 2: Selection respects non-selectable members (core)

**Files:**
- Modify: `packages/core/src/decision/component-selection.ts`: `flattenSelectable` (:61-100), `createComponentSelection` (:125-149), `assertSelectionEntry` (:169) and `toSelectionOptions` (:198-223).
- Modify: `packages/core/src/decision/ui-selection.ts`: the `createSelectionSchema` parameter type (:61-68) and its TSDoc.
- Test: `packages/core/src/decision/component-selection.spec.ts`, `ui-selection.spec.ts` and `ui-chat-decision.spec.ts`.

**Interfaces:**
- **Consumes:** `UiKit.ɵnonSelectable` (Task 1).
- **Produces:**
  - `createComponentSelection(components).options` excludes non-selectable names.
  - `expand(ids)` always includes non-selectable members, keeping declared order.
  - `createSelectionSchema` accepts a new entry kind, `{ components: ReadonlyArray<{ name; description; children? }>; selectable?: boolean }` (a plain group), and skips non-selectable kits and groups.
  - When nothing selectable is left, `ɵcreateUiChatDecision.decide` returns `fallback` (existing path).

- [ ] **Step 1: Write the failing tests**

  - `test('options skip non-selectable kit members')`
  - `test('expand always includes non-selectable members in declared order')`
  - `test('createSelectionSchema skips a non-selectable kit and a non-selectable plain group')`
  - `test('createSelectionSchema plain groups produce the same questions as the equivalent kits')`: compare with `compileDecision(...)` equality.
  - `test('chat decision with only non-selectable components falls back without deciding')`: the fake transport is never called.

- [ ] **Step 2: Run them and confirm they fail**

  Run: `npx nx test core --testPathPatterns="component-selection|ui-selection|ui-chat-decision"`. Expected: FAIL.

- [ ] **Step 3: Implement.** Plain groups go through the same flatten path as kits. Validate them in `assertSelectionEntry`. Errors are `DecisionSchemaError`, naming the index.

- [ ] **Step 4: Run the tests and confirm they pass.**

- [ ] **Step 5: Commit**

  `feat(core): UI selection skips non-selectable kits`

### Task 3: Pass `selectable` through React and Angular, then document it

**Files:**
- Modify: `packages/react/src/hooks/use-ui-kit.tsx`: the options type (:82-87), the `ɵcreateUiKit` call (:111-112), and the memo key (:120), which now includes `selectable`.
- Modify: `packages/angular/src/utils/ui-kit.fn.ts`: the options type (:22-27) and `createUiKit` (:46-50).
- Test: `packages/react/src/hooks/use-ui-kit.spec.tsx`, `packages/react/src/hooks/use-ui-decision.spec.tsx`, `packages/angular/src/utils/ui-kit.fn.spec.ts`, `packages/angular/src/resources/ui-decision-resource.spec.ts`.
- Docs: `www/content/docs/{react,angular}/recipes/ui-kits.md`. Add a section after "Compose Kits": "Always include a kit when narrowing".
- Docs: `www/content/docs/{react,angular}/recipes/ui-selection.md`:
  - Under "Narrowing a Chat", show the `cards` plus `prose` kits.
  - Under "Pinning the Questions on the Server", show plain groups.

**Interfaces:**
- **Produces:** `useUiKit({ components, selectable? })` and `createUiKit({ components, selectable? })`.

- [ ] **Step 1: Write the failing tests** (both frameworks):

  - `test('chat mode never asks about a non-selectable kit')`: the decision's questions contain the cards only.
  - `test('chat mode always sends non-selectable members with the picks')`: the chat request's components are the picks plus Markdown.
  - `test('useUiKit re-creates the kit when selectable changes')`. React only.

- [ ] **Step 2: Run them and confirm they fail.**

  - React: `npx nx test react -- src/hooks/use-ui-decision.spec.tsx`
  - Angular: `npx nx test angular -- src/resources/ui-decision-resource.spec.ts`

- [ ] **Step 3: Implement and write the docs.**

- [ ] **Step 4: Verify** that all of the following pass:

  - `npx nx run-many -t test,build,lint -p core angular`
  - `npx nx run-many -t test,build -p react`
  - `npx nx run react:eslint:lint` (only the existing 5 warnings)
  - `npx nx build-api-report core`, then `react` and `angular`
  - `npx nx run-many -t test,lint,build -p www`

- [ ] **Step 5: Commit**

  `feat: selectable flag on React and Angular UI kits`. Then open PR 1.

---

## PR 2: atc, the map filter as state

All paths are relative to `examples/atc/`. Run a single shared spec with `npx nx test atc-shared -- src/<file>.test.ts`.

### Task 4: One set of filter fields, plus the predicate

**Files:**
- Modify: `shared/src/find-aircraft.ts`:
  - Lines 32-78 become `aircraftFilterFields`, `findAircraftInput` and `mapFilterSchema`.
  - Lines 194-252 are split into `resolveFilter` and `matchesResolved`.
- Test: `shared/src/find-aircraft.test.ts`

**Interfaces:**
- **Produces:**
  - `aircraftFilterFields`: the shape object holding the eight fields, which stay unchanged.
  - `findAircraftInput = s.object(…, { ...aircraftFilterFields, sortBy, limit })`, the same description as today.
  - `mapFilterSchema = s.streaming.object('A filter for the aircraft shown on the map', aircraftFilterFields)`.
  - `type MapFilter = Omit<FindAircraftInput, 'sortBy' | 'limit'>`.
  - `resolveFilter(state: AtcState, filter: MapFilter): ResolvedFilter | { unknownPlaces: string[] }`.
  - `matchesResolved(resolved: ResolvedFilter, aircraft: Aircraft): boolean`.
  - `findAircraft(state, input, area?)` keeps its signature and result, but is rebuilt on these two.

- [ ] **Step 1: Write the failing tests:**

  - `test('findAircraftInput keeps its JSON schema')`: a snapshot of `s.toJsonSchema(findAircraftInput)` equals the current output.
  - `test('matchesResolved agrees with findAircraft for every fixture filter')`
  - `test('resolveFilter reports unknown places instead of resolving them')`

- [ ] **Step 2: Run them and confirm they fail.**

- [ ] **Step 3: Implement.** Resolve once per call, not once per aircraft.

- [ ] **Step 4: Run them and confirm they pass**, along with `npx nx test atc-shared`.

- [ ] **Step 5: Commit**

  `refactor(atc): one set of filter fields and a shared predicate`

### Task 5: `mapFilter` in the store

**Files:**
- Modify: `shared/src/store.ts`:
  - `AtcState` (:55-90) and `INITIAL_STATE` (:93-111) get `mapFilter`.
  - Add the reducers next to `applyLayers` (:241).
  - Add the methods to the `AtcStore` interface (:403-442) and to `createAtcStore` (:445-502).
- Test: `shared/src/store.test.ts`

**Interfaces:**
- **Produces:**
  - `AtcState.mapFilter: AppliedMapFilter | null`, where `AppliedMapFilter = { filter: MapFilter; resolved: ResolvedFilter | null; unknownPlaces: string[] }`.
  - `applyMapFilter(state, filter: MapFilter | null): AtcState`.
  - `store.setMapFilter(filter: MapFilter)` and `store.clearMapFilter()`.
- **Behaviour:** a filter with `near` or `inAirspace` also issues one view request through the existing `requestView`, using the same kind `findAircraft` uses for `near` (outline and fit).

- [ ] **Step 1: Write the failing tests:**

  - `test('setMapFilter stores the filter and its resolution')`
  - `test('clearMapFilter returns the same state when nothing is set')`
  - `test('a near filter issues one view request and a later user drag still cancels it')`
  - `test('an unknown place is kept in unknownPlaces and ignored when matching')`

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.**

- [ ] **Step 5: Commit**

  `feat(atc): the map filter is app state`

### Task 6: Chips view model, and validating streamed filters

**Files:**
- Create: `shared/src/filter-view.ts`, `shared/src/filter-view.test.ts`

**Interfaces:**
- **Produces:**
  - `parseStreamedFilter(partial: unknown): { filter: MapFilter; complete: ReadonlySet<keyof MapFilter> }`. It turns the partial output of `useStructuredCompletion` into a `MapFilter`, setting missing fields to null and recording which fields are complete.
  - `filterChips(state: AtcState, filter: MapFilter, streaming: ReadonlySet<keyof MapFilter>): FilterChip[]`, where `FilterChip = { key: string; label: string; state: 'set' | 'streaming' | 'unknown' }`.
  - `filterSummary(filter: MapFilter): string`, a one-line plain-language summary such as `"jets below 10,000 ft near KSEA"`. Tasks 8 and 15 use it.

- [ ] **Step 1: Write the failing tests:**

  - `test('a half-streamed airport code is a streaming chip and never resolves')`: input `{ near: { airport: 'KSE' } }` while streaming. Expect a chip with state `'streaming'`, and that `resolveFilter` is not called for it. (Review Focus 1.)
  - `test('a complete unknown code is an unknown chip')`
  - `test('labels read naturally')`, for example `{ kind: 'jet', maxAltitudeFt: 10000 }` gives `['Jets', 'Below 10,000 ft']`.
  - `test('filterSummary of an empty filter is empty')`

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.**

- [ ] **Step 5: Commit**

  `feat(atc): filter chips and streamed filter parsing`

### Task 7: Filter dimming and the filter pill on the map

**Files:**
- Modify: `shared/src/map/plane-marker.ts`, in `markerClassName` (:13-26) and `STATE_CLASSES` (:80-85).
- Create:
  - `shared/src/map/filter-pill.ts`, modelled on `follow-pill.ts`: a pure view plus a DOM factory that writes text nodes only.
  - `shared/src/styles/filter-pill.css`
- Modify:
  - `shared/src/map/airspace-map.ts` `render` (:216-264): sync the pill.
  - `shared/src/styles/atc.css`: add the partial in cascade order.
- Test: `shared/src/map/plane-marker.test.ts` and `shared/src/map/filter-pill.test.ts`

**Interfaces:**
- **Consumes:** `AtcState.mapFilter` (Task 5), `filterChips` (Task 6) and `matchesResolved` (Task 4).
- **Produces:**
  - `createFilterPill(doc, onClear: () => void)`, which returns `{ element, sync(state, streaming) }`.
  - The class `is-filtered-out`. It is never applied to the selected, highlighted or followed plane.

- [ ] **Step 1: Write the failing tests:**

  - `test('planes outside the filter are filtered out except selected, highlighted and followed planes')`
  - `test('a plane that starts matching after a new snapshot loses is-filtered-out')`. This re-evaluates on a snapshot, with no model call. (Review Focus 5.)
  - `test('a filter that matches nothing filters out every plane except pointed-at ones')`
  - `test('the pill shows chips and calls onClear on the x')`
  - `test('the pill builds text nodes only')`

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.** Also run `npx nx test atc-shared -- src/design-rules.test.ts`.

- [ ] **Step 5: Commit**

  `feat(atc): filter dimming and the filter pill`

### Task 8: `setMapFilter` and `clearMapFilter` tools, and `findAircraft` respecting the filter

**Files:**
- Modify:
  - `shared/src/tool-definitions.ts`: add two entries. `setMapFilter`'s schema is `s.object('The map filter', aircraftFilterFields)`; `clearMapFilter` uses `noInput`.
  - `shared/src/tools.ts`: add the handlers. The `findAircraft` handler (:126) applies `mapFilter`.
  - `shared/src/tool-chips.ts`: add `RUNNING` and `DONE` labels for both tools.
  - `shared/src/contracts.ts` `SYSTEM_PROMPT`: one rule that the filter applies and may be changed or cleared when a question needs it. When the assistant changes the filter, it says so.
- Test: `shared/src/tools.test.ts` and `shared/src/tool-chips.test.ts`

**Interfaces:**
- **Consumes:** `store.setMapFilter` / `store.clearMapFilter` (Task 5) and `filterSummary` (Task 6).
- **Produces:**
  - `findAircraft` tool result: `{ mapFilter: string | null; aircraft: AircraftRow[] }`, where `mapFilter` is the summary.
  - `setMapFilter` result: `{ applied: true, mapFilter: string, unknownPlaces: string[] }`.
  - `clearMapFilter` result: `{ cleared: true }`.
  - Chip labels: "Filtered to {summary}" and "Cleared the map filter".

- [ ] **Step 1: Write the failing tests:**

  - `test('findAircraft intersects its input with the map filter and reports the summary')`
  - `test('findAircraft with a filter that matches nothing returns an empty list with the summary')`. (Review Focus 3.)
  - `test('getSelectedAircraft ignores the map filter')`
  - `test('setMapFilter applies a validated filter and reports unknown places')`
  - `test('chips label the new tools')`

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.** Also run `npx nx test atc-shared` and `npx nx test atc-server` (pinned tools come from `ATC_TOOL_DEFINITIONS`).

- [ ] **Step 5: Commit**

  `feat(atc): the assistant reads and changes the map filter`

### Task 9: `/api/filter` (pinned structured output)

**Files:**
- Create: `server/src/filter-handler.ts`, `server/src/filter-handler.test.ts` and `server/src/vercel/filter.ts`.
- Modify:
  - `server/src/app.ts`: add `['/api/filter', createFilterHandler(options.run)]` to the routes (:19-25).
  - `tools/build-vercel-output.mts`: add `{ route: 'filter', entry: 'filter', maxDuration: 30 }` to `functions` (:26-32).
- Docs: README, under "Hosting", adds the route and a rate-limit line.

**Interfaces:**
- **Consumes:** `mapFilterSchema` (Task 4), and `readRunOptions` and `limitRequest` from `run-handler.ts`.
- **Produces:** `createFilterHandler(options: RunHandlerOptions): NodeHandler`. It:
  - accepts POST only;
  - replaces the system prompt with `FILTER_SYSTEM_PROMPT` (exported from `shared/src/contracts.ts`);
  - replaces the response schema with `s.toJsonSchema(mapFilterSchema)`;
  - drops all tools;
  - caps output at 512 tokens;
  - streams AG-UI events like `/api/run`.
- **Request:** the client's input is JSON, `{ request: string, current: MapFilter | null }`, so a second filter refines the first.

- [ ] **Step 1: Write the failing tests:**

  - `test('filter handler pins the system prompt and the map filter schema')`
  - `test('filter handler drops client tools')`
  - `test('filter handler rejects GET with 405')`

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.** Run `npx nx test atc-server`.

- [ ] **Step 5: Commit**

  `feat(atc): pinned /api/filter`

### Task 10: The filter in both apps (step 5, structured output)

**Files:**
- Create: `react/src/filter.tsx` and `angular/src/app/filter.ts`. Each is a small core file with a step comment: "5. Structured output, without a chat".
- Modify: each app's map host, to mount the pill from Task 7 (shared) and connect `onClear` to `store.clearMapFilter`.

**Interfaces:**
- **Produces:** `useMapFilter(): { apply(request: string): void; streaming: ReadonlySet<keyof MapFilter>; output: unknown }` in React, and `injectMapFilter()` with the same shape, as signals, in Angular.
- **How it works:**
  - It is built on `useStructuredCompletion` / `structuredCompletionResource` with `schema: mapFilterSchema`, `system: 'Provided by the server.'`, and a transport to `/api/filter` (`createHttpTransport({ baseUrl: '/api/filter' })` / `provideHashbrown` equivalent per hook).
  - Each streamed update is passed through `parseStreamedFilter` (Task 6), and `store.setMapFilter` is called with the fields that are complete.
- **Shared by Tasks 13 and 15:** `apply` (the router calls it) and `output` (the stream panel reads it).

- [ ] **Step 1: Write the failing tests** (both apps):

  - `test('apply streams into store.setMapFilter as fields complete')`. Use a fake transport.
  - `test('apply sends the current filter for refinement')`

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.** Run `npx nx test atc-react` and `npx nx test atc-angular`.

- [ ] **Step 5: Commit**

  `feat(atc): natural-language map filter`

---

## PR 3: atc, decisions (router and narrowed chat)

### Task 11: The router schema, card groups, and the route action

**Files:**
- Modify: `shared/src/contracts.ts`.
- Create: `shared/src/route.ts` and `shared/src/route.test.ts`.

**Interfaces:**
- **Produces (in `contracts.ts`):**
  - `routeSchema`, exactly as written in the spec's "One input that routes" section.
  - `cardGroups`: `[{ components: [flightCard, arrivalsBoard, aircraftCompare, airportCard] }, { components: [markdownComponent()], selectable: false }]`, built from the existing contracts with `children: false`. The order matches `PINNED_RESPONSE_SCHEMA`, Markdown first in the flattened order.
  - `ROUTE_CONTEXT` and `CARDS_CONTEXT`: short decision contexts, for example "You route what a user typed in a live air-traffic map."
- **Produces (in `route.ts`):**
  - `routeAction(result: Decision.Result<typeof routeSchema> | null): { kind: 'filter' } | { kind: 'clear' } | { kind: 'chat' }`.
  - The threshold is 0.7. Null, `other`, and low confidence all go to chat. `clear` is returned only when `intent` is `filter` and `clear.probability` ≥ 0.5.
  - `routeBadge(result, pending: boolean): { label: string; tone: 'filter' | 'chat' | 'unsure' | 'idle' }`.

- [ ] **Step 1: Write the failing tests:**

  - `test('routeAction goes to chat below 0.7 and for other')`
  - `test('clear only applies with a filter intent')`
  - `test('a missing decision routes to chat')`
  - `test('cardGroups flatten in the pinned order with Markdown non-selectable')`

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.**

- [ ] **Step 5: Commit**

  `feat(atc): router schema and card groups`

### Task 12: `/api/decide` (Jev, pinned per kind)

**Files:**
- Create: `server/src/decide-handler.ts`, `server/src/decide-handler.test.ts` and `server/src/vercel/decide.ts`.
- Modify:
  - `server/src/app.ts`: add the route.
  - `server/project.json`: add `"typesafe"` to `implicitDependencies`.
  - `tools/build-vercel-output.mts`: add `{ route: 'decide', entry: 'decide', maxDuration: 10 }`.
- Docs: README env table adds `TYPESAFE_API_KEY`. "Hosting" adds the route, a rate-limit line, and a note that the key is set on `hashbrown-atc`.

**Interfaces:**
- **Consumes:** `routeSchema`, `cardGroups`, `ROUTE_CONTEXT` and `CARDS_CONTEXT` (Task 11), plus `HashbrownTypeSafe` and `DecisionError` from `@hashbrownai/typesafe` and `createSelectionSchema` from core.
- **Produces:** `createDecideHandler(env: NodeJS.ProcessEnv): NodeHandler`. It:
  - accepts POST only;
  - reads `kind` from the query string (`route` or `cards`; anything else is 400);
  - with no `TYPESAFE_API_KEY`, answers 503 `{ code: 'unavailable' }`.
- **Each kind:**
  - Schema: `routeSchema`, or `createSelectionSchema(cardGroups, { max: 2 })`.
  - The request `state` is rebuilt as `{ system: <pinned context>, input: <client state.input, or client state if it's a string> }`.
  - It calls `HashbrownTypeSafe.decide({ apiKey, model: 'jev-1.14.0', schema, request, maxRequestChars: 4000, signal })`.
- **Errors:** `DecisionError` maps to `{ code }` with its status.

- [ ] **Step 1: Write the failing tests** (with a fake `fetch`):

  - `test('decide pins the questions and the context for kind=route')`
  - `test('decide pins the card selection for kind=cards, never asking about Markdown')`
  - `test('decide answers 503 without a key')`
  - `test('decide rejects an unknown kind and oversized requests')`
  - `test('the pinned cards questions equal what the browser sends')`: `compileDecision` equality against `createSelectionSchema(cardGroups, { max: 2 })`.

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.** Run `npx nx test atc-server`.

- [ ] **Step 5: Commit**

  `feat(atc): pinned /api/decide with TypeSafe Jev`

### Task 13: The routing composer (step 4, decide)

**Files:**
- Modify:
  - `react/src/composer.tsx` (props :8-14, `submit` :31-41) and `react/src/assistant.tsx` (`send` :104-107).
  - `angular/src/app/composer.ts` and `angular/src/app/assistant.ts` (`send` :137-140).
  - `react/src/empty-state.tsx` and `angular/src/app/empty-state.ts`: starters carry a route.
  - `shared/src/contracts.ts`: `STARTER_PROMPTS` become `{ text, route: 'chat' | 'filter' }`, with at least one filter starter.
- Create:
  - `shared/src/styles/route-badge.css`, added to `atc.css`.
  - `shared/src/router-input.ts` and `.test.ts`: a pure state machine.

**Interfaces:**
- **Consumes:** `routeAction` and `routeBadge` (Task 11), `useMapFilter().apply` (Task 10), and `/api/decide?kind=route`.
- **Produces:**
  - `createRouterInput()`, a pure reducer. Its states are `{ text, decidedFor: string | null, result, pending }`. Its events are `typed`, `decided` and `failed`.
  - `submitTarget(state, waitedMs): 'wait' | RouteAction`, which returns `'wait'` until the result belongs to the current text, or until 1000 ms have passed.
- **In each app:**
  - Use `useDecision({ schema: routeSchema, input: text || null, debounceTime: 150, transport })` / `decisionResource`.
  - `transport = createHttpDecisionTransport({ url: '/api/decide?kind=route' })`.
  - Show the badge in the composer.
  - Mark the code with a step comment, "4. Decide: route what the user typed", in each app's core file. The narrowed assistant in Task 14 adds its part of step 4 next to step 1.
  - On Enter: filter → `apply(text)`; clear → `store.clearMapFilter()`; chat → `narrowed.sendMessage(text)` (Task 14), or `chat.sendMessage` until Task 14 lands.

- [ ] **Step 1: Write the failing tests:**

  - Shared:
    - `test('a decision for older text is not used for the current text')`. (Review Focus 4.)
    - `test('submitTarget waits up to 1000 ms then goes to chat')`
    - `test('a failed or unavailable decision gives a chat badge without error')`. (Review Focus 2.)
  - Apps:
    - `test('Enter on a filter-routed text applies the filter and adds nothing to the transcript')`
    - `test('starters go straight to their route')`

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.** Also run the design-rules test.

- [ ] **Step 5: Commit**

  `feat(atc): the composer routes with a Jev decision`

### Task 14: The narrowed assistant, and the `/api/run` allowlist

**Files:**
- Modify:
  - `react/src/assistant.tsx` and `angular/src/app/assistant.ts`. Step 1 becomes two kits: `cards` (four `exposeComponent` calls) and `prose` (`exposeMarkdown`, `selectable: false`). Markdown stays first in the flattened order. Add `useUiDecision({ chat, select: { max: 2 }, minConfidence: 0.7, transport })` / `uiDecisionResource`, with transport `/api/decide?kind=cards`. Add `system: 'Provided by the server.'`.
  - `server/src/run-handler.ts`: `PINNED_RESPONSE_SCHEMA` (:178-186) becomes `PINNED_RESPONSE_SCHEMAS`, the allowlist of all 15 non-empty subsets of the four cards, each plus Markdown, in pinned order, built with `createUiJsonSchema`. `pinResponseSchema` (:196) keeps a client schema whose JSON equals an allowlisted entry, and otherwise replaces it with the full schema.
  - `shared/src/contracts.ts` `SYSTEM_PROMPT` (:78-103): reword the card rules to "If the X card is available, …".
- Test: `server/src/run-handler.test.ts`, plus the app tests.

**Interfaces:**
- **Consumes:** `cardGroups` (Task 11) and `/api/decide?kind=cards` (Task 12).
- **Produces:** `narrowed.sendMessage`, which Task 13 calls for the chat route.

- [ ] **Step 1: Write the failing tests:**

  - `test('pinResponseSchema keeps an allowlisted narrowed schema')`
  - `test('pinResponseSchema replaces a schema that drops Markdown')`
  - `test('pinResponseSchema replaces a schema with an unknown component')`
  - App test: `test('a chat-routed message decides the cards, then sends the narrowed chat with Markdown')`
  - App test: `test('a cards decision failure sends with every card')`

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.**

  - `npx nx run-many -t test -p atc-server atc-react atc-angular`
  - Then `npx nx prose-eval atc-e2e`. This needs `OPENAI_API_KEY` and the dev servers. Record the result in the report.

- [ ] **Step 5: Commit**

  `feat(atc): the assistant narrows its cards with UI selection`

---

## PR 4: atc, "Show the stream", e2e and docs

### Task 15: "Show the stream"

**Files:**
- Create:
  - `shared/src/stream-view.ts` and `.test.ts`: view models.
  - `shared/src/styles/stream-panel.css`, added to `atc.css`. An ink panel (`--atc-ink` background, `--atc-surface` text) in the mono font, with no shadow or gradient. The design rules' "no dark scheme" ban covers `prefers-color-scheme` blocks, not a dark element, and `design-rules.test.ts` must stay green.
- Modify:
  - Both apps' panel headers get the switch.
  - The transcript answers and the filter pill host render the panels.

**Interfaces:**
- **Produces:**
  - `decisionView(result, ms)`: rows of `{ key, answer, probability }`.
  - `streamJson(value)`: pretty-printed JSON with a caret on the last token.
  - `readShowStream(storage): boolean`, defaulting to `true`, with try/catch.
  - `writeShowStream(storage, on)`.
- **Panels:**
  - Under the filter pill: the router decision, then the filter output (from Task 10's `output`).
  - Under each answer: the router decision, then the cards decision (from `narrowed.decision`), then the streaming UI JSON (from the message's raw content).
  - Tool chips show the real call and its arguments when the switch is on.

- [ ] **Step 1: Write the failing tests:**

  - `test('decisionView lists answers with probabilities and ms')`
  - `test('readShowStream defaults to on and survives a throwing storage')`
  - App test: `test('the switch hides and shows the panels')`

- [ ] **Steps 2–4: Run them and confirm they fail, implement, then confirm they pass.** Include the design-rules test.

- [ ] **Step 5: Commit**

  `feat(atc): show the stream`

### Task 16: End-to-end coverage

**Files:**
- Modify:
  - `e2e/src/stubs.ts` (:14-46): stub `/api/decide`, routing by the `kind` query and by input text to fixed results.
  - `e2e/src/model.ts`: script `/api/filter` turns in aimock.
  - `e2e/src/atc.spec.ts`: add the cases below.

- [ ] **Step 1: Write the failing cases** (both projects):

  - typing shows the right badge;
  - Enter on a filter streams chips and dims the map;
  - Enter on a question narrows the cards;
  - "what's the highest plane overall?" with a filter set makes the assistant call `clearMapFilter`, and the pill clears;
  - the ✕ clears the filter;
  - "Show the stream" hides and shows the panels;
  - a `/api/decide` failure (503) sends to chat with all cards.

- [ ] **Step 2: Run them and confirm they fail:** `npx nx e2e atc-e2e`.

- [ ] **Step 3: Implement the stubs and scripts.**

- [ ] **Step 4: Run them and confirm they pass:** `npx nx e2e atc-e2e` and `npx nx typecheck atc-e2e`.

- [ ] **Step 5: Commit**

  `test(atc): e2e for routing, filtering and narrowing`

### Task 17: Docs, video and the final verification

**Files:**
- Modify:
  - `README.md`: "How this example is built" leads with decide, filter and generate, and with "one schema, four uses". Update the env table and "Hosting".
  - `AGENTS.md`: file map rows for `filter-view`, `route`, `router-input`, `stream-view`, the filter pill and the new handlers. Invariants: the server pins all three model routes, the filter is state, and pointed-at planes are never dimmed.
  - `e2e/demo/storyboard.ts`: new beats for routing, filtering and narrowing. Update the marked-line patterns for the moved code.
  - `www/content/blog/2026-10-10-building-atc.md`: a short dated update note pointing to the new sections. The maintainer decides on a separate post.

- [ ] **Step 1: Write the failing test.** Update the storyboard patterns first, then run `npx nx test atc-e2e` and confirm it fails until the patterns match the moved lines.

- [ ] **Step 2: Write the docs.**

- [ ] **Step 3: Run the full verification.** All of these must pass:

  - `npx nx run-many -t build,test,lint -p atc-shared atc-server atc-angular atc-react atc-e2e atc`
  - `npx nx e2e atc-e2e`
  - `npx nx typecheck atc-e2e`
  - `npx nx run-many -t test,lint,build -p www`

  Then run `npx nx demo atc-e2e`. It needs ffmpeg; report whether it ran.

- [ ] **Step 4: Commit**

  `docs(atc): lead with decide, filter, generate`. Then open PR 4.
