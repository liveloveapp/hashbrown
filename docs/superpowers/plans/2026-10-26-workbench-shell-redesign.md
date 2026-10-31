# Canonical Workbench Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the workbench's four-panel shell with a collapsible sidebar, a chat/inspector split the user can resize, one paired inspector and a player-style timeline. Capture, SDK and server behaviour stay unchanged.

**Architecture:** The shell is vanilla DOM shared by React and Angular (`www/examples/quickstart/runtime/workbench-view.ts` + `workbench.css`). New, focused modules hold the pure logic (layout prefs, player helpers, lesson groups, icons) and the DOM pieces that must survive `render()` (sidebar, split handle). `mountWorkbench` wires them together. Its existing per-tab captured/detail computation is moved into a paired inspector, not rewritten.

**Tech Stack:** TypeScript, DOM APIs, CSS (grid, container queries), Vitest (jsdom for DOM tests), Playwright verifiers, Nx.

**Spec:** `docs/superpowers/specs/2026-10-26-workbench-shell-redesign.md`

## Global Constraints

- No new dependencies. Icons are inline SVG, Lucide-style: 24 viewBox, 2px stroke, round caps, `aria-hidden="true"`. No emoji.
- Keep the LLA light canvas, Hanken Grotesk, JetBrains Mono, ink actions and cobalt (`#002fa7`) selection, on the 4px spacing grid. No dark mode.
- No change to `WorkbenchStore`, frames, transports, server code, lesson prompts or acceptance rules. Replay stays inert.
- Keep these accessible names: Play/Pause, Previous event, Next event, Return to live, Raw events, Playback speed, Seek captured event (a `role="slider"` native range), New conversation, First prompt, Follow-up, Send, Stop.
- Keep these hooks: `.wb-inspector .wb-inspection` (captured body), `.wb-nav [aria-pressed=true]` (current conversation), `.wb-lessons a[href$="lesson=<id>"]`, `.wb-events` (tick buttons), `[data-send]`, `[data-source]`, `.wb-chat .wb-panel-head`.
- The new interpreted-section hook is `[data-detail]`. Do not keep a hidden `.wb-detail`.
- Sizes: sidebar 216px expanded / 48px rail. Default split 44 (chat %). Split clamped to 25–75, ±4 per arrow key. Minimums 280px chat / 320px inspector. The pair goes side by side at an inspector width of at least 560px. Single column below 800px viewport.
- localStorage key `hashbrown.workbench.layout`. Every access goes in try/catch. Defaults: `{ rail: false, collapsed: [], split: 44 }`.
- Tests first. Top-level `test()` only, arrange/act/assert separated by blank lines. TSDoc on every new export. Fix lint, don't suppress it.
- Run Nx targets one after another, never in parallel. They share `dist/docs-quickstart/compiled`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

## Review Focus

1. Space pressed while a player button has focus must toggle play once, not twice. The shortcut handler ignores button, input, select, textarea and contenteditable targets (Task 3 test).
2. Unavailable or corrupt `localStorage` (getter throws, invalid JSON, split `999`, unknown section names) must yield defaults or clamped values and never throw (Task 2 test).
3. With two retained conversations on one page, toggling the rail in one updates the other. Keyboard shortcuts act only on the instance that is not inside a `[hidden]` ancestor (Task 7 test).
4. Store updates arriving mid-drag must not replace the split handle or the sidebar elements. Their DOM identity survives `store.record(...)` (Task 5 test).
5. In rail mode, New conversation, lesson links and conversation buttons keep their accessible names even though their visible labels are hidden (Task 4 test).

---

