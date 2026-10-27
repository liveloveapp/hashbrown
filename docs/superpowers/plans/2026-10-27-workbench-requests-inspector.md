# Workbench Requests Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the canonical workbench's Requests tab into a request inspector: an overview timeline, a full exchanges table, and per-row detail tabs. Make both timelines drag-scrubbable.

**Architecture:** Five new framework-neutral modules under `www/examples/quickstart/runtime/`:
- a pure exchange derivation (`workbench-requests.ts`);
- a pure active-time axis (`workbench-requests-axis.ts`);
- a shared pointer-scrub controller (`workbench-scrub.ts`);
- the overview strip (`workbench-requests-timeline.ts`);
- the table and detail view (`workbench-requests-view.ts`).

`workbench-view.ts` mounts the requests view once and shows it in place of the captured/interpreted pair when the Requests tab is open. Each `render()` calls the view's `update`, so selection and drags survive re-renders.

**Tech Stack:** TypeScript and DOM, no framework; Vitest with jsdom; Playwright verifiers; Nx.

**Spec:** `docs/superpowers/specs/2026-10-27-workbench-requests-inspector-design.md`

## Global Constraints

- **No changes** to `WorkbenchStore`, frames, transports, server routes, prompts or SDK usage. Replay makes no network, tool or write calls.
- **Dependencies:** none new; no Pretable.
- **Tests:** written first, as top-level `test(...)` with arrange/act/assert separated by blank lines.
- **Docs and lint:** TSDoc on every exported function and type. Fix lint rather than suppress it.
- **Shell:** stays framework neutral and is shared by the React and Angular clients.
- **Styling:** use the existing `--wb-*` tokens and the 4px grid. Requests are cobalt (`--wb-cobalt`), streams light cobalt (`#a5b4e8`), tools `--wb-tok-number` (`#953800`), errors `--wb-live`.
- **Highlighting:** all JSON renders through `renderWorkbenchCode(source, 'json')` from `workbench-highlight.ts`.
- **Accessible names to keep:** tab "Requests"; slider "Seek captured event" (native range, still `fill()`-able); "Play", "Return to live"; milestone tick `aria-label`s; `.wb-inspector .wb-inspection` around the Requests content; `[data-detail]` on the open detail pane.
- **New accessible names:**
  - overview slider "Seek request timeline";
  - close button "Close request detail";
  - narrow back button "Back to requests";
  - copy button "Copy raw request".
- **Checks:** run `npx nx test www`, `npx nx lint www`, `npx nx typecheck www`, `npx nx workbench-build www` and `npx nx workbench-e2e www` sequentially, never in parallel.

## Review Focus

1. **Re-render churn while streaming:** `render()` fires for every AG-UI event, so a scrub in progress, the open detail tab, a focused row button and the selection must all survive. The view must not rebuild nodes the user is interacting with.
2. **Pointer edge cases:**
   - a press on a tick that never moves must still activate that tick;
   - releasing outside the track must end the drag (pointer capture, plus a `lostpointercapture` fallback);
   - a second pointer must be ignored.
3. **Live vs replay:** automatic error selection only while live, and never replacing a user's selection. Seeking from a row or event pauses playback. Rows after the playhead grey only in replay.
4. **Odd runs:**
   - decision lessons (no URL, no `response`);
   - a 403 that ends a turn;
   - workflow resume and retry naming;
   - empty runs;
   - a still-streaming last exchange (status "…", a growing duration).
5. **Narrow inspector (<560px container):** hidden columns and the back button, with no horizontal overflow at 390px (`expectNoHorizontalOverflow`).

---

### Task 1: Exchange derivation

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-requests.ts`
- Test: `www/test/workbench-requests.spec.ts`

**Interfaces:**
- Consumes: `WorkbenchSnapshot['events']` (frames with `kind`, `payload`, `turn`, `elapsedMs`, `sequence`), lesson `format`.
- Produces:

```ts
export type WorkbenchExchangeKind = 'request' | 'tool';
export type WorkbenchExchangeName =
  | 'Model request' | 'Decision request' | 'Continuation' | 'Resume' | 'Retry' | 'Follow-up request';
