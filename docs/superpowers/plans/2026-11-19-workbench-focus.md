# Workbench Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workbench (standalone and docs embed) calmer. Each lesson
opens on the view it teaches, the clutter is cut, spacing follows one rhythm,
and generative lessons highlight the newest streamed text in both the JSON and
the rendered card.

**Architecture:** The shared vanilla-DOM shell (`mountWorkbench` in
`www/examples/quickstart/runtime/workbench-view.ts` plus `workbench.css`) owns
the layout, inspector and player. The React and Angular clients portal their
chat UI into the shell's `live` element. New logic goes into small pure
modules with Vitest specs: the tab rule, the fresh-text diff, and the fresh
mark. The view wires them in. The work ships as five PRs, one per phase below.

**Tech Stack:** TypeScript, vanilla DOM, CSS custom properties, React 19,
Angular (standalone, signals), Vitest, Playwright verifiers in
`www/src/tools/verify-workbench*.ts`, Nx.

**Spec:** `docs/superpowers/specs/2026-11-19-workbench-focus-design.md`

## Global Constraints

- Keep every existing tab name (**JSON**, **UI**, **Requests**, **State**,
  **Schema**, **Transform**, **Server**, **History**, **Agent**, **Access**,
  **Kit**, **Code**, **Runtime**, **Markdown**, **Text**, …). Never rename one.
- Keep the **First prompt** and **Follow-up** buttons and their names.
- Keep these accessible names and hooks, or update every verifier that reads
  them in the same task:
  - accessible names: Play, Return to live, "Seek captured event", the
    "Inspector views" tablist;
  - selectors: `.wb-inspector .wb-inspection`, `[data-captured]`,
    `[data-detail]`, `.wb-lessons a`, `[data-source]`, `data-mode` ids.
- Every spacing value sits on the `--wb-space-*` 4px grid. This is enforced by
  `www/test/workbench-spacing-grid.spec.ts`.
- Full workbench: gutter, gaps between panels and inner panel padding are
  `--wb-space-4` (16px). Embed: `--wb-space-3` (12px).
- Keep the `--wb-*` colour and type tokens. The highlight colour is
  `--wb-cobalt-soft`.
- Tests are top-level `test(...)` only, with arrange/act/assert separated by
  blank lines. New public or reusable functions get TSDoc.
- No new dependencies.
- Every docs page's named views stay reachable, and "opens first" claims stay
  true.
- Before each PR, run `npx nx test www`, `npx nx lint www`,
  `npx nx build www` and `npx nx workbench-e2e www`. Before PR 4 also run
  `npx nx e2e www`.

## Review Focus

1. **Narrow embed (790px frame, about 400px inspector):** four tabs, More and
   the mode toggle in one row must not overflow sideways. Task 6 adds the
   overflow check at 790px.
2. **A reader with a saved layout from before this change:** they must land in
   rail mode once, with their split kept. Task 8 tests that a v1 layout
   migrates.
3. **A More tab while the reader scrubs or the lesson changes:** the promoted
   tab stays selected across renders, and a new lesson resets it. Task 6 tests
   both.
4. **The highlight on replay and seek-back:** scrubbing backwards shows the
   delta at the new cursor, never a stale one, and a completed run shows none.
   Task 10 tests seek-back, and Task 12's verifier checks a backwards seek.
5. **Screen-reader and keyboard users after the cuts:** the status still
   announces, the hidden prompt label still names the textarea, and the More
   menu is reachable with arrows and Escape. Tasks 2 and 6 assert these.

---

## Phase 1 (PR 1): Spacing and text cuts

### Task 1: Semantic spacing tokens

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench.css` (the `.wb` token
  block around lines 40–70, `.wb-embed` rules around lines 174–182 and
  1864–1880, and every panel-level padding/gap)
- Test: `www/test/workbench-spacing-grid.spec.ts`

**Interfaces:**
- Produces these CSS custom properties on `.wb`:
  - `--wb-gap: var(--wb-space-4)`: frame padding and the gap between panels;
    replaces `--wb-gutter`;
  - `--wb-pad: var(--wb-space-4)`: inner horizontal and vertical padding of
    every panel region (head rows, feed, composer, inspection, player);
  - `--wb-stack: var(--wb-space-4)`: vertical space between blocks inside a
    panel;
  - `--wb-tight: var(--wb-space-2)`: spacing inside a control group.
- `.wb.wb-embed` redefines `--wb-gap`, `--wb-pad` and `--wb-stack` as
  `var(--wb-space-3)`.

- [ ] **Step 1: Write the failing test**

Add to `workbench-spacing-grid.spec.ts`:

```ts
test('panel spacing reads only the semantic tokens', () => {
  const rules = panelRules(css, [
    '.wb', '.wb-panel-head', '.wb-feed', '.wb-composer', '.wb-tabs',
    '.wb-inspection', '.wb-player', '.wb-layout',
  ]);

  const literal = rules.filter((rule) =>
    /(?:padding|gap)\s*:[^;]*var\(--wb-space-\d+\)/.test(rule),
  );

  expect(literal).toEqual([]);
});