### Task 1: Lesson groups and icon registry

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-lessons.ts`
- Create: `www/examples/quickstart/runtime/workbench-icons.ts`
- Test: `www/test/workbench-sidebar-data.spec.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Produces:
  - `type WorkbenchSidebarSection = 'conversations' | 'concepts' | 'production' | 'recipes'`
  - `workbenchLessonGroups: readonly { readonly id: Exclude<WorkbenchSidebarSection, 'conversations'>; readonly title: string; readonly lessons: readonly WorkbenchLessonId[] }[]`
  - `type WorkbenchIconName`
  - `workbenchLessonIcons: Readonly<Record<WorkbenchLessonId, WorkbenchIconName>>`
  - `workbenchIcon(name: WorkbenchIconName): SVGSVGElement`

- [ ] **Step 1: Write the failing tests**
  - `test('groups every lesson exactly once in sidebar order')`: expect `workbenchLessonGroups.map(g => [g.id, g.title, g.lessons])` toEqual
    - `['concepts','Concepts',['generative-ui','tools','structured-output','streaming','schemas','decisions']]`
    - `['production','Production',['debugging','request-transformation']]`
    - `['recipes','Recipes',['prose','predictions','ui-selection']]`

    Also expect the flattened ids, sorted, to equal `workbenchLessons.map(l => l.id)`, sorted.
  - `test('gives every lesson an icon')`: for each lesson, `workbenchLessonIcons[lesson.id]` is defined.
  - `test('renders decorative inline SVG icons')`: `workbenchIcon('play')` has tagName `svg`, `aria-hidden="true"`, `focusable="false"`, `viewBox="0 0 24 24"`, class `wb-icon`, and at least one child.
- [ ] **Step 2: Run** `npx vitest run --config www/vitest.config.mts www/test/workbench-sidebar-data.spec.ts`. Expected: FAIL (missing exports).
- [ ] **Step 3: Implement.**
  - Add the type and groups to `workbench-lessons.ts`.
  - In `workbench-icons.ts`, `WorkbenchIconName` covers: `plus`, `sidebar`, `chevron-down`, `conversation`, `previous-turn`, `previous-event`, `play`, `pause`, `next-event`, `next-turn`, `raw-events`, `layout`, `wrench`, `braces`, `activity`, `file-code`, `branch`, `bug`, `transform`, `wand`, `lightbulb`, `square-check`.
  - Copy the path data from the `<symbol>` elements in `.superpowers/brainstorm/30258-1793046962/content/layout-v3.html` (`pause` is two `rect`s). Lesson mapping: generative-ui→layout, tools→wrench, structured-output→braces, streaming→activity, schemas→file-code, decisions→branch, debugging→bug, request-transformation→transform, prose→wand, predictions→lightbulb, ui-selection→square-check.
  - Build with `document.createElementNS('http://www.w3.org/2000/svg', …)`, never `innerHTML`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(www): add workbench lesson groups and inline icons`

### Task 2: Persisted layout preferences

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-layout.ts`
- Test: `www/test/workbench-layout.spec.ts`

**Interfaces:**
- Consumes: `WorkbenchSidebarSection` (Task 1).
- Produces:
  - `interface WorkbenchLayout { readonly rail: boolean; readonly collapsed: readonly WorkbenchSidebarSection[]; readonly split: number }`
  - `workbenchLayoutDefaults: WorkbenchLayout` (`{ rail: false, collapsed: [], split: 44 }`)
  - `workbenchLayoutKey = 'hashbrown.workbench.layout'`
  - `clampWorkbenchSplit(value: number): number` (25–75; non-finite → 44)
  - `stepWorkbenchSplit(split: number, key: string): number | null`: `ArrowLeft` −4, `ArrowRight` +4, `Home` → 44, clamped. Any other key → `null`.
  - `parseWorkbenchLayout(raw: string | null): WorkbenchLayout`
  - `interface WorkbenchLayoutStore { get(): WorkbenchLayout; set(patch: Partial<WorkbenchLayout>): void; subscribe(listener: () => void): () => void }`
  - `createWorkbenchLayoutStore(storage?: Pick<Storage, 'getItem' | 'setItem'>): WorkbenchLayoutStore`
  - `workbenchLayout: WorkbenchLayoutStore`: a shared singleton over `globalThis.localStorage`, resolved inside try/catch.

