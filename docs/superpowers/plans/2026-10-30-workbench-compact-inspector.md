# Workbench Compact Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workbench inspector usable in the ~400px docs embed:

- one panel per tab, with a mode toggle;
- a State tree;
- Requests that shows one request's detail, with the list as a picker, and that follows the playhead;
- a decluttered replay embed.

**Architecture:**

- Pure models live in new small modules, tested in node:
  - modes and partial parse;
  - tree rows and changed paths;
  - the request under the playhead.
- `workbench-view.ts` and `workbench-requests-view.ts` render those models with plain DOM. Their jsdom specs pin the behaviour.
- CSS changes stay in `workbench.css`. Narrow behaviour is gated by the existing `wb-requests` container query.

**Tech Stack:** TypeScript, plain DOM, Vitest (`npx nx test www`), `@cacheplane/json-stream` (already a root dependency).

**Spec:** `docs/superpowers/specs/2026-10-30-workbench-compact-inspector-design.md`

## Global Constraints

- All runtime code is in `www/examples/quickstart/runtime/`. It is framework neutral and serves both `react.html` and `angular.html`.
- Tests live in `www/test/*.spec.ts(x)`:
  - top-level `test()` only, with arrange/act/assert separated by blank lines;
  - DOM specs start with `// @vitest-environment jsdom`.
- Every new export gets a TSDoc block.
- No new dependencies. `@cacheplane/json-stream@0.1.1` is already in the root `package.json`. If www lint's dependency check rejects the import, stop and ask; do not add it to `www/package.json`.
- Fix lint rather than suppress it.
- Commit with `--no-verify`: the pre-commit hook needs `dotnet`, which isn't installed. Run `npx nx lint www` and `npx prettier --check` on changed files first.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Narrow means the `wb-requests` container is under 560px: `@container wb-requests (max-width: 559px)`.
- Mode labels are exact:
  - UI: `Schema`, `Raw`, `Parsed`, `Resolved` (default `Resolved`);
  - JSON: `Raw`, `Parsed`, `Resolved` (default `Parsed`);
  - State: `Tree`, `JSON`, `Raw` (default `Tree`).
- Requests detail tabs: `Overview`, `Messages`, `Tools`, `State`, `Request`, `Response`. "Raw request" is renamed to `Request`.
- The panel caption format is `<source> · turn <n> · event <i>/<total>`, for example `SDK parsed output · turn 1 · event 50/123`.

## Review Focus

1. **A mode with no data yet** (Resolved before any parsed event, Parsed on empty text) shows the waiting text, not `null` or an error. Task 1 tests it.
2. **Malformed or truncated streamed JSON** (`{"title": "Sh`) still renders Parsed as the partial value and never throws. Task 1 tests it.
3. **Scrubbing backwards past every request** (playhead at the prompt, before any exchange) leaves Requests showing a "No request yet" state, not a stale one. Task 4 tests it.
4. **Lessons whose `recipeView` overrides the inspector** (local models, QuickJS, authoring, server, history, workflow) still render both of their views as two modes plus Raw. Task 2 tests one recipe lesson.
5. **Keyboard-only use** of the segmented control, the tree and the picker works: arrows move focus, Enter/Space selects, Escape closes the picker. Tasks 2–4 test it.

---

### Task 1: Mode model and partial parse

**Files:**

- Create: `www/examples/quickstart/runtime/workbench-inspector-modes.ts`
- Test: `www/test/workbench-inspector-modes.spec.ts`

**Interfaces:**

