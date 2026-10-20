# OpenAI and Azure providers on the Responses API, with reasoning

Status: design, awaiting approval (2026-10-20)

## Intent

`@hashbrownai/openai` and `@hashbrownai/azure` call OpenAI's Chat Completions
API today. Moving them to the Responses API does three things:

- **Reasoning.** Hashbrown developers can now stream an OpenAI model's
  reasoning summaries into their UI, the way the Anthropic, Bedrock, Google and
  Ollama providers already stream reasoning.
- **Newest models.** OpenAI's reasoning guide says Chat Completions does not
  support function calling on its newest models (GPT-6 Astra, GPT-6.1 Sol).
  Hashbrown depends on tool calls, so staying on Chat Completions means those
  models break.
- **Built-in tools later.** Built-in tools (web search, file search, code
  interpreter, image generation, remote MCP) exist only on Responses. A later
  design maps them to AG-UI activity events (`ACTIVITY_SNAPSHOT` /
  `ACTIVITY_DELTA`). That later work was the reason this work started; this
  design is its first step.

Reasoning defaults follow threadplane: summaries are on for reasoning models
without any configuration. There is one deliberate difference. Reasoning
effort is left at the model's own default; threadplane forced `'minimal'`, and
that is being fixed there separately.

## Goals

1. **Both providers move to Responses.** `HashbrownOpenAI.stream.text` and
   `HashbrownAzure.stream.text` stream from the Responses API. Chat
   Completions is no longer used.
2. **Reasoning streams as AG-UI reasoning events.**
   - Summaries stream as `REASONING_MESSAGE_START` / `CONTENT` / `END`.
   - The reasoning item's `encrypted_content` is sent as
     `REASONING_ENCRYPTED_VALUE`, so the client keeps it in history.
3. **Multi-turn reasoning works statelessly.**
   - Every request sends `store: false`.
   - Reasoning items that earlier OpenAI turns produced are replayed in
     `input`, before the assistant items of the turn that produced them.
     Core rebuilds each run as `[...reasoning, assistant(text, toolCalls),
     ...toolResults]` (`packages/core/src/reducers/ag-ui-message-history.ts:96`),
     so the order within one response is not kept.
   - A tool-calling conversation of several turns on a reasoning model must
     never fail with OpenAI's reasoning/function-call pairing 400 errors.
4. **Reasoning defaults.**
   - When the model looks like a reasoning model, send
     `reasoning: { summary: 'auto' }`.
   - When it doesn't, send no `reasoning` field.
   - Never send `effort` unless the developer set it.
5. **A `reasoning` option on both providers** overrides the default. It
   accepts `false` (send nothing) or `{ effort?, summary? }`.
6. **Parity with today.** Text, refusals, client tool calls, structured output
   (`responseSchema`) and cancellation behave exactly as they do now.
7. **Matching documentation.** Docs and migration notes describe the
   breaking change for both Angular and React.

## Non-goals

- **Built-in tools and activities.** Mapping built-in tools to activities, and
  surfacing activities on the client, are the next design.
- **OpenAI-compatible servers that only speak Chat Completions** (vLLM,
  OpenRouter, LM Studio and similar) are no longer supported by this provider.
  This break is accepted. A Chat Completions fallback is out of scope.
- **Stored conversations.** We do not use `previous_response_id`, OpenAI-side
  conversation storage, or `item_reference` replay.
- **Raw reasoning text.** OpenAI never exposes it for hosted models. If
  `reasoning_text.delta` events do arrive (gpt-oss behind a compatible
  endpoint), mapping them is allowed but not required.
- **Usage reporting.** No new token-usage reporting.
- **Other providers.** No changes to them.

## Anti-goals

The design has failed, even if it technically works, if any of these happen:

- A request fails because hashbrown sent `reasoning` to a model that rejects it
  and the developer never asked for reasoning.
- A second turn fails because a reasoning item or a `function_call` was
  replayed without its partner.
- Hashbrown stores conversation data on OpenAI by default.
- Reasoning text leaks into the assistant's answer or into a structured-output
  JSON payload.
- A reasoning item produced by another provider (for example an Anthropic
  thinking block in a shared history) is sent to OpenAI.