- [ ] **Step 1: Write the failing tests**
  - `test('clamps and steps the split')`:
    - `clampWorkbenchSplit(10)` → 25, `(90)` → 75, `(NaN)` → 44.
    - `stepWorkbenchSplit(44,'ArrowRight')` → 48, `(74,'ArrowRight')` → 75, `(60,'Home')` → 44, `(44,'Enter')` → null.
  - `test('parses stored layouts defensively')`:
    - `parseWorkbenchLayout(null)` and `('not json')` → defaults.
    - `('{"rail":true,"collapsed":["recipes","bogus"],"split":999}')` → `{ rail: true, collapsed: ['recipes'], split: 75 }`.
  - `test('persists patches and notifies subscribers')`:
    - Arrange a fake storage over a `Map`.
    - `set({ rail: true })` → `get().rail` is true, the listener is called once, and the storage holds JSON with `rail:true`.
    - A second store over the same storage reads `rail: true`.
  - `test('survives storage that throws')`: `getItem`/`setItem` throw. `get()` returns defaults, and `set({ split: 60 })` does not throw and updates memory (`get().split === 60`).
- [ ] **Step 2: Run** `npx vitest run --config www/vitest.config.mts www/test/workbench-layout.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `workbench-layout.ts`. Use an in-memory copy as the source of truth and write it back to storage on every `set`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(www): persist workbench layout preferences`

### Task 3: Player helpers and keyboard shortcuts

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-player.ts`
- Test: `www/test/workbench-player.spec.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Produces:
  - `workbenchTurnSegments(events: readonly { readonly turn: number }[]): readonly { readonly turn: number; readonly start: number; readonly end: number }[]` (inclusive event indexes, in order)
  - `workbenchTickPercent(index: number, total: number): number` (`total <= 1` → 0, else `index / (total - 1) * 100`)
  - `adjacentTurnIndex(events: readonly { readonly turn: number }[], cursor: number | null, direction: -1 | 1): number | null`. A `null` cursor means the last event.
    - For −1: return the start of the current turn when the cursor is past it, else the start of the previous turn, else `null`.
    - For +1: return the start of the next turn, else `null`.
  - `formatPlaybackSeconds(ms: number): string` (`2140` → `'2.14 s'`)
  - `nextPlaybackSpeed(speed: number): 0.5 | 1 | 2` (0.5→1→2→0.5; anything else → 1)
  - `type WorkbenchShortcut = 'toggle-play' | 'previous-event' | 'next-event' | 'previous-turn' | 'next-turn' | 'live' | 'toggle-sidebar'`
  - `workbenchShortcut(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>, target: EventTarget | null): WorkbenchShortcut | null`
    - Returns `null` when the target is inside `input`, `textarea`, `select`, `button` or `[contenteditable]`.
    - Space → toggle-play. ←/→ → previous/next-event. Shift+←/→ → previous/next-turn. `l` or `L` (no modifier) → live. Meta-or-Ctrl+`b` → toggle-sidebar.

- [ ] **Step 1: Write the failing tests**
  - `test('splits events into turn segments')`: turns `[1,1,1,2,2]` → `[{turn:1,start:0,end:2},{turn:2,start:3,end:4}]`.
  - `test('positions ticks by event index')`: `(0,1)` → 0, `(61,123)` → 50, `(122,123)` → 100.
  - `test('jumps between turns like a media player')`: with turns `[1,1,1,2,2]`:
    - `(cursor 4, -1)` → 3, `(3, -1)` → 0, `(0, -1)` → null.
    - `(1, 1)` → 3, `(3, 1)` → null, `(null, -1)` → 3.
  - `test('formats time and cycles speed')`: `formatPlaybackSeconds(7330)` → `'7.33 s'`. `nextPlaybackSpeed` 0.5→1, 1→2, 2→0.5, 3→1.
  - `test('maps keys to shortcuts outside text fields and buttons')`:
    - `' '` on `document.body` → toggle-play. Shift+ArrowLeft → previous-turn. `{key:'b',metaKey:true}` → toggle-sidebar.
    - `' '` with a `button` target → null. ArrowRight with an `input[type=range]` target → null. `'l'` with a `textarea` target → null.
