# Component generative UI with local tool calling

Research date: October 25, 2026. This document distinguishes source contracts,
previous measured inference, and proposed work. No new component inference has
been run for this research. Implementation and model quality remain unverified.

## Current Hashbrown boundary

PR #746 supplied opt-in tools-then-schema finalization. Its measured React and
Angular cases used a simple `{ value: string }` schema. They did not generate
component trees. See [the measurements](2026-10-24-chrome-schema-finalization.md).

`prepareChromeToolMessages` still rejects `forwardedProps.hashbrown.ui`, even
when `schemaFinalization: 'after-tool-planning'` is enabled. Capability detection
reports `adapter.ui: false`. Removing that guard alone would not establish
support for component schemas or rendering.

React's `useUiChat` and Angular's `uiChatResource` already use the shared UI kit
and structured-chat runtime. Their component output is the existing `{ ui: [...] }`
wrapper, with component names as object keys and schema-validated props/children.
`createComponentSchema` uses alternatives for component selection, streaming
children and lazy references for recursive composition. These are substantially
different constraints from the measured scalar response.

The existing hosted conformance case verifies actual progressive DOM rendering
and the forwarded schema. The native-schema host exercises parsed values and
real handlers, but has no component renderer. Both layers are needed for the
next tests. Existing offered-component retention also matters: narrowing the
next request must preserve historical rendering; current parsing can accept a
previously offered component even after removal. Do not silently promise stricter
catalog enforcement as a side effect of native transport support.

## Primary-source findings

### Chrome: tools and rendering are separate application responsibilities

