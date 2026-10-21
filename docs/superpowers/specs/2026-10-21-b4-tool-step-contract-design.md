# The `b4.step` tool-step contract (hashbrown × B4.run)

Status: design, awaiting approval (2026-10-21)

## Intent

When a model or an agent server runs a tool that the browser did not run, the user should see the work happening, in plain language. Examples:

- OpenAI web search, Anthropic code execution or Google grounding;
- a B4.run tool such as `getMetar`.

A good step reads like "Searching the web for 'KSFO weather'…", then "Searched 'KSFO weather' · 2 sources". It fails visibly when it fails, and lists its sources with the answer citing them. This is how B4.run's navlog example already behaves, and the user named it as the reference. Hashbrown stays headless: it provides state, not components.

Today neither project gets this right:

- **Hashbrown.** Core derives `serverToolCalls` (`inProgress | executing | complete`) from AG-UI tool-call events. However, none of the six provider adapters emits a result for built-in tools. The 2026-10-21 audit found that OpenAI and Azure drop them, Anthropic sends them only as RAW, Google drops them, and Bedrock mis-mapped them as client calls (fixed in #684). Ollama has none. Hashbrown also has no labels, sources, citations, failure outcome or timing.
- **B4.run.** It has the right UX on the wrong carrier. Its labels, sources and failure state travel only in a `b4.step` CUSTOM event that has no version, is missing from message snapshots, and is ignored by hashbrown. As a result, a B4 tool that throws reaches hashbrown as a *successful* call. B4 also discards provider built-in tool calls and citations entirely.

The user wants the two projects designed together, each improving the other, and built iteratively.

Research behind this design, kept local and not committed:
- `reports/Server tool progress contract.md` (prior art: AG-UI, CopilotKit, MCP, Vercel AI SDK, assistant-ui, Mastra, ChatKit, provider display rules, B4 compared with hashbrown);
- `reports/Tool step contract under LangGraph.md` (B4 naming, plain LangGraph, LangChain v1 content blocks, the ag-ui-langgraph and CopilotKit bridges).

## Goals

1. **One wire contract, owned by B4.run.** It is called `b4.step`, a decision the user made. Hashbrown, B4.run and any plain LangGraph app can produce and consume it, and it conflicts with nothing that ag-ui-langgraph or CopilotKit emits.
2. **Built on standard AG-UI.** The contract rides in the `metadata` of standard `TOOL_CALL_*` events, with a CUSTOM event as a live second carrier. Lifecycle still comes from the standard events, so a client that knows nothing of the contract still renders a correct lifecycle.
3. **Failures are visible everywhere.** That covers a live step, a restored thread, and the model's own view.
4. **Provider built-in tools become first-class steps** in every hashbrown adapter, eventually in B4 as well. They carry sources and citations, meet each provider's display obligations, and replay natively on the next turn.
5. **Headless state in hashbrown.** `serverToolCalls` gains label, outcome, error, sources and timing, and assistant messages gain citations. React and Angular expose this as plain state. Grouping and turn summaries are pure helpers, not components.
6. **Iterative delivery in thin slices that cross both repos**, starting with the slice described below.

## Non-goals

- Hashbrown UI components. Hashbrown is headless. B4's styled kit and its CopilotKit slots stay B4's.
- Merging hashbrown's and B4's reducers into one shared package. There is one contract and two implementations, kept in agreement by shared fixtures.
- Changing AG-UI itself in this work. Upstream proposals are listed below, but nothing here waits on them.
- A PyPI package for plain LangGraph Python. Python users get the JSON Schema and a documented recipe.
- Bedrock built-ins through B4. `@langchain/aws` lacks the support, and Bedrock is not a B4 provider peer today.

## Anti-goals

- A failed tool shows as successful, live or after a restore, in either project.
- Provider built-in calls are replayed to the model as plain function calls to undeclared tools.
- Google Search grounding is shown without its Search Suggestions, or the suggestions are restyled or instrumented. Google's Service Terms bind this.
- Citations are dropped where the provider says they must be shown (OpenAI, Anthropic, Bedrock Nova).
- Hashbrown takes a *runtime* dependency on B4.run, or puts `b4`-named or `ɵ` types in its public signatures.
- A new step field forces a breaking release on either side.

## Constraints

- **Repo rules.** Follow AGENTS.md: write the failing test first, use top-level `test(...)` with arrange/act/assert, add TSDoc to public API, and keep public React and Angular types free of `ɵ` types. Use `npx nx` targets, and run build, test, lint and e2e for each affected package.
- **Dependency (user decision, 2026-10-21).** Hashbrown adds `@b4run/sdk` as a **devDependency**, used only by a conformance spec in `packages/core` to run B4's published JSON Schema and fixtures. Hashbrown core parses the contract with its own small reader.
- **B4.run conventions.** Its vendor wire names use the `b4.` prefix. All 21 packages version together in one Changesets fixed group (currently 0.14.0). Additive contract changes ship as a patch changeset (B4 bumps patch on 0.x), documented in `apps/web/content/docs/ag-ui.mdx`, `api/sdk.mdx` and `upgrading.mdx`.
- **AG-UI 1.0.**
  - Metadata merges onto a tool call or tool message key by key, without recursion.
  - The `ag-ui` key is reserved.
  - Vendor keys and CUSTOM names SHOULD carry a prefix.
  - `TOOL_CALL_RESULT` has no `error` field.
- **Recorded fixtures.** Hashbrown's provider tests replay fixtures recorded from the live APIs (`npx nx record-fixtures <provider>`, #682). Keys come only from the root `.env` and are never printed or committed.

## The contract

### Names (user decision: B4.run naming)

| Carrier | Name |
|---|---|
| Tool-call metadata key, on `TOOL_CALL_START` / `TOOL_CALL_END` (merges onto the ToolCall) and on `TOOL_CALL_RESULT` (lands on the ToolMessage) | `"b4.step"` |
| Assistant-message metadata key, on `TEXT_MESSAGE_START` / `TEXT_MESSAGE_END` | `"b4.answer"` |
| CUSTOM event (existing name, now versioned) | `b4.step`, value = `B4ToolStep` with `toolCallId` required |
| LangChain persistence | `ToolMessage.additional_kwargs.b4_step` (a `B4ToolStep`); provider built-ins: `AIMessage.additional_kwargs.b4_steps` (map keyed by call id) |

All values are camelCase on every carrier. B4's existing snake_case internal payload is retired.

### Shape (v1)

```ts
/** Owned by @b4run/sdk. */
interface B4ToolStep {
  v: 1;
  toolCallId?: string;                 // required on the CUSTOM event only
  kind: 'server' | 'provider';         // agent/app server vs model provider
  builtin?: string;                    // open; recommended: web_search | web_fetch | code_execution
                                       //   | file_search | mcp | grounding | tool_search | image_generation
  provider?: string;                   // openai | azure | anthropic | google | bedrock | ollama | ...
  status: 'running' | 'completed' | 'failed' | 'denied' | 'cancelled';
  label?: string;                      // plain text, ≤120 code points
  icon?: string;                       // open; B4's ten icons are the recommended set
  queries?: string[];                  // search-style tools
  sources?: B4StepSource[];
  startedAt?: number;                  // epoch ms, producer clock, execution start
  settledAt?: number;                  // epoch ms
  parentToolCallId?: string;           // call within a call, or LangGraph lifecycle cause
  error?: { message: string; code?: string };   // present iff status === 'failed'
  decision?: 'once' | 'always' | 'deny';        // approval outcome (B4)
}

interface B4StepSource {
  id: string;                          // stable within the thread; citations reference it
  kind: 'url' | 'file' | 'document' | 'record';
  title: string;
  href?: string;
  snippet?: string;
  fileId?: string;
  containerId?: string;
  cited?: boolean;                     // e.g. OpenAI lists uncited URLs too
}

interface B4AnswerAnnotations {
  v: 1;
  citations?: Array<{
    sourceId: string;
    quote?: string;                    // the cited text: the reliable anchor
    block?: number;                    // index of the text block
    start?: number; end?: number;      // only when the provider gives true character spans
  }>;
  sources?: B4StepSource[];            // grounding that comes with no tool call (Gemini, Nova)
  attribution?: Array<{
    provider: 'google';
    kind: 'search-suggestions' | 'maps';
    html?: string;                     // searchEntryPoint.renderedContent, verbatim
    widgetToken?: string;
    mustRender: true;                  // show unmodified, adjacent, full width, no link tracking
  }>;
}
```

### Rules

- **Lifecycle comes from the standard events.** START means `inProgress`. END without a result means `executing`. RESULT means `complete`. The step refines this and never replaces it. A producer must stream START live and must not buffer a whole call (AG-UI #2402).
- **Every write carries the complete step object.** Metadata merges without recursion, so the last write is the current state and no patch logic is needed.
- **Two carriers, one value.**
  - The metadata is authoritative and survives snapshots when the producer controls the events.
  - The CUSTOM `b4.step` is live-only and works everywhere. On ag-ui-langgraph it is the only way graph code can reach the wire, and it is the only signal for the moment execution actually starts, which can be long after END when an approval gate parks the call.
  - A consumer folds a CUSTOM step into that call's `metadata["b4.step"]` using the same merge rules.
  - A step for an id the consumer hasn't seen yet is held, then applied when START arrives. ag-ui-langgraph emits START only at `on_tool_end` for calls that weren't streamed.
- **Merge rules.**
  - `failed` wins over every other status.
  - `completed`, `denied` and `cancelled` settle the step unless it has already failed.
  - `running` only lifts an unsettled step.
  - The ToolMessage's step beats the ToolCall's.
  - `failed`, `denied` and `cancelled` clear the running label and its sources.
  - On `RUN_ERROR`, open steps settle as `failed`. On a `RUN_FINISHED` whose outcome is cancelled or interrupt, open steps settle as `cancelled`, except ids in `pendingToolCallIds`.
- **Failure is signalled three ways:**
  - `status: 'failed'` plus `error` in the step;
  - `ToolMessage.error`, whenever the producer writes a snapshot or a stored thread;
  - readable error text in the result `content`, so the model can correct itself.

  Consumers also read the bare ag-ui-langgraph `error: "error"` sentinel.
- **Labels are computed by the producer and overridable on the client.** For B4 tools they come from `display.running/done/failed`. For provider built-ins, the adapter has a built-in label table. The client checks the app's override first, then the producer's label, then a generic fallback.
- **Sources live where they were produced, and citations point at them by id.** Sources from a tool call go on that call's step. Grounding that comes with no tool call goes on `b4.answer.sources`. Google attribution is never mixed into sources.
- **Timing.** Use the producer's `startedAt` and `settledAt`. Fall back to the CUSTOM event's own `timestamp`, then to arrival time.
- **Versioning.**
  - `v` is a major version.
  - New optional fields and new values of open strings never bump it.
  - Consumers ignore unknown fields.
  - An unknown `status` falls back to the lifecycle given by the events.
  - A breaking change ships as `v: 2`, and producers write both `v: 1` and `v: 2` for one minor release.
- **Replay.**
  - A call with `kind: 'provider'` is never sent back to a model as a function call. Adapters rebuild the provider's native blocks from what they stored on the call (`encryptedValue`, the provider payload in metadata), or drop the call where the provider allows that.
  - B4's inbound path drops any tool call or tool message that has a provider step.

### Where it lives

- **`@b4run/sdk`** (no runtime dependencies) owns:
  - the types and constants: `B4_STEP_METADATA_KEY`, `B4_ANSWER_METADATA_KEY`, `B4_STEP_EVENT_NAME`, and the builtin and icon tables;
  - the JSON Schema, exported as a const and also shipped as `tool-step.schema.json`;
  - the pure helpers `readToolStep`, `mergeToolStep` and `settleOpenSteps`;
  - the **fixture corpus** under the published `./testing` export. Each fixture is an AG-UI event stream paired with the expected per-call step view, including the ag-ui-langgraph ordering cases.
- **Hashbrown** reads the contract with its own parser in core. A conformance spec in `packages/core` runs the `@b4run/sdk` fixtures against hashbrown's reducer (as a devDependency).
- **`@b4run/langgraph/tool-step`** (a later slice) holds the producer helpers for plain LangGraph: `emitToolStep(config, step)` and a `toolStepMiddleware({display})` built on `createAgent`'s `wrapToolCall`.

## Hashbrown's public surface

These are neutral public names, with no `b4` and no `ɵ` types in their signatures:

```ts
type ServerToolCall = {
  // existing: toolCallId, name, status, args, result, progress, encryptedValue, metadata
  outcome?: 'success' | 'failure' | 'denied' | 'cancelled';  // set once settled
  label?: string;
  icon?: string;
  kind?: 'server' | 'provider';
  builtin?: string;
  queries?: readonly string[];
  sources?: readonly Source[];
  error?: { message: string; code?: string };
  timing?: { startedAt: number; settledAt?: number };
  parentToolCallId?: string;
};
// AssistantMessage gains: citations?, sources? (call-less), attribution?
```

`status` keeps its three public values, which match CopilotKit. The settled result is a separate `outcome`, so the existing union doesn't widen.

**How a bad settle looks (my call).** A step can settle as `failed`, `denied` or `cancelled` with no `TOOL_CALL_RESULT`. That happens with a CUSTOM `failed`, a `RUN_ERROR`, or a cancel. When it does:
- `status` becomes `complete`, so a renderer never spins on `executing`.
- `result` becomes `{ status: 'rejected', reason: error }` for `failed`, where `error` is `{message, code?}`.
- For `denied` and `cancelled`, `result` stays absent unless a RESULT arrived. A RESULT that arrives later never turns a settled failure back into a success.

This means a failed B4 tool no longer reads as `fulfilled`.

**Classification (my call).** Today a call counts as server-run only when the client has no tool of that name. In addition, any call whose `b4.step` has `kind: 'provider'` is server-run, whatever its name. The adapter emits the provider's own tool name (`web_search`), and the metadata on `TOOL_CALL_START` arrives before any client-tool dispatch. An app tool that happens to be called `web_search` is therefore never run for a provider call. The pure helpers that later slices port from B4 (`groupServerToolCalls`, `summarizeTurn`, `formatDuration`, plus the 300 ms no-flash and 1 s tick constants) are exported from core. React and Angular expose them as plain state.

## Turning built-in tools on (user decision: typed, aligned across providers)

Every hashbrown provider adapter gets one typed option, `builtInTools`, on its server-side `stream.text(...)` options. It is not on core's chat options and it does not change the React or Angular APIs, because the provider is chosen on the server. The user's direction is that all providers are aligned as closely as possible.

```ts
HashbrownOpenAI.stream.text({
  apiKey, request,
  builtInTools: {
    webSearch: true,                    // or the provider's own config, typed per provider
    // webSearch: { searchContextSize: 'low', userLocation: { ... } }
  },
});
```

**Alignment rules:**
- **One vocabulary.** The keys are camelCase forms of the contract's `builtin` values. A key means the same capability on every provider, and it produces the same `builtin` on the step, so apps can write one UI.
- **Typed per provider.** Each adapter accepts only the keys its provider supports. Each value is `true` (provider defaults) or that provider's own configuration, typed from its SDK and passed through unchanged. Hashbrown does not invent a lowest-common-denominator config.
- **Shared wording.** Labels come from one shared table in core, exported with the `ɵ` prefix for adapters. "Searching the web for '<query>'…" reads the same on OpenAI, Anthropic and Google. Apps still override labels per tool on the client.
- **The adapter owns the plumbing.** When a key is on, the adapter adds whatever its provider needs for steps and sources to work: OpenAI's `include: ['web_search_call.action.sources']`, Gemini's `includeServerSideToolInvocations`, and so on. It also documents the provider's display obligations in that key's TSDoc. Google `webSearch` must say that the Search Suggestions have to be shown.
- **Built-in calls are mapped however they were turned on.** A built-in tool added through `transformRequestOptions` still becomes a provider step. It only misses the plumbing above, and the TSDoc says so.

**Capability map.** "—" means not offered. A cell in brackets means the provider has it, but it is deferred and not designed yet.

| Key → `builtin` | OpenAI | Azure OpenAI | Anthropic | Google Gemini | Bedrock | Ollama |
|---|---|---|---|---|---|---|
| `webSearch` → `web_search` | `web_search` | `web_search`, only if the resource supports it (to verify) | `web_search` | `googleSearch` (grounding) | `nova_grounding` (Nova models only) | — |
| `webFetch` → `web_fetch` | — | — | `web_fetch` | `urlContext` | — | — |
| `codeExecution` → `code_execution` | `code_interpreter` | `code_interpreter` | `code_execution` | `codeExecution` | — | — |
| `fileSearch` → `file_search` | `file_search` | `file_search` | — | `fileSearch` | — | — |
| `imageGeneration` → `image_generation` | `image_generation` | — (documented as unsupported) | — | — | — | — |
| `mcp` → `mcp` | [remote MCP; needs an approval design] | [same] | [MCP connector, beta] | — | — | — |

Ollama has no model-run tools. Its hosted `web_search` and `web_fetch` are REST APIs that the app runs as ordinary tools, so Ollama gets no `builtInTools` key.

**Order.** Slice 1 builds the option and the `webSearch` key for OpenAI and Azure only. Slice 3 adds the other keys and providers. The names and the map above are fixed now, so later slices only fill in cells.

## Slice 1 (user decision): the contract end to end with OpenAI web search

This slice shows the whole idea working across both repos with one real provider tool.

1. **B4.run: `@b4run/sdk` contract.**
   - The `B4ToolStep`, `B4StepSource` and `B4AnswerAnnotations` types, the constants, the JSON Schema and the pure merge helpers.
   - Keep the legacy types and mark them deprecated (my call), so the release breaks nothing. The legacy types are `PersistedStep` (public, ISO times, `completed | failed | denied`) and `B4StepEventValue` (no `v`, `kind` or source ids). B4's emitters keep producing them in this slice.
   - `readToolStep` accepts both v1 and legacy values and returns a `B4ToolStep`. A legacy value normalizes as follows:
     - a missing `v` becomes `1`;
     - `kind` becomes `'server'`;
     - source ids become `<toolCallId>:<index>`, and source kind becomes `'url'` when there is an `href`, `'record'` otherwise;
     - ISO times become epoch ms.
   - The duplicated step-event name and types in `@b4run/langchain` and `@b4run/ag-ui` import from the sdk.
   - Publish the fixture corpus under `./testing`.
   - Ship a patch changeset with docs.
   - **Pulled forward from slice 2 (my call), consumer side only.** `@b4run/ag-ui/view` reads `metadata["b4.step"]` first, through `readToolStep`, then the CUSTOM event, and gains `cancelled` and the hold rule for unknown ids. This lets B4 pass the whole fixture corpus in slice 1. Hashbrown's adapters will emit metadata steps that B4's CopilotKit slots should render. B4's *emitters* still change only in slice 2.
2. **Hashbrown core reads the contract.**
   - Parse `metadata["b4.step"]` on tool calls and tool messages.
   - Fold the CUSTOM `b4.step` into the call, holding steps that arrive for ids not yet seen.
   - Parse `b4.answer` on assistant messages.
   - Add the public fields above.
   - Settle open steps at run end.
   - Read the `error: "error"` sentinel.

   Because B4 already emits the CUSTOM `b4.step`, a current B4 server immediately gets labels and failures in hashbrown. Old values with no `v` are read as v1, best effort.
3. **Hashbrown OpenAI adapter: web search as a provider step.**
   - Add the `builtInTools` option with its `webSearch` key, as described in "Turning built-in tools on". This includes TSDoc, the API report and a docs page.
   - Add the shared label table to core.
   - `web_search_call` maps to `TOOL_CALL_START`/`END`/`RESULT` with a `kind: 'provider'`, `builtin: 'web_search'` step that carries queries, sources and a label from the adapter's label table.
   - `url_citation` annotations become `b4.answer.citations` that point at the source ids.
   - On replay, provider calls are never sent back as `function_call`. The adapter replays the native item where the API accepts it, or drops it.
   - Azure shares the code path. It is enabled only once the Azure resource is confirmed to support web search; otherwise it is documented as unsupported.
   - Tests use a recorded web-search fixture (`npx nx record-fixtures openai --only …`) plus unit tests for the mapping and for replay.
4. **Conformance.**
   - **Fixture form (my call).** Each fixture is `{ name, events: AGUIEvent[], expected: { steps: Record<toolCallId, B4ToolStep>, answers?: Record<messageId, B4AnswerAnnotations> } }`. The expected state is written in *contract* terms, not in either project's view terms. Each repo maps it to its own view in a small tested adapter. Hashbrown's mapping:

     | Contract step | Hashbrown `status` | Hashbrown `outcome` |
     |---|---|---|
     | `running` | `executing`, or `inProgress` before END | — |
     | `completed` | `complete` | `success` |
     | `failed` | `complete` | `failure` |
     | `denied` | `complete` | `denied` |
     | `cancelled` | `complete` | `cancelled` |

     Label, sources, error and timing copy straight across.
   - Hashbrown adds `@b4run/sdk` as a devDependency.
   - A core conformance spec (`tool-step.conformance.spec.ts`; core rather than `tools/conformance` because it drives internal reducers) runs every sdk fixture through hashbrown's reducer and checks the derived `ServerToolCall` fields.
   - B4 runs the same fixtures against `@b4run/ag-ui/view`.

**Order.** Step 1 is released (published to npm) before hashbrown takes the devDependency. Steps 2 and 3 can be built against the local schema in parallel. Step 3 needs #682's recording tooling on main, and #684's bug fixes are expected to have merged first.

## Later slices (order agreed, details designed when reached)

2. **B4 correctness and restore (emitters).**
   - Write `metadata["b4.step"]` on START, END and RESULT.
   - Send the CUSTOM step v1 at the moment execution actually starts.
   - Write `ToolMessage.error` in snapshots and `/turns`.
   - Project `b4_step` onto `ToolMessage.metadata`.
   - Persist v1 `b4_step`, retiring the legacy emitter shapes.
   - Drop inbound provider tool messages.
3. **The remaining hashbrown adapters, as provider steps.**
   - Anthropic: web search, web fetch and code execution, with citations and native block replay. This also fixes the interleaved-thinking order (#684 fixed the crash).
   - Google: built-in tool parts, code execution and grounding, plus the Search Suggestions attribution and `finishReason` handling.
   - Bedrock: server tool use and Nova citations.
   - Azure, if not done in slice 1.
4. **Plain LangGraph.**
   - `@b4run/langgraph/tool-step` with `emitToolStep` and `toolStepMiddleware`.
   - A Python recipe.
   - A recipe for the ag-ui-langgraph `LangGraphAgent` subclass, so steps survive a restore.
   - A hashbrown docs page, "LangGraph without B4".
5. **B4 provider built-ins.**
   - A normalizer from LangChain v1 `contentBlocks`, with raw-content fallbacks: OpenAI `tool_outputs`, Anthropic raw blocks, Google `groundingMetadata` and code parts.
   - `b4_steps` on AIMessage; `b4.answer` citations and Google attribution.
   - Stay on v0 storage and `streamEvents` v2.
   - Keep Anthropic `web_fetch` and `code_execution` off in JS until langchainjs#9911 is fixed.
6. **UX and upstream.**
   - Hashbrown: the grouping, turn-summary and attribution helpers, and `SUBAGENT_*`.
   - B4: retire the snake_case payload and open the icon set.
   - Take the profile to AG-UI #2146/#2161.

Stop reasons and token usage (audit item 2) and multimodal input (audit item 4) stay separate efforts. They are not part of this contract.

## Upstream issues to file or track (none filed without the user's OK)

- **AG-UI:**
  - an `error` field on `TOOL_CALL_RESULT`;
  - a standard settled outcome (failed, denied, cancelled);
  - per-call labels (#2146, #2161);
  - a provider-executed tool kind;
  - a citation and attribution type (#646, #2862);
  - the published schema forbids extra result fields while the TypeScript SDK allows them.
- **ag-ui-langgraph:**
  - round-trip AG-UI metadata in both directions;
  - emit tool errors;
  - an execution-start signal;
  - built-in tool emission, with inbound skipping.
- **LangChain JS:** #9911 (Anthropic streaming drops result blocks), #9906 (v1 replay empties `encrypted_content`), #9980/#11070 (args finality), #11885/#11890 (v3 drops `web_search_call` and `url_citation`), and OpenAI MCP args read from the wrong field.
- **LangGraph JS:** v1 hydration marks failed tools as finished and leaves unmatched calls running forever.
- **CopilotKit:** the suspected discard of manually emitted events, and a renderer that ignores tool-call metadata.

## Left to the builder

- The exact JSON Schema text and fixture file layout under `@b4run/sdk/testing`.
- How hashbrown's reducer stores steps that are waiting for an unknown id, and the internal module layout in core.
- The OpenAI web-search label wording, within the pattern "Searching the web for '<query>'" then "Searched '<query>' · <n> sources".
- Whether OpenAI replay sends native `web_search_call` items or drops them. Use the cheaper option that the Responses API accepts with `store: false`, and verify it with a recorded two-turn fixture.
- The source id scheme. It must be stable within a thread, for example `<toolCallId>:<index>`.
