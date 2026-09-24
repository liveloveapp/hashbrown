# Homepage Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make three fixes:
- Fix the `www` dev server.
- Highlight the homepage code samples with Shiki at build time.
- Replace the invoicing screenshot with reproducible WebP stills, recorded once from a real generative UI answer and replayed deterministically.

**Architecture:** Three independent parts (A, B, C). Each ends in green builds and tests.
- A upgrades Analog and fixes SSR dependency pre-bundling.
- B adds a Vite virtual module that holds pre-highlighted HTML.
- C adds an AG-UI tape recorder, a replay mode in the invoicing fixture server, a stills recorder that uses `sharp`, and an e2e guard.

**Tech Stack:** Analog 3.0.0-alpha.87, Vite 8, Shiki 1.29, Playwright, Vitest, `sharp` (a new root devDependency, approved by the user).

**Spec:** `docs/superpowers/specs/2026-09-23-homepage-followups-design.md`

---

## Conventions for every task

- The working directory is the repo root: `/Users/blove/repos/hashbrown/.claude/worktrees/upbeat-merkle-3df7c0`. The branch is `blove/homepage-redesign`.
- Tests use top-level `test(...)` only, with arrange/act/assert separated by blank lines. New reusable functions get TSDoc.
- Commit messages end with a blank line followed by `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx nx build www` modifies `tsdoc-metadata.json` and bumps `@hashbrownai/angular` in `www/analog/package.json`. Revert both with `git checkout -- tsdoc-metadata.json www/analog/package.json` before every commit, unless the task intentionally edits that `package.json`. In that case, stage only the intended lines. After every commit, run `git show --stat HEAD` and make sure nothing extra got in.
- Never commit `.claude/`.
- Lint baseline: `npx nx lint www` must show 26 warnings or fewer.

---

## Part A: fix the `www` dev server

### Task A1: Upgrade Analog to alpha.87

**Files:**
- Modify: root `package.json`, `package-lock.json`, `www/analog/package.json` (if it lists `@analogjs/*`)
- Modify: `www/analog/vite.config.ts`

- [ ] **Step 1: Reproduce the failure first**

Pick a free port and point `PORT` at it; 4200 may already be in use. Run:
```bash
PORT=4315; (npx nx serve www --port $PORT > /tmp/www-serve.log 2>&1 &) ; sleep 60; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$PORT/; grep -c "Requires Babel" /tmp/www-serve.log; pkill -f "nx serve www"
```
Expected:
- The status is not 200, or the server never responds.
- The Babel error count is greater than 0.

- [ ] **Step 2: Upgrade**

Run:
```bash
npm install --save-exact @analogjs/content@3.0.0-alpha.87 @analogjs/router@3.0.0-alpha.87 @analogjs/platform@3.0.0-alpha.87 @analogjs/vite-plugin-angular@3.0.0-alpha.87 @analogjs/vitest-angular@3.0.0-alpha.87 --no-audit --no-fund
```
- If `www/analog/package.json` pins any `@analogjs/*` package, update it to `3.0.0-alpha.87` too.
- If npm reports ERESOLVE, STOP and report it. Don't force the install.

- [ ] **Step 3: Update `vite.config.ts`**

1. Delete the `index:` option together with its comment (around lines 58–64). alpha.87 wires the client `index.html` into SSR itself. If `command` is now unused, drop it from the config function's parameters.
2. Under `environments.ssr` (around line 27), add:
   ```ts
   optimizeDeps: {
     include: ['rxjs', 'rxjs/operators'],
   },
   ```
   Leave `resolve.noExternal` as is.

- [ ] **Step 4: Verify the dev server**

Run the Step 1 command again, then also check `/docs`.

Expected:
- `/` returns 200 with a body over 30 KB that contains `AI chat and agents for your React or Angular app`.
- `/docs` returns 200.
- The log has no `Requires Babel`, no `exports is not defined` and no `NG0203`.

- [ ] **Step 5: Verify everything else**

Run:
```bash
npx nx build www && npx nx test www && npx nx lint www && npx nx e2e www && npx nx test angular && npx nx build angular
```
All must pass.
- If `nx test angular` or `nx build angular` fails because of the upgrade, STOP and report it.
- Lint must show 26 warnings or fewer.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json www/analog/vite.config.ts www/analog/package.json
git commit -m "fix(www): upgrade Analog to alpha.87 so the dev server runs"
```
Make sure the `www/analog/package.json` diff contains only the `@analogjs` changes and not the `@hashbrownai/angular` bump.

---

## Part B: highlight the homepage code with Shiki at build time

### Task B1: Highlighting helpers

**Files:**
- Create: `www/analog/src/tools/highlight-code.ts`
- Test: `www/analog/src/tools/highlight-code.spec.ts`

- [ ] **Step 1: Write the failing tests**

`www/analog/src/tools/highlight-code.spec.ts`:
```ts
import { expect, test } from 'vitest';
import {
  getSiteHighlighter,
  highlightSample,
  renderHomeCodeModule,
} from './highlight-code';