- [ ] **Step 2: Run** `npx vitest run --config www/vitest.config.mts www/test/workbench-player.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `workbench-player.ts`. Pure functions only. Use `target instanceof Element && target.closest(...)` for the field check.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(www): add workbench player helpers and shortcuts`

### Task 4: Collapsible sectioned sidebar

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-sidebar.ts`
- Modify: `www/examples/quickstart/runtime/workbench-view.ts` (`mountWorkbench` signature, `renderNavigation`)
- Test: `www/test/workbench-shell.spec.tsx` (new, `// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `mountWorkbench(host, store, commands, options?: { readonly layout?: WorkbenchLayoutStore })`. The default is the `workbenchLayout` singleton. Tests pass `createWorkbenchLayoutStore()` with a fake storage.
  - `renderWorkbenchSidebar(nav: HTMLElement, options: WorkbenchSidebarOptions): void`. It replaces nav's children. Options are:
    - `framework`, `currentLesson: WorkbenchLessonId`
    - `conversations: readonly { id: string; label: string }[]`, `currentConversation: string`
    - `layout: WorkbenchLayout`
    - `onSelect(id: string)`, `onCreate()`, `onToggleRail()`, `onToggleSection(section: WorkbenchSidebarSection)`
- DOM contract:
  - `nav.wb-nav`, then `.wb-nav-top` holding:
    - `button.wb-cta` (plus icon, `.wb-label` "New conversation", `aria-label="New conversation"`)
    - `button.wb-rail-toggle` (sidebar icon, `aria-label` "Collapse sidebar"/"Expand sidebar", `aria-expanded` = !rail)
  - Then one `section.wb-nav-group[data-section]` per section in the order conversations, concepts, production, recipes. Each has:
    - `button.wb-nav-heading` (`aria-expanded`, `aria-controls` → list id, chevron icon)
    - a list: `.wb-conversations` for conversations, `.wb-lessons` for lesson groups
  - Collapsed lists get `data-collapsed` and `inert`. In rail mode, lists are never inert.
  - Conversation rows: `button` with icon and `.wb-label`, `aria-pressed`, `aria-label` = label. `textContent` stays exactly the label.
  - Lesson rows: `a[href="<framework>.html?lesson=<id>"]` with icon, `.wb-label`, `aria-label`, and `aria-current="page"` on the current lesson.
  - The root `.wb` toggles class `wb-rail`.
  - `mountWorkbench` subscribes to the layout store and re-renders the sidebar on change. The listener is removed in `dispose`.

- [ ] **Step 1: Write the failing tests** in `workbench-shell.spec.tsx`. Mount with lesson `{ id:'tools', … }` and an injected layout store.
  - `test('renders New conversation first and four expanded sections by default')`:
    - The first button in `.wb-nav` has aria-label `New conversation`.
    - The `[data-section]` values are `['conversations','concepts','production','recipes']`, and every heading has `aria-expanded="true"`.
    - `a[aria-current=page]` href ends with `lesson=tools`.
    - `.wb-nav [aria-pressed=true]` textContent is `Two-step plan`.
  - `test('folds a section and persists it')`:
    - Click the Recipes heading.
    - Its list has the `inert` attribute and the heading has `aria-expanded="false"`.
    - `layout.get().collapsed` toEqual `['recipes']`.
  - `test('collapses to an icon rail that keeps accessible names')`:
    - Click `.wb-rail-toggle`. `.wb` has class `wb-rail`, and the toggle's aria-label is `Expand sidebar`.
    - Every lesson link and the CTA still have a non-empty `aria-label`. No list is inert.
  - `test('shares rail state across retained instances')`: mount two shells with the same layout store, toggle the rail in the first, and the second root has `wb-rail`.
  - `test('keeps sidebar elements across store updates')`: grab the CTA element, then `store.send('Plan'); store.record('tool', {…})`. The same CTA node is still connected (`toBe`).
  - Update `www/test/workbench-clients.spec.tsx` wherever it finds "New conversation" or conversation buttons by `textContent`. Match `textContent?.trim()` or `aria-label`.