test('the embed redefines the rhythm one step down', () => {
  const embed = ruleBody(css, '.wb.wb-embed');

  const values = ['--wb-gap', '--wb-pad', '--wb-stack'].map((name) =>
    declaration(embed, name),
  );

  expect(values).toEqual(Array(3).fill('var(--wb-space-3)'));
});
```

`panelRules`, `ruleBody` and `declaration` are small local regex helpers in
the spec file. `panelRules` returns the declaration text of each listed
selector's top-level rule.

- [ ] **Step 2: Run the test and check it fails**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-spacing-grid.spec.ts`
Expected: FAIL. Several panel rules use `var(--wb-space-…)` directly.

- [ ] **Step 3: Add the tokens and move the panel rules onto them**

Rename `--wb-gutter` to `--wb-gap` everywhere, including `.wb-rail`'s
`--wb-nav` calc. Panel regions pad with `var(--wb-pad)` on every side, except
the head rows, which keep `min-height: var(--wb-head)` and pad sideways with
`--wb-pad`. Blocks inside a panel use `--wb-stack`. Within the feed, set
`.wb-user` and `.wb-summary` margins from `--wb-stack`.

- [ ] **Step 4: Run the test and check it passes**

Run the same command. Expected: PASS, including the existing 4px-grid tests.

- [ ] **Step 5: Run the layout verifier**

Run: `npx nx workbench-e2e www`
Expected: PASS. If `verify-workbench-layout.ts` asserts the old 12px gutter or
"panel+16" edges, update the expected values to `--wb-gap` and `--wb-pad`.

- [ ] **Step 6: Commit**

```bash
git add www/examples/quickstart/runtime/workbench.css www/test/workbench-spacing-grid.spec.ts www/src/tools/verify-workbench-layout.ts
git commit -m "style(workbench): one spacing rhythm via semantic tokens"
```

### Task 2: Header, chat and card cuts

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-view.ts:539-660` (header,
  chat head, composer)
- Modify: `www/examples/quickstart/runtime/workbench.css` (`.wb-header`,
  `.wb-composer`, `.wb-actions`)
- Modify: `www/examples/quickstart/react/src/PlanCard.tsx`,
  `www/examples/quickstart/angular/src/app/plan-card.ts`, and the
  `trusted component` eyebrows in
  `www/examples/quickstart/angular/src/app/ui-kit-workbench.ts:254,323` and
  their React counterparts in `UiKitWorkbench.tsx`
- Test: `www/test/workbench.spec.ts`, `www/test/workbench-clients.spec.tsx`

**Interfaces:**
- Produces: the chat panel's `h1` text is `commands.lesson?.title ?? 'Conversation workbench'`.
  `PlanCard` loses its `label` prop.

- [ ] **Step 1: Write the failing tests**

In `workbench.spec.ts`, using the file's existing mount helper:

```ts
test('the header keeps only the logo and framework', () => {
  const shell = mountForLesson('generative-ui');

  const header = shell.root.querySelector('.wb-header')!;

  expect(visibleText(header)).toBe('Hashbrown React');
  expect(header.querySelector('[data-source]')!.classList).toContain('wb-visually-hidden');
});

test('the chat head shows the lesson title and hides the status visually', () => {
  const shell = mountForLesson('generative-ui');

  const head = shell.root.querySelector('.wb-chat .wb-panel-head')!;

  expect(head.querySelector('h1')!.textContent).toBe('Generative UI');
  expect(head.querySelector('[role=status]')!.classList).toContain('wb-visually-hidden');
});

test('the prompt is named by a hidden label and a placeholder', () => {
  const shell = mountForLesson('generative-ui');

  const prompt = shell.root.querySelector('textarea')!;

  expect(prompt.labels![0].classList).toContain('wb-visually-hidden');
  expect(prompt.placeholder).toBe('Ask a follow-up');
});

test('Stop shows only while a run is going', () => {
  const shell = mountForLesson('generative-ui');

  const idle = stopButton(shell).hidden;
  shell.store.begin(); // the existing helper or store call that sets loading
  const running = stopButton(shell).hidden;

  expect([idle, running]).toEqual([true, false]);
});

test('an embed has no header and no visible chat head', () => {
  const shell = mountForLesson('generative-ui', { embed: 'replay' });

  const head = shell.root.querySelector('.wb-chat .wb-panel-head')!;

  expect(shell.root.querySelector('.wb-header')!.classList).toContain('wb-visually-hidden');
  expect(head.classList).toContain('wb-visually-hidden');
});
```

In `workbench-clients.spec.tsx`, assert that the rendered React `PlanCard` has
no element whose text contains `trusted component`.

`visibleText` concatenates the text of descendants without
`.wb-visually-hidden`. If the spec file has no helper like it, add one.

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench.spec.ts www/test/workbench-clients.spec.tsx`
Expected: FAIL on all of the new tests.

