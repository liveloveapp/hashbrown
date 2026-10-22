# b4.step contract, hashbrown side (slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hashbrown core reads the `b4.step` / `b4.answer` contract into `serverToolCalls` and the assistant message. The OpenAI and Azure adapters gain `builtInTools.webSearch`, which emits web search as a provider step with sources and citations and never replays it as a function call. Conformance runs against B4's published fixtures.

**Architecture:** The contract is folded once, at the canonical AG-UI message layer. CUSTOM `b4.step` and tool-call metadata both merge into `toolCall.metadata["b4.step"]` there, through one contract-aware merge. The tool-calls reducer and its projection then inherit it. `toServerToolCalls` derives the new public fields from that metadata. Adapters build steps with ɵ helpers from core and a shared label table.

**Tech Stack:** TypeScript, Nx, Jest, `@ag-ui/core` 1.0.2, `openai` 6.x, aimock record and replay.

**Spec:** `docs/superpowers/specs/2026-10-21-b4-tool-step-contract-design.md` (approved). The B4 side is in `docs/superpowers/plans/2026-10-21-b4-tool-step-b4run.md`.

## Global Constraints

- AGENTS.md:
  - Write the failing test first.
  - Use top-level `test(...)` with arrange, act and assert separated by blank lines. No `describe` or `it`.
  - Every new public API gets TSDoc.
  - No `ɵ` types and no `b4`-named types in public React or Angular signatures.
  - Run `npx nx build|test|lint` (and `e2e` where it exists) for each affected package.
- Wire names: metadata key `"b4.step"`, answer key `"b4.answer"`, CUSTOM `b4.step`, `v: 1`. The merge rules and the legacy normalization are as in the spec's "Rules" section. They mirror `@b4run/sdk`'s `mergeToolStep` and `readToolStep`, and Task 9 proves the two agree.
- Core has **no runtime dependency** on B4. `@b4run/sdk` is a root **devDependency**, a user decision, used only in Task 9.
- Public fields are the spec's "Hashbrown's public surface": `outcome`, `label`, `icon`, `kind`, `builtin`, `queries`, `sources`, `error`, `timing`, `parentToolCallId`. `status` stays `inProgress | executing | complete`.
- Bad settle: `status: 'complete'`. For `failed`, `result` is `{status:'rejected', reason: error}`. For `denied` and `cancelled` with no RESULT, there is no `result`. A later RESULT never un-fails a step.
- Classification: a call is server-run if no client tool has its name, **or** if its step has `kind: 'provider'`.
- Labels for OpenAI web search, which apply to all providers through the shared table:
  - running with a query: `Searching the web for '<query>'`
  - running with no query: `Searching the web`
  - completed: `Searched '<query>' · <n> sources`, or `· 1 source`
  - failed: `Web search failed`
  - Trim to 120 code points.
- `builtInTools` exists only on the provider adapters' `stream.text` options. Keys are camelCase forms of `builtin` values. Slice 1 adds only `webSearch`, on OpenAI and Azure.
- Keys come only from `/Users/blove/repos/hashbrown/.env`. Never print or commit them.
- **Dependencies between tasks:**
  - Task 7 needs #682 (recording tooling) merged into main; rebase this branch onto it first.
  - Task 9 needs the B4 plan released to npm.
  - Tasks 1-6 and 8 can run before either.

## Review Focus

