# Invoicing Assistant Evals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An on-demand eval suite for the invoicing assistant, built on `@b4run/evals` and `@b4run/testing` (which wrap aimock), whose expected answers are computed from the generated ledger's facts, runnable in replay (no key), live (real model), and record (refresh fixtures) modes.

**Architecture:** B4's `createAgentHarness` runs no route middleware, so the assistant's tools would have no context under `b4 eval`. This PR ships its own small harness instead: it boots the example's real runtime listener (`createRuntimeRequestListener` from `@b4run/cli/runtime`, with the real `middleware.ts`) and the `/api` handler in-process on an ephemeral port, starts an aimock via `createAimock` from `@b4run/testing` and points the model at it through `OPENAI_BASE_URL`, obtains a session cookie, posts the AG-UI request the React client would send, and parses the SSE stream into the `AgentRunResult` shape the `@b4run/evals` scorers read. Eval definitions use `defineEval` and are executed by a `run.ts` script that mirrors `b4 eval`'s replay/record/live switches and its sibling-fixture-file convention, so the harness can be deleted when B4 gains a `middlewareContext` option.

**Tech Stack:** `@b4run/testing` 0.8.36 (`createAimock`, `loadFixtures`, `writeFixtures`, `script`), `@b4run/evals` 0.8.36 (`defineEval`, `runEval`, `toolCalled`, `custom`, `tokensUnder`, `llmJudge`, `gate`), `@b4run/cli/runtime`, `@ag-ui/core` event names, Vitest, `tsx`.