- [ ] **Step 2: Run** `npx vitest run --config www/vitest.config.mts www/test/workbench-shell.spec.tsx www/test/workbench-clients.spec.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `workbench-sidebar.ts` and switch `renderNavigation` in `mountWorkbench` to it. The `New conversation` action body stays as it is.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(www): collapsible sectioned workbench sidebar`

### Task 5: Resizable chat/inspector split

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-split.ts`
- Modify: `www/examples/quickstart/runtime/workbench-view.ts` (layout grid: `nav, chat, split, inspector`)
- Test: `www/test/workbench-shell.spec.tsx`

**Interfaces:**
- Consumes: `WorkbenchLayoutStore`, `stepWorkbenchSplit`, `clampWorkbenchSplit` (Task 2).
- Produces: `createWorkbenchSplit(options: { readonly chat: HTMLElement; readonly inspector: HTMLElement; readonly layout: WorkbenchLayoutStore }): HTMLElement`. It returns `div.wb-split` containing:
  - `role="separator"`, `aria-orientation="vertical"`, `aria-label="Resize chat and inspector"`, `aria-valuemin="25"`, `aria-valuemax="75"`, `aria-valuenow`, `tabindex="0"`
  - a child `.wb-grip` with two chevron polylines
- Behaviour:
  - Pointer drag: on `pointerdown`, capture the pointer and measure `chat.left` to `inspector.right`. Each `pointermove` sets `split = clamp((x - left) / width * 100)`, ignoring the handle width.
  - Keys go through `stepWorkbenchSplit`, and `dblclick` sets 44.
  - `mountWorkbench` writes three properties on `.wb-layout` from `layout.get().split` on every layout change: `--wb-split: <n>`, `--wb-chat: <n>fr` and `--wb-inspector: <100-n>fr`. CSS cannot multiply `fr` inside `calc()`.

- [ ] **Step 1: Write the failing tests**
  - `test('steps, clamps and resets the split from the keyboard')`:
    - Focus the separator and dispatch ArrowRight ×2. `aria-valuenow` is `"52"`, `layout.get().split` is 52, and `.wb-layout` style has `--wb-split: 52` and `--wb-chat: 52fr`.
    - Home → 44. `dblclick` after ArrowLeft → 44.
  - `test('drags the split relative to chat and inspector')`:
    - Stub `getBoundingClientRect` so `chat.left=0` and `inspector.right=1000`.
    - Dispatch `pointerdown` then `pointermove` at clientX 700 → split 70, and at 900 → 75.
    - Stub `setPointerCapture` on the element.
  - `test('keeps the handle across store updates')`: the handle node is the same after `store.record(...)`. This is Review Focus 4.
- [ ] **Step 2: Run** the shell spec. Expected: FAIL.
- [ ] **Step 3: Implement** `workbench-split.ts` and insert it between chat and inspector in `mountWorkbench`.
- [ ] **Step 4: Run** the shell spec. Expected: PASS.
- [ ] **Step 5: Commit** `feat(www): resizable workbench chat and inspector split`

### Task 6: Paired inspector without the Context panel

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-view.ts` (remove `detail` aside, `drawer`, Details/Raw/Console; restructure `inspection`)
- Modify: `www/test/workbench-clients.spec.tsx`, `www/test/workbench-recipe-clients.spec.tsx`
- Modify: `www/src/tools/verify-workbench.ts`, `www/src/tools/verify-recipe-workbench.ts`, `www/src/tools/verify-decision-workbench.ts`

