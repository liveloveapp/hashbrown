# Component generative UI with local tool calling

Research date: October 25, 2026. This document distinguishes source contracts,
the initial audit, implementation verification and measured model-quality results.
The native failures below remain part of the evidence.

## Baseline before this follow-up

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
The user selected option 1 before implementation.

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

## Implementation and measured results

Implementation is published in [PR #749](https://github.com/liveloveapp/hashbrown/pull/749).
The user approved tools followed by component UI. The opt-in now accepts the
existing framework UI schema, requires root `type: 'object'` before session
creation, and reports UI adapter policy separately from inference. No renderer,
framework public API, dependency or default transport behavior changed.

The test-first transport cases failed at the existing UI rejection and capability
boundary, then passed 97 focused tests. Full core passed 1,822 tests; React 210,
Angular 278, conformance 45 and the site 882 passed. Core build/lint/API reporting,
framework and production host builds, applicable lint/type checks and the site
production build/lint passed. React has no lint target. Existing three core
unused-variable warnings and build/API/deprecation warnings remain.

All 22 local UI aimock contracts passed, including exact parsed assistant trees,
assistant-specific canonical replay, dependent result correlation, held-response
fallback rendering, invalid-component/prop handling and cancellation/recovery.
The stronger Stop test observes an unfinished fallback before stopping, verifies
its removal, then requires exactly one recovered card with the exact fresh tool
token. The existing default `stop()` satisfied that test; no cancellation policy
was changed. Unknown components are omitted and invalid props can retain the
existing fallback without mounting the trusted component. Malformed JSON and
terminal tool calls surface errors. The Angular fixture guards resource values
on error, matching the existing UI host.

Standard browser conformance passed 64 cases and provider conformance 8. Existing
local transport, media, tools and schema contracts passed 24, 4, 18 and 10 cases.
The new local UI target explicitly refused `CI=1`. Local suites remain uncached
and outside CI. Independent spec and code-quality reviews approved the source.

### Fresh v4 acquisition and initial broad-catalog sample

The previous temporary model profile was absent. The existing user-authorized
download flow restored it in 9m40s and passed a raw compatibility round trip.
Observed Chrome remains 155.0.8059.85; the downloaded manifest again identifies
`gemma4-2b-it`, base `2026.06.10.0000`, component `2026.8.7.929`. Profile size is
approximately 2.4 GiB. Subsequent UI tests refuse downloads and hosted fallback.

The initial real framework sample failed **all eight strict cases** (464.8s),
despite successful deterministic contracts. Both frameworks offered `lookup_secret`
and `follow_secret` together, and a kit containing status and bounded panel
components. Failures must not be reported as native UI passes:

- Both lookup cases executed an unrequested dependent tool.
- Both dependent cases produced undeclared rendering calls (`render_status` or
  `render_ui`), which the adapter rejected before execution.
- Nested cases made extra tool calls; React also attempted undeclared rendering.
- Both no-tools cases returned a schema-valid panel wrapping the requested status,
  rather than the exact expected top-level status. The initial user instruction
  did not explicitly forbid that wrapper, so the next sample makes layout exact.

Every case recorded zero active readers at settlement, balanced session creation
and destruction, zero page errors and zero hosted fallback requests. These are
model planning/layout failures, not resource cleanup failures. Raw evidence is
retained under `/tmp/hashbrown-ui-v4-initial-evidence/`, including exact native
prompts, constraints, chunks, constructor-backed fields and actual framework
history/DOM. No model output was repaired or normalized.

### Separate recursive-schema probe

A raw text-only probe supplied the exact expected two-level panel tree and a
`createUiJsonSchema` kit whose panel has `children: 'any'`. Chrome accepted the
recursive schema and returned the exact requested tree with a fresh nonce.
Evidence: `/tmp/hashbrown-ui-recursive-evidence.json`; script:
`/tmp/hashbrown-ui-recursive-probe.cjs`. This is an acceptance/copy canary, not
framework rendering, free composition, constraint-enforcement proof or arbitrary
depth/grammar support.

### Clarified sample and release gate

A second production sample retains the same tool declarations, component kit
and strict output assertions. Fixture instructions explicitly distinguish JSON
components from callable tools, forbid an unrequested dependent call and specify
the top-level layout. All 22 deterministic contracts pass with those instructions.
The clarified sample passed **4/8 cases** in 329.7s: Angular dependent, React
lookup and both no-tools cases. Angular lookup added two empty panels; Angular
nested made four unrequested dependent calls; React dependent rendered four
receipt cards instead of one; React nested skipped the required lookup. Every
case again had zero active readers, balanced sessions, no page errors and no
hosted fallback. Exact native phase/schema/raw-JSON and parsed/DOM assertions
passed in the four successful cases. Evidence is retained under
`/tmp/hashbrown-ui-v4-clarified-evidence/`.

These are different instruction samples, not a repeatability demonstration.
No entire native UI suite has passed, and the planned successful production
repetition gate has not been met. The extra calls are declared tools that the
framework is allowed to execute; structural validation does not establish user
intent. Workflow-specific tool exposure and application-owned permission gates
remain meaningful controls. Do not retry unchanged prompts until a green
result appears or broaden the assertions to accept these failures.

The user has been asked whether to verify a narrower per-workflow tool/component
catalog, retain broad-catalog reliability as a merge gate, or merge experimental
adapter support with native-quality failures explicitly documented. The PR stays
unmerged while that decision and native validation are outstanding.

## Pending decisions and external action

- User approved option 1: tools gather data, then generate component UI.
- Chromium report: posted as [#577500782](https://issues.chromium.org/issues/577500782).
- Release qualification is pending the native-quality decision above.