- [ ] **Step 3: Implement**

- Header: keep `Hashbrown` and the framework name. Remove the lesson-title
  span. Give `provenance` the class `wb-visually-hidden`, keeping
  `data-source`, because the verifiers read it. In an embed, give the header
  `wb-visually-hidden` (it still carries `[data-source]` for the verifiers), and make the whole chat head visually hidden. The docs page already
  shows the lesson name, and the status, including the commit hash, stays
  announced.
- Chat head: the `h1` becomes the lesson title (the `javascript-runtime` case
  uses its lesson title too). `status` gets `wb-visually-hidden`.
- Composer: the label gets `wb-visually-hidden`, and the textarea gets
  `placeholder = 'Ask a follow-up'`.
- First prompt and Follow-up: add the class `wb-quiet`. Style it as a
  borderless text button in `--wb-muted`, ink on hover, 28px tall.
- Stop: set `stop.hidden = !busy` where `stop.disabled` is set today.
- Cards: delete the eyebrow `<span>` in both `PlanCard`s and remove the `label`
  prop. Delete the `· trusted component` eyebrow spans in the UI kit
  workbenches. Delete the `'Application-owned plan'` muted span in the view's
  decision replay card.

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Update the verifiers**

Run: `npx nx workbench-e2e www`. Any verifier that matched "A plan, built
together", "Live ·", the visible "Your message" label or the card eyebrow
switches to the lesson title, `[role=status]` text, the textarea's accessible
name, or nothing. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A www/examples/quickstart www/test www/src/tools
git commit -m "feat(workbench): cut header, chat and card chrome"
```

### Task 3: Inspector chrome cuts

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-view.ts:731-751`
  (`captured`, `capturedHeader`, `caption`) and the render code that fills
  `capturedHeading` and `caption` (around lines 1660–1690)
- Modify: `www/examples/quickstart/runtime/workbench.css` (`.wb-tabs`,
  `.wb-section-head`, `.wb-caption`)
- Modify: `www/src/tools/verify-workbench-layout.ts:190-235,454`
- Test: `www/test/workbench-inspector-panel.spec.tsx`

**Interfaces:**
- Produces: the tab row `.wb-tabs` is now a flex row holding the tablist
  buttons, then a spacer, then `modeControl.element`. Task 6 inserts the More
  button before the spacer.

- [ ] **Step 1: Write the failing tests**

```ts
test('the mode toggle sits in the tab row', () => {
  const shell = mountForLesson('generative-ui');

  const row = shell.root.querySelector('.wb-inspector .wb-tabs-row')!;

  expect(row.querySelector('[role=tablist]')).not.toBeNull();
  expect(row.querySelector('.wb-segmented')).not.toBeNull();
});

test('the inspector has no caption and no visible section title', () => {
  const shell = mountForLesson('generative-ui');

  const inspector = shell.root.querySelector('.wb-inspector')!;

  expect(inspector.querySelector('.wb-caption')).toBeNull();
  expect(inspector.querySelector('[data-captured] h3')!.classList).toContain('wb-visually-hidden');
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-inspector-panel.spec.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Wrap the tablist in a new `div.wb-tabs-row`, which takes over today's
  `.wb-tabs` box styles. The tablist keeps `role=tablist` and
  `aria-label="Inspector views"`.
- Move `modeControl.element` to the end of the row, pushed right with
  `margin-left: auto`.
- Make `capturedHeading` visually hidden but still the section's heading, and
  delete `capturedHeader`.
- Delete `caption` and the code that computes `sourcePhrase` and fills
  `caption`.
- Remove the `.wb-caption` and `.wb-section-head` CSS. `.wb-inspection` pads
  with `var(--wb-pad)`.

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Update the layout verifier**

In `verify-workbench-layout.ts`, drop the caption and section-head edge and
height checks, and remove `.wb-section-head` and `.wb-caption` from the target
selector list at line 454. Add a check that `.wb-segmented` and the selected
tab share a centre line within 1px.

Run: `npx nx workbench-e2e www`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A www/examples/quickstart/runtime www/test www/src/tools
git commit -m "feat(workbench): fold inspector heading, mode toggle and caption into the tab row"
```