The [Prompt API draft](https://webmachinelearning.github.io/prompt-api/)
declares tools at session creation and accepts response constraints per prompt.
Its stream exposes complete tool-call objects and text; it defines no component
renderer or incremental argument-delta protocol. A constrained generation may
still emit a tool call. Consequently, terminal rendering must reject unexpected
calls rather than rely on the constraint to disable tools. Native complete
arguments also do not establish token-by-token component-prop streaming.

Previous local v4 evidence showed simultaneous tools and constraints could skip
the required lookup. The shipped adapter therefore leaves planning unconstrained,
executes tools through the framework, and constrains a terminal text pass after a
call-free planning turn. Keep this sequencing when evaluating UI. The empty-ID
workaround remains limited to a single call needing repair in a completed turn;
native same-response batches remain a separate limitation.

[Chrome's documentation](https://developer.chrome.com/docs/ai/prompt-api)
directs implementation bugs to Chromium and API-shape feedback to the Prompt API
GitHub repository. The empty-ID report belongs in Chromium. The report was posted and verified as [Chromium issue
#577500782](https://issues.chromium.org/issues/577500782).

### AI SDK: a tool result can be a UI boundary

The [AI SDK generative UI guide](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)
maps named tool parts to application-owned React components and renders their
results. Its [tool usage guide](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage)
distinguishes input streaming, input available, approval and result/error states.
This is a useful alternative to asking a model to restate a fetched value in
component props: the application can render the authoritative result directly.
Adopting that model in Hashbrown would require a deliberate public contract for
tool-associated UI, history and lifecycle. Chrome's typed stream does not supply
the same argument-streaming states automatically.

### Declarative catalogs: reuse the existing trusted-component contract

[A2UI](https://a2ui.org/concepts/overview/) separates declarative UI, streaming
updates and application data. Its [catalog guidance](https://a2ui.org/concepts/catalogs/)
includes validation at both producer and client boundaries. Its
[action model](https://a2ui.org/concepts/actions/) distinguishes renderer-local
functions from events sent back to an agent. These separations are useful design
comparisons; they do not require adopting A2UI's wire format.

[json-render](https://github.com/vercel-labs/json-render) similarly exposes a
component/action catalog and progressively applies streamed UI specifications.
Its state bindings and action handlers demonstrate a broader product surface
than terminal component selection. For Hashbrown, the immediate opportunity is
to reuse Skillet, the current registry and existing renderer. Adding another
protocol, patch language or dependency would expand this follow-up unnecessarily.

### Small-model quality needs its own evaluation

A [September 2026 study](https://arxiv.org/html/2609.04184v1) evaluates fine-tuned
small models generating A2UI in two React/TypeScript domains. It distinguishes
syntax, catalog adherence and resolvable data bindings, and explicitly limits
generalization beyond its domains and single-response setting. It did not test
our installed Chrome Gemma model. This supports measuring multiple independent
quality axes; it does not establish that our model supports recursive UI schemas
or that shrinking every catalog necessarily improves output.

### Interoperability without a WebLLM dependency

[WebLLM's documented interface](https://webllm.mlc.ai/docs/user/basic_usage.html)
uses `engine.chat.completions.create` and async streaming. Applications can own
engine creation/loading while Hashbrown accepts a structural transport boundary.
Keep component definitions and validation above that boundary. Verify tools,
constraints and their joint behavior for each selected engine/model rather than
inferring them from an OpenAI-shaped method. Worker lifecycle is also application
owned ([WebLLM worker documentation](https://webllm.mlc.ai/docs/user/advanced_usage.html)).

[Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling) and
[structured output](https://docs.ollama.com/capabilities/structured-outputs) are
documented separately. That is not evidence that every model supports both
together or that existing Hashbrown adapters accept every UI composition. Use
the same framework conformance cases when a provider's combination is supported.
No new package dependency is required by this proposal.

## Three implementation directions

1. **Tools, then a component tree (recommended first increment).** Keep normal
   tools and the existing opt-in finalization policy. Allow UI requests only
   through that policy; stream the exact generated UI schema into the existing
   Skillet parser and framework renderers. This gives component choice and layout,
   and preserves the current API/history. It adds a terminal pass and makes the
   model copy tool data into props, so exact provenance assertions are essential.
2. **Render tool results directly.** Associate a trusted component with a tool
   and render its validated result as soon as available. This avoids model
   transcription of result data and can show UI before planning ends. It needs
   new tool/UI API decisions, behavior for approvals/errors/cancellation, and a
   durable representation of UI in history. It does not itself provide arbitrary
   model-composed layout.
3. **Expose rendering as model-callable tools.** Generate declarations for
   components or a single render-tree tool. This avoids using a terminal response
   constraint for rendering, but introduces component/tool name collisions,
   append-versus-replace semantics, acknowledgements and loop termination.
   Per-component calls could also depend on currently unverified native batching.
   A complete render-tree call still carries the complex schema and arrives as a
   whole native object. It is not automatically a simpler or faster path.

These options are not equivalent. The first is a bounded extension of the merged
local-model work; the other two change the meaning and timing of UI messages.
Confirm which meaning of “using tool calling” is intended before implementation.

## Proposed first-increment design and evidence gate

For option 1, keep `experimental_chrome_tools({ schemaFinalization:
'after-tool-planning' })` and existing `useUiChat` / `uiChatResource` APIs. Require
an object response schema on UI requests before native session creation. Keep
default rejection, text-only input, timeout/abort ownership, hidden planning text,
canonical history and finalization's rejection of non-text chunks. Report UI
adapter support only for the explicit policy, separately from inference evidence.

Start with a small leaf-component catalog and exact random tool data; then test
a bounded parent/child kit, alternative components, text children and multiple
siblings. Probe unrestricted recursive children separately: successful bounded
composition cannot be described as arbitrary recursive-schema support. Do not
flatten or weaken a rejected schema silently.

Write failing unit tests before product changes. Add both framework hosts using
real `exposeComponent` APIs and their actual renderers. Local aimock cases should
cover phase options, progressive finalization, exact handler results in rendered
props, dependent rounds, malformed/disallowed components, invalid props, final
tool rejection, cancellation during both phases, recovery and canonical replay.
Confirm the existing policy for historical offered components rather than
introducing an accidental catalog-policy change.

Run the downloaded v4 profile sequentially with downloads/fallback refused.
Retain raw prompts, exact constraints/chunks, handler journal, final parsed tree,
DOM, session balance, active readers, timing and failures. Use unpredictable
lookup tokens/receipts so a plausible card cannot pass without tool execution.
Repeat successful cases against explicit production bundles. Measure schema
acceptance, component selection, exact data, rendering and latency separately.
Keep native and local aimock targets outside CI, uncached and explicitly opted in.
Run affected package build/test/lint/API checks plus standard conformance, then
review, PR, merge only on the exact reviewed green head, and verify main.

## Pending decisions and external action

- User approved option 1: tools gather data, then generate component UI.
- Chromium report: posted as [#577500782](https://issues.chromium.org/issues/577500782).
- No component feature, PR or new inference success is claimed by this research.
