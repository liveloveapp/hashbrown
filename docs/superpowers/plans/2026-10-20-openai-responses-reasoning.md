# OpenAI and Azure on the Responses API: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `@hashbrownai/openai` and `@hashbrownai/azure` from Chat Completions to the Responses API, stream reasoning summaries as AG-UI reasoning events with stateless replay, and show those summaries in both atc apps.

**Architecture:**
- **Four pure modules per provider:**
  - reasoning-option resolution
  - AG-UI history → Responses `input`
  - request options
  - Responses stream events → AG-UI events

  `text.fn.ts` wires them together exactly as Azure's `text.fn.ts` already does today.
- **Azure gets its own copy** of the same modules, because providers don't depend on each other. This duplication already exists today.
- **atc** keeps its own effort and length limits, and adds a `reasoning` row to its shared transcript model, which both UIs render.

**Tech Stack:**
- TypeScript, with the `openai` SDK 6.x as a peer dependency (`responses.stream`).
- `@ag-ui/core` 1.0.2.
- Jest, plus aimock (`@hashbrownai/testing/aimock`, `@copilotkit/aimock` 1.43.0).
- Angular and React in atc, with Playwright for atc-e2e.

**Spec:** `docs/superpowers/specs/2026-10-20-openai-responses-reasoning-design.md`. Read it first. Every decision below comes from it.

## Global Constraints

- **Peer dependency.** `openai` stays a peer dependency. Raise both providers' peer range from `^6.9.0` to the lowest version that has every type used. The expected value is `^6.45.0` (the root pin); confirm it.
- **Dependencies.** No new dependencies in any package.
- **Requests.** Every request sends `store: false`. Send `include: ['reasoning.encrypted_content']` whenever `reasoning` is sent.
- **Reasoning effort.** Never send `reasoning.effort` unless the developer set it.
- **Function tools** are `{ type: 'function', name, description, parameters, strict: true }`.
- **Structured output** is `text.format = { type: 'json_schema', name: 'schema', schema, strict: true }`, sent only when `forwardedProps.hashbrown.responseSchema` is set.
- **Reasoning-model check.** A case-insensitive prefix match on the model:
  - `o` + a digit
  - `gpt-5`
  - `gpt-` + a major version ≥ 5
- **Provider metadata namespace** is `metadata.openai`, on both OpenAI and Azure.
  - The Azure provider also reads and writes `metadata.openai`, because it is the same wire format.
- **Tests.**
  - Top-level `test(...)` only, with arrange/act/assert separated by blank lines.
  - Write the failing test first.
  - Run each stream-mapping test's output through `EventSchemas.parse`, as `azure-events.spec.ts` does.