1. **A B4 0.14 server's legacy CUSTOM step** (no `v`, sources without ids) must give a label and failure in `serverToolCalls`. Pinned in Task 2 by `test('folds a legacy B4 CUSTOM step into the call metadata')`.
2. **A CUSTOM step that arrives before TOOL_CALL_START** (the ag-ui-langgraph order) must not be dropped. Pinned in Task 2 by `test('holds a b4.step for an unknown call until TOOL_CALL_START')`.
3. **An app that defines its own `web_search` client tool** must never have it run for an OpenAI provider call. Pinned in Task 3 by `test('a provider step is server-run even when a client tool shares its name')`.
4. **A follow-up turn after a web search** must not 400 when the provider call is dropped from input. Pinned in Task 6 by unit tests and in Task 7 by the recorded two-turn fixture.
5. **A citation whose URL matches no collected source** (OpenAI can cite a page that isn't in `action.sources`) must still become a source, as an answer-level source, and never vanish. Pinned in Task 5 by `test('a url_citation with no matching source adds an answer-level source')`.

---

### Task 1: Contract reader and merge in core

**Files:**
- Create: `packages/core/src/models/tool-step.ts`
- Modify: `packages/core/src/public_api.ts` (ɵ exports below)
- Test: `packages/core/src/models/tool-step.spec.ts`

**Interfaces:**
- Produces, as ɵ exports for adapters:
  - `ɵTOOL_STEP_METADATA_KEY = 'b4.step'`, `ɵANSWER_METADATA_KEY = 'b4.answer'`, `ɵTOOL_STEP_EVENT_NAME = 'b4.step'`
  - Types `ɵToolStep`, `ɵToolStepSource`, `ɵAnswerAnnotations`, the same shapes as the spec's `B4ToolStep`, `B4StepSource` and `B4AnswerAnnotations`
  - `ɵreadToolStep(value: unknown, toolCallId?: string): ɵToolStep | undefined`, with the same normalization as the spec
  - `ɵreadAnswerAnnotations(value: unknown): ɵAnswerAnnotations | undefined`
  - `ɵmergeToolStep(previous: ɵToolStep | undefined, next: ɵToolStep, source: 'call' | 'message'): ɵToolStep`
  - `ɵmergeStepMetadata(previous: Metadata | undefined, next: Metadata | undefined, source: 'call' | 'message'): Metadata | undefined`. This is a shallow merge like today's `mergeMetadata`, except that the `'b4.step'` key goes through `ɵmergeToolStep`.

- [ ] **Step 1: Write the failing tests.** Use the same cases as the B4 plan's Task 1 tests, in hashbrown style:
  - legacy normalization, including `c1:0` source ids and ISO to ms;
  - the 120 code-point trim;
  - an unknown status reads as an undefined status;
  - failed wins;
  - denied clears the label and sources;
  - running never un-settles;
  - `ɵmergeStepMetadata` keeps the other keys, such as `openai`, shallow-merged.
- [ ] **Step 2: Run** `npx nx test core --testFile=tool-step.spec.ts`. Expect FAIL.
- [ ] **Step 3: Implement `tool-step.ts`.** These are pure functions over frozen POJOs.
- [ ] **Step 4: Run** the same command. Expect PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): read and merge the b4.step tool-step contract"`

### Task 2: Fold steps at the canonical message layer

**Files:**
- Modify: `packages/core/src/reducers/ag-ui-messages.reducer.ts`:
  - `applyCanonicalMessageEvent`'s switch (354-476) gets a `CUSTOM` case: when `event.name === 'b4.step'`, merge `ɵreadToolStep(event.value)` into the tool call with id `toolCallId` through `ɵmergeStepMetadata(..., 'call')`.
  - Steps for ids not yet known go into a new state field, `pendingToolSteps: Readonly<Record<string, ɵToolStep>>`, and are applied in `startToolCall`.
  - `mergeEventFields` (1125-1150) uses `ɵmergeStepMetadata` (`'message'` for tool results, `'call'` otherwise) instead of a plain spread.
  - Make sure `ɵdecideAgUiMessageEvent` *accepts* `b4.step` CUSTOM events. Ignore all other CUSTOM events, as today.
- Modify: `packages/core/src/reducers/tool-calls.reducer.ts:63-73`. `mergeMetadata` delegates to `ɵmergeStepMetadata`, so the draft and the canonical projection agree.
- Modify: the run-terminal paths:
  - On `RUN_FINISHED` with a cancelled or interrupt outcome, settle every open call's step as `'cancelled'`, except `pendingToolCallIds`.
  - On run failure, settle open steps as `'failed'`. RUN_ERROR is thrown in `transport/ag-ui-run-driver.ts:296`, so settle in the reducer for the action that driver dispatches on failure.

  Use the B4-equivalent `settleOpenSteps` logic, as a private helper in `tool-step.ts`.
- Test: `packages/core/src/reducers/ag-ui-messages.reducer.spec.ts` and `tool-calls.reducer.spec.ts`

- [ ] **Step 1: Write the failing tests**, in the style of `tool-calls.reducer.spec.ts:479`:
  - `test('folds a legacy B4 CUSTOM step into the call metadata')`: START `c1`, then CUSTOM `{name:'b4.step', value:{toolCallId:'c1',status:'running',label:'Fetching'}}`. Expect `metadata['b4.step']` to match `{v:1,kind:'server',status:'running',label:'Fetching'}`.
  - `test('holds a b4.step for an unknown call until TOOL_CALL_START')`
  - `test('a failed step survives a later fulfilled TOOL_CALL_RESULT step')`
  - `test('a RESULT step beats the call step')`
  - `test('an interrupted run keeps pending tool calls open and cancels the rest')`
  - `test('a failed run settles open steps as failed')`
  - `test('ignores CUSTOM events with other names')`