- Produces:
  - `parsePartialJson(text: string): unknown`. It returns `undefined` for empty or whitespace-only text. Otherwise it returns `resolve(push(create(), text))` from `@cacheplane/json-stream`, wrapped in try/catch, returning `undefined` on error.
  - `type WorkbenchInspectorMode = { readonly id: string; readonly label: string; readonly value: unknown }`
  - `workbenchInspectorModes(input: { tab: string; format?: string; frame: WorkbenchFrame | null; application: unknown; top: { heading: string; value: unknown }; bottom: { heading: string; value: unknown }; raw: unknown }): readonly WorkbenchInspectorMode[]`. The rules:
    - UI tab, when `frame.json` exists and the format is not `decision` or `structured`: Schema = `top.value`, Raw = `frame.json`, Parsed = `parsePartialJson(frame.json)`, Resolved = `frame.props`.
    - JSON tab, same condition: Raw = `frame.json`, Parsed = `parsePartialJson(frame.json)`, Resolved = `frame.props`.
    - State tab: Tree = `{ ...application, moment: bottom.value }`, JSON = the same value, Raw = `raw`.
    - Every other tab or format: `[{ id: 'top', label: shortLabel(top.heading) }, { id: 'bottom', label: shortLabel(bottom.heading) }, { id: 'raw', label: 'Raw', value: raw }]`.
    - `shortLabel` keeps the heading's first two words, for example "Typed choice and confidence" becomes "Typed choice".
  - `defaultInspectorMode(tab: string, modes: readonly WorkbenchInspectorMode[]): string`. UI defaults to `resolved`, JSON to `parsed`, State to `tree`, and everything else to its first mode.
  - `createInspectorModeMemory(): { get(tab: string): string | undefined; set(tab: string, id: string): void }`. It keeps a per-tab choice for the life of the page.

- [ ] **Step 1: Write the failing tests.** Cover:
  - `parsePartialJson('{"title": "Sh')` deep-equals `{ title: 'Sh' }`;
  - `parsePartialJson('')` is `undefined`;
  - `parsePartialJson('not json')` does not throw;
  - the UI tab with a frame `{ json: '{"title":"A"}', props: { title: 'A' } }` gives mode ids `['schema','raw','parsed','resolved']`, with Resolved `{ title: 'A' }`;
  - JSON tab ids are `['raw','parsed','resolved']`;
  - State gives `['tree','json','raw']`, and the Tree value includes `moment`;
  - the `decision` format falls back to top/bottom/raw, with labels shortened from the headings;
  - the defaults per tab;
  - memory round-trips per tab and does not leak between tabs.
- [ ] **Step 2:** Run `npx vitest run --config www/vitest.config.mts www/test/workbench-inspector-modes.spec.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement the exports above. Import `WorkbenchFrame` as a type from `./workbench`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(www): model workbench inspector modes`.

### Task 2: One panel per tab, with a segmented toggle

**Files:**

- Create: `www/examples/quickstart/runtime/workbench-segmented.ts`
- Modify: `www/examples/quickstart/runtime/workbench-view.ts`. The areas to change:
  - the captured, detail and `rawFrameToggle` setup (~691–709);
  - the pane title and selection row (~675, ~774–776);
  - the selection fill (~1395–1408);
  - the top and bottom bodies (~1371–1665).
- Modify: `www/examples/quickstart/runtime/workbench.css`, removing the `.wb-pair` split, `.wb-raw` and `.wb-selection`, and adding the segmented control and caption styles.
- Test: `www/test/workbench-segmented.spec.ts`, plus a new `www/test/workbench-inspector-panel.spec.tsx` (jsdom). Mount the view the way `www/test/workbench-requests-view.spec.tsx` does, with `mountWorkbench` and `createWorkbenchStore`.

**Interfaces:**

- Consumes all of Task 1.
- Produces `createWorkbenchSegmented(options: { label: string; onChange(id: string): void }): { element: HTMLElement; sync(modes: readonly { id: string; label: string }[], selected: string): void; dispose(): void }`. The element is `role="radiogroup"` with `aria-label`. Each option is `role="radio"` with `aria-checked`. Left/Right/Home/End move the choice and focus, using a roving tabindex.

- [ ] **Step 1: Write the failing tests.**
  - Segmented control:
    - `sync` renders one radio per mode with the selected one checked;
    - ArrowRight checks the next radio and calls `onChange`;
    - re-`sync` with the same modes keeps focus on the same element.
  - Panel:
    - the generative-ui lesson on the UI tab shows one `.wb-section`, a radiogroup labelled `Inspector view` with the four UI labels, and no `.wb-raw`, `.wb-selection` or "Inspector" `h2`;
    - choosing `Raw` shows the frame's `json` text;
    - switching to State and back to UI keeps `Raw`;
    - the caption matches `/· turn \d+ · event \d+\/\d+$/`;
    - for one recipe lesson (`local-models`), the panel shows two recipe modes plus `Raw`.