## Constraints

- **Dependencies.**
  - The `openai` package stays a peer dependency. No new dependencies.
  - The installed SDK is 6.49.0, with Responses streaming types in
    `openai/resources/responses/responses.d.ts`.
  - The peer range must be raised to the lowest version whose types include
    everything used. The root pin is `^6.45.0`, so `^6.45.0` is the expected
    answer; confirm it.
- **Public API.**
  - Core and the framework packages are unchanged. This is a provider-only
    change.
  - Provider public types must not expose `ɵ` types.
- **Repo conventions.** Follow `AGENTS.md`:
  - top-level `test(...)` only, with arrange/act/assert
  - tests are written first
  - TSDoc on every new public symbol
  - run build/test/lint/e2e for `openai` and `azure`
  - run `build-api-report` for both, and commit the updated reports
- **Cancellation.** Keep the current pattern: stop yielding once
  `signal.aborted`, and abort the provider stream in `finally`.

## Decisions

### Endpoint and request

- **Endpoint.** Use `client.responses.stream(params, { signal })`, or
  `responses.create({ stream: true })` if that maps more cleanly.
- **Request shape.** The request is a `ResponseCreateParamsStreaming` with:
  - `model`
  - `input`, mapped from the AG-UI messages (see Input mapping below)
  - `store: false`
  - `tools`: function tools `{ type: 'function', name, description,
    parameters, strict: true }`. Hashbrown sends `strict: true` today; keep it.
  - `text.format`, only when a `responseSchema` is present:
    `{ type: 'json_schema', name: 'schema', schema, strict: true }`
  - `reasoning`, decided as described under Reasoning default and option
    below
  - `include: ['reasoning.encrypted_content']` whenever `reasoning` is sent.
    Newer docs say this is now the default under `store: false`, while the
    cookbook still requires it, and sending it is harmless.
- **`transformRequestOptions`** now receives and returns
  `OpenAI.Responses.ResponseCreateParamsStreaming`. This is the breaking
  change.
  - It runs after hashbrown builds the request, so a developer can still
    change anything, including `store`, `include` and `reasoning`.

### Reasoning default and option

- **The option.** The new public option goes on `OpenAITextStreamOptions` and
  `AzureTextStreamOptions`:

  ```ts
  /**
   * Reasoning request settings. `false` sends no `reasoning` field. An object
   * is sent as given (plus `summary: 'auto'` when `summary` is omitted).
   * When unset, Hashbrown requests summaries only for models that look like
   * reasoning models, and never sets effort.
   */
  reasoning?: false | { effort?: ReasoningEffort; summary?: 'auto' | 'concise' | 'detailed' | null };
  ```

  Reuse the SDK's own `Shared.ReasoningEffort` type rather than restating the
  values.
- **Behavior when `reasoning` is unset:**
  - For models that look like reasoning models (below), send
    `{ summary: 'auto' }`.
  - For all other models, send nothing.
- **Reasoning-model check.** It is a case-insensitive prefix match on the
  model string:
  - `o` followed by a digit (`o1`, `o3`, `o4-mini`, …)
  - `gpt-5`
  - `gpt-` followed by a major version of 5 or higher (`gpt-6`, `gpt-6.1`,
    `gpt-10`, …)

  Put it in one small pure function with its own tests. The prefix list is
  this design's call. Threadplane uses the same idea, with a list that is
  being updated to include `gpt-6`.
- **Azure deployment names.** On Azure, `model` is the deployment name, which
  can be anything. The same check runs on it.
  - The docs must say plainly: if a deployment's name doesn't reveal that the
    model reasons, set `reasoning` explicitly to get summaries. If a
    non-reasoning deployment's name happens to match, set `reasoning: false`.
  - The user decided Azure follows exactly the same decisions as OpenAI, so
    there is no Azure-specific default.

### Output mapping (Responses stream → AG-UI events)

Every run is bracketed by `RUN_STARTED` and then either `RUN_FINISHED` or
`RUN_ERROR`, as today.