- [ ] **Step 2: Run** `npx nx test core`. Expect the new tests to FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx nx test core`. Expect all to PASS, including the existing metadata merge test at `ag-ui-messages.reducer.spec.ts:231-299`.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): fold b4.step metadata and events into tool calls"`

### Task 3: Public `serverToolCalls` fields and classification

**Files:**
- Modify: `packages/core/src/models/view.models.ts:98-116`. Add the spec's fields to `ServerToolCall`, each with TSDoc. Add the public types `ServerToolCallSource` (the `B4StepSource` shape) and `ServerToolCallOutcome = 'success' | 'failure' | 'denied' | 'cancelled'`.
- Modify: `packages/core/src/models/internal_helpers.ts:211-252` (`toServerToolCalls`):
  - Read `ɵreadToolStep(toolCall.metadata?.['b4.step'])`.
  - Derive `outcome`, `label`, `icon`, `kind`, `builtin`, `queries`, `sources`, `error`, `timing {startedAt, settledAt?}` (falling back to the arrival time; store an `arrivedAt` on the internal ToolCall at START if none exists) and `parentToolCallId`.
  - Apply the bad-settle rule.
  - Treat a ToolMessage `error` of `'error'` (the ag-ui-langgraph sentinel) as `outcome: 'failure'`, `error: {message: 'error'}`.
  - The classification change goes at line ~217.
- Test: `packages/core/src/models/internal_helpers.spec.ts` (around the serverToolCalls tests at 709-840)

- [ ] **Step 1: Write the failing tests:**
  - `test('a completed step gives outcome success with label and sources')`
  - `test('a failed step completes the call with a rejected result')`. Assert that `status` is `'complete'`, `result` is `{status:'rejected', reason:{message:'boom'}}`, and `outcome` is `'failure'`.
  - `test('a denied step without a result completes with no result')`
  - `test('a provider step is server-run even when a client tool shares its name')`
  - `test('the ag-ui-langgraph error sentinel reads as a failure')`
  - `test('calls without a step keep todays fields only')`. This one is a regression test.
- [ ] **Step 2: Run** `npx nx test core`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx nx test core`, `npx nx build core`, `npx nx lint core` and `npx nx build-api-report core`. Check the generated report locally: the new fields are public, and no ɵ type appears in them.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): label, outcome, sources and timing on serverToolCalls"`

### Task 4: Answer annotations and the shared label table

**Files:**
- Modify: `packages/core/src/models/view.models.ts`. `AssistantMessage` gains `citations?: readonly Citation[]`, `sources?: readonly ServerToolCallSource[]` and `attribution?: readonly Attribution[]`. The types are public, TSDoc'd, and copied from `B4AnswerAnnotations`.
- Modify: `packages/core/src/models/internal_helpers.ts` (`toViewMessagesFromInternal`, ~261-307). Read `ɵreadAnswerAnnotations(metadata?.['b4.answer'])`.
- Create: `packages/core/src/models/built-in-tool-labels.ts`, exported as `ɵbuiltInToolLabel(builtin: string, status: 'running' | 'completed' | 'failed', detail: { query?: string; sourceCount?: number }): string`. It has the `web_search` wordings from Global Constraints. Any other builtin falls back to `Using <builtin>`, `Used <builtin>` or `<builtin> failed`.
- Modify: `packages/core/src/public_api.ts`
- Test: `internal_helpers.spec.ts`, `built-in-tool-labels.spec.ts`

- [ ] **Step 1: Write the failing tests:**
  - `test('assistant messages expose b4.answer citations and call-less sources')`
  - `test('web search labels follow the shared wording')`. Cover all five strings from Global Constraints, including the 1-source singular and the 120 code-point trim.
- [ ] **Step 2: Run** `npx nx test core`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx nx test core`, `npx nx build core` and `npx nx lint core`. Expect PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(core): answer citations and the shared built-in tool labels"`

### Task 5: OpenAI `builtInTools.webSearch`, request and events