export interface WorkbenchExchange {
  readonly id: string;                 // `${kind}-${firstIndex}`
  readonly kind: WorkbenchExchangeKind;
  readonly name: string;               // a WorkbenchExchangeName, or the tool name
  readonly turn: number;
  readonly parentId?: string;          // tool rows: the request that called them
  readonly answeredById?: string;      // tool rows: the continuation request
  readonly firstIndex: number;         // index into events
  readonly lastIndex: number;
  readonly eventIndexes: readonly number[]; // every event attached (request rows include the request event)
  readonly startMs: number;
  readonly endMs: number;
  readonly status: 'pending' | 'ok' | 'error';
  readonly httpStatus?: number;
  readonly method: string;             // 'POST' for requests, '' for tools
  readonly path?: string;              // pathname of payload.url, or the configured endpoint
  readonly pathConfigured: boolean;    // true when path came from the lesson endpoint
  readonly request?: unknown;          // the request event payload, as captured
  readonly response?: unknown;         // the `response` event payload
  readonly tool?: { readonly name: string; readonly result: unknown; readonly callId?: string };
  readonly problem?: string;           // response payload `problem`
}
export interface WorkbenchTurnExchanges {
  readonly turn: number;
  readonly userText: string;           // last `user` event payload text in the turn, or ''
  readonly exchanges: readonly WorkbenchExchange[]; // request rows each followed by their tool children
}
export function workbenchExchanges(
  events: readonly WorkbenchFrame[],
  options: { readonly format?: string; readonly endpoint?: string; readonly settledStatus?: string },
): readonly WorkbenchTurnExchanges[];
```

**Rules:** the spec's "Data" section is authoritative.
- Status: `error` when HTTP status ≥ 400, or when an attached `error` event exists, or when this is the last exchange and `settledStatus === 'error'`.
- `ok` when a later exchange exists in the turn, a `RUN_FINISHED` event is attached, or (for decision and selection lessons) its `event` arrived.
- Otherwise `pending`.
- Tool rows are `ok`. A tool's `callId` is the `toolCallId` of the nearest preceding attached `TOOL_CALL_START`/`TOOL_CALL_END` event with a matching `toolCallName`, when present.

- [ ] **Step 1:** write failing tests in `www/test/workbench-requests.spec.ts`, building frames through `createWorkbenchStore()` as the existing specs do (`store.send`, `store.record`, `store.settle`):
  - `groups a request, its tool call and the continuation in one turn`: names `['Model request','readContext','Continuation']`, the tool's `parentId` is the first request's id, `answeredById` is the continuation's id, and `eventIndexes` cover every attached event.
  - `marks a 403 as an error with its problem and recovers in the next turn`: turn 1 row status `error`, `httpStatus` 403, `problem` set; turn 2 row `ok`.
  - `names resume, retry and follow-up requests`: three same-turn requests preceded by a `resume` event, a repeated `requestId`, and nothing, give `['Model request','Resume','Retry','Follow-up request']` in the appropriate order.
  - `uses the configured endpoint for decision requests`: format `decision`, payload without `url` → `name` `Decision request`, `pathConfigured: true`, `path` equals the endpoint pathname, status `ok` after its `event`.
  - `leaves the streaming exchange pending`: status `pending`, and `endMs` equals the last attached event's `elapsedMs`.
  - `returns no turns for an empty run` and `ignores events before a turn's first request`.
- [ ] **Step 2:** run `npx vitest run --config www/vitest.config.mts www/test/workbench-requests.spec.ts`; expect a FAIL (module missing).
- [ ] **Step 3:** implement `workbenchExchanges` as a single pass over events.
- [ ] **Step 4:** re-run; expect a PASS.
- [ ] **Step 5:** commit `feat(www): derive request exchanges from captured workbench events`.

### Task 2: Active-time axis and the shared scrub controller

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-requests-axis.ts`
- Create: `www/examples/quickstart/runtime/workbench-scrub.ts`
- Test: `www/test/workbench-requests-axis.spec.ts`
- Test: `www/test/workbench-scrub.spec.ts`

**Interfaces:**
- Produces:

```ts
// workbench-requests-axis.ts
export interface WorkbenchActiveAxis {
  readonly percentAt: (elapsedMs: number, turn: number) => number;   // 0–100
  readonly nearestIndex: (percent: number) => number | null;           // event index nearest a position
  readonly turns: readonly { readonly turn: number; readonly startPercent: number; readonly endPercent: number }[];
}
export function workbenchActiveAxis(events: readonly WorkbenchFrame[], gapPercent?: number): WorkbenchActiveAxis;