test('highlights a sample with the hashbrown theme', async () => {
  const highlighter = await getSiteHighlighter();

  const html = highlightSample(highlighter, {
    code: 'const a = 1;',
    lang: 'typescript',
  });

  expect(html.startsWith('<pre class="shiki hashbrown"')).toBe(true);
  expect(new Set(html.match(/color:#[0-9A-Fa-f]{6}/g)).size).toBeGreaterThan(1);
});

test('escapes markup inside code', async () => {
  const highlighter = await getSiteHighlighter();

  const html = highlightSample(highlighter, {
    code: '<b>hi</b>',
    lang: 'html',
  });

  expect(html).not.toContain('<b>hi</b>');
});

test('builds a module keyed by framework', () => {
  const fake = { codeToHtml: (code: string) => `<x>${code}</x>` };

  const source = renderHomeCodeModule(fake, {
    HERO_CODE: { react: { code: 'r' }, angular: { code: 'a' } },
    STEPS: { react: [{ code: 'r1' }], angular: [{ code: 'a1' }] },
  });

  expect(source).toBe(
    'export const HOME_CODE_HTML = {"hero":{"react":"<x>r</x>","angular":"<x>a</x>"},"steps":{"react":["<x>r1</x>"],"angular":["<x>a1</x>"]}};',
  );
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run --config www/analog/vite.config.ts www/analog/src/tools/highlight-code.spec.ts`

Expected: FAIL, because the module can't be resolved.

- [ ] **Step 3: Implement**

`www/analog/src/tools/highlight-code.ts`:
```ts
import { createHighlighter, type Highlighter } from 'shiki';
import shikiHashbrown from '../app/themes/shiki-hashbrown';

/** Languages the site highlights at build time. Unknown languages throw, so a typo fails the build. */
export const SITE_LANGS = ['tsx', 'typescript', 'html'] as const;

let highlighter: Promise<Highlighter> | undefined;

/**
 * Create the site's Shiki highlighter once, shared by the client and SSR builds.
 */
export function getSiteHighlighter(): Promise<Highlighter> {
  return (highlighter ??= createHighlighter({
    // The theme object matches Shiki's ThemeRegistration shape at runtime.
    themes: [shikiHashbrown as Parameters<typeof createHighlighter>[0]['themes'][number]],
    langs: [...SITE_LANGS],
  }));
}

/** A code sample to highlight. */
export interface Sample {
  code: string;
  lang?: string;
}

/**
 * Highlight one sample with the hashbrown theme, producing the same markup the docs use.
 *
 * @param hl - A highlighter, or any object with a compatible `codeToHtml`.
 * @param sample - The code and its language (defaults to TypeScript).
 */
export function highlightSample(
  hl: Pick<Highlighter, 'codeToHtml'>,
  sample: Sample,
): string {
  return hl.codeToHtml(sample.code, {
    lang: sample.lang ?? 'typescript',
    theme: 'hashbrown',
  });
}

/**
 * Build the source of the `virtual:home-code-html` module from the homepage content.
 *
 * @param hl - The highlighter to use.
 * @param content - `HERO_CODE` and `STEPS` from `home.content.ts`.
 */
export function renderHomeCodeModule(
  hl: Pick<Highlighter, 'codeToHtml'>,
  content: {
    HERO_CODE: Record<string, Sample>;
    STEPS: Record<string, Sample[]>;
  },
): string {
  const map = <T, R>(o: Record<string, T>, f: (v: T) => R) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
  const html = {
    hero: map(content.HERO_CODE, (s) => highlightSample(hl, s)),
    steps: map(content.STEPS, (steps) =>
      steps.map((s) => highlightSample(hl, s)),
    ),
  };
  return `export const HOME_CODE_HTML = ${JSON.stringify(html)};`;
}
```
- Check how `www/analog/vite.config.ts` imports and passes the theme to Analog's `content.shikiOptions`, and use the same approach.
- If the theme type doesn't fit, use the narrowest cast that compiles, and explain it in a comment.
- The docs test (`'<pre class="shiki hashbrown"'`) assumes Shiki's class naming, which is `shiki` plus the theme name. If the real output differs, adjust the assertion to what Shiki actually emits, and report the change.

- [ ] **Step 4: Run the tests and watch them pass**

Run the same command. Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add www/analog/src/tools/highlight-code.ts www/analog/src/tools/highlight-code.spec.ts
git commit -m "feat(www): add build-time Shiki helpers for site code samples"
```

### Task B2: The virtual module plugin

**Files:**
- Create: `www/analog/src/tools/home-code-plugin.ts`
- Modify: `www/analog/vite.config.ts`, `www/analog/src/vite-env.d.ts`
- Test: `www/analog/src/app/components/home/home-code.spec.ts`

- [ ] **Step 1: Write the failing test**

`www/analog/src/app/components/home/home-code.spec.ts`:
```ts
import { expect, test } from 'vitest';
import { HOME_CODE_HTML } from 'virtual:home-code-html';

test('serves highlighted hero code for both frameworks', () => {
  const { react, angular } = HOME_CODE_HTML.hero;

  const result = [react, angular];

  expect(result[0]).toContain('shiki hashbrown');
  expect(result[0]).toContain('useUiKit');
  expect(result[1]).toContain('createUiKit');
});

test('serves three highlighted steps for each framework', () => {
  const counts = [
    HOME_CODE_HTML.steps.react.length,
    HOME_CODE_HTML.steps.angular.length,
  ];

  expect(counts).toEqual([3, 3]);
  expect(HOME_CODE_HTML.steps.angular[2]).toContain('shiki hashbrown');
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --config www/analog/vite.config.ts www/analog/src/app/components/home/home-code.spec.ts`

Expected: FAIL, because `virtual:home-code-html` can't be resolved.

- [ ] **Step 3: Implement the plugin**

`www/analog/src/tools/home-code-plugin.ts`:
```ts
import { resolve } from 'node:path';
import { runnerImport, type Plugin } from 'vite';
import { getSiteHighlighter, renderHomeCodeModule } from './highlight-code';

const ID = 'virtual:home-code-html';
const RESOLVED = `\0${ID}`;

/**
 * Serve the homepage code samples as HTML highlighted at build time.
 *
 * @param root - The `www/analog` directory.
 */
export default function homeCodePlugin(root: string): Plugin {
  const content = resolve(root, 'src/app/components/home/home.content.ts');
  return {
    name: 'hashbrown-home-code-html',
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    async load(id) {
      if (id !== RESOLVED) return;
      this.addWatchFile(content);
      const { module } = await runnerImport<
        typeof import('../app/components/home/home.content')
      >(content);
      return renderHomeCodeModule(await getSiteHighlighter(), module);
    },
  };
}
```
- Register the plugin in `www/analog/vite.config.ts` next to `hashbrownStackblitzPlugin()`, as `homeCodePlugin(__dirname)`. Leave it active in test mode as well.
- If `runnerImport` isn't exported by the installed Vite, use `this.environment` / `ssrLoadModule`, or import with `tsx`. The scratch prototype at `/private/tmp/claude-501/-Users-blove-repos-hashbrown--claude-worktrees-upbeat-merkle-3df7c0/e3744c9d-eee4-4c2d-9569-e6fe5ee76ccc/scratchpad/vp/` worked with `runnerImport`, so read it first.

Add this to `www/analog/src/vite-env.d.ts`:
```ts
declare module 'virtual:home-code-html' {
  export const HOME_CODE_HTML: {
    hero: Record<'react' | 'angular', string>;
    steps: Record<'react' | 'angular', string[]>;
  };
}
```

- [ ] **Step 4: Run the tests and build**

Run: the test command from Step 2, then `npx nx build www`.

Expected:
- 2 tests pass.
- The build succeeds.

- [ ] **Step 5: Commit**

```bash
git add www/analog/src/tools/home-code-plugin.ts www/analog/vite.config.ts www/analog/src/vite-env.d.ts www/analog/src/app/components/home/home-code.spec.ts
git commit -m "feat(www): serve pre-highlighted homepage code as a virtual module"
```

### Task B3: Render highlighted code on dark panels

**Files:**
- Modify: `www/analog/src/app/components/home/HomeHero.ts`, `www/analog/src/app/components/home/HowItWorks.ts`

- [ ] **Step 1: HomeHero**
1. Remove the `CodeHighlight` import and remove it from `imports`.
2. Add:
   ```ts
   import { DomSanitizer } from '@angular/platform-browser';
   import { HOME_CODE_HTML } from 'virtual:home-code-html';
   // in the class:
   private readonly sanitizer = inject(DomSanitizer);
   // Build-time constant HTML; bypassing is required to keep Shiki's inline token colors.
   readonly codeHtml = computed(() =>
     this.sanitizer.bypassSecurityTrustHtml(HOME_CODE_HTML.hero[this.config.sdk()]),
   );
   ```
3. In the template, change the code element to `<div class="code" [innerHTML]="codeHtml()"></div>`.
4. Styles:
   - Make `.code` use `background: var(--gray-dark);`.
   - Add `.code ::ng-deep pre { margin: 0; background: transparent !important; }` and `.code ::ng-deep code { font: inherit; }`.
   - Keep the panel's white `.bar` and `.result`, so only the code block is dark.
   - If the `.bar` file-name strip looks disconnected, give it `background: var(--gray-dark); color: var(--gray-light);` with the dots in a muted gray, like an editor title bar. Use judgment, and compare with the docs code blocks.

- [ ] **Step 2: HowItWorks**
- Remove `CodeHighlight`. Build the trusted HTML per step:
  ```ts
  readonly steps = computed(() => {
    const sdk = this.config.sdk();
    return STEPS[sdk].map((step, i) => ({
      ...step,
      html: this.sanitizer.bypassSecurityTrustHtml(HOME_CODE_HTML.steps[sdk][i]),
    }));
  });
  ```
- Template: `<div class="code" [innerHTML]="step.html"></div>`.
- Change `.code` to `background: var(--gray-dark)`, and add the same two `::ng-deep` rules as in Step 1.

- [ ] **Step 3: Check that nothing else uses the step `lang` or `CodeHighlight`**

Run `grep -rn "codeHighlight\|CodeHighlight" www/analog/src/app/components/home`. Expected: nothing.

Keep the `lang` field in `home.content.ts`; the plugin uses it.

- [ ] **Step 4: Verify**

Run `npx nx build www && npx nx test www && npx nx lint www && npx nx e2e www`. All must pass.

Then check in the browser, using `npx nx serve www` (Part A fixed it) on a free port:
- The hero and step code show several token colors on a dark panel.
- Switching the framework swaps to highlighted Angular code.
- There's no horizontal overflow at 375px.
- The view source of `/` contains `shiki hashbrown`, which means it's rendered on the server.

- [ ] **Step 5: Commit**

```bash
git add www/analog/src/app/components/home/HomeHero.ts www/analog/src/app/components/home/HowItWorks.ts
git commit -m "feat(www): show Shiki-highlighted homepage code on docs-style panels"
```

---

## Part C: reproducible invoicing stills

Background: `examples/invoicing` has these parts:
- a React app (`react/`), which draws an assistant answer from the `render` server tool call's arguments (`react/src/assistant-draft.tsx`, `findRenderCall(message.serverToolCalls)`)
- a B4 server (`server/`)
- contracts (`shared/`)
- Playwright e2e (`e2e/`)

The assistant endpoint is `/agui/%2Fassistant%23agent`.

The deterministic fixture server `server/browser-fixture.ts` works like this:
- It serves the app on 4330 and the API on 4329.
- It scripts AG-UI events for the review agent only.
- It answers other agent requests with 503.

The ledger is seeded, and the as-of date is fixed at 2026-09-15.

### Task C1: Tape helpers

**Files:**
- Create: `examples/invoicing/server/src/fixture-tape.ts`
- Test: `examples/invoicing/server/src/fixture-tape.spec.ts`

- [ ] **Step 1: Write the failing tests**

`examples/invoicing/server/src/fixture-tape.spec.ts`:
```ts
import { expect, test } from 'vitest';
import {
  parseSseEvents,
  prepareReplay,
  validateTape,
  type AgUiTape,
} from './fixture-tape';

const tape = (events: Record<string, unknown>[]): AgUiTape => ({
  version: 1,
  recordedAt: '2026-09-23T00:00:00.000Z',
  question: 'q',
  events: events.map((event) => ({ event })),
});

const complete = [
  { type: 'RUN_STARTED', threadId: 't0', runId: 'r0' },
  { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'render' },
  { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{"text":"hi"}' },
  { type: 'TOOL_CALL_END', toolCallId: 'c1' },
  { type: 'TOOL_CALL_RESULT', toolCallId: 'c1', content: '{"rendered":true}' },
  { type: 'MESSAGES_SNAPSHOT', messages: [] },
  { type: 'RUN_FINISHED', threadId: 't0', runId: 'r0' },
];

test('parses server-sent events into AG-UI events', () => {
  const body = 'data: {"type":"RUN_STARTED"}\n\ndata: {"type":"RUN_FINISHED"}\n\n';

  const events = parseSseEvents(body);

  expect(events).toEqual([{ type: 'RUN_STARTED' }, { type: 'RUN_FINISHED' }]);
});

test('accepts a complete take with a successful render call', () => {
  const input = tape(complete);

  const problems = validateTape(input);

  expect(problems).toEqual([]);
});

test('rejects a take without a successful render call', () => {
  const input = tape([complete[0], complete[6]]);

  const problems = validateTape(input);

  expect(problems).toContain('missing successful render tool call');
});

test('rejects provider metadata and secrets', () => {
  const input = tape([
    ...complete.slice(0, 6),
    { type: 'RAW', event: { authorization: 'Bearer sk-abc' } },
    complete[6],
  ]);

  const problems = validateTape(input);

  expect(problems).toEqual(
    expect.arrayContaining(['contains RAW event', 'contains a secret-like value']),
  );
});

test('rewrites run identity and drops message snapshots for replay', () => {
  const input = tape(complete);

  const events = prepareReplay(input, { threadId: 't9', runId: 'r9' });

  expect(events[0]).toEqual({ type: 'RUN_STARTED', threadId: 't9', runId: 'r9' });
  expect(events.at(-1)).toEqual({ type: 'RUN_FINISHED', threadId: 't9', runId: 'r9' });
  expect(events.some((e) => e.type === 'MESSAGES_SNAPSHOT')).toBe(false);
  expect(input.events[0].event).toEqual(complete[0]);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run --config examples/invoicing/server/vitest.config.mts examples/invoicing/server/src/fixture-tape.spec.ts`

Expected: FAIL, because the module can't be resolved.

- [ ] **Step 3: Implement**

`examples/invoicing/server/src/fixture-tape.ts`:
```ts
/** One recorded AG-UI event. */
export interface TapeEntry {
  event: Record<string, unknown> & { type?: unknown };
}

/** A recorded AG-UI run used to replay a real assistant answer deterministically. */
export interface AgUiTape {
  version: 1;
  recordedAt: string;
  question: string;
  events: TapeEntry[];
}

const FORBIDDEN_TYPES = ['RAW', 'CUSTOM', 'REASONING_START', 'REASONING_MESSAGE_START', 'REASONING_MESSAGE_CONTENT', 'REASONING_MESSAGE_END', 'REASONING_END', 'THINKING_START', 'THINKING_END', 'THINKING_TEXT_MESSAGE_START', 'THINKING_TEXT_MESSAGE_CONTENT', 'THINKING_TEXT_MESSAGE_END'];
const SECRET = /sk-[A-Za-z0-9_-]{3,}|authorization/i;

/**
 * Parse a server-sent event body into AG-UI event objects.
 *
 * @param body - The raw `text/event-stream` body.
 */
export function parseSseEvents(body: string): Record<string, unknown>[] {
  return body
    .split(/\n\n+/)
    .map((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n'),
    )
    .filter((data) => data.length > 0)
    .map((data) => JSON.parse(data) as Record<string, unknown>);
}

/**
 * List the problems that make a take unfit to commit. An empty list means the take is valid.
 *
 * @param tape - The recorded take.
 */
export function validateTape(tape: AgUiTape): string[] {
  const events = tape.events.map((entry) => entry.event);
  const problems: string[] = [];
  const renderCalls = new Set(
    events
      .filter((e) => e.type === 'TOOL_CALL_START' && e['toolCallName'] === 'render')
      .map((e) => e['toolCallId']),
  );
  const rendered = events.some(
    (e) =>
      e.type === 'TOOL_CALL_RESULT' &&
      renderCalls.has(e['toolCallId']) &&
      String(e['content']).includes('"rendered":true'),
  );
  if (!rendered) problems.push('missing successful render tool call');
  if (events.at(-1)?.type !== 'RUN_FINISHED') problems.push('does not end with RUN_FINISHED');
  for (const type of FORBIDDEN_TYPES) {
    if (events.some((e) => e.type === type)) problems.push(`contains ${type} event`);
  }
  if (SECRET.test(JSON.stringify(events))) problems.push('contains a secret-like value');
  return problems;
}

/**
 * Prepare a tape for replay against a new request: rewrite run identity and drop message snapshots.
 *
 * @param tape - The committed take.
 * @param identity - The incoming request's thread and run IDs.
 */
export function prepareReplay(
  tape: AgUiTape,
  identity: { threadId: string; runId: string },
): Record<string, unknown>[] {
  return tape.events
    .map((entry) => entry.event)
    .filter((event) => event.type !== 'MESSAGES_SNAPSHOT')
    .map((event) =>
      event.type === 'RUN_STARTED' || event.type === 'RUN_FINISHED'
        ? { ...event, ...identity }
        : event,
    );
}
```
- Check the real AG-UI event type names used in this repo. See `@ag-ui/core` and `packages/core/src/transport/ag-ui-*`. Correct `FORBIDDEN_TYPES`, the `TOOL_CALL_*` field names (`toolCallName`, `content`) and the render tool's result shape (`server/src/app/assistant/tools/render.ts`) to match. Update the tests to match, and report any changes.

- [ ] **Step 4: Run the tests and watch them pass**

Run: the Step 2 command. Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add examples/invoicing/server/src/fixture-tape.ts examples/invoicing/server/src/fixture-tape.spec.ts
git commit -m "feat(invoicing): add AG-UI tape helpers for deterministic replays"
```

### Task C2: The recorder

**Files:**
- Create: `examples/invoicing/e2e/record-answer.record.ts`, `examples/invoicing/e2e/record-answer.config.ts`
- Modify: `examples/invoicing/e2e/project.json` (target `record-answer`), `examples/invoicing/e2e/tsconfig.json` (include the new files if needed)

- [ ] **Step 1: Config**

`record-answer.config.ts` copies `playwright.config.ts`:
- It loads `INVOICING_ENV_FILE` and requires `OPENAI_API_KEY`.
- It uses the same two webServers (4325 API, 4326 app) with `reuseExistingServer: true`.
- It uses `channel: 'chrome'`.

Only the following differs:
- `testMatch: 'record-answer.record.ts'`
- `timeout: 240000`
- `outputDir` under `test-results/examples/invoicing-record`
- no HTML reporter

- [ ] **Step 2: Recorder script**

`record-answer.record.ts` is a Playwright `test(...)` that does the following:
1. Sets `const QUESTION = 'Which USD customers are more than 60 days overdue?'`.
2. Registers `page.route('**/agui/%2Fassistant%23agent', async (route) => { const response = await route.fetch(); const body = await response.text(); bodies.push(body); await route.fulfill({ response, body }); })`. Check the real request URL in `react/src/assistant-workspace.tsx`, and match it with a glob that works for the encoded path.
3. `page.goto('/')`, fills the "Message assistant" textbox with `QUESTION`, and submits. Use the same selectors `live.spec.ts` uses.
4. Waits until `.assistant-answer` is visible and `Reading your ledger…` is gone. Check both selectors in `react/src/assistant-workspace.tsx`.
5. Builds `const tape: AgUiTape = { version: 1, recordedAt: new Date().toISOString(), question: QUESTION, events: parseSseEvents(bodies.join('')).map((event) => ({ event })) }`.
6. Asserts `validateTape(tape)` is `[]`, printing the problems on failure.
7. Writes `examples/invoicing/e2e/recordings/overdue-60.agui.json` with `JSON.stringify(tape, null, 2)` plus a newline.

The header comment must say: "Record several takes and commit the best complete one. Never hand-edit what the model said."

Import `parseSseEvents`, `validateTape` and `AgUiTape` from `../server/src/fixture-tape`, with a relative import that the e2e tsconfig can compile.

- [ ] **Step 3: Nx target**

Add this to `examples/invoicing/e2e/project.json`:
```json
"record-answer": {
  "executor": "nx:run-commands",
  "cache": false,
  "options": {
    "command": "playwright test --config examples/invoicing/e2e/record-answer.config.ts"
  }
}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx nx build invoicing-e2e && npx nx lint invoicing-e2e`. Expected: both pass.

- [ ] **Step 5: Commit the recorder (without a tape yet)**

```bash
git add examples/invoicing/e2e/record-answer.record.ts examples/invoicing/e2e/record-answer.config.ts examples/invoicing/e2e/project.json examples/invoicing/e2e/tsconfig.json
git commit -m "feat(invoicing): add a recorder for a real assistant answer tape"
```

### Task C3: Record the tape (controller runs this)

**Files:**
- Create: `examples/invoicing/e2e/recordings/overdue-60.agui.json`

- [ ] **Step 1: Record**

Run:
```bash
INVOICING_ENV_FILE=/Users/blove/repos/hashbrown/.env npx nx record-answer invoicing-e2e
```
Expected: the test passes and writes the tape.

- [ ] **Step 2: Review the take**

Read the tape and check:
- It has a `render` call whose `components` include `AgingSummary` and/or `LedgerTable` for USD.
- The prose is sensible.
- There's no `sk-`, no `Authorization` and no reasoning.
- The size is under 200 KB.

If the take is weak, record it again. Never edit it.

- [ ] **Step 3: Commit**

```bash
git add examples/invoicing/e2e/recordings/overdue-60.agui.json
git commit -m "test(invoicing): record a real generative UI answer tape"
```

### Task C4: Replay the tape in the fixture server, plus an e2e guard

**Files:**
- Modify: `examples/invoicing/server/browser-fixture.ts`
- Modify: `examples/invoicing/e2e/workflow.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

Append to `workflow.spec.ts`:
```ts
test('a recorded assistant answer replays as validated generative UI', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('textbox', { name: 'Message assistant' }).fill(
    'Which USD customers are more than 60 days overdue?',
  );
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  const answer = page.locator('.assistant-answer').last();
  await expect(answer).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(answer.locator('table tbody tr, [data-aging-bucket]').first()).toBeVisible();
});
```
Match the selectors to the real app; the table and aging bucket markup live in `react/src/`. The assertion must prove that real rows or buckets rendered, not only that a text answer appeared.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx nx application-e2e invoicing-e2e`

Expected: the new test fails. The fixture answers assistant requests with 503. The existing 4 tests still pass.

- [ ] **Step 3: Implement replay in `browser-fixture.ts`**

In the agent request handler, before the `x-invoicing-fixture` check:
- If `request.url` targets the assistant agent (`%2Fassistant%23agent`, decoded as `/assistant#agent`), then:
  1. Read and parse the JSON body.
  2. Load `examples/invoicing/e2e/recordings/overdue-60.agui.json`. Resolve it relative to the repo root the fixture runs from (`cwd: ../../..`), or use `import.meta` / `__dirname`, and read it once at startup.
  3. Build `prepareReplay(tape, { threadId: body.threadId, runId: body.runId })`.
  4. Respond `200 text/event-stream` with every event as a `data: …\n\n` line, the same way the approval branch does.
- Leave the review-agent path unchanged.

The replay ignores the question text, so any assistant question gets the recorded answer. That's acceptable for a test fixture; note it in a comment.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx nx application-e2e invoicing-e2e`. Expected: 5 of 5 pass.

- [ ] **Step 5: Commit**

```bash
git add examples/invoicing/server/browser-fixture.ts examples/invoicing/e2e/workflow.spec.ts
git commit -m "test(invoicing): replay the recorded answer and guard it in e2e"
```

### Task C5: Record the stills with `sharp`

**Files:**
- Modify: root `package.json` and `package-lock.json` (devDependency `sharp`)
- Create: `examples/invoicing/e2e/record-stills.record.ts`, `examples/invoicing/e2e/record-stills.config.ts`
- Modify: `examples/invoicing/e2e/project.json` (target `stills`)
- Create: `www/analog/public/image/landing-page/invoicing.webp`, `www/analog/public/image/landing-page/invoicing-mobile.webp`

- [ ] **Step 1: Add `sharp`**

Run: `npm install --save-dev --save-exact sharp --no-audit --no-fund`. The user approved this.
- If ERESOLVE or the native install fails, STOP and report it.
- Check that `git diff --stat package-lock.json` only adds sharp and its `@img/*` dependencies.

- [ ] **Step 2: Config**

`record-stills.config.ts` copies `playwright.deterministic.config.ts`, which has the fixture webServer on 4330 and needs no API key. Only the following differs:
- `testMatch: 'record-stills.record.ts'`
- `use: { baseURL: 'http://127.0.0.1:4330', channel: 'chrome', headless: true }`
- `outputDir` under `test-results/examples/invoicing-stills`
- no HTML reporter

- [ ] **Step 3: Stills script**

`record-stills.record.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

// Regenerate by hand after the tape or the invoicing UI changes:
//   npx nx stills invoicing-e2e
// Stills are committed; CI never rewrites them.
const OUT = resolve(__dirname, '../../../www/analog/public/image/landing-page');
const QUESTION = 'Which USD customers are more than 60 days overdue?';
const BUDGET = 150 * 1024;

async function ask(page: Page) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message assistant' }).fill(QUESTION);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const answer = page.locator('.assistant-answer').last();
  await expect(answer).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(answer.locator('table tbody tr, [data-aging-bucket]').first()).toBeVisible();
  await page.waitForTimeout(400);
  return answer;
}

async function save(png: Buffer, name: string, width: number) {
  const webp = await sharp(png).resize({ width }).webp({ quality: 70, effort: 6 }).toBuffer();
  expect(webp.byteLength, `${name} over budget`).toBeLessThanOrEqual(BUDGET);
  await mkdir(OUT, { recursive: true });
  await writeFile(resolve(OUT, name), webp);
}

test('desktop still', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 875 }, deviceScaleFactor: 2 });
  await ask(page);
  await save(await page.screenshot(), 'invoicing.webp', 1400);
});

test('mobile still', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2, isMobile: true });
  const answer = await ask(page);
  await answer.scrollIntoViewIfNeeded();
  await save(await page.screenshot(), 'invoicing-mobile.webp', 585);
});
```
- Use the same selectors as the C4 guard.
- On the mobile layout (≤800px), the assistant panel stacks below the grid. Make sure the screenshot shows the question and the rendered answer; `scrollIntoView` on the conversation region may be needed.
- If a WebP goes over budget, lower the quality to 60. If the answer isn't readable at desktop size, consider screenshotting a clipped region that includes the grid edge and the whole assistant panel. Report whatever you chose.

- [ ] **Step 4: Nx target and run**

Add this to `project.json`:
```json
"stills": {
  "executor": "nx:run-commands",
  "cache": false,
  "options": {
    "command": "playwright test --config examples/invoicing/e2e/record-stills.config.ts"
  }
}
```
Run: `npx nx stills invoicing-e2e`

Expected:
- Both tests pass.
- Both WebP files exist and are under 150 KB.

Read both images with the Read tool. They must show the question, the assistant's prose, and a rendered table or aging summary. They must not show a loading state.

- [ ] **Step 5: Type-check, lint and commit**

Run: `npx nx build invoicing-e2e && npx nx lint invoicing-e2e`.
```bash
git add package.json package-lock.json examples/invoicing/e2e/record-stills.record.ts examples/invoicing/e2e/record-stills.config.ts examples/invoicing/e2e/project.json www/analog/public/image/landing-page/invoicing.webp www/analog/public/image/landing-page/invoicing-mobile.webp
git commit -m "feat(invoicing): record homepage stills from the replayed answer"
```

### Task C6: Use the stills on the homepage

**Files:**
- Modify: `www/analog/src/app/components/home/RealApp.ts`
- Delete: `www/analog/public/image/landing-page/invoicing.jpg`

- [ ] **Step 1: Update `RealApp`**

Replace the screenshot `<img>` inside `.shot` with:
```html
<picture>
  <source media="(max-width: 767px)" srcset="/image/landing-page/invoicing-mobile.webp" width="585" height="<mobile height>" />
  <img src="/image/landing-page/invoicing.webp" alt="The Hashbrown invoicing example: the assistant answers which USD customers are more than 60 days overdue with a rendered aging summary" loading="lazy" width="1400" height="875" />
</picture>
```
- Read the real pixel sizes with `sips -g pixelWidth -g pixelHeight` and use them as `width` and `height` for both.
- Update the alt text to describe what the still actually shows.
- Keep `.shot img` styles working for `picture > img`.

- [ ] **Step 2: Delete the old JPEG and verify**

```bash
git rm -q www/analog/public/image/landing-page/invoicing.jpg
grep -rn "invoicing.jpg" www/analog/src
npx nx build www && npx nx test www && npx nx lint www && npx nx e2e www
```
Expected:
- The grep finds nothing.
- Everything passes.

Browser check at desktop width and 375px: the showcase shows the new still, and the mobile still appears on mobile.

- [ ] **Step 3: Commit**

```bash
git add -A www/analog/src/app/components/home/RealApp.ts www/analog/public/image/landing-page
git commit -m "feat(www): show the recorded generative UI answer in the invoicing showcase"
```

---

## Final verification

- [ ] Run: `npx nx run-many -t build,test,lint -p www angular invoicing-e2e invoicing-server && npx nx e2e www && npx nx application-e2e invoicing-e2e`. All must pass.
- [ ] `npx nx serve www` serves `/` with highlighted code, rendered on the server.
- [ ] `git status --short` shows only `?? .claude/`.
- [ ] Update the PR draft at `scratchpad/pr-draft.md`:
  - Add the dev server fix, the Shiki highlighting, and the stills pipeline.
  - Remove those three items from the limitations list.
  - Note that Mike's posts were left unchanged (the v0.3 post still links to the removed `/workshops`).
  - List API reference highlighting as a follow-up.