**Files:**
- Modify: `packages/openai/src/stream/types.ts`. Add `builtInTools?: OpenAIBuiltInTools` to `OpenAITextStreamOptions`, where `export interface OpenAIBuiltInTools { webSearch?: true | Omit<OpenAI.Responses.WebSearchTool, 'type'> }`. The TSDoc states that sources need the option, and that a tool added through `transformRequestOptions` still maps but gets no sources.
- Modify: `packages/openai/src/stream/openai-request.ts`. The signature becomes `createOpenAIRequestOptions(input, model, reasoning, builtInTools?)`:
  - `webSearch` appends `{type:'web_search', ...config}` to `tools`;
  - it adds `'web_search_call.action.sources'` to `include`;
  - `include` is merged with the reasoning include, never replacing it.
- Modify: `packages/openai/src/stream/text.fn.ts`. Pass `builtInTools` through.
- Modify: `packages/openai/src/stream/openai-events.ts`:
  - `mapItemAdded`: `web_search_call` emits `TOOL_CALL_START {toolCallId: item.id, toolCallName: 'web_search', parentMessageId: messageId, metadata: {openai: {itemId, itemType: 'web_search_call'}, 'b4.step': running step}}`. The running step is `kind:'provider', builtin:'web_search', provider:'openai'`, with `startedAt: Date.now()` and the no-query label.
  - `mapItemDone` for `web_search_call`:
    - `TOOL_CALL_ARGS` with `JSON.stringify(item.action)`
    - `TOOL_CALL_END`
    - `TOOL_CALL_RESULT {messageId: \`${item.id}:result\`, toolCallId: item.id, content: JSON.stringify({action, status}), metadata: {'b4.step': completed step}}`. The completed step has `queries` (from `action.query`/`queries`), `sources` (from `action.sources`, ids `<itemId>:<i>`, kind `url`) and `settledAt`. If `item.status` is `failed`, it is a failed step with `error: {message: 'Web search failed'}` instead.
  - `response.output_text.annotation.added` with `url_citation` is collected into state as `{url, title, start, end, quote}`, where the quote is the annotated slice of the accumulated text.
  - At `response.completed`, `TEXT_MESSAGE_END` carries `metadata['b4.answer']`. Citations map each url to the matching source id. A url with no matching source adds an answer-level source with id `<messageId>:cite:<i>`.
  - `MapperState` gains `annotations` and `sourceIndex` (url → id) as readonly fields.
- Mirror every change in `packages/azure/src/stream/*`, with the metadata key `azure` and `provider: 'azure'`.
- Test: `openai-request.spec.ts`, `openai-events.spec.ts`, and the matching Azure specs.

- [ ] **Step 1: Write the failing tests:**
  - Request:
    - `test('webSearch adds the web_search tool and requests its sources')`
    - `test('webSearch keeps the reasoning include')`
    - `test('webSearch passes the provider config through')`
  - Events. Validate with `EventSchemas.parse` as the existing specs do:
    - `test('a web_search_call becomes a provider step with queries and sources')`
    - `test('a failed web_search_call becomes a failed step')`
    - `test('url_citation annotations become b4.answer citations pointing at source ids')`
    - `test('a url_citation with no matching source adds an answer-level source')`
    - `test('a web_search_call added via transformRequestOptions still maps, without sources')`
- [ ] **Step 2: Run** `npx nx test openai` and `npx nx test azure`. Expect FAIL.
- [ ] **Step 3: Implement**, using core's ɵ step helpers and `ɵbuiltInToolLabel`.
- [ ] **Step 4: Run** `npx nx test openai`, `npx nx test azure`, `npx nx build openai`, `npx nx build azure`, `npx nx lint openai` and `npx nx lint azure`. Expect PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(openai,azure): builtInTools.webSearch as a b4.step provider step"`

### Task 6: Never replay provider calls as function calls

**Files:**
- Modify: `packages/openai/src/stream/openai-input.ts`. In `mapTurn` and the tool-message branch (100-113, 186-197), drop any tool call whose metadata has `openai.itemType` set, or a `'b4.step'` with `kind: 'provider'`, and drop its matching `role: 'tool'` message. Requests use `store: false`, so the server keeps no item to reference. The assistant's text and its citations still replay.
- Mirror in `packages/azure/src/stream/azure-input.ts`.
- Test: `openai-input.spec.ts` and `azure-input.spec.ts`

- [ ] **Step 1: Write the failing tests:**
  - `test('a provider web search call and its result are not replayed as function calls')`
  - `test('client function calls in the same turn still replay')`
- [ ] **Step 2: Run** `npx nx test openai` and `npx nx test azure`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands. Expect PASS.
- [ ] **Step 5: Commit.** `git commit -m "fix(openai,azure): drop provider calls from replayed input"`