- [ ] **Step 2:** Run both specs. Expected: FAIL.
- [ ] **Step 3:** Implement `workbench-segmented.ts`. Then in `workbench-view.ts`:
  - keep computing today's top and bottom headings and values (including `recipeView`);
  - pass them to `workbenchInspectorModes`;
  - render a single section: header `h3` (title) plus the segmented control; body `pre(mode.value, tab)`, or the waiting text when the value is `undefined` or `null`; caption.
  - delete the selection row, the pane `h2` and `rawFrameToggle`.
  - the State tab's Tree mode renders `pre(...)` for now. Task 3 swaps in the tree.
- [ ] **Step 4:** Run both specs and the existing workbench specs (`npx nx test www`). Expected: PASS. Update existing assertions that referenced `.wb-raw`, `.wb-selection` or two sections only where the spec removed them.
- [ ] **Step 5:** Commit: `feat(www): one inspector panel per tab with a mode toggle`.

### Task 3: State tree

**Files:**

- Create: `www/examples/quickstart/runtime/workbench-tree.ts`
- Modify: `workbench-view.ts` (State Tree mode body) and `workbench.css`
- Test: `www/test/workbench-tree.spec.ts`, plus cases added to `www/test/workbench-inspector-panel.spec.tsx`

**Interfaces:**

- Produces:
  - `type WorkbenchTreeRow = { readonly path: string; readonly depth: number; readonly key: string; readonly kind: 'object' | 'array' | 'value'; readonly size?: number; readonly preview?: string; readonly open?: boolean }`. Paths are JSON-pointer style, for example `/plan/steps/0`.
  - `workbenchTreeRows(value: unknown, open: ReadonlySet<string>): readonly WorkbenchTreeRow[]`. Rows for closed branches' children are omitted.
  - `defaultOpenPaths(value: unknown): ReadonlySet<string>`. It opens the root and depth 1.
  - `changedPaths(previous: unknown, next: unknown): ReadonlySet<string>`. It returns leaf paths whose value differs.
  - `createWorkbenchTree(options: { label: string }): { element: HTMLElement; update(value: unknown, previous: unknown): void }`. It renders `role="tree"` with `role="treeitem"` and `aria-expanded`. It keeps its open set across `update` calls, keyed by path. Changed rows get `data-changed`. Keys:
    - Up/Down move focus;
    - Right opens or moves to the first child;
    - Left closes or moves to the parent;
    - Enter toggles.

    Long string values are truncated by CSS, with the full value in `title`.

- [ ] **Step 1: Write the failing tests.** Cover:
  - row output for `{ revision: 1, plan: { title: 'A', steps: ['x','y'] } }` with the default open set: `steps` is closed with `size: 2`;
  - `changedPaths` reports `/plan/title` only;
  - the DOM: clicking `plan` hides its children;
  - an `update` with a new value keeps `plan` closed;
  - ArrowRight on a closed branch opens it;
  - a changed row has `data-changed`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. In `workbench-view.ts`, the State `tree` mode renders one long-lived tree instance, updated with the current and previous frame's Tree value (`events[selectedIndex - 1]`).