This is PR 4 of 4 from [the design spec](../specs/2026-09-19-invoicing-generative-ui-design.md), stacked on PR 3 ([#560](https://github.com/liveloveapp/hashbrown/pull/560), branch `blove/invoicing-react-kit`). Work on branch `blove/invoicing-evals`. It depends on PR 2's tools and contracts, not on PR 3's renderers.

**Facts that shape the design** (verified in the B4 source and the installed packages):

- `AgentRunResult` has `finalMessage`, `messages`, `toolCalls: { name, args, id? }[]`, `toolResults: { name, status?, content, isError }[]`, `tokens: string[]`, `state`, `threadId`, `interrupts`, `planUpdates`, `todos`, `subagents`, `subagentEvents`, `systemPrompt`. Scorers read `finalMessage`, `toolCalls`, `toolResults`, `tokens`.
- B4 emits AG-UI events `TEXT_MESSAGE_START/CONTENT/END`, `TOOL_CALL_START/ARGS/END`, `TOOL_CALL_RESULT`, `RUN_FINISHED`, `RUN_ERROR`. The `render` tool's nested echo also streams as `TEXT_MESSAGE_CONTENT`, so the run's text contains the canonical UI JSON followed by the root model's final `{"ui":[]}`.
- aimock matches a request by its last user message, `turnIndex` (count of assistant messages already in the request), and `hasToolResult`. B4's `recordingsToFixtures` keys `turnIndex` by the recording's ordinal instead, which breaks for the nested echo call (a fresh one-message request). This harness re-keys recordings from the request itself.
- `createChatModel` reads `OPENAI_BASE_URL` at call time, so setting the env before booting the listener routes every model call, including the echo and `llmJudge`, through aimock.

---

## File map

| File | Change | Responsibility |
| ---- | ------ | -------------- |
| `examples/invoicing/server/package.json` | modify | devDependencies `@b4run/testing`, `@b4run/evals` |
| `examples/invoicing/server/evals/collect-run.ts` | create | SSE parser to `AgentRunResult` |
| `examples/invoicing/server/evals/collect-run.spec.ts` | create | |
| `examples/invoicing/server/evals/fixtures.ts` | create | re-keying recordings, sibling fixture path |
| `examples/invoicing/server/evals/fixtures.spec.ts` | create | |
| `examples/invoicing/server/evals/harness.ts` | create | boot runtime + aimock, run one case |
| `examples/invoicing/server/evals/harness.spec.ts` | create | scripted replay through the real route |
| `examples/invoicing/server/src/app/assistant/evals/assistant.eval.ts` | create | dataset from facts, scorers, gate |
| `examples/invoicing/server/src/app/assistant/evals/*.fixtures.json` | create by recording | replay tapes |
| `examples/invoicing/server/evals/run.ts` | create | CLI: replay, `--live`, `--record`, `--json` |
| `examples/invoicing/server/project.json` | modify | `eval` target |
| `examples/invoicing/server/vitest.config.mts` | modify | include `evals/**/*.spec.ts` |
| `examples/invoicing/README.md` | modify | evals section |
| `docs/superpowers/specs/2026-09-19-invoicing-generative-ui-design.md` | modify | note that PR 4 shipped the harness |

Commands run from the repository root `/Users/blove/repos/hashbrown/.claude/worktrees/xenodochial-rosalind-9aa111`. Server tests: `npx vitest run --config examples/invoicing/server/vitest.config.mts <file>`. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Prettier and eslint before every commit; stage only files you changed.

---

### Task 1: Dependencies and the SSE run collector

**Files:**
- Modify: `examples/invoicing/server/package.json`, `examples/invoicing/server/vitest.config.mts`
- Create: `examples/invoicing/server/evals/collect-run.ts`, `collect-run.spec.ts`

- [ ] **Step 1: Add the dev dependencies**

In `examples/invoicing/server/package.json` add to `devDependencies`: `"@b4run/testing": "0.8.36"` and `"@b4run/evals": "0.8.36"`. Run `npm install --no-audit --no-fund` at the repo root; confirm with `git diff --stat package-lock.json` that the lockfile change is confined to the workspace entry plus any newly pulled packages (`@copilotkit/aimock` is expected). In `vitest.config.mts` change `include` to `['examples/invoicing/server/src/**/*.spec.ts', 'examples/invoicing/server/evals/**/*.spec.ts']`.

- [ ] **Step 2: Write the failing test** `evals/collect-run.spec.ts`

```ts
import { expect, test } from 'vitest';
import { collectRun } from './collect-run';

const sse = (events: unknown[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

test('collects text, tool calls and results from an AG-UI stream', async () => {
  const body = sse([
    { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
    { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'ledgerSummary' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{}' },
    { type: 'TOOL_CALL_END', toolCallId: 'c1' },
    { type: 'TOOL_CALL_RESULT', toolCallId: 'c1', messageId: 'm1', role: 'tool', content: '{"asOf":"2026-09-15"}' },
    { type: 'TOOL_CALL_START', toolCallId: 'c2', toolCallName: 'render' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'c2', delta: '{"text":"Hi",' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'c2', delta: '"components":[]}' },
    { type: 'TOOL_CALL_END', toolCallId: 'c2' },
    { type: 'TEXT_MESSAGE_START', messageId: 'echo', role: 'assistant' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'echo', delta: '{"ui":[{"AssistantText":{"props":{"text":"Hi"},"children":[]}}]}' },
    { type: 'TEXT_MESSAGE_END', messageId: 'echo' },
    { type: 'TOOL_CALL_RESULT', toolCallId: 'c2', messageId: 'm2', role: 'tool', content: '{"rendered":true}' },
    { type: 'TEXT_MESSAGE_START', messageId: 'final', role: 'assistant' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'final', delta: '{"ui"' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'final', delta: ':[]}' },
    { type: 'TEXT_MESSAGE_END', messageId: 'final' },
    { type: 'RUN_FINISHED', threadId: 't', runId: 'r' },
  ]);

  const run = await collectRun(new Response(body), 't');

  expect(run.threadId).toBe('t');
  expect(run.toolCalls).toEqual([
    { id: 'c1', name: 'ledgerSummary', args: {} },
    { id: 'c2', name: 'render', args: { text: 'Hi', components: [] } },
  ]);
  expect(run.toolResults).toEqual([
    { name: 'ledgerSummary', content: '{"asOf":"2026-09-15"}', isError: false },
    { name: 'render', content: '{"rendered":true}', isError: false },
  ]);
  expect(run.finalMessage).toBe('{"ui":[]}');
  expect(run.tokens).toHaveLength(3);
  expect(run.messages.map((m) => m.role)).toEqual(['assistant', 'assistant']);
  expect(run.error).toBeUndefined();
});

test('marks tool errors and surfaces RUN_ERROR', async () => {
  const body = sse([
    { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'render' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{"text":""}' },
    { type: 'TOOL_CALL_END', toolCallId: 'c1' },
    { type: 'TOOL_CALL_RESULT', toolCallId: 'c1', messageId: 'm', role: 'tool', content: '{"error":"invalid_ui: text is empty"}' },
    { type: 'RUN_ERROR', message: 'boom' },
  ]);

  const run = await collectRun(new Response(body), 't');

  expect(run.toolResults[0]).toMatchObject({ name: 'render', isError: true, status: 'error' });
  expect(run.error).toBe('boom');
  expect(run.finalMessage).toBe('');
});
```

- [ ] **Step 3: Run to verify failure.** Expected: cannot find module `./collect-run`.

- [ ] **Step 4: Implement** `evals/collect-run.ts`

```ts
import type { AgentRunResult } from '@b4run/testing';

/** An AgentRunResult plus the run-level error AG-UI reports, if any. */
export interface InvoicingRunResult extends AgentRunResult {
  readonly error?: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parse an AG-UI SSE response into the shape @b4run/evals scorers read. */
export async function collectRun(
  response: Response,
  threadId: string,
): Promise<InvoicingRunResult> {
  const text = await response.text();
  const events = text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('data:'))
    .map((frame) => JSON.parse(frame.slice(5).trim()) as Record<string, unknown>);

  const calls = new Map<string, { name: string; args: string }>();
  const order: string[] = [];
  const toolResults: AgentRunResult['toolResults'][number][] = [];
  const messages: Record<string, unknown>[] = [];
  const texts = new Map<string, string>();
  const tokens: string[] = [];
  let error: string | undefined;

  for (const event of events) {
    switch (event.type) {
      case 'TOOL_CALL_START': {
        const id = String(event.toolCallId);
        calls.set(id, { name: String(event.toolCallName), args: '' });
        order.push(id);
        break;
      }
      case 'TOOL_CALL_ARGS': {
        const call = calls.get(String(event.toolCallId));
        if (call) call.args += String(event.delta ?? '');
        break;
      }
      case 'TOOL_CALL_RESULT': {
        const call = calls.get(String(event.toolCallId));
        const content = event.content;
        let isError = false;
        if (typeof content === 'string') {
          try {
            const parsed: unknown = JSON.parse(content);
            isError = record(parsed) && typeof parsed.error === 'string';
          } catch {
            isError = false;
          }
        }
        toolResults.push({
          name: call?.name ?? '',
          content,
          isError,
          ...(isError ? { status: 'error' as const } : {}),
        });
        break;
      }
      case 'TEXT_MESSAGE_START':
        texts.set(String(event.messageId), '');
        break;
      case 'TEXT_MESSAGE_CONTENT': {
        const id = String(event.messageId);
        const delta = String(event.delta ?? '');
        texts.set(id, (texts.get(id) ?? '') + delta);
        tokens.push(delta);
        break;
      }
      case 'TEXT_MESSAGE_END': {
        const id = String(event.messageId);
        messages.push({ id, role: 'assistant', content: texts.get(id) ?? '' });
        break;
      }
      case 'RUN_ERROR':
        error = String(event.message ?? 'run_error');
        break;
      default:
        break;
    }
  }

  const toolCalls = order.map((id) => {
    const call = calls.get(id);
    let args: unknown = call?.args ?? '';
    try {
      args = JSON.parse(call?.args || '{}');
    } catch {
      /* keep the raw string */
    }
    return { id, name: call?.name ?? '', args };
  });
  const last = messages.at(-1);
  return {
    finalMessage: typeof last?.content === 'string' ? last.content : '',
    messages,
    toolCalls,
    toolResults,
    tokens,
    state: {},
    threadId,
    interrupts: [],
    planUpdates: [],
    todos: [],
    subagents: [],
    subagentEvents: [],
    systemPrompt: '',
    ...(error !== undefined ? { error } : {}),
  };
}
```

If `AgentRunResult` is not exported from `@b4run/testing`'s root, import the type from the module path its `index.d.ts` re-exports it from and report it.

- [ ] **Step 5: Run the tests, then lint and commit**

Run the spec (expect 2 passed) and `npx nx run invoicing-server:build`. Commit `package.json`, `package-lock.json` (root), `vitest.config.mts`, and the two new files:

```
feat(invoicing): parse AG-UI streams into eval run results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 2: Fixture re-keying and the sibling path

**Files:**
- Create: `examples/invoicing/server/evals/fixtures.ts`, `fixtures.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from 'vitest';
import { recordingsToFixtures, siblingFixturePath } from './fixtures';

test('re-keys each recording from its own request, not its ordinal', () => {
  const fixtures = recordingsToFixtures([
    {
      request: { messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'Q' }] },
      response: { toolCalls: [{ id: 'c1', name: 'ledgerSummary', arguments: {} }] },
    },
    {
      request: {
        messages: [
          { role: 'system', content: 's' },
          { role: 'user', content: 'Q' },
          { role: 'assistant', content: '' },
          { role: 'tool', content: '{}' },
        ],
      },
      response: { toolCalls: [{ id: 'c2', name: 'render', arguments: { text: 'Hi' } }] },
    },
    {
      request: { messages: [{ role: 'user', content: 'Return exactly this JSON: {"ui":[]}' }] },
      response: { content: '{"ui":[]}' },
    },
  ]);

  expect(fixtures.map((f) => f.match)).toEqual([
    { userMessage: 'Q', turnIndex: 0, hasToolResult: false },
    { userMessage: 'Q', turnIndex: 1, hasToolResult: true },
    { userMessage: 'Return exactly this JSON: {"ui":[]}', turnIndex: 0, hasToolResult: false },
  ]);
});