| Responses event | AG-UI |
|---|---|
| `response.output_item.added` with a `reasoning` item | `REASONING_MESSAGE_START` (`messageId` = the reasoning item id, `role: 'reasoning'`, `metadata: { openai: { itemId } }`) |
| `response.reasoning_summary_text.delta` | `REASONING_MESSAGE_CONTENT` for that item. Separate consecutive summary parts (new `summary_index`) with `"\n\n"`. |
| `response.reasoning_text.delta` (gpt-oss only) | Optional: `REASONING_MESSAGE_CONTENT` |
| `response.output_item.done` with a `reasoning` item | If `item.encrypted_content` is non-empty, `REASONING_ENCRYPTED_VALUE` (`subtype: 'message'`, `entityId` = item id). Then `REASONING_MESSAGE_END`. Read `encrypted_content` from the *done* item only, because OpenAI says it may be incomplete while the item is in progress. |
| `response.output_text.delta`, `response.refusal.delta` | `TEXT_MESSAGE_START` (first time) and `TEXT_MESSAGE_CONTENT`, on the run's single assistant message `${runId}:assistant`, as today |
| `response.output_item.added` with a `function_call` item | `TOOL_CALL_START` (`toolCallId` = `item.call_id`, `toolCallName` = `item.name`, `parentMessageId` = the assistant message id, `metadata: { openai: { itemId: item.id } }`) |
| `response.function_call_arguments.delta` | `TOOL_CALL_ARGS`, routed by `item_id` to the tool call's `call_id` |
| `response.output_item.done` with a `function_call` item | `TOOL_CALL_END` |
| `response.failed`, `error`, `response.incomplete` | `RUN_ERROR` with the most specific message available |
| `response.completed` | Close any open text message, then `RUN_FINISHED` |
| Built-in tool events (web_search_call, file_search_call, code_interpreter_call, image_generation_call, mcp_*, custom_tool_call) and any unknown event | Ignored in this design |

- **Text messages.** Text from every `message` output item goes into the one
  assistant AG-UI message, as Chat Completions did. This is this design's
  call, and it keeps structured output to a single parseable message.
  - Record the first message item's id as `metadata: { openai: { itemId } }`
    on `TEXT_MESSAGE_START`.
  - Hashbrown does not split preambles (`phase: 'commentary'`) into separate
    messages.
- **Event order.**
  - Reasoning events for an item come before the text or tool calls that
    follow it, because Responses streams items in output order.
  - `TEXT_MESSAGE_END` is emitted before `RUN_FINISHED`, and before any tool
    call that starts after the text.
  - Close every open reasoning and text message before `RUN_ERROR` only if
    the current providers do so; otherwise match their behavior.

### Input mapping (AG-UI history → Responses `input`)

Walk the messages in order:

| AG-UI message | Responses input |
|---|---|
| `system`, `developer` | `{ role, content }` message, kept in place in `input`. `instructions` is not used, so ordering is preserved. |
| `user` (string content) | `{ role: 'user', content }`. Non-string content still throws, as today. |
| `assistant` with text | `{ role: 'assistant', content: text }`. If `metadata.openai.itemId` is present, send it as an output message item with that id instead (`{ type: 'message', id, role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }], status: 'completed' }`). Live testing decides which form is accepted. |
| `assistant` tool calls | One `{ type: 'function_call', call_id: toolCall.id, name, arguments }` per call, after the assistant's text. Include `id: metadata.openai.itemId` when present. |
| `tool` | `{ type: 'function_call_output', call_id: toolCallId, output: content }`. Non-string content still throws. |
| `reasoning` with `metadata.openai` | `{ type: 'reasoning', id: metadata.openai.itemId ?? message.id, summary, encrypted_content: message.encryptedValue }`, placed exactly where it sits in history, before the assistant/tool-call items it preceded. `summary` is `[{ type: 'summary_text', text: content }]` when content is non-empty, otherwise `[]`. |
| `reasoning` without `metadata.openai` | Dropped. It came from another provider. |
| `reasoning` with `metadata.openai` but no `encryptedValue` | Dropped. OpenAI can't use it statelessly, and sending it would risk a pairing error. |
| `activity` | Dropped, as today. |

- **Malformed OpenAI-marked reasoning messages** throw a clear error, like
  Anthropic's `mapReasoningMessage` does (`packages/anthropic/src/stream/anthropic-request.ts:51`).
  Examples: `metadata.openai` is not an object, or `encryptedValue` is
  present but not a non-empty string.