// workbench-scrub.ts
export interface WorkbenchScrubOptions {
  readonly track: HTMLElement;
  readonly indexAt: (fraction: number) => number | null;   // fraction 0–1 across track width
  readonly onScrub: (index: number) => void;                 // called on press and on each move to a new index
  readonly isDisabled?: () => boolean;
  readonly tickSelector?: string;                            // e.g. '[data-index]'
}
export function attachWorkbenchScrub(options: WorkbenchScrubOptions): () => void; // returns detach
```

**Rules:**
- Axis: each turn's span is its last `elapsedMs` minus its first. Turns are laid out in order with `gapPercent` (default 2) between them, scaled so that the spans plus the gaps fill 100. A run with a single event maps to 0.
- Scrub, on press:
  - a press on a tick (`event.target.closest(tickSelector)`) records the tick and does not scrub yet;
  - a press elsewhere scrubs immediately to `indexAt(fraction)`.
- Scrub, during the drag:
  - once the pointer has moved more than 4px it scrubs on every move;
  - only the pointer that started the drag counts;
  - the controller uses `setPointerCapture` when available and ends on `pointerup`, `pointercancel` or `lostpointercapture`.
- Scrub, on release: if a tick was pressed and movement never exceeded 4px, it does nothing (the tick's own click fires). If the scrub is disabled, it ignores the press. `onScrub` is called only when the index changes.

- [ ] **Step 1:** write failing axis tests:
  - `collapses idle time between turns`: two turns at 0–1000 ms and 60000–61000 ms each take about 49% of the axis.
  - `maps nearestIndex back to the closest event`.
  - `handles one event and an empty run`.
- [ ] **Step 2:** write failing scrub tests, using MouseEvents with `pointerId` assigned as `workbench-shell.spec.tsx` does and a mocked `getBoundingClientRect`:
  - `scrubs on press and follows the pointer`;
  - `treats a still press on a tick as a click, not a scrub`;
  - `turns a press on a tick into a scrub after 4px`;
  - `ignores other pointers`;
  - `stops after lostpointercapture`;
  - `ignores presses while disabled`;
  - `detach removes listeners`.
- [ ] **Step 3:** run both files; expect a FAIL.
- [ ] **Step 4:** implement both modules.
- [ ] **Step 5:** run both files; expect a PASS.
- [ ] **Step 6:** commit `feat(www): add an active-time axis and a shared pointer scrub`.

### Task 3: Drag-scrub on the bottom player

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-view.ts` (scrubber setup near `const scrubber = element('div', '', 'wb-scrubber')`, and dispose)
- Modify: `www/examples/quickstart/runtime/workbench.css` (`.wb-scrubber`, `.wb .wb-events button`)
- Test: `www/test/workbench-shell.spec.tsx`

**Interfaces:**
- Consumes: `attachWorkbenchScrub` from Task 2.
- `indexAt` is `Math.round(fraction * (total - 1))`, matching `workbenchTickPercent`.
- `onScrub` calls `pause()` then `store.seek(index)`.
- `isDisabled` is `() => busy || !total`.
- `tickSelector` is `'.wb-events button'`.

**CSS:**
- `.wb-scrubber` gets `touch-action: none`.
- Tick buttons get at least a 24px-tall hit area centred on the track, with the visual mark unchanged. The `.wb-events` layer keeps `pointer-events: none` except on the buttons.

- [ ] **Step 1:** write failing shell tests:
  - `drags the bottom scrubber from anywhere on the track, including a tick`: after `recordTwoTurns`, a press then moves on `.wb-scrubber` change `store.getSnapshot().cursor` and pause playback; a press on a tick button followed by a 30px move also scrubs.
  - `still seeks to a tick on a plain click`.
- [ ] **Step 2:** run; expect a FAIL.
- [ ] **Step 3:** attach the scrub controller; detach it in `dispose`.
- [ ] **Step 4:** run the shell spec; expect a PASS, including the existing tick and keyboard tests.
- [ ] **Step 5:** commit `fix(www): scrub the workbench player by dragging anywhere on the track`.