- [ ] **Step 4:** Run `npx nx test www`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(www): show workbench state as an expandable tree`.

### Task 4: Requests follows the playhead, with a picker when narrow

**Files:**

- Modify:
  - `www/examples/quickstart/runtime/workbench-requests-view.ts`;
  - `workbench-requests-timeline.ts` (the flag label input);
  - `workbench-view.ts` (passing the main timeline's milestone label to the Requests view);
  - `workbench.css` (the `wb-requests` container query at ~1231).
- Create: `www/examples/quickstart/runtime/workbench-requests-follow.ts`
- Test: `www/test/workbench-requests-follow.spec.ts`, plus cases in `www/test/workbench-requests-view.spec.tsx`

**Interfaces:**

- Produces:
  - `exchangeAtPlayhead(exchanges: readonly WorkbenchExchange[], events: readonly WorkbenchEvent[], at: number): WorkbenchExchange | null`. This moves today's inline rule out of `draw()`: it returns the last exchange with `firstIndex <= at`, preferring the playhead's own turn. It returns `null` when none has started.
  - The `WorkbenchRequestsTimelineInput.flag` value now comes from the caller as the main timeline's active milestone label (`workbenchEventLabel`), so both flags read the same.
- Behaviour:
  - **Following:**
    - When the cursor changes and the change did not come from `select()`, clear `userSelected`.
    - While `!userSelected`, set `selectedId` to `exchangeAtPlayhead(...)?.id`, at every width.
    - With nothing yet, the detail shows `No request yet`.
  - **Picker (narrow only):**
    - A header button shows `<name> · Turn <n>`, the status and the duration, with `aria-haspopup="listbox"` and `aria-expanded`.
    - Opening it shows the existing turn-grouped table as a `role="listbox"` overlay. The current row gets `data-current`, and future rows `data-future`.
    - Picking calls `select(id)` and closes it. Escape closes it and returns focus to the button.
    - At wide widths the table and detail stay as today, and the picker button is hidden by CSS.
  - **Detail tabs:**
    - one segmented-style row that scrolls sideways (`overflow-x: auto`, no wrap);
    - rename `Raw request` to `Request`;
    - remove `Back to requests` and its CSS.
  - **The strip** is hidden by CSS inside the narrow container query, and kept wide.

- [ ] **Step 1: Write the failing tests.**
  - `exchangeAtPlayhead`:
    - a playhead before the first request gives `null`;
    - a playhead mid-continuation gives the continuation;
    - a playhead in Turn 2 before its request gives the last Turn 1 exchange.
  - View (the tools lesson, as in the existing spec):
    - seeking the store to a Turn 2 event selects the Turn 2 model request;
    - `select()` on a Turn 1 row, then a store seek, follows again;
    - no `Back to requests` button exists;
    - the detail tab named `Request` exists;
    - the picker button opens a listbox, and Enter on a row selects it;
    - the strip flag text equals the main timeline flag text for the same cursor.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement as above.
- [ ] **Step 4:** Run `npx nx test www`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(www): requests follow the playhead and pick from a list when narrow`.

### Task 5: Declutter the replay embed

**Files:**

- Modify: `www/examples/quickstart/runtime/workbench-view.ts`. The places to change:
  - provenance (~505, ~1004);
  - `returnLive` (~805, ~1767);
  - the conversation strings (~1080, ~1110–1140).
- Test: cases added to `www/test/workbench-inspector-panel.spec.tsx`

**Interfaces:** none new.

- Behaviour:
  - **Source label:** the provenance label is empty and hidden when `snapshot.readOnly` is true. It is kept for live sessions, including while scrubbed back.
  - **Return to live:** hidden (the `hidden` attribute) when `embed === 'replay'`. It is unchanged otherwise.
  - **Conversation strings:**
    - remove `Replay is read-only.` (both places);
    - remove the `… · captured preview` and `Closed choice · captured result` lines;
    - the status text `Recorded at c29b05b` becomes `c29b05b`.
- [ ] **Step 1: Write the failing tests.**
  - A loaded recording (`store.load`) with `embed: 'replay'`:
    - no element with the text `Live model` or `Awaiting source`;
    - the `.wb-live` button is hidden;
    - no `Replay is read-only.` text;
    - the status text matches `/^[0-9a-f]{7}$/`.
  - A live store (not loaded) still shows a source label and the live button.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx nx test www`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(www): declutter the replay workbench embed`.

### Task 6: Verify in a browser and finish

**Files:**

- Modify, only if the check finds an offset: `workbench.css` (`.wb-requests-playhead::before` and the main timeline knob)

- [ ] **Step 1:** Run `npx nx serve www`. Open a docs page with an embed, for example `/docs/react/concept/components`, in Chrome at the docs width (embed frame about 790px). Check:
  - each UI, JSON and State mode;
  - the tree survives scrubbing;
  - the Requests picker, following the playhead, and stopping following after a pick;
  - no strip at narrow width;
  - the declutter items are absent;
  - the main timeline's click, drag and keyboard still work.

  Repeat on the full workbench, where the strip is present and its flag matches the main timeline. Then repeat on the Angular docs page.

- [ ] **Step 2:** Zoom on the requests playhead and the main timeline knob at device pixel ratio 1 and 2. If the circle is off-centre from its line by 1px or more, centre it in CSS and re-check.
- [ ] **Step 3:** Run `npx nx build www`, `npx nx test www`, `npx nx lint www` and `npx nx e2e www`. Expected: all pass, and the layout report has no new findings.
- [ ] **Step 4:** Commit any fix: `fix(www): centre the workbench playhead knob`.