test('sibling fixture path follows the b4 eval convention', () => {
  expect(siblingFixturePath('/x/assistant.eval.ts', 'Which GBP client is furthest behind?', 3)).toBe(
    '/x/assistant.which-gbp-client-is-furthest-behind.fixtures.json',
  );
  expect(siblingFixturePath('/x/assistant.eval.ts', undefined, 3)).toBe('/x/assistant.case-4.fixtures.json');
});
```

- [ ] **Step 2: Run to verify failure.** Expected: cannot find module `./fixtures`.

- [ ] **Step 3: Implement** `evals/fixtures.ts`

```ts
import { basename, dirname, join } from 'node:path';
import type { AimockFixture, AimockResponse, FixtureSet } from '@b4run/testing';

/** One captured real-model exchange, as `Aimock.getRecordings()` returns it. */
export interface Recording {
  readonly request: {
    readonly messages?: ReadonlyArray<{ readonly role: string; readonly content: unknown }>;
  };
  readonly response: AimockResponse;
}

/**
 * Key each recording the way aimock matches at replay: the request's last
 * user message, the number of assistant messages already in it, and whether
 * a tool result is present. B4's own helper keys by ordinal, which breaks for
 * the render tool's nested echo call (a fresh one-message request).
 */
export function recordingsToFixtures(recordings: readonly Recording[]): FixtureSet {
  return recordings.map((rec): AimockFixture => {
    const messages = rec.request.messages ?? [];
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return {
      match: {
        ...(typeof lastUser?.content === 'string' ? { userMessage: lastUser.content } : {}),
        turnIndex: messages.filter((m) => m.role === 'assistant').length,
        hasToolResult: messages.some((m) => m.role === 'tool'),
      },
      response: rec.response,
    };
  });
}