### Task 4: Requests view (overview, table, detail) mounted in the inspector

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-requests-timeline.ts`
- Create: `www/examples/quickstart/runtime/workbench-requests-view.ts`
- Modify: `www/examples/quickstart/runtime/workbench-view.ts`
  - Requests branch in `render()`;
  - hide `pair` and show the requests view for the Requests tab;
  - keep the error alert inside the Requests `.wb-inspection`;
  - remove the old `.wb-request-list` code.
- Modify: `www/examples/quickstart/runtime/workbench.css`
- Test: `www/test/workbench-requests-view.spec.tsx`
- Modify tests: `www/test/workbench-shell.spec.tsx` (the `.wb-request-list` focus test), `www/test/workbench-clients.spec.tsx` (`.wb-request-list` 403 assertion)

**Interfaces:**
- Consumes: Tasks 1 and 2, `renderWorkbenchCode`.
- Produces:

```ts
export interface WorkbenchRequestsView {
  readonly element: HTMLElement;   // wraps everything in a `.wb-inspection` container
  update(input: {
    readonly snapshot: WorkbenchSnapshot;
    readonly busy: boolean;
    readonly format?: string;
    readonly endpoint?: string;
    readonly source: string;       // provenance text, e.g. "Live model"
  }): void;
  readonly dispose: () => void;
}
export function createWorkbenchRequestsView(options: {
  readonly instanceId: string;
  readonly seek: (index: number) => void; // the shell passes () => { pause(); store.seek(i) }
}): WorkbenchRequestsView;
```

**Behaviour:** the spec's "Layout" section is authoritative.
- The selected exchange id, open detail tab, selected response-event index and narrowing state live in the view's closure.
- `update` rebuilds the table body, overview bars and detail body with `rebuildKeepingFocus`-style focus restoration, keyed on `data-exchange` and `data-event-index`. Copy that helper's approach locally, or export it from `workbench-view.ts`; it is not exported today.
- Escape is handled with a `keydown` listener on `element` and is not gated on `defaultPrevented`.
- Narrow mode uses a container query on the requests view (`container-type: inline-size`) at 560px. The Back button exists in the DOM always and shows only in narrow mode.
- Copy uses `navigator.clipboard?.writeText` and fails silently.

- [ ] **Step 1:** write failing tests in `www/test/workbench-requests-view.spec.tsx`, mounting the full shell as `workbench-shell.spec.tsx` does, with lesson `{ id: 'tools', format: 'ui', inspector: 'Requests' }`:
  - **`renders the overview, a turn-grouped table and no selection`:** `table` header texts are `['Name','Type','Status','Start','Duration','Events','Waterfall']`; `[role=slider][aria-label="Seek request timeline"]` exists; there is no `[data-detail]`; `.wb-inspector .wb-inspection` contains "Model request".
  - **`selecting a row seeks, narrows the table and opens request tabs`:** clicking the Model request button calls seek with its first index.
    - The table root gets `data-narrow`.
    - The detail tab names are `['Overview','Messages 2','Tools 1','State','Raw request','Response n']`, using a fixture with two messages and one tool.
    - `[data-detail]` is present.
  - **`shows tool and error tabs`:** a tool row gives `['Call','Result','Raw']`; a 403 row gives `['Overview','Raw']`, and its Overview contains the problem text.
  - **`auto-selects a live HTTP error but never replaces a user's selection`.**
  - **`closes the detail with the close button and Escape`:** focus returns to the row button.
  - **`keeps the selection and focus across store updates`:** recording further events keeps the same focused row button node and the open tab.
  - **`greys rows after the playhead and marks the current row`:** after `store.seek(0)`, later rows carry `data-future`, and the current row carries `data-current`.
  - **`Response lists events and seeks on click`.**
  - **`Raw request highlights the captured payload and copies it`.**
  - **`roves between row buttons with the arrow keys`.**
  - **`scrubs from the overview strip`.**
- [ ] **Step 2:** run; expect a FAIL.
- [ ] **Step 3:** implement the timeline, the view, the shell wiring and the CSS. Update the two existing tests that used `.wb-request-list`: they now target `.wb-requests-table` row buttons and, for the 403, the auto-selected detail.
- [ ] **Step 4:** run `npx vitest run --config www/vitest.config.mts www/test/workbench`; expect all PASS.
- [ ] **Step 5:** commit `feat(www): inspect workbench requests in a timeline, table and detail tabs`.

### Task 5: Verifiers, guides and full checks

**Files:**
- Modify: `www/src/tools/verify-workbench-layout.ts` (`expectWorkbenchDefaultLayout`: when the selected tab is Requests, assert the overview slider and table instead of the pair)
- Modify: `www/src/tools/verify-workbench.ts`, `verify-onboarding-workbench.ts`, `verify-recipe-workbench.ts`, `verify-decision-workbench.ts`, `verify-workflow-workbench.ts`, wherever they read `[data-detail]` or request detail while Requests is open.
  - The debugging lesson relies on the auto-selected 403.
  - Elsewhere, select a row (`getByRole('button', { name: 'Model request' })`) before reading detail.
- Modify guides that describe the Requests tab, in both `www/content/docs/react` and `www/content/docs/angular`. Find them with `grep -rln "Requests" www/content/docs/{react,angular}`: at least `start/workbench.md`, `concept/functions.md`, `concept/debugging.md` and `concept/ai-basics.md`. Describe the overview, table, detail tabs and drag-to-scrub; keep the image alt text accurate.
- Modify `www/examples/quickstart/README.md` if it describes the Requests tab.

- [ ] **Step 1:** update the verifiers, then run `npx nx workbench-build www` and `npx nx workbench-e2e www`; expect every path to PASS.
- [ ] **Step 2:** update the guides and the README.
- [ ] **Step 3:** run `npx nx test www`, `npx nx lint www` and `npx nx typecheck www`; expect a PASS.
- [ ] **Step 4:** commit `docs(www): describe the workbench requests inspector`.