### Task 4: One scrubber

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-requests-view.ts:388,435,1129-1140,1215`
  (remove the overview timeline)
- Modify: `www/examples/quickstart/runtime/workbench-view.ts` (segment labels
  and `flag` in the player)
- Modify: `www/examples/quickstart/runtime/workbench.css` (`.wb-segments`,
  `.wb-flag`, `.wb-requests-overview`)
- Modify: `www/content/docs/react/start/workbench.md:116`,
  `www/content/docs/angular/start/workbench.md:116`
- Test: `www/test/workbench-requests-view.spec.tsx`,
  `www/test/workbench-player.spec.ts`

**Interfaces:**
- Consumes: `workbenchActiveAxis(events)`, still used for the table waterfall.
- Produces: `createWorkbenchRequestsView(...)` no longer takes or renders a
  timeline. `update(...)` still accepts `flag`; it may stay unused.

- [ ] **Step 1: Write the failing tests**

```ts
test('the Requests view has no overview timeline', () => {
  const view = createWorkbenchRequestsView({ instanceId: 'x', seek: () => undefined });

  view.update(fixtureUpdate());

  expect(view.element.querySelector('.wb-requests-overview')).toBeNull();
});
```

```ts
test('turn labels and the milestone flag show only on hover or focus', () => {
  const shell = mountWithCapture(twoTurnFixture());

  const segment = shell.root.querySelector('.wb-segments > *')!;
  const flag = shell.root.querySelector('.wb-flag')!;

  expect(segment.getAttribute('title')).toBe('Turn 1');
  expect(segment.textContent).toBe('');
  expect(flag.classList).toContain('wb-on-hover');
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-requests-view.spec.tsx www/test/workbench-player.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Requests view: stop creating and appending the timeline. Delete
  `workbench-requests-timeline.ts` and its spec if nothing else imports them.
- Player: move each segment's visible text into `title` and `aria-label`.
- Flag: add the class `wb-on-hover`. In CSS, show it only under
  `.wb-scrubber:hover` and `.wb-scrubber:focus-within`.
- Docs: in both `workbench.md` files, change line 116 to describe the Requests
  tab as a table of requests grouped by turn that follows the player's
  playhead, with no overview timeline.

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Run the full checks for PR 1**

Run each of these:
- `npx nx test www`
- `npx nx lint www`
- `npx nx build www`
- `npx nx workbench-e2e www`

Expected: all PASS. Update any verifier that dragged the Requests overview so
it uses the player's "Seek captured event" slider instead.

- [ ] **Step 6: Commit and open PR 1**

```bash
git add -A www
git commit -m "feat(workbench): the player is the only scrubber"
```

---

## Phase 2 (PR 2): Tab rule, More menu, Streaming mode

### Task 5: Tab rule

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-tab-rule.ts`
- Test: `www/test/workbench-tab-rule.spec.ts`

**Interfaces:**
- Produces:

```ts
/** Which tabs show in the bar and which go into More. */
export interface WorkbenchTabLayout {
  readonly bar: readonly string[];
  readonly more: readonly string[];
}
/** The one companion view per lesson whose docs teach two views together. */
export const workbenchTabCompanions: Readonly<Partial<Record<WorkbenchLessonId, string>>>;
export function workbenchTabLayout(
  lesson: { readonly id: WorkbenchLessonId; readonly inspector: string },
  tabs: readonly string[],
): WorkbenchTabLayout;
```

Companions: `ui-kits` and `ui-chatbot` → `Kit`; `javascript-runtime` → `Code`;
`activities` → `Interrupts`; `interrupts` → `Activities`; `server-threads` →
`History`; `message-history` → `Saved text`; `save-text-conversations` →
`History`.

Rule: `bar` is the lead (`lesson.inspector`), then the companion if the lesson
has that tab, then `Requests` and `State` if the lesson has them and they
aren't already in the bar. `more` is every other tab in `tabs`, in its
original order. A tab listed in the rule but missing from `tabs` is skipped.

- [ ] **Step 1: Write the failing tests**

Build each lesson's tab list from today's list in
`workbench-view.ts:754-806`. Before Task 6, extract that list into
`workbenchInspectorTabs(lesson): readonly string[]` in the same new file, so
the spec can call it. Use `test.each` over these rows and assert
`workbenchTabLayout(lesson, workbenchInspectorTabs(lesson))`:

| lesson | bar | more |
|---|---|---|
| generative-ui | UI, Requests, State | JSON |
| tools | Requests, State | JSON, UI |
| javascript-runtime | Runtime, Code, Requests, State | Text, UI |
| ui-kits | UI, Kit, Requests, State | JSON, Schema |
| activities | Activities, Interrupts, Requests, State | Text, UI |
| server-threads | Server, History, Requests, State | Text, Access, UI |
| decisions | JSON, Requests, State | UI |
| natural-forms | Form, Requests, State | JSON, History, Parser, Schema, UI |
| shared-state | State, Requests | Text, UI, Activities, Interrupts |

Also add: `test('every lesson shows at most four tabs in the bar', …)` over
`workbenchLessons`, and `test('every lesson keeps every tab it had', …)`,
asserting that `bar ∪ more` equals the original list as a set.

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-tab-rule.spec.ts`
Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement `workbenchInspectorTabs` and `workbenchTabLayout`**

Move the ternary chain from `workbench-view.ts:754-806` into
`workbenchInspectorTabs` unchanged, then implement the rule. If a table row
disagrees with what the moved list produces, the moved list is right: fix the
row.

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www/examples/quickstart/runtime/workbench-tab-rule.ts www/test/workbench-tab-rule.spec.ts
git commit -m "feat(workbench): tab rule for lead, companion and More"
```

### Task 6: More menu in the inspector

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-more-menu.ts`
- Modify: `www/examples/quickstart/runtime/workbench-view.ts:752-816` (tab
  creation) and the render's `inspectorTabs.sync(...)` call
- Modify: `www/examples/quickstart/runtime/workbench.css`
- Modify: `www/src/tools/verify-workbench.ts` (wherever it clicks a tab now in
  More)
- Test: `www/test/workbench-more-menu.spec.ts`, `www/test/workbench-tabs.spec.ts`

**Interfaces:**
- Consumes: `workbenchTabLayout`, `workbenchInspectorTabs` (Task 5).
- Produces:

```ts
export interface WorkbenchMoreMenu {
  readonly element: HTMLElement; // a button "More" with aria-haspopup="menu" plus its menu
  sync(items: readonly string[]): void; // hides itself when items is empty
  dispose(): void;
}
export function createWorkbenchMoreMenu(options: {
  readonly idPrefix: string;
  readonly onSelect: (tab: string) => void;
}): WorkbenchMoreMenu;
```

Behaviour:
- Choosing a More item calls `onSelect(tab)`. The view then puts that tab into
  the bar as the last tab, selected, and More lists the rest.
- The promoted tab stays until the reader picks another tab from More, which
  replaces it, or until the lesson changes.
- The menu uses `role=menu` and `menuitem`. Arrow keys move through it,
  Escape closes it and returns focus to the More button, and clicking outside
  closes it.

- [ ] **Step 1: Write the failing tests**

`workbench-more-menu.spec.ts`:
- `test('choosing an item reports it and closes the menu', …)`
- `test('Escape closes the menu and focuses the More button', …)`
- `test('ArrowDown and ArrowUp move between items', …)`
- `test('an empty list hides the More button', …)`

`workbench-tabs.spec.ts`, using a mounted `generative-ui` shell:

```ts
test('a tab chosen from More joins the bar and stays across renders', () => {
  const shell = mountForLesson('generative-ui');

  chooseMore(shell, 'JSON');
  shell.store.seek(0);

  expect(tabNames(shell)).toEqual(['UI', 'Requests', 'State', 'JSON']);
  expect(selectedTab(shell)).toBe('JSON');
});

test('choosing another More tab replaces the promoted one', () => { /* … */ });

test('the default lesson tab opens first', () => {
  const shell = mountForLesson('request-transformation');

  expect(selectedTab(shell)).toBe('Transform');
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-more-menu.spec.ts www/test/workbench-tabs.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the menu and wire it in**

The view builds tab buttons for `bar` plus the promoted tab only, so the
tablist only ever holds visible tabs. It keeps `promoted: string | undefined`
and, on every render, rebuilds the buttons when the visible set changes. The
More element sits in `.wb-tabs-row`, after the tablist and before the mode
toggle. `options.inspectorTabs`, when a consumer passes it, bypasses the rule:
it shows those tabs with no More menu.

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Update the verifiers and add the narrow check**

In `verify-workbench.ts`, a step that selects a tab now in More first opens
More and chooses it. Add a shared helper `selectInspectorTab(page, name)` that
uses the tab if it's visible and goes through More otherwise. Use it
everywhere tabs are chosen.

In `verify-workbench-layout.ts`, add an embed-size check: at a 790px frame,
`expectNoHorizontalOverflow` holds for `.wb-tabs-row` on `ui-kits` and
`server-threads` (four tabs plus More plus the mode toggle).

Run: `npx nx workbench-e2e www`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A www/examples/quickstart/runtime www/test www/src/tools
git commit -m "feat(workbench): lead tabs first, everything else under More"
```

### Task 7: UI tab is Streaming and Schema

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-inspector-modes.ts:79-110`
- Modify: wherever the view chooses a tab's default mode
  (`createInspectorModeMemory` or its caller)
- Test: `www/test/workbench-inspector-modes.spec.ts`

**Interfaces:**
- Produces: for `generative && tab === 'ui'`, the modes are
  `[{ id: 'streaming', label: 'Streaming', value: parsePartialJson(json) }, { id: 'schema', label: 'Schema', value: top.value }]`,
  and the default is `streaming`. `generative && tab === 'json'` stays
  Raw / Parsed / Resolved.

- [ ] **Step 1: Write the failing tests**

```ts
test('a generative UI tab offers Streaming then Schema', () => {
  const modes = workbenchInspectorModes(generativeInput({ tab: 'ui', json: '{"title":"Pl' }));

  expect(modes.map((mode) => mode.id)).toEqual(['streaming', 'schema']);
  expect(modes[0].value).toEqual({ title: 'Pl' });
});

test('the generative JSON tab keeps Raw, Parsed and Resolved', () => {
  const modes = workbenchInspectorModes(generativeInput({ tab: 'json' }));

  expect(modes.map((mode) => mode.id)).toEqual(['raw', 'parsed', 'resolved']);
});
```

Replace any existing test that asserts the four UI modes.

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-inspector-modes.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement and set the default mode**

The UI tab's default mode is `streaming`. Recipe and kit lessons are
untouched, because they never take the `generative` branch.

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Run the full checks for PR 2**

Run each of these:
- `npx nx test www`
- `npx nx lint www`
- `npx nx build www`
- `npx nx workbench-e2e www`

A verifier that picks `data-mode="resolved"` or `data-mode="raw"` on the UI
tab moves to the JSON tab through `selectInspectorTab`. Expected: all PASS.

- [ ] **Step 6: Commit and open PR 2**

```bash
git add -A www
git commit -m "feat(workbench): UI tab shows the stream, not four modes"
```

---

## Phase 3 (PR 3): Rail by default, lesson overlay

### Task 8: Layout defaults and migration

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-layout.ts`
- Test: `www/test/workbench-layout.spec.ts`

**Interfaces:**
- Produces:
  - `workbenchLayoutDefaults` becomes
    `{ rail: true, collapsed: ['start', 'concepts', 'production', 'recipes'], split: 44 }`;
  - `workbenchLayoutKey` becomes `'hashbrown.workbench.layout.v2'`;
  - new `export const workbenchLegacyLayoutKey = 'hashbrown.workbench.layout'`;
  - new `export function workbenchExpandSection(layout: WorkbenchLayout, section: WorkbenchSidebarSection): WorkbenchLayout`,
    which returns the layout with that section removed from `collapsed`.
- The store reads v2 first. With no v2 entry it reads the legacy key and keeps
  only `split`; rail and collapsed come from the defaults. Its first save
  writes v2.

- [ ] **Step 1: Write the failing tests**

- `test('a new reader starts in rail mode with lesson sections collapsed', …)`
- `test('a legacy layout keeps its split but takes the new rail default', …)`
  seeds `localStorage['hashbrown.workbench.layout'] = '{"rail":false,"collapsed":[],"split":60}'`
  and expects `{ rail: true, collapsed: [...4], split: 60 }`.
- `test('a saved v2 choice wins over the defaults', …)`
- `test('expanding a section removes only that section', …)`

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-layout.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www/examples/quickstart/runtime/workbench-layout.ts www/test/workbench-layout.spec.ts
git commit -m "feat(workbench): rail by default, migrate saved layouts once"
```

### Task 9: Lesson overlay from the rail

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-sidebar.ts:100-200`
- Modify: `www/examples/quickstart/runtime/workbench-view.ts:546-600`
  (`renderNavigation`, `onToggleRail`, the `toggle-sidebar` shortcut)
- Modify: `www/examples/quickstart/runtime/workbench.css` (`.wb-rail`,
  `.wb-nav`, a new `.wb-nav-overlay`)
- Test: `www/test/workbench-shell.spec.tsx`,
  `www/test/workbench-sidebar-data.spec.ts`

**Interfaces:**
- Consumes: `workbenchExpandSection` (Task 8).
- Produces: `renderWorkbenchSidebar` options gain
  `overlayOpen: boolean`, `onOpenOverlay: () => void`,
  `onCloseOverlay: () => void` and `onPin: () => void`.
- Behaviour:
  - In rail mode, the rail button opens the overlay. The overlay is the full
    sidebar (New conversation, Conversations, sections) floating over the
    chat, with the same width as today's open sidebar.
  - In the overlay, the existing collapse toggle becomes "Keep open", which
    sets `rail: false` and closes the overlay.
  - With `rail: false`, the toggle collapses back to the rail, as it does
    today.
  - Choosing a lesson, pressing Escape or clicking outside closes the overlay.
    Focus returns to the rail button.
  - `overlayOpen` is view state only and never persisted.
  - On mount, the current lesson's section is expanded with
    `{ persist: false }`.
  - Rail mode shows icons only, with no section labels.

- [ ] **Step 1: Write the failing tests**

- `test('the rail button opens the lesson overlay and Escape closes it', …)`:
  asserts `aria-expanded`, that the overlay is present, and where focus
  returns.
- `test('choosing a lesson closes the overlay', …)`
- `test('Keep open pins the sidebar and saves rail false', …)`
- `test("the current lesson's section opens even when saved collapsed", …)`
- `test('the toggle-sidebar shortcut opens the overlay in rail mode', …)`

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-shell.spec.tsx www/test/workbench-sidebar-data.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Run the full checks for PR 3**

Run each of these:
- `npx nx test www`
- `npx nx lint www`
- `npx nx build www`
- `npx nx workbench-e2e www`

A verifier that clicks `.wb-lessons a` in the default layout opens the overlay
first. Add `openLessons(page)` next to `selectInspectorTab`. Expected: all
PASS.

- [ ] **Step 6: Commit and open PR 3**

```bash
git add -A www
git commit -m "feat(workbench): lesson list opens as an overlay from the rail"
```

---

## Phase 4 (PR 4): Linked highlight

### Task 10: Fresh-text diff

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-fresh.ts`
- Test: `www/test/workbench-fresh.spec.ts`

**Interfaces:**
- Produces:

```ts
/** The text that most recently arrived at one string path of a streamed value. */
export interface WorkbenchFresh {
  readonly path: string; // dot path, array indexes as numbers: "title", "steps.1"
  readonly text: string; // the arrived suffix
}
/** How many captured events back "recent" reaches. */
export const workbenchFreshWindow = 3;
export function workbenchFreshText(previous: unknown, current: unknown): WorkbenchFresh | null;
export function workbenchFreshAt(
  events: readonly WorkbenchFrame[],
  cursor: number,
): WorkbenchFresh | null;
```

- `workbenchFreshText` walks `current` in document order. For each string leaf
  whose value differs from the same path in `previous` (missing counts as
  `''`), the delta is the suffix after the common prefix. It returns the
  last such leaf in document order, or `null`.
- `workbenchFreshAt` returns `null` when `events[cursor]` has status
  `complete` or `error`. Otherwise it compares `parsePartialJson(json)` at
  `cursor` with the value at `max(first event of the same turn, cursor - workbenchFreshWindow)`.

- [ ] **Step 1: Write the failing tests**

```ts
test('a growing string reports its new suffix', () => {
  const fresh = workbenchFreshText({ steps: ['Outline', 'Rec'] }, { steps: ['Outline', 'Record the'] });

  expect(fresh).toEqual({ path: 'steps.1', text: 'ord the' });
});

test('a new array item reports the whole item', () => {
  const fresh = workbenchFreshText({ steps: ['A'] }, { steps: ['A', 'B'] });

  expect(fresh).toEqual({ path: 'steps.1', text: 'B' });
});

test('no change reports nothing', () => {
  expect(workbenchFreshText({ title: 'X' }, { title: 'X' })).toBeNull();
});

test('a completed frame has no fresh text', () => {
  expect(workbenchFreshAt(fixtureEnding('complete'), lastIndex)).toBeNull();
});

test('seeking back compares against the window before the new cursor', () => {
  const events = streamingFixture(); // title then steps arriving over 10 frames

  const fresh = workbenchFreshAt(events, 4);

  expect(fresh).toEqual(expectedAt4);
});

test('the window never reaches into the previous turn', () => { /* … */ });
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-fresh.spec.ts`
Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www/examples/quickstart/runtime/workbench-fresh.ts www/test/workbench-fresh.spec.ts
git commit -m "feat(workbench): compute the newest streamed text"
```

### Task 11: Mark fresh text in the Streaming view

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-highlight.ts`
- Modify: `www/examples/quickstart/runtime/workbench-view.ts` (the
  `pre(mode.value, tab)` call around line 1714)
- Modify: `www/examples/quickstart/runtime/workbench.css` (`mark.wb-fresh`)
- Test: `www/test/workbench-highlight.spec.ts`

**Interfaces:**
- Consumes: `WorkbenchFresh`, `workbenchFreshAt` (Task 10).
- Produces:

```ts
export function renderWorkbenchFreshJson(
  value: unknown,
  fresh: WorkbenchFresh | null,
): DocumentFragment;
```

This renders like `renderWorkbenchCode(JSON.stringify(value, null, 2), 'json')`,
but the last `fresh.text.length` characters of the string at `fresh.path` are
wrapped in `<mark class="wb-fresh">`. `textContent` is unchanged.

Approach: set a private-use sentinel (``) at the start of the fresh
suffix in a copy of `value`, stringify, tokenize, then split the token that
contains the sentinel, drop the sentinel, and wrap from there to the end of
the string's content, before the closing quote.

- [ ] **Step 1: Write the failing tests**

```ts
test('the fresh suffix is marked and the text is unchanged', () => {
  const value = { steps: ['Outline', 'Record the'] };

  const fragment = renderWorkbenchFreshJson(value, { path: 'steps.1', text: 'ord the' });

  expect(fragment.textContent).toBe(JSON.stringify(value, null, 2));
  expect(fragment.querySelector('mark.wb-fresh')!.textContent).toBe('ord the');
});

test('no fresh text renders no mark', () => {
  expect(renderWorkbenchFreshJson({ a: 'b' }, null).querySelector('mark')).toBeNull();
});

test('text with quotes and escapes is marked correctly', () => { /* text: 'say "hi"\n' */ });
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-highlight.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement and wire it in**

The view uses `renderWorkbenchFreshJson(mode.value, workbenchFreshAt(snapshot.events, selectedIndex))`
only when the mode is `streaming`. Every other mode keeps `pre(...)`.

`mark.wb-fresh` uses background `var(--wb-cobalt-soft)`, inherits the colour,
and has a 1px radius plus a `box-shadow` of the same colour as a 2px spread,
so it sits on the grid. It transitions its background over 400ms, so when the
mark disappears on completion it fades out.

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A www/examples/quickstart/runtime www/test
git commit -m "feat(workbench): highlight the newest streamed text in the inspector"
```

### Task 12: Mark the matching element in the chat

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-fresh-mark.ts`
- Modify: `www/examples/quickstart/react/src/PlanCard.tsx`,
  `www/examples/quickstart/angular/src/app/plan-card.ts`, and the view's
  replay card builder (`workbench-view.ts` around lines 1160–1170)
- Modify: `www/examples/quickstart/runtime/workbench-view.ts` (call the marker
  on render and from a `MutationObserver`)
- Modify: `www/src/tools/verify-workbench.ts`
- Test: `www/test/workbench-fresh-mark.spec.ts`,
  `www/test/workbench-clients.spec.tsx`

**Interfaces:**
- Consumes: `WorkbenchFresh`, `workbenchFreshAt`.
- Produces:

```ts
/**
 * Marks the element for `fresh.path` in the newest `.wb-summary` card in
 * `feed` with `data-wb-fresh`, and clears it everywhere else.
 */
export function markWorkbenchFresh(feed: HTMLElement, fresh: WorkbenchFresh | null): void;
```

- Card contract: the title `h2` has `data-wb-path="title"`, and each step `li`
  has `data-wb-path="steps.<index>"`. This applies to both framework
  `PlanCard`s and the view's own replay card.
- Scope: only lessons `generative-ui` and `first-plan`. For any other lesson,
  the view passes `null`.
- Timing: the framework commits after the view renders, so the view keeps a
  `MutationObserver` (`childList`, `subtree`, `characterData`) on the visible
  feed. The observer re-applies `markWorkbenchFresh` with the last computed
  fresh value, and disconnects on dispose.
- CSS: `[data-wb-fresh]` gets the same `--wb-cobalt-soft` background and fade
  as `mark.wb-fresh`.

- [ ] **Step 1: Write the failing tests**

`workbench-fresh-mark.spec.ts`:
- `test('marks the step in the newest card only', …)`: two cards in the feed;
  only the second card's `steps.1` is marked.
- `test('null clears every mark', …)`
- `test('a path with no element marks nothing', …)`

`workbench-clients.spec.tsx`:
- `test('PlanCard tags its title and steps with data paths', …)`, for React.
  Mirror it for Angular in the existing Angular client spec.

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run --config www/vitest.config.mts www/test/workbench-fresh-mark.spec.ts www/test/workbench-clients.spec.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement and wire it in**

- [ ] **Step 4: Run the tests and check they pass**

Run the same command. Expected: PASS.

- [ ] **Step 5: Add the verifier and run the full checks for PR 4**

In `verify-workbench.ts`, for the `generative-ui` fixture replay:
- seek to a mid-stream milestone, then assert that `mark.wb-fresh` and
  `[data-wb-fresh]` both exist and that the mark's text is a suffix of the
  marked element's text;
- seek back three events and assert the same at the new cursor;
- seek to the end and assert neither exists.

Then run each of these:
- `npx nx test www`
- `npx nx lint www`
- `npx nx build www`
- `npx nx workbench-e2e www`
- `npx nx e2e www`

Expected: all PASS.

Also look at the docs embed at 790px in a real browser (memory:
[[workbench-compact-inspector]]: subagent tests missed embed-only bugs).

- [ ] **Step 6: Commit and open PR 4**

```bash
git add -A www
git commit -m "feat(workbench): link the newest streamed text to the rendered card"
```

---

## Phase 5 (PR 5): Media

### Task 13: Re-record workbench media

**Files:**
- Modify: whatever `nx workbench-demo www` and the media publication step
  regenerate (posters, capture JSON, video catalog entries)

- [ ] **Step 1: Build**

Run: `npx nx workbench-build www`
Expected: PASS.

- [ ] **Step 2: Re-record in batches**

Run: `WORKBENCH_LESSONS=<batch> OPENAI_MODEL=gpt-4.1-mini TYPESAFE_MODEL=jev-1.14.0 node --env-file=<root>/.env node_modules/.bin/tsx www/src/tools/record-workbench.ts`

Use batches of about six lessons. One live flake fails the whole batch, so
retry a failed batch on its own (memory: [[workbench-shell-redesign]]).

Expected: each batch publishes.

- [ ] **Step 3: Verify**

Run each of these:
- `npx nx test www` (including `workbench-media-publication.spec.ts`)
- `npx nx workbench-check www`
- `npx nx e2e www`

Expected: all PASS.

- [ ] **Step 4: Commit and open PR 5**

```bash
git add -A www
git commit -m "chore(workbench): re-record media for the focused layout"
```