**Interfaces:**
- DOM contract inside `section.wb-inspector`:
  - `.wb-tabs` (unchanged).
  - `.wb-selection`:
    - `span.wb-chip.wb-chip-active` = the current event label (`workbenchEventLabel`), or `Live` when there is no frame
    - `Turn n · <elapsedMs> ms · event i/total`
    - `span.wb-chip` with provenance text matching `[data-source]`
  - `.wb-pair[role=tabpanel]` (owns the existing `inspection.id`, and tabs' `aria-controls` point at it), containing:
    - `section.wb-section[data-captured]`:
      - header with the existing captured heading (`recipeView?.heading ?? …`) and `button.wb-raw` (`{ }` text, `aria-label="Show captured frame"`, `aria-pressed`)
      - body `.wb-inspection` holding today's captured content (pre, request list, or error alert)
      - when raw is pressed, the body shows today's Raw content instead: `h3` `kind · source` and `pre(tab === 'Transform' && transform ? transform : frame?.payload)`
    - `section.wb-section[data-detail]`: today's Details heading, `pre`, and the "Captured from …" note.
  - Raw state is a `let` in `mountWorkbench`, kept across renders.
  - Console is deleted. Every tab shows both sections.
- Verifier migration:
  - `.wb-detail .wb-inspection` → `.wb-inspector [data-detail]`
  - `.wb:visible .wb-detail` → `.wb:visible .wb-inspector [data-detail]`
  - `text('.wb-detail .wb-inspection')` in the recipe verifier → `text('.wb-inspector [data-detail]')`
  - `.wb-inspector .wb-inspection` is unchanged, because it is still the captured body only.

- [ ] **Step 1: Update the tests first.**
  - Replace `test('offers scoped Details Raw and Console views …')` with `test('pairs captured and interpreted content under one selection strip')`:
    - After the same arrange, `.wb-detail` and `aside` are null and `[data-detail]` contains `Trusted plan`.
    - `.wb-selection` contains `Turn 1` and matches `/event \d+\/\d+/`.
    - `[role=tab]` labels include none of `Details`, `Raw`, `Console`.
    - Click `button.wb-raw`: it gets `aria-pressed="true"`, and `.wb-inspection` contains `complete` (the selected frame kind or source).
  - Change every other `.wb-detail` query in both spec files to `[data-detail]`.
  - Apply the verifier migration above.
- [ ] **Step 2: Run** `npx vitest run --config www/vitest.config.mts www/test/workbench-clients.spec.tsx www/test/workbench-recipe-clients.spec.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the restructure in `mountWorkbench` and `render()`. Move the existing heading and value expressions unchanged. Only their containers change.
- [ ] **Step 4: Run** the same command plus `npx vitest run --config www/vitest.config.mts www/test/workbench-*.spec.ts*`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(www): pair captured and interpreted views in the workbench inspector`

### Task 7: Player bar

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-view.ts` (footer controls, `render()` timeline section, keydown listener, `dispose`)
- Modify: `www/test/workbench-clients.spec.tsx`, `www/test/workbench-recipe-clients.spec.tsx` (button helpers)
- Test: `www/test/workbench-shell.spec.tsx`

**Interfaces:**
- Consumes: Task 3 helpers, Task 1 `workbenchIcon`, Task 2 layout store (for ⌘B).
- DOM contract, `section.wb-playback[aria-label="Captured timeline"]` → `.wb-player`:
  - `.wb-transport`: icon buttons (no visible text) with `aria-label`s: `Previous turn`, `Previous event`, `Play`/`Pause` (class `wb-play`), `Next event`, `Next turn`.
  - `.wb-scrubber`:
    - `.wb-segment` per turn: left/width from `workbenchTickPercent` on start/end, a `Turn n` label, and `data-played` when the cursor ≥ start
    - the existing native range (`aria-label="Seek captured event"`), styled
    - `.wb-events` holding the milestone (or raw) tick buttons, absolutely positioned with `style.left = <percent>%`. They keep today's `aria-label`, `aria-pressed`, click → seek and `disabled = busy`.
    - `.wb-flag[aria-hidden=true]` holds the active milestone label, positioned at the cursor's percent.
  - `.wb-time`: `formatPlaybackSeconds(frame.elapsedMs) / formatPlaybackSeconds(last.elapsedMs)`, or `No captured events`.
  - `button.wb-speed`: `aria-label="Playback speed"`, text `½×`/`1×`/`2×`, click → `nextPlaybackSpeed`.
  - Raw events button: list icon, `aria-label="Raw events"`, `aria-pressed`.
  - `button.wb-live`: `aria-label="Return to live"`.
    - At live (`cursor === null`) it is disabled with `data-live`, shows a red dot and the text `LIVE`.
    - In replay it is enabled and shows a grey dot and the text `Go live`.
  - The `Conversation turn` select is removed.
  - Shortcuts: a `document` keydown listener calls `workbenchShortcut(event, event.target)` and acts only when `!root.closest('[hidden]')`, calling `preventDefault` when it acts. The listener is removed in `dispose`.
    - toggle-play → `play.click()`.
    - previous/next-event → those buttons.
    - previous/next-turn → seek `adjacentTurnIndex(...)` when non-null.
    - live → `returnLive.click()` when enabled.
    - toggle-sidebar → `layout.set({ rail: !layout.get().rail })`.
    - Disabled buttons stay inert.

- [ ] **Step 1: Write and update the tests**
  - Change the `byText`/`button` helpers in both client specs to match `textContent?.trim() === text || getAttribute('aria-label') === text`.
  - Shell spec, `test('jumps turns and cycles speed from the player')`:
    - Two turns recorded, then settled.
    - Click `Previous turn` → cursor = start index of turn 2. Click it again → 0.
    - Click `Next turn` → the turn-2 start.
    - The speed button text goes `1×` → `2×` → `½×` across two clicks.
  - Shell spec, `test('shows LIVE at the head and Return to live in replay')`:
    - At live, `.wb-live` is disabled with `data-live` and text `LIVE`.
    - Click `Previous event`: it is enabled, the text is `Go live`, and clicking it sets cursor `null`.
  - Shell spec, `test('drives playback from shortcuts only on the visible instance')`:
    - Two mounts, the second host has `hidden`.
    - Dispatch keydown ArrowLeft on `document.body`. Only the first store's cursor changes.
    - Dispatch `' '` with the event target set to the Play button: no change (Review Focus 1).
    - After `dispose()`, keydown has no effect.
  - Shell spec, `test('toggles the rail with Cmd+B')`: keydown `{ key: 'b', metaKey: true }` → `layout.get().rail === true`.
  - Keep the existing raw-events count test (`3` → `22` buttons under `.wb-events`). Find its toggle by aria-label.
- [ ] **Step 2: Run** `npx vitest run --config www/vitest.config.mts www/test/workbench-shell.spec.tsx www/test/workbench-clients.spec.tsx www/test/workbench-recipe-clients.spec.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the footer and its `render()` updates in `mountWorkbench`. Create the controls once and update their attributes in `render()`. Only `.wb-events` and the segments are rebuilt.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(www): player-style workbench timeline`

### Task 8: Shell styles

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench.css`

**Interfaces:**
- Consumes the class and attribute names from Tasks 4–7 and the custom properties `--wb-chat` and `--wb-inspector`.

- [ ] **Step 1: Restyle.**
  - Define colour tokens on `.wb` (canvas, panel, line, muted, faint, ink, cobalt, cobalt-soft, code, live `#dc2626`).
  - Grid: `.wb-layout { grid-template-columns: var(--wb-nav, 216px) minmax(280px, var(--wb-chat, 44fr)) 14px minmax(320px, var(--wb-inspector, 56fr)) }`.
  - `.wb-rail` sets `--wb-nav: 48px`. The track animates for 200ms.
  - Rail: hide `.wb-label` and heading text, turn headings into 1px dividers, centre the 36px items, and show a tooltip from `aria-label` on hover/focus.
  - `.wb-nav-group [data-collapsed]` uses a `grid-template-rows: 0fr` transition.
  - `.wb-inspector { container-type: inline-size }`. `@container (min-width: 560px)` puts `.wb-pair` side by side, otherwise it stacks. Code surfaces stay light.
  - Player: circular ink Play, ghost icon buttons, cobalt played segments, grey ticks (cobalt when played or pressed), a dark flag, a red live dot.
  - `@media (max-width: 800px)`: single column. `.wb-split` and `.wb-rail-toggle` are hidden, `.wb-rail` is ignored, and the sidebar becomes a wrapping strip with labels visible.
  - `@media (prefers-reduced-motion: reduce)`: remove transitions.
  - Keep `:focus-visible` outlines in cobalt.
  - Do not let the document scroll sideways at 390px.
- [ ] **Step 2: Build and look.**
  - Run `npx nx workbench-build www`, then serve it. See the README; if port 4370 is busy, use the port override from the session log.
  - Screenshot `react.html` and `angular.html?lesson=prose` at 1600×1000, 1100×800 (the pair should stack) and 390×844.
  - Check: no horizontal overflow, the rail and the sections toggle, the handle drags.
- [ ] **Step 3: Commit** `style(www): restyle the workbench shell`

### Task 9: End-to-end verification and default-layout checks

**Files:**
- Modify: `www/src/tools/verify-workbench.ts`

- [ ] **Step 1: Add default-state assertions** after the existing `.wb-inspector` visibility check:
  - `.wb:visible` has no class `wb-rail`.
  - `.wb:visible .wb-split` has `aria-valuenow="44"`.
  - `.wb:visible .wb-nav-heading[aria-expanded=false]` count is 0.
  - At the 1600×1000 viewport, the bounding boxes of `[data-captured]` and `[data-detail]` share the same `y` (side by side).
- [ ] **Step 2: Run, one after another:**
  - `npx nx test www`
  - `npx nx lint www`
  - `npx nx typecheck www`
  - `npx nx workbench-build www`
  - `npx nx workbench-e2e www`

  Expected: all pass, the e2e report covers both frameworks and every lesson path, and the 390px overflow check passes. Report any failures with their output.
- [ ] **Step 3: Commit** `test(www): verify workbench default layout`

### Task 10: Guide and README prose

**Files:**
- Modify: `www/examples/quickstart/README.md` and these 14 guides: `www/content/docs/{react,angular}/start/workbench.md`, `concept/{components,streaming,functions,debugging}.md`, `recipes/{predictive-actions,prose}.md`

- [ ] **Step 1: Rewrite the shell descriptions** in the author's plain first-person teaching voice:
  - "far-right panel" / "contextual panel" / "Details, Raw, and Console views" → each inspector tab pairs what was captured with what the SDK or app made of it, and `{ }` shows the captured frame.
  - The left navigation → a collapsible sidebar with Conversations, Concepts, Production and Recipes, plus **New conversation** at the top.
  - The timeline → a player: play, step by event or turn, scrub, **Raw events**, and **Return to live**.
  - Mention the resizable split once in each `start/workbench.md`.
  - Do not touch `<hb-code-example>` blocks or `<hb-docs-demo>` embeds. The media is re-recorded in the follow-up PR.
- [ ] **Step 2: Run** `npx nx test www`. Expected: PASS, including `www/test/docs/workbench-guides.spec.ts`.
- [ ] **Step 3: Commit** `docs(www): describe the redesigned workbench shell`