/** `<dir>/<evalBase>.<slug>.fixtures.json`, matching `b4 eval`'s convention. */
export function siblingFixturePath(evalFile: string, caseName: string | undefined, index: number): string {
  const slug = (caseName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const evalBase = basename(evalFile).replace(/\.eval\.ts$/, '');
  return join(dirname(evalFile), `${evalBase}.${slug || `case-${index + 1}`}.fixtures.json`);
}
```

Check `AimockFixture`'s `match` type in `@b4run/testing`; if it does not allow `userMessage` to be the last user message semantics or lacks a field, use the type as declared and report. If aimock's last-user-message matching turns out to use a substring, long prompts still match exactly as recorded.

- [ ] **Step 4: Run, lint, commit** `feat(invoicing): key replay fixtures from the recorded request`.

---

### Task 3: The harness

**Files:**
- Create: `examples/invoicing/server/evals/harness.ts`, `harness.spec.ts`

- [ ] **Step 1: Write the failing test** `evals/harness.spec.ts`

```ts
import { afterAll, beforeAll, expect, test } from 'vitest';
import { script } from '@b4run/testing';
import { createInvoicingHarness, type InvoicingHarness } from './harness';

let harness: InvoicingHarness;

beforeAll(async () => {
  harness = await createInvoicingHarness({ mode: 'replay' });
}, 60_000);
afterAll(async () => {
  await harness.close();
});

test('replays a scripted answer through the real route, middleware, tools and render', async () => {
  const canonical = '{"ui":[{"AssistantText":{"props":{"text":"There are five."},"children":[]}}]}';
  const fixtures = [
    ...script()
      .user('How many payments need matching?')
      .callsTool('unappliedPayments', {})
      .callsTool('render', { text: 'There are five.', components: [] })
      .replies('{"ui":[]}')
      .build(),
    { match: { userMessage: 'Return exactly this JSON' }, response: { content: canonical } },
  ];

  const run = await harness.run({ input: 'How many payments need matching?', fixtures });

  expect(run.error).toBeUndefined();
  expect(run.toolCalls.map((c) => c.name)).toEqual(['unappliedPayments', 'render']);
  expect(run.toolResults.every((r) => !r.isError)).toBe(true);
  expect(run.toolResults[0].content).toContain('"paymentCount":5');
  expect(run.finalMessage).toBe('{"ui":[]}');
  expect(run.messages.map((m) => m.content)).toContain(canonical);
}, 60_000);

test('a rejected render surfaces as a tool error the model could act on', async () => {
  const fixtures = script()
    .user('Bad render')
    .callsTool('render', { text: 'x', components: [{ CustomerCard: { customerId: 'nobody' } }] })
    .replies('{"ui":[]}')
    .build();

  const run = await harness.run({ input: 'Bad render', fixtures });

  expect(run.toolResults[0]).toMatchObject({ name: 'render', isError: true });
  expect(String(run.toolResults[0].content)).toContain('unknown customer nobody');
}, 60_000);
```

- [ ] **Step 2: Run to verify failure.** Expected: cannot find module `./harness`.

- [ ] **Step 3: Implement** `evals/harness.ts`

Requirements (write it; read `examples/invoicing/server/src/main.ts`, `src/http.ts`, `src/services.ts`, `src/session-cookie.ts`, and `@b4run/testing`'s `createAimock` signature first):

- `createInvoicingHarness({ mode: 'replay' | 'record' | 'live', recordUpstream?: string })`:
  1. Start aimock: replay → `createAimock({ fixtures: [] })`; live → `createAimock({ fixtures: [], proxy: { openai: upstream } })` (upstream default `https://api.openai.com`); record → same as live plus `record: true`. In replay set `process.env.OPENAI_API_KEY = 'mock'`; in live/record require a real `OPENAI_API_KEY` (load `INVOICING_ENV_FILE` first if set, like `main.ts`) and fail fast without it. Set `process.env.OPENAI_BASE_URL = aimock.baseUrl` and remember the previous values to restore on close.
  2. Boot the runtime: `createRuntimeRequestListener({ appRoot: <examples/invoicing/server>, middleware })` where `middleware` is the default export of `src/middleware.ts`, and the `/api` handler from `src/api.ts`, on one `http.createServer` bound to `127.0.0.1:0`, routing exactly like `main.ts`. Ensure `DATABASE_URL` is unset for the harness process so memory repositories are used.
  3. `run({ input, fixtures?, state? })`: in replay mode, `aimock.clearFixtures()` then `aimock.addFixtures(fixtures)` (accept a `ScriptBuilder` too via `.build()`). Create a fresh session by `GET /api/snapshot` and capture the `invoicing_session` cookie. POST `/agui/%2Fassistant%23agent` with the cookie and body `{ threadId: randomUUID(), runId: randomUUID(), messages: [{ id: randomUUID(), role: 'user', content: input }], tools: [], context: [], state: state ?? {}, forwardedProps: {}, hashbrown: { ui: true, responseSchema: assistantResponseSchema } }` (import `assistantResponseSchema` from `@invoicing/contracts`). Non-200 → throw with the status and body. Return `collectRun(response, threadId)`. In record mode, snapshot `aimock.getRequests().length` and `aimock.getFixtureCount()` before the run and expose `lastRecordedFixtures()` = `recordingsToFixtures(aimock.getRecordingsSince(journalStart, fixtureStart))`.
  4. `close()`: stop the server (`closeAllConnections`), `runtime.close()`, `aimock.close()`, restore env.
- Export the `InvoicingHarness` interface with `run`, `lastRecordedFixtures`, `close`, `baseUrl`.

If `createRuntimeRequestListener` rejects because a second runtime is created in the same process across tests, keep one harness per spec file (the tests above do). If the route rejects with 422 in the test, print the response body in the thrown error so the cause is visible.

- [ ] **Step 4: Run the spec.** Expected: 2 passed within the timeout. If the scripted replay fails on fixture matching, dump `aimock.getRequests()` (the last request's messages) in the failure message and compare against the fixture keys; adjust the echo fixture's `match` to what aimock actually saw and report what you learned about matching (last-vs-first user message, turnIndex semantics).

- [ ] **Step 5: Lint, commit** `feat(invoicing): in-process eval harness that runs the assistant route with its middleware`.

---

### Task 4: Eval definition and runner

**Files:**
- Create: `examples/invoicing/server/src/app/assistant/evals/assistant.eval.ts`
- Create: `examples/invoicing/server/evals/run.ts`
- Modify: `examples/invoicing/server/project.json`

- [ ] **Step 1: Write the eval definition** `assistant.eval.ts`

```ts
import { contains, custom, defineEval, gate, llmJudge, toolCalled, tokensUnder } from '@b4run/evals';
import type { AgentRunResult } from '@b4run/testing';
import type { AssistantRenderInput } from '@invoicing/contracts';
import { deriveFacts } from '../../../generator/facts';
import { formatMoney } from '../../../money';
import { createSampleLedger, sampleScenarios } from '../../../sample-ledger';

const facts = deriveFacts(createSampleLedger());
const gbp = facts.currencies.find((c) => c.currency === 'GBP');
const largestGbp = gbp?.largestOpen?.customerId ?? '';
const cedarOpen = facts.customers.find((c) => c.customerId === 'cedar')?.openInvoiceIds ?? [];

const renderInput = (run: AgentRunResult): AssistantRenderInput | undefined =>
  run.toolCalls.find((c) => c.name === 'render')?.args as AssistantRenderInput | undefined;
const components = (run: AgentRunResult) => renderInput(run)?.components ?? [];
const has = (run: AgentRunResult, name: string) =>
  components(run).some((c) => Object.keys(c)[0] === name);

const rendersOnce = custom(
  (run) => (run.toolCalls.filter((c) => c.name === 'render').length === 1 ? 1 : 0),
  { name: 'rendersOnce', threshold: 1 },
);
const endsWithEmptyUi = custom((run) => (run.finalMessage.trim() === '{"ui":[]}' ? 1 : 0), {
  name: 'endsWithEmptyUi',
  threshold: 1,
});
const noAllocationClaim = custom(
  (run) => (/\b(I have|I've) (matched|applied|allocated)\b/i.test(renderInput(run)?.text ?? '') ? 0 : 1),
  { name: 'noAllocationClaim', threshold: 1 },
);

export default defineEval({
  name: 'invoicing assistant',
  dataset: [
    {
      name: 'unapplied total',
      input: 'How many incoming payments still need matching, and what is the unapplied total?',
      expected: '$13,900.00',
    },
    {
      name: 'gbp furthest behind',
      input: 'Which GBP client has the largest overdue balance?',
      expected: largestGbp,
    },
    {
      name: 'cedar open invoices',
      input: 'Show me Cedar Health\'s open invoices.',
      expected: cedarOpen,
    },
    {
      name: 'eur trend',
      input: 'How did EUR invoicing trend this year?',
    },
    {
      name: 'atlas match',
      input: 'Match the Atlas payment.',
      expected: sampleScenarios.ambiguous.paymentId,
    },
    ...facts.customers.slice(0, 3).map((c) => ({
      name: `habit ${c.customerId}`,
      input: `How does ${c.name} usually pay?`,
      expected: c.profile,
    })),
  ],
  scorers: [
    rendersOnce,
    endsWithEmptyUi,
    noAllocationClaim,
    tokensUnder(4000),
    custom(
      (run, c) => {
        switch (c.name) {
          case 'unapplied total':
            return run.toolCalls.some((t) => t.name === 'unappliedPayments' || t.name === 'ledgerSummary') &&
              (renderInput(run)?.text ?? '').includes(formatMoney(1390000, 'USD'))
              ? 1
              : 0;
          case 'gbp furthest behind':
            return (renderInput(run)?.text ?? '').toLowerCase().includes(String(c.expected)) ||
              components(run).some((k) => JSON.stringify(k).includes(String(c.expected)))
              ? 1
              : 0;
          case 'cedar open invoices': {
            const table = components(run).find((k) => 'LedgerTable' in k) as
              | { LedgerTable: { recordIds: string[] } }
              | undefined;
            const ids = new Set(table?.LedgerTable.recordIds ?? []);
            return (c.expected as string[]).every((id) => ids.has(id)) ? 1 : 0;
          }
          case 'eur trend':
            return has(run, 'TrendChart') ? 1 : 0;
          case 'atlas match':
            return has(run, 'ReviewPayment') && JSON.stringify(components(run)).includes(String(c.expected)) ? 1 : 0;
          default:
            return (renderInput(run)?.text ?? '').toLowerCase().includes(String(c.expected).replace('-', ' ')) ||
              has(run, 'CustomerCard')
              ? 1
              : 0;
        }
      },
      { name: 'answersTheQuestion', threshold: 1 },
    ),
    llmJudge({
      criteria:
        'The answer is grounded in the ledger figures it cites, states amounts as formatted currency, and never claims to have changed anything. Input: {{input}}. Output: {{output}}',
      model: 'gpt-5-mini',
      threshold: 0.7,
    }),
  ],
  gate: gate.all(gate.passRate(0.8), gate.perScorer()),
});
```

Read `@b4run/evals`'s `gate` export to confirm `gate.all`, `gate.passRate`, `gate.perScorer` exist with those signatures; adjust to what exists and report.

- [ ] **Step 2: Write the runner** `evals/run.ts`

Requirements: parse `--live`, `--record`, `--json [file]`, and an optional path filter; discover `src/app/assistant/evals/*.eval.ts` (import each; default export is the definition); build one `createInvoicingHarness` per mode; call `runEval(definition, { baseDir: dirname(evalFile), runCase })` where `runCase`: replay → fixtures from `testCase.fixtures` (build if a ScriptBuilder) or `loadFixtures(siblingFixturePath(evalFile, name, index))`, else throw a clear error; record → `harness.run({ input })` then `writeFixtures(sibling, harness.lastRecordedFixtures())` and print the path; live → `harness.run({ input })`. Print a report per eval: each case with per-scorer scores and reasons, then the gate verdict; exit code 1 if a gated eval failed. Write JSON to `.b4/eval-report.json` (or the given path) when `--json` is passed. `llmJudge` uses `OPENAI_BASE_URL`, so in replay its call is served from the same fixtures; in record it is recorded alongside.

- [ ] **Step 3: Add the nx target** in `examples/invoicing/server/project.json`:

```json
"eval": {
  "executor": "nx:run-commands",
  "options": {
    "command": "tsx --tsconfig examples/invoicing/server/tsconfig.json examples/invoicing/server/evals/run.ts",
    "forwardAllArgs": true
  }
}
```

Confirm `tsconfig.json`'s `include` covers `evals/**/*.ts` (add it if not) so `invoicing-server:build` typechecks the harness and runner.

- [ ] **Step 4: Build, lint, commit** `feat(invoicing): define assistant evals with computed expectations and a replay/record/live runner`.

---

### Task 5: Record the tapes, replay, document, PR

- [ ] **Step 1: Record** with the real key:

```bash
INVOICING_ENV_FILE=/Users/blove/repos/hashbrown/.env npx nx run invoicing-server:eval -- --record
```

Expected: one `assistant.<slug>.fixtures.json` per case under `src/app/assistant/evals/`, and a printed report. Read the report: every case should pass `rendersOnce`, `endsWithEmptyUi`, `noAllocationClaim`, and most should pass `answersTheQuestion`. For any case the model fails, do not edit the fixture; decide whether the question is ambiguous (rephrase the input and re-record that case) or the scorer is wrong (fix the scorer), and say which in the commit message. If `llmJudge` fails on a case, read its reason.

- [ ] **Step 2: Replay** without a key: `npx nx run invoicing-server:eval` with `OPENAI_API_KEY` unset. Expected: identical report, no network. Run twice to confirm determinism.

- [ ] **Step 3: Commit the fixtures and report** (`.b4/` stays untracked; commit the `*.fixtures.json` files):

```
test(invoicing): record replay tapes for the assistant evals

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

- [ ] **Step 4: README and spec.** Add an "Evals" section to `examples/invoicing/README.md` describing the three modes, the fixture files, and that the harness exists because B4's `createAgentHarness` runs no route middleware. In the spec's Delivery section, note PR 4 shipped its own harness and that `evals/harness.ts` is deleted once B4 exposes a `middlewareContext` option.

- [ ] **Step 5: Full verification** as in the earlier PRs (`build,test,lint` across the four projects, deterministic e2e, artifact build), then push and open the PR against `blove/invoicing-react-kit` with a summary, the replay report excerpt, and the retarget note.

- [ ] **Step 6: Upstream drafts.** Write `docs/superpowers/upstream/2026-09-19-b4-findings.md` containing ready-to-file issue bodies for the four B4 findings in the spec (harness `middlewareContext`, `responseSchema` ignored, typegen ignores tsconfig paths and reports success on an empty schema, no post-run output hook) with the reproduction from this example for each. Filing them on `cacheplane/b4run` is a separate step the user confirms.