- **TSDoc** on every new public or reusable symbol. Public provider types expose no `ɵ` types.
- **Before each commit,** run `npx nx test <project>` and `npx nx lint <project>` for the touched project.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Switching to a reasoning model mid-thread.** History where earlier turns ran on a non-reasoning model, or had no reasoning items, must replay without errors and keep their item ids. Task 2 pins this.
2. **Cancelled after reasoning.** If a run was cancelled after reasoning but before any text or tool call, the next request must not send that trailing reasoning group. Task 2 pins this.
3. **Reasoning from another provider.** An Anthropic thinking block left in the history (no `metadata.openai`) is never sent to OpenAI. Task 2 pins this.
4. **Summary-less reasoning.** A reasoning item with an empty summary (low effort) still produces a reasoning message start and end with no content. Its encrypted value still replays. Task 4 pins this.
5. **Structured output stays clean.** With `responseSchema` and reasoning both on, reasoning text never reaches the assistant text message, so the streamed JSON parses. Task 4 pins this.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/openai/src/stream/reasoning.ts` (new) | `OpenAIReasoningOption`, `isReasoningModel`, `resolveReasoning` |
| `packages/openai/src/stream/openai-input.ts` (new) | AG-UI messages → Responses `input`, including the pairing rules |
| `packages/openai/src/stream/openai-request.ts` (new) | Builds `ResponseCreateParamsStreaming` |
| `packages/openai/src/stream/openai-events.ts` (new) | Responses stream events → AG-UI events |
| `packages/openai/src/stream/types.ts` (new) | Public option and input types, moved out of `text.fn.ts` |
| `packages/openai/src/stream/text.fn.ts` | Rewritten to wire the four modules, shaped like `packages/azure/src/stream/text.fn.ts` |
| `packages/openai/src/live.integration.spec.ts` (new) | Key-gated live tests |
| `packages/azure/src/stream/{reasoning,azure-input,azure-request,azure-events,types,text.fn}.ts` | Azure copies. `azure-request.ts` and `azure-events.ts` are rewritten, the others are new or updated |
| `packages/azure/src/live.integration.spec.ts` (new) | Key-gated live tests |
| `tools/testing/aimock/fixtures/openai/{reasoning,reasoning-tool-call}.json` (new) | aimock reasoning fixtures |
| `examples/atc/server/src/run-handler.ts` | `limitRequest` on Responses params |
| `examples/atc/shared/src/transcript.ts` | `reasoning` transcript row |
| `examples/atc/angular/src/app/transcript.ts`, `examples/atc/react/src/transcript.tsx` | Render the reasoning row |
| `examples/atc/e2e/src/{model.ts,atc.spec.ts}` | e2e coverage for the reasoning row |
| `www/content/docs/{angular,react}/platform/{openai,azure}.md`, `www/content/docs/{angular,react}/concept/transform-request-options.md`, `www/content/docs/angular/migrations/v0-8.md` | Docs |

---

### Task 1: Reasoning option and model check (OpenAI)

**Files:**
- Create: `packages/openai/src/stream/reasoning.ts`
- Test: `packages/openai/src/stream/reasoning.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  /** @public */
  export type OpenAIReasoningOption =
    | false
    | { effort?: OpenAI.ReasoningEffort; summary?: 'auto' | 'concise' | 'detailed' | null };
  export function isReasoningModel(model: string): boolean;
  export function resolveReasoning(
    model: string,
    option: OpenAIReasoningOption | undefined,
  ): OpenAI.Reasoning | undefined;
  ```
  `OpenAI.ReasoningEffort` and `OpenAI.Reasoning` are the SDK's shared types (`openai/resources/shared`).

- [ ] **Step 1: Write the failing tests**

```ts
test('isReasoningModel matches o-series and gpt-5 and later, case-insensitively', () => {
  const models = ['o1', 'o3-mini', 'O4-mini', 'gpt-5', 'gpt-5-mini', 'gpt-5.1', 'gpt-6', 'gpt-6.1-sol', 'gpt-10',
                  'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'omni-moderation', 'my-deployment'];

  const result = models.map(isReasoningModel);

  expect(result).toEqual([true, true, true, true, true, true, true, true, true,
                          false, false, false, false, false]);
});

test('resolveReasoning requests auto summaries for reasoning models when unset', () => {
  expect(resolveReasoning('gpt-5-mini', undefined)).toEqual({ summary: 'auto' });
  expect(resolveReasoning('gpt-4.1', undefined)).toBeUndefined();
});

test('resolveReasoning sends nothing when the option is false', () => {
  expect(resolveReasoning('gpt-5-mini', false)).toBeUndefined();
});

test('resolveReasoning sends an object as given and fills only a missing summary', () => {
  expect(resolveReasoning('gpt-4.1', { effort: 'low' })).toEqual({ effort: 'low', summary: 'auto' });
  expect(resolveReasoning('gpt-5', { summary: null })).toEqual({ summary: null });
  expect(resolveReasoning('gpt-5', { effort: 'high', summary: 'detailed' })).toEqual({ effort: 'high', summary: 'detailed' });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx nx test openai --testFile=reasoning.spec.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement `reasoning.ts`**

`isReasoningModel` is a single regular expression, `/^(o\d|gpt-(?:[5-9]|\d{2,})(?!\d))/i`. Adjust it if the tests demand. An explicitly passed `summary` (including `null`) is kept as is. No `effort` key is ever added.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx nx test openai --testFile=reasoning.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/openai/src/stream/reasoning.ts packages/openai/src/stream/reasoning.spec.ts
git commit -m "feat(openai): resolve the reasoning request option"
```

---

### Task 2: History → Responses input (OpenAI)

**Files:**
- Create: `packages/openai/src/stream/openai-input.ts`
- Test: `packages/openai/src/stream/openai-input.spec.ts`

**Interfaces:**
- Produces: `export function mapInput(messages: readonly Message[]): OpenAI.Responses.ResponseInputItem[]`. Here `Message` is from `@ag-ui/core`.
- **Metadata contract** (the output side, Task 4, writes these):
  - `reasoning` messages carry `metadata.openai = { itemId: string }` and `encryptedValue`.
  - `assistant` messages carry `metadata.openai = { itemId?: string, reasoningItemIds: string[] }`. `itemId` is the first output-message item id.
  - Each assistant `toolCalls[i]` carries `metadata.openai = { itemId: string, reasoningItemIds: string[] }`.
  - `reasoningItemIds` lists every reasoning item that came earlier in the same response.
  - This is how the all-or-nothing id rule knows which reasoning a turn had. It doesn't rely on core keeping empty reasoning messages.

**Mapping rules.** Spec, "Input mapping":
- `system` / `developer` / `user` map to role messages. Non-string user content throws `OpenAI provider currently requires text user content`, as today.
- Assistant text maps to an assistant message, then one `function_call` per tool call with `call_id = toolCall.id`.
- `tool` maps to `function_call_output`. Non-string content throws, as today.
- A `reasoning` message maps to a `reasoning` item, `{ type: 'reasoning', id: itemId, summary, encrypted_content }`, but only when it has `metadata.openai` and a non-empty `encryptedValue`. Otherwise it is dropped.
- `activity` is dropped.
- Consecutive reasoning items form a group that goes before the assistant items that follow it. A group followed by nothing, or by a non-assistant message, is dropped.
- **Item ids.** For each assistant turn, send `id` on its message and `function_call` items only when every id in that turn's `reasoningItemIds` was sent as a reasoning item. Otherwise send both item kinds without `id`, and send the text as `{ role: 'assistant', content }`.
- **Malformed `metadata.openai`** throws `` `OpenAI reasoning message "${id}" metadata.openai must be an object` ``. So does a non-string `itemId`. Match the style of `packages/anthropic/src/stream/anthropic-request.ts:51-107`.

- [ ] **Step 1: Write the failing tests.** Each test builds a `Message[]` and asserts the exact `ResponseInputItem[]`:
  - `test('maps system, user, assistant text, tool calls and tool results in order', …)`: `call_id` equals the AG-UI `toolCall.id`, and `function_call_output.call_id` equals `toolCallId`.
  - `test('replays OpenAI reasoning with encrypted content before the turn it preceded, with item ids', …)`: expected order `[user, reasoning(rs_1), assistant msg(id msg_1), function_call(id fc_1, call_id call_1), function_call_output(call_1)]`, where `reasoning.summary` is `[{ type: 'summary_text', text }]`.
  - `test('sends an empty summary array for a reasoning message with no text', …)`
  - `test('groups several reasoning messages before one turn, in order', …)`
  - `test('strips item ids from a turn whose reasoning cannot be replayed', …)`: `reasoningItemIds: ['rs_1']`, and the reasoning message has no `encryptedValue`. Expect no `reasoning` item, no `id` on the `function_call`, and assistant text as `{ role: 'assistant', content }`.
  - `test('keeps item ids on turns that had no reasoning', …)`: empty `reasoningItemIds` (Review Focus 1).
  - `test('drops a trailing reasoning group with nothing after it', …)` (Review Focus 2).
  - `test('drops reasoning from other providers', …)`: a message with `metadata.anthropic` only (Review Focus 3).
  - `test('drops activity messages', …)`
  - `test('throws on malformed metadata.openai', …)`
  - `test('throws on non-text user content', …)`

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx nx test openai --testFile=openai-input.spec.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement `mapInput`** in two passes:
  1. Group messages into turns, where a turn is a run of reasoning messages followed by an assistant message, and pass every other message through.
  2. Emit the items.

  Keep it pure, with no mutation of the input.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx nx test openai --testFile=openai-input.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/openai/src/stream/openai-input.ts packages/openai/src/stream/openai-input.spec.ts
git commit -m "feat(openai): map AG-UI history to Responses input with reasoning replay"
```

---

### Task 3: Request options (OpenAI)

**Files:**
- Create: `packages/openai/src/stream/openai-request.ts`
- Test: `packages/openai/src/stream/openai-request.spec.ts`

**Interfaces:**
- Consumes: `mapInput` (Task 2) and `resolveReasoning` (Task 1).
- Produces:
  ```ts
  export function createOpenAIRequestOptions(
    input: OpenAIHashbrownRunAgentInput,
    model: string,
    reasoning: OpenAIReasoningOption | undefined,
  ): OpenAI.Responses.ResponseCreateParamsStreaming;
  ```
  `OpenAIHashbrownRunAgentInput` moves into `stream/types.ts` (Task 5). Until then, import its current definition from `text.fn.ts`.

- [ ] **Step 1: Write the failing tests**
  - `test('builds a stateless streaming Responses request', …)`: expect `stream: true`, `model`, `store: false`, `input` equal to `mapInput(messages)`, and no `tools` key when there are no tools.
  - `test('maps tools to strict function tools', …)`: expect `[{ type: 'function', name, description, parameters, strict: true }]`, where `parameters` is a structured clone, not the same object.
  - `test('maps the response schema to text.format', …)`: expect `text: { format: { type: 'json_schema', name: 'schema', schema, strict: true } }`, and no `text` key without a schema.
  - `test('requests summaries and encrypted reasoning for reasoning models', …)`: for `gpt-5-mini`, expect `reasoning: { summary: 'auto' }` and `include: ['reasoning.encrypted_content']`. For `gpt-4.1`, expect neither key.
  - `test('honours reasoning: false and an explicit object', …)`

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx nx test openai --testFile=openai-request.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `createOpenAIRequestOptions`.** Optional keys are omitted, not set to `undefined`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx nx test openai --testFile=openai-request.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/openai/src/stream/openai-request.ts packages/openai/src/stream/openai-request.spec.ts
git commit -m "feat(openai): build Responses request options"
```

---

### Task 4: Responses events → AG-UI events (OpenAI)

**Files:**
- Create: `packages/openai/src/stream/openai-events.ts`
- Test: `packages/openai/src/stream/openai-events.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface MapOpenAIEventsOptions {
    readonly events: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>;
    readonly messageId: string;
    readonly signal?: AbortSignal;
  }
  export function mapOpenAIEvents(options: MapOpenAIEventsOptions): AsyncIterable<AGUIEvent>;
  ```
- **Behavior:**
  - The mapper does **not** emit `RUN_STARTED` or `RUN_FINISHED`; `text.fn` does, as in Azure.
  - On `response.failed`, `error` or `response.incomplete`, it **throws** an `Error`, so that `text.fn` emits `RUN_ERROR`. The message comes from:
    - `response.error.message`
    - otherwise `error.message`
    - otherwise `` `OpenAI response incomplete: ${response.incomplete_details?.reason}` ``
  - It stops yielding once `signal.aborted`.
- **Mapping:** the table in the spec's "Output mapping" section, plus the metadata contract from Task 2:
  - **Text messages.** `TEXT_MESSAGE_START` carries `metadata: { openai: { itemId, reasoningItemIds } }`. `itemId` is the first message item's id.
  - **Tool calls.** `TOOL_CALL_START` carries `metadata: { openai: { itemId: item.id, reasoningItemIds } }`, with `toolCallId = item.call_id`. Argument deltas are routed by `item_id`.
  - **Reasoning messages.** `REASONING_MESSAGE_START` carries `metadata: { openai: { itemId } }`, with `messageId = item.id` and `role: 'reasoning'`.
  - **`reasoningItemIds`** lists the ids of every reasoning item that has come so far in this response.
  - **Order at the end of a reasoning item.** Content parts are joined with `"\n\n"` when `summary_index` changes. `REASONING_ENCRYPTED_VALUE` comes before `REASONING_MESSAGE_END`, read from the `output_item.done` item.
  - **Closing text.** `TEXT_MESSAGE_END` is emitted before the first tool call that starts after text, and at `response.completed`.
  - **Ignored.** Built-in tool events and unknown events.

- [ ] **Step 1: Write the failing tests.** Feed hand-built `ResponseStreamEvent` sequences through an `async function* source(...)` helper, as `azure-events.spec.ts` does. Parse every output event with `EventSchemas.parse`, and assert the exact `AGUIEvent[]`.
  - `test('maps output text and refusal deltas into one assistant message', …)`
  - `test('maps a reasoning item with two summary parts and encrypted content', …)`: expect content deltas `'First.'`, `'\n\n'`, `'Second.'`, then `REASONING_ENCRYPTED_VALUE { subtype: 'message', entityId: 'rs_1', encryptedValue: 'enc' }`, then `REASONING_MESSAGE_END`.
  - `test('maps a reasoning item with an empty summary to start and end only', …)` (Review Focus 4)
  - `test('reads encrypted content only from the done item', …)`: the `added` item carries `encrypted_content: 'partial'` and the `done` item carries `'final'`. Expect only `'final'`.
  - `test('maps parallel function calls with interleaved argument deltas by item id', …)`: two calls whose argument deltas alternate. Expect each call's `TOOL_CALL_ARGS` to route to its own `call_id`, and `TOOL_CALL_END` to follow each `output_item.done`.
  - `test('records reasoning item ids on the text message and tool calls that follow', …)`
  - `test('keeps reasoning out of structured-output text', …)`: reasoning followed by `output_text` deltas that form JSON. The concatenated `TEXT_MESSAGE_CONTENT` must equal the JSON exactly (Review Focus 5).
  - `test('ignores built-in tool events', …)`: `response.web_search_call.searching` produces no events.
  - `test('throws the provider message on response.failed', …)`, `test('throws on error events', …)`, `test('throws on response.incomplete', …)`
  - `test('stops yielding once aborted', …)`

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx nx test openai --testFile=openai-events.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `mapOpenAIEvents`.** Track two pieces of state: open reasoning items by item id, and function calls by item id (holding `call_id`).

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx nx test openai --testFile=openai-events.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/openai/src/stream/openai-events.ts packages/openai/src/stream/openai-events.spec.ts
git commit -m "feat(openai): map Responses stream events to AG-UI with reasoning"
```

---

### Task 5: Wire `text.fn`, public types, and aimock integration (OpenAI)

**Files:**
- Create: `packages/openai/src/stream/types.ts`
- Modify: `packages/openai/src/stream/text.fn.ts` (full rewrite), `packages/openai/src/index.ts`, `packages/openai/package.json` (peer range), `packages/openai/src/stream/text.fn.spec.ts`, `packages/openai/src/integration.spec.ts`
- Create: `tools/testing/aimock/fixtures/openai/reasoning.json`, `tools/testing/aimock/fixtures/openai/reasoning-tool-call.json`. Copy the shape of `tools/testing/aimock/fixtures/anthropic/reasoning*.json`, with `reasoning` text and no signature.
- Update the API report for `openai`.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces these public types, all exported from `packages/openai/src/index.ts`:
  - `OpenAITextStreamOptions`: unchanged fields, plus `reasoning?: OpenAIReasoningOption`.
    - `transformRequestOptions?: (options: OpenAI.Responses.ResponseCreateParamsStreaming) => OpenAI.Responses.ResponseCreateParamsStreaming | Promise<…>`
  - `OpenAIHashbrownRunAgentInput`: unchanged.
  - `OpenAIReasoningOption`.

- [ ] **Step 1: Update `text.fn.spec.ts` and `integration.spec.ts` to the new contract first.**
  - Existing cases now run against aimock's `/v1/responses`. Keep the model `gpt-4.1-mini` for them, since it is not a reasoning model.
  - Add these cases:
    - `test('OpenAI streams reasoning summaries and encrypted reasoning from a reasoning model', …)`: uses `openai/reasoning.json` with `gpt-5-mini`. Expect the `REASONING_MESSAGE_START`, `CONTENT`, `ENCRYPTED_VALUE` and `END` events before `TEXT_MESSAGE_START`.
    - `test('OpenAI replays reasoning across a tool round trip', …)`: uses `openai/reasoning-tool-call.json`. The first run calls `lookup`. Build the second run's `messages` from the first run's events plus a `tool` result (reuse the history helper that `integration.spec.ts:214` already uses), and expect `Continued answer from aimock.`
    - `test('transformRequestOptions receives Responses params', …)`: the transform sees `store: false` and `input`, and its changed `max_output_tokens` reaches aimock.
- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx nx test openai && npx nx e2e openai`
Expected: FAIL.

- [ ] **Step 3: Rewrite `text.fn.ts`** in the shape of `packages/azure/src/stream/text.fn.ts`:
  - `RUN_STARTED`
  - `createOpenAIRequestOptions`, then `transformRequestOptions`
  - `new OpenAI({ apiKey, baseURL }).responses.stream(request, { signal })`
  - `mapOpenAIEvents`
  - `RUN_FINISHED`
  - `RUN_ERROR` in `catch` when not aborted, and `stream.abort()` in `finally`

  Move the public types to `types.ts` and update `index.ts`. Raise the peer range (see Global Constraints).

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx nx test openai && npx nx e2e openai && npx nx lint openai && npx nx build openai && npx nx build-api-report openai`
Expected: all pass, and the API report shows the new `reasoning` option and the Responses `transformRequestOptions` type.

- [ ] **Step 5: Commit**

```bash
git add packages/openai tools/testing/aimock/fixtures/openai
git commit -m "feat(openai)!: stream from the Responses API with reasoning summaries"
```

---

### Task 6: Key-gated live tests (OpenAI)

**Files:**
- Create: `packages/openai/src/live.integration.spec.ts`

**Interfaces:**
- Consumes: `HashbrownOpenAI.stream.text` (Task 5).
- Gate: `const liveTest = process.env['OPENAI_API_KEY'] ? test : test.skip;`, as in `packages/typesafe/src/integration.spec.ts:69`.

- [ ] **Step 1: Write the live tests.** Each one collects events and asserts there is no `RUN_ERROR`.
  - `liveTest('gpt-5-mini streams reasoning and replays it across two parallel tool calls', …)`:
    - Turn 1 forces two `lookup` calls; the prompt asks for two lookups.
    - Expect reasoning events and two `TOOL_CALL_START`s.
    - Turn 2 replays the history built from turn 1's events, plus two tool results, and ends in `TEXT_MESSAGE_CONTENT`.
  - `liveTest('gpt-5-mini replays a tool round trip with reasoning: false', …)`: the same flow. This exercises the id-stripping path.
  - `liveTest('gpt-4.1-mini runs without a reasoning field', …)`: a plain text answer.
- [ ] **Step 2: Run the tests**

Run: `set -a; source /Users/blove/repos/hashbrown/.env; set +a; npx nx e2e openai --testFile=live.integration.spec.ts`
Expected: PASS.
- **If OpenAI rejects a replay form** (assistant message with `id`, `function_call` with `id`, summary text), change the mapping in Task 2 to the form it accepts, update Task 2's tests, and record the change in the PR description.
- **Confirm the tests skip without the key:** `npx nx e2e openai` with no `OPENAI_API_KEY` shows the cases as skipped.

- [ ] **Step 3: Commit**

```bash
git add packages/openai/src/live.integration.spec.ts packages/openai/src/stream
git commit -m "test(openai): key-gated live Responses reasoning tests"
```

---

### Task 7: Azure provider on Responses

**Files:**
- Create: `packages/azure/src/stream/reasoning.ts` and `packages/azure/src/stream/azure-input.ts`. These copy Tasks 1–2, with `Azure`-prefixed public names and Azure wording in errors (`Azure OpenAI reasoning message "…"`).
- Modify: `packages/azure/src/stream/azure-request.ts` (rewrite to the Task 3 behavior), `packages/azure/src/stream/azure-events.ts` (rewrite to the Task 4 behavior), `packages/azure/src/stream/types.ts`, `packages/azure/src/stream/text.fn.ts`, `packages/azure/src/index.ts`, and `packages/azure/package.json` (peer range).
- Rewrite the specs: `azure-request.spec.ts`, `azure-events.spec.ts`, `text.fn.spec.ts`, `integration.spec.ts`. Also create `reasoning.spec.ts`, `azure-input.spec.ts` and `live.integration.spec.ts`.
- Update the API report for `azure`.

**Interfaces:**
- Produces:
  - `AzureReasoningOption`, with the same shape as `OpenAIReasoningOption`.
  - `AzureTextStreamOptions.reasoning?: AzureReasoningOption`.
  - `AzureTextStreamOptions.transformRequestOptions`, taking and returning `OpenAI.Responses.ResponseCreateParamsStreaming`.
  - `clientOptions: AzureClientOptions` stays, unless Step 4 proves it can't.
  - The function names are `createAzureRequestOptions(input, model, reasoning)` and `mapAzureEvents(options)`, keeping today's names.

- [ ] **Step 1: Port the unit specs from Tasks 1–4,** with Azure names and fixture values. Add `test('rejects clientOptions.deployment with a clear error', …)`, which expects a `RUN_ERROR` whose message names `deployment` and says to remove it for the Responses API.
- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx nx test azure`
Expected: FAIL.
- [ ] **Step 3: Implement the port.**
  - `text.fn` uses `new AzureOpenAI(clientOptions).responses.stream(request, { signal })`.
  - It checks `clientOptions.deployment` before the request and throws inside the `try`, so the error becomes a `RUN_ERROR`.
  - Update the aimock fixtures in `integration.spec.ts`: drop `deployment` and use a Responses-capable `apiVersion` such as `'preview'`. Confirm aimock serves the Azure Responses path. If it does not, note that in the spec file's header comment and keep the aimock coverage to what it serves.
- [ ] **Step 4: Verify routing live.** With `AZURE_API_KEY`, `AZURE_ENDPOINT` and `AZURE_API_VERSION` from the root `.env`, run `live.integration.spec.ts`. Its cases mirror Task 6, gated on `AZURE_API_KEY`, and use `process.env['AZURE_REASONING_MODEL']` as the deployment for the reasoning cases, skipping them when it is unset.
  - **If `/openai/responses?api-version=…` fails** and only `/openai/v1/` works, change the public option to whatever reaches v1 cleanly. Record it as a breaking change for Task 8 and in the PR.
  - **Report which Azure cases ran and which were skipped.**

Run: `set -a; source /Users/blove/repos/hashbrown/.env; set +a; npx nx e2e azure`
Expected: PASS, with the skipped cases listed.
- [ ] **Step 5: Run the full checks**

Run: `npx nx test azure && npx nx lint azure && npx nx build azure && npx nx build-api-report azure`
Expected: all pass.
- [ ] **Step 6: Commit**

```bash
git add packages/azure tools/testing/aimock/fixtures
git commit -m "feat(azure)!: stream from the Responses API with reasoning summaries"
```

---

### Task 8: Docs and migration guide

**Files:**
- Modify: `www/content/docs/angular/platform/openai.md`, `www/content/docs/react/platform/openai.md`, `www/content/docs/angular/platform/azure.md`, `www/content/docs/react/platform/azure.md`, `www/content/docs/angular/concept/transform-request-options.md`, `www/content/docs/react/concept/transform-request-options.md`, `www/content/docs/angular/migrations/v0-8.md`. Also update `www/content/docs/react/migrations/v0-8.md` if it exists on the base branch when this task runs.

- [ ] **Step 1: Update the platform pages** for both frameworks:
  - The Responses API.
  - The `reasoning` option table row and its default (summaries for reasoning models, effort left to the model).
  - `store: false`.
  - The reasoning events the client receives.
  - For Azure: the endpoint and `apiVersion` setup from Task 7, the "do not set `deployment`" rule, the deployment-name caveat (set `reasoning` explicitly), and the known Azure differences (no partial images, summaries not on every request).
- [ ] **Step 2: Rewrite the `transform-request-options` examples** to Responses params, for example `max_output_tokens` and `reasoning.effort`.
- [ ] **Step 3: Add a v0.8 migration section** covering:
  - the `transformRequestOptions` type change, with a before/after snippet
  - that Chat-Completions-only compatible servers are no longer supported
  - that reasoning is on by default for reasoning models, and how to turn it off
  - the Azure endpoint and `deployment` changes
  - Add it to the checklist at the top.
- [ ] **Step 4: Run the checks**

Run: `npx nx lint www && npx nx test www && npx nx build www`
Expected: PASS. The `search-index.spec.ts` sitemap count is unchanged, because no pages are added.
- [ ] **Step 5: Commit**

```bash
git add www/content
git commit -m "docs: OpenAI and Azure on the Responses API with reasoning"
```

---

### Task 9: atc server on Responses params

**Files:**
- Modify: `examples/atc/server/src/run-handler.ts:26-40,215-240` and `examples/atc/server/src/run-handler.test.ts:149-165`.

**Interfaces:**
- Consumes: the Task 5 `transformRequestOptions` type.
- Produces:
  - `type ReasoningEffort = NonNullable<OpenAI.ReasoningEffort>`, the shared SDK type, with the `REASONING_EFFORTS` table kept.
  - `export function limitRequest(request: OpenAI.Responses.ResponseCreateParamsStreaming, reasoningEffort: ReasoningEffort | null): OpenAI.Responses.ResponseCreateParamsStreaming`.
- **Behavior:**
  - Set `max_output_tokens: MAX_OUTPUT_TOKENS`.
  - When `reasoningEffort !== null && REASONING_MODEL.test(request.model)`, set `reasoning: { ...request.reasoning, effort: reasoningEffort }`. Merging keeps the provider's `summary: 'auto'`.
  - Leave `REASONING_MODEL` as is.

- [ ] **Step 1: Update the tests**
  - `limitRequest caps the output`: expect `limited.max_output_tokens > 0`.
  - `limitRequest sends reasoning effort only to reasoning models`: map to `limitRequest({ ...request, model, reasoning: { summary: 'auto' } }, 'low').reasoning`, and expect `[{ summary: 'auto', effort: 'low' }, …same for 'gpt-5.1' and 'o4-mini'…, { summary: 'auto' }, { summary: 'auto' }]`. With `null`, expect `reasoning` to be unchanged.
  - Change the `request` fixture at the top of the file to a `ResponseCreateParamsStreaming`.
- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx nx test atc-server`
Expected: FAIL.
- [ ] **Step 3: Implement it.** Update the `readRunOptions` TSDoc if its wording mentions Chat Completions.
- [ ] **Step 4: Run the checks**

Run: `npx nx test atc-server && npx nx lint atc-server && npx nx build atc-server`
Expected: PASS. This includes `the run handler streams AG-UI events from the model`, which now runs through aimock's Responses endpoint.
- [ ] **Step 5: Commit**

```bash
git add examples/atc/server
git commit -m "feat(atc): request options for the Responses API"
```

---

### Task 10: Reasoning row in both atc UIs

**Files:**
- Modify: `examples/atc/shared/src/transcript.ts` and its spec (create `transcript.spec.ts` next to it if none exists; check `examples/atc/shared/src` for where transcript tests live).
- Modify: `examples/atc/angular/src/app/transcript.ts`, `examples/atc/react/src/transcript.tsx`, and the shared atc stylesheet the existing `.atc-activity` row uses.
- Modify: `examples/atc/e2e/src/model.ts` and `examples/atc/e2e/src/atc.spec.ts`.

**Interfaces:**
- Produces, in `@atc/shared`:
  - `TranscriptMessageLike` gains `readonly reasoning?: string`.
  - `TranscriptItem` gains `| { readonly kind: 'reasoning'; readonly text: string; readonly done: boolean }`.
- **Behavior:**
  - For each assistant message with non-empty `reasoning`, emit a reasoning row before that message's tools or answer rows.
  - Consecutive reasoning rows inside one turn merge, with their text joined by `"\n\n"`.
  - `done` is `true` once any later row exists, or once the chat isn't busy. Compute it in `transcriptItems`, which gains a second parameter, `busy = false`.
  - `thinkingStatus` returns `null` when the last row is an unfinished reasoning row, because the row itself shows progress.
- **Rendering:**
  - Both apps render `<li class="atc-reasoning" data-testid="reasoning">`.
  - While `!done`, it shows the streaming summary in the `atc-activity` style, with the shimmer on its label "Reasoning".
  - When `done`, it collapses to a `<details>` whose summary reads "Reasoned" and whose body is the text.
  - It is quieter than answers and uses existing atc design tokens. Both apps must render the same markup and copy.

- [ ] **Step 1: Write the failing shared tests**
  - `test('puts an assistant message's reasoning before its tool calls', …)`
  - `test('merges reasoning within one turn', …)`
  - `test('marks reasoning done once a later row exists or the chat is idle', …)`
  - `test('hides the thinking line while reasoning streams', …)`
- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx nx test atc-shared`
Expected: FAIL.
- [ ] **Step 3: Implement the shared model, then both renderers.** Pass `busy` through at each app's `transcriptItems(...)` call site: `angular/src/app/assistant.ts:135` and `react/src/assistant.tsx:121`.
- [ ] **Step 4: Add the e2e case**
  - In `model.ts`, add a prompt such as `reasoned: 'Which plane is highest?'`. Its scripted first response carries aimock's `reasoning: 'Comparing altitudes across the visible traffic.'` along with the existing `highest` tool call.
  - Add `test('shows the model's reasoning before its tool calls, collapsed once answered', …)` to `atc.spec.ts`. It checks that `[data-testid=reasoning]` contains the reasoning text and that after the answer it shows "Reasoned". Run it in both the Angular and React Playwright projects.
- [ ] **Step 5: Run the checks**

Run: `npx nx test atc-shared && npx nx lint atc-shared && npx nx test atc-angular && npx nx lint atc-angular && npx nx build atc-angular && npx nx test atc-react && npx nx lint atc-react && npx nx build atc-react && npx nx e2e atc-e2e && npx nx typecheck atc-e2e`
Expected: all pass.
- [ ] **Step 6: Commit**

```bash
git add examples/atc
git commit -m "feat(atc): show reasoning summaries in both apps"
```

---

### Task 11: Whole-branch verification

- [ ] **Step 1: Run every affected target**

Run: `npx nx run-many -t build,test,lint -p core openai azure atc-shared atc-server atc-angular atc-react www && npx nx e2e openai && npx nx e2e azure && npx nx e2e atc-e2e && npx nx run-many -t build-api-report -p openai azure`
Expected: all pass, and `git status` shows no uncommitted API-report changes.
- [ ] **Step 2: Run the live tests one last time** with the root `.env` loaded, and record which cases ran and which were skipped.
- [ ] **Step 3: Write the PR description.** It lists:
  - the breaking changes
  - any replay-form changes from Task 6
  - the Azure routing outcome and skipped Azure cases from Task 7
  - that the atc demo video and home loop predate the reasoning row
  - that the 0.8 CHANGELOG entry goes into the release-notes PR (#663), not this one