- **Pairing safety.** These rules are this design's call. The key-gated live
  test below verifies them.
  - **Turn.** A turn is one assistant message plus the reasoning messages
    directly before it. Core keeps provider metadata, `encryptedValue` and
    this shape across runs; this was checked in
    `packages/core/src/reducers/ag-ui-message-accumulator.ts:302,463,476,626`
    and `ag-ui-message-history.ts:96`.
  - **Several reasoning items in one turn** are replayed as one consecutive
    group, in their original relative order, directly before the turn's
    first assistant item. The group as a whole must be followed by an
    assistant message or a `function_call`. If nothing follows it (for
    example, the run was cancelled after reasoning), drop the whole group.
  - **Item ids are all or nothing per turn.** Send `id` on that turn's
    `function_call` and assistant-message items only when every OpenAI
    reasoning item of the turn is replayed. Otherwise strip the ids from the
    whole turn and send the plain forms: `function_call` without `id`, and the
    assistant text as `{ role: 'assistant', content }`.
  - **Why strip.** A `function_call` with its `fc_…` id but without its
    reasoning item is the pairing 400 this design must avoid. Turns with
    missing reasoning are common: `reasoning: false`, an Azure deployment
    name the check doesn't recognize, `include` removed in
    `transformRequestOptions`, or an empty encrypted value.

### Azure specifics

- **Same code.** The Azure provider uses the same request builder, event
  mapper and `reasoning` option as OpenAI.
  - Share the code without adding a dependency between the two packages
    (duplicate, or use a build-time shared source). Which mechanism is left
    to the builder.