### Task 7: Recorded web-search fixtures (after #682 is on main)

**Files:**
- Modify: `packages/openai/src/integration.spec.ts` (the recorded version from #682). Add the `web search` and `web search follow-up` cases.
  - Use a unique prompt that needs fresh facts, for example "Search the web: what is today's top story on hnrss.org/frontpage? Cite it."
  - Pass `builtInTools: { webSearch: true }` with model `gpt-4.1-mini`.
  - Assert the structure: a `serverToolCalls` entry with `builtin: 'web_search'` and `outcome: 'success'`, at least one source with an `href`, and at least one citation whose `sourceId` resolves. The follow-up turn completes with no error.
- Modify: `packages/azure/src/integration.spec.ts`. Add the same case.
  - If the Azure resource rejects `web_search` while recording, delete the Azure case.
  - Record the result in the Task 8 docs as "not supported on Azure OpenAI today".
- Recordings: `npx nx record-fixtures openai --only "web search"`, then `--only "web search follow-up"`, and the same for Azure. The secret scan must pass before you commit.

- [ ] **Step 1:** Write the two cases. They fail on replay because no recording exists, and strict mode returns a 503.
- [ ] **Step 2:** Record both providers, then re-run `npx nx e2e openai` and `npx nx e2e azure` in replay mode. Expect PASS.
- [ ] **Step 3:** Run `npx nx test testing`, which includes the credential scan. Expect PASS.
- [ ] **Step 4: Commit** the specs and the recordings: `git commit -m "test(openai,azure): recorded web search fixtures"`

### Task 8: Docs

**Files:**
- Modify: `www/content/docs/{react,angular}/platform/openai.md`. Add a "Built-in Tools" section: the `builtInTools.webSearch` option, the options table row, what users see through `serverToolCalls`, citations, OpenAI's requirement to show citations as visible and clickable, and the `transformRequestOptions` caveat.
- Modify: `www/content/docs/{react,angular}/platform/azure.md`. Same section, or "not supported" per Task 7.
- Modify: `www/content/docs/{react,angular}/concept/functions.md`, under "Server-Executed Tool Calls" (react ~188, angular ~195):
  - the new fields and the `outcome` table;
  - the `b4.step` contract, in one paragraph with a link to B4's docs;
  - that a B4.run server's steps show up automatically;
  - assistant `citations`.

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2: Run** `npx nx test www`, `npx nx lint www` and `npx nx build www`. Expect PASS. The `www` tests that are known to be flaky under parallel load may need a solo re-run.
- [ ] **Step 3: Commit.** `git commit -m "docs: built-in web search and the tool step fields"`

### Task 9: Conformance against B4's fixtures (after B4's release)

**Files:**
- Modify: the root `package.json`. Add `"@b4run/sdk": "<released version>"` to `devDependencies`, the user decision. Run `npm install` so `package-lock.json` updates.
- Create: `packages/core/src/models/tool-step.conformance.spec.ts`. It sits in core, not `tools/conformance` (my call), because it has to drive core's internal reducers directly.
  - For every entry in `@b4run/sdk/testing`'s `TOOL_STEP_FIXTURES`:
    1. Drive `fixture.events` through the root reducer with `apiActions.generateMessageEvent`, as `reducers/index.spec.ts` does around line 3761.
    2. Project with `toViewMessagesFromInternal`.
    3. Map each `ServerToolCall` back to contract terms with the spec's mapping table (`complete` plus `outcome` becomes the contract status; `inProgress` or `executing` becomes `running`).
    4. Compare `status`, `label`, `sources`, `error` and `kind` with `fixture.expected.steps`, and the assistant fields with `expected.answers`.
  - Also assert that core's `ɵmergeToolStep` matches `@b4run/sdk`'s `mergeToolStep` on every pair of statuses.

- [ ] **Step 1:** Write the spec.
- [ ] **Step 2: Run** `npx nx test core --testFile=tool-step.conformance.spec.ts`. Fix any disagreement in hashbrown. If the fixture looks wrong instead, stop and report it to the user, because the fix then belongs in B4.
- [ ] **Step 3:** Run the full check: `npx nx run-many -t build,test,lint -p core openai azure react angular`, and `npx nx run-many -t e2e -p core openai azure angular`. Expect PASS.
- [ ] **Step 4: Commit.** `git commit -m "test(core): conform to the b4.step fixture corpus"`