- **Routing** (this design's call).
  - **What the SDK does.** `AzureOpenAI` always sends `?api-version=` and only
    adds `/deployments/{model}` for the older endpoints
    (`node_modules/openai/azure.js:29-41,71-91`). So with `deployment` unset,
    `/openai/responses?api-version=…` is reachable without changing the public
    options.
  - **Preferred route.** Keep `clientOptions: AzureClientOptions` and
    `AzureOpenAI`, and require a Responses-capable `apiVersion`.
  - **Check it live.** Use the root `.env` Azure resource to confirm that the
    route works, including reasoning summaries and `encrypted_content`.
  - **If it can't work.** If only the `/openai/v1/` route supports what this
    design needs, changing the Azure public options is acceptable, because
    breaking changes are accepted for this release. The PR must name the
    change, and the migration guide must cover it.
  - **Fail early on `deployment`.** If `clientOptions.deployment` is set,
    fail with a clear error that names the fix, because it puts
    `/deployments/…` in the base URL. Update the aimock fixtures, which set
    `deployment` today.
- **Expected differences** to document: no streamed partial images on Azure,
  summaries not guaranteed on every request, and model lists differ from
  OpenAI's.

### The atc example

atc (`examples/atc`) resolves `@hashbrownai/openai` from source
(`tsconfig.base.json:30`), so it breaks as soon as the provider types change.
These are the user's decisions:

- **Migrate the request options.** `limitRequest` in
  `examples/atc/server/src/run-handler.ts:227` moves to Responses params:
  - `max_completion_tokens` becomes `max_output_tokens`.
  - The reasoning effort moves to the provider's new `reasoning` option
    (`reasoning: { effort }`), or to `reasoning.effort` in
    `transformRequestOptions`, whichever reads more clearly.
  - The `ReasoningEffort` type and `REASONING_EFFORTS` table come from the
    Responses/shared SDK types instead of Chat Completions types.
  - atc's existing effort choice stays as it is today.
  - Update `run-handler.test.ts`, including the `reasoning_effort` assertion
    at line 160.
- **Keep summaries on.** atc runs `gpt-5-mini`, so summaries arrive by
  default. Do not turn them off.
- **Show reasoning summaries in both UIs.**
  - **Shared code.** Add the reasoning row to atc's shared transcript model
    (`shared/src/transcript.ts`) so Angular and React render the same thing.
  - **Where it renders.** Render the row in `angular/src/app/assistant.ts`
    and `react/src/assistant.tsx`. It reads the assistant message's
    `reasoning` / `reasoningDetails`.
  - **Placement.** It shows inside the assistant turn, before that turn's
    tool chips and answer.
  - **Behavior.** It streams live while the model reasons. When the turn
    finishes it can collapse to a single "Reasoned" line.
  - **Styling.** It is quieter than the answer and follows atc's existing
    design tokens.
  - **Left to the builder:** the exact visual design, collapse behavior and
    copy, provided both apps match.
- **Tests.**
  - Unit-test the shared transcript row.
  - Extend atc e2e (`npx nx e2e atc-e2e`) so a run with reasoning shows the
    row in both apps.
  - The demo video and home-page loop are not re-recorded in this work. Say
    in the PR that they predate the reasoning row.
- **Run each atc project's build, test and lint**, as listed in `AGENTS.md`.

## Testing

- **Unit tests** (`text.fn.spec.ts` or new specs) cover:
  - Event mapping from recorded or hand-built Responses event sequences: text
    only; text and refusal; parallel tool calls with interleaved argument
    deltas; reasoning with one and with several summary parts; reasoning
    followed by tool calls; `response.failed`; `error`;
    `response.incomplete`; abort mid-stream.
  - Input mapping: reasoning replay placement; dropping foreign and
    incomplete reasoning; dropping unpaired trailing reasoning; `call_id`
    use; `itemId` round-trip.
  - The reasoning-model check and the `reasoning` option's resolution.
  - `text.format` from `responseSchema`.
  - `transformRequestOptions` receiving Responses params.
- **Mock integration** (`integration.spec.ts`, run by `npx nx e2e openai` and
  `npx nx e2e azure`).
  - It runs against aimock, a local mock server. Installed aimock 1.43.0
    serves `/v1/responses` and synthesizes reasoning items.
  - Move the existing cases to Responses and add reasoning cases. This is
    what runs in CI.
  - aimock ignores replayed reasoning, so it cannot catch pairing errors.
- **Key-gated live tests** (new; this design's call). They follow the
  `(process.env['OPENAI_API_KEY'] ? test : test.skip)` pattern used in
  `packages/typesafe/src/integration.spec.ts:69`. They are skipped in CI and
  run locally, where the root `.env` has `OPENAI_API_KEY` and the
  `AZURE_*` variables.
  - **Reasoning model** (for example `gpt-5-mini`): stream reasoning events,
    make two parallel client tool calls, then send the results back with the
    reasoning replayed from history. The run must complete without a 400.
  - **Same flow with `reasoning: false`**, which exercises the id-stripping
    path.
  - **Non-reasoning model** (for example `gpt-4.1-mini`), with no `reasoning`
    field sent.
  - **Azure:** the same cases, if a reasoning deployment exists for the
    configured Azure resource. Otherwise the Azure reasoning case is skipped,
    and the final report says so.
  - **Settling replay forms.** These tests also decide the replay choices
    listed under "Left to the builder". If OpenAI rejects a form this design
    specifies, change the mapping to the form it accepts and note it in the PR.

## Documentation

- **Platform pages.** Update `www/content/docs/{angular,react}/platform/openai.md`
  and `azure.md`: Responses API, the `reasoning` option and its default, the
  `store: false` behaviour, Azure endpoint setup, and the deployment-name
  caveat.
- **Concept page.** Update `concept/transform-request-options.md` with the
  Responses-shaped example.
- **Migration guide.** Add the breaking changes to the v0.8 migration guide
  (`www/content/docs/angular/migrations/v0-8.md`, and the React counterpart if
  it exists by then):
  - `transformRequestOptions` type
  - Chat-Completions-only compatible servers are no longer supported
  - reasoning on by default for reasoning models
  - Azure endpoint requirements
- **Changelog.** Add a CHANGELOG entry under the 0.8 release notes.

## Left to the builder

- Whether to use `responses.stream` or `responses.create({ stream: true })`.
- How OpenAI and Azure share code without a cross-package dependency.
- The exact `RUN_ERROR` message wording.
- Which assistant-message input form OpenAI accepts on replay, settled by the
  live test.
- Whether to map `reasoning_text.delta` for gpt-oss.
- The lowest `openai` peer version that has the needed types.
