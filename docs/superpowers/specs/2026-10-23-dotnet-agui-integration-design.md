# .NET AG-UI integration for OpenAI and Azure OpenAI

Status: design for review, October 23, 2026.

## Decision and scope

Hashbrown will document and continuously test a .NET integration built on the upstream AG-UI SDK and Microsoft Agent Framework. The first supported integration covers OpenAI and Azure OpenAI with React and Angular. It includes streaming text, structured output, generative UI, browser tools, server tools, and interrupt/resume, including workflows that combine tools and interruptions.

The user selected a documented integration backed by CI. This design supersedes the historical .NET PR; none of its protocol, API, or persistence design constrains this work. The [research report](../research/2026-10-23-non-node-providers-and-dotnet-agui.md) records the source evidence and upstream gaps.

The deliverables are a small tested C# reference integration, React and Angular documentation, and deterministic e2e coverage. Hashbrown will own the reference configuration, Hashbrown-specific semantic translation, and tested compatibility table. Upstream owns AG-UI types, serialization, event conversion, model SDK translation, and agent execution machinery.

### Alternatives considered

| Approach | Decision |
| --- | --- |
| Document upstream integration, keep reference source in the repository, and test it in CI | Selected by the user |
| Publish and maintain a Hashbrown NuGet package | Deferred; the recipe must demonstrate a need before a package is justified |
| Build a general conformance product for arbitrary agent implementations | Deferred; scenarios should remain reusable without turning the initial work into a certification system |

## Supported contract

| Dimension | Initial guarantee |
| --- | --- |
| Frontends | Current Hashbrown React and Angular public APIs |
| Host | ASP.NET Core on .NET 10, Microsoft Agent Framework AG-UI integration |
| Model clients | Real .NET OpenAI and Azure OpenAI clients, initially using Chat Completions |
| Transport | AG-UI JSON over SSE; ordinary Hashbrown HTTP transport |
| History | Client supplies canonical conversation history on every run |
| Output | Streaming text and schema-constrained JSON in assistant text events |
| Tools | Browser tools, server tools, mixed sequential workflows, repeated tool calls |
| Interrupts | Application input/confirmation, complete batches, resolved/declined/cancelled answers, expiration, resume after a tool round |
| Infrastructure | No live model credentials required in conformance CI |

Use Chat Completions for both providers initially to keep the .NET recipe and its fixtures consistent. This does not change Hashbrown's existing Node OpenAI/Azure adapters, which use Responses. Responses-backed .NET agents, .NET 8/9, Entra authentication, durable sessions, shared state, activities, model reasoning, and finish-reason extensions are outside the initial support guarantee. The documentation must say so explicitly. Supporting interrupts does not require exposing a general workflow persistence framework.

### Observable success

An application can follow either framework's recipe, choose OpenAI or Azure OpenAI on its .NET server, and retain the same Hashbrown browser API. Every required feature runs through the actual .NET integration in CI. A passing test proves request translation and browser behavior, including tool effects and resumed model requests.

## Architecture and source ownership

```text
React or Angular public API
  -> Hashbrown HttpTransport
  -> ASP.NET Core AG-UI endpoint
  -> Hashbrown request and interrupt configuration
  -> Microsoft Agent Framework agent and tool pipeline
  -> provider-specific .NET model client
  -> OpenAI or Azure OpenAI API
```

In CI, aimock replaces only the model API. It never replaces the AG-UI endpoint or produces the endpoint's event stream. A test capture boundary before aimock records original HTTP requests and forwards response bytes with cancellation intact.

The reference source lives under `tools/conformance/dotnet/`. It is internal test infrastructure. Documentation links to it as the tested reference and shows the minimal application setup; it does not present the harness as a public example application. Keep production-usable integration helpers separate from test control routes, fixture tool implementations, process diagnostics, and aimock configuration.

Proposed units:

| Unit | Responsibility |
| --- | --- |
| Provider factory | Build an OpenAI or Azure OpenAI `IChatClient` from trusted server configuration |
| Hashbrown request configuration | Apply the requested output schema while preserving the upstream tools and AG-UI request |
| Interrupt workflow middleware | Pause a configured application workflow with native .NET interrupt content and resume it from validated decisions |
| Pending interrupt store | Retain only pending workflow data and process-local consumption state |
| ASP.NET endpoint setup | Register upstream serialization, agent hosting, cancellation, and application middleware |
| Playwright harness | Own aimock, model request capture, .NET process, readiness, diagnostics, and cleanup |

Use `AddAGUIServer` and `MapAGUIServer` where the required extension points permit. Put request semantics in a delegating model client or the corresponding Agent Framework middleware. If hosting cannot accommodate a required pre-run check, add a narrow route filter or application wrapper around the upstream integration. Do not write a second SSE encoder or duplicate AG-UI models. Confirm extension-point feasibility as the first implementation task before documenting the final C# API.

## Provider configuration

Provider and model selection are server-owned. The browser supplies neither unrestricted model identifiers nor credentials.

OpenAI configuration names its API key and model. Azure OpenAI configuration names its endpoint, deployment, and API key. The recipe treats Azure's deployment as configuration in its own right rather than assuming it is the public OpenAI model name. API version selection follows the pinned Azure client and is explicit when that client requires it.

The factory has one common return type. Both branches use their genuine provider configuration and SDK behavior. The Azure test must observe the expected Azure endpoint path/query and authentication for the selected SDK; changing only a label on the OpenAI test is insufficient. Use the existing SDK ecosystem, including `Microsoft.Extensions.AI.OpenAI` and its compatible OpenAI/Azure client packages, rather than introducing another provider abstraction.

For CI, point both factories to isolated localhost model endpoints with fixture credentials. Configure bounded SDK retries and avoid layering uncontrolled retries with Hashbrown retries. Assertions account for the configured retry count explicitly.

## Request and output semantics

Read `forwardedProps.hashbrown.responseSchema` through the upstream .NET `ForwardedProperties` value. Validate that it is a schema object, then apply it through native .NET structured-output options on a request-local copy of `ChatOptions`. Keep existing tools, additional properties, and cancellation intact. Never mutate shared agent options between requests.

With no schema, preserve normal text generation. With a schema, preserve the exact JSON schema semantics; do not silently fall back to prose or replace the schema with a permissive generic object. Unsupported or malformed schemas fail clearly before model work where possible.

Generative UI uses this same output-schema path. Preserve the `ui` marker without inventing a separate rendering protocol. Return the provider's JSON through upstream assistant text events; Hashbrown's Skillet parser and trusted component renderer perform incremental parsing and rendering. State snapshots, `RUN_FINISHED.result`, tool results, and A2UI surfaces are not substitutes for that stream.

The recipe distinguishes dynamic schemas from endpoint policies: an application may pin or allowlist schemas server-side. Test clients cannot expand model permissions by changing a schema or tool declaration.

## Conversation and tool ownership

Use a fresh model/agent conversation context per HTTP run and the transcript supplied by Hashbrown. Do not enable persisted Agent Framework chat sessions in the initial recipe. Keep the same `threadId` for related requests and echo each incoming `runId` unchanged; tool continuation and resume are new runs with fresh IDs. Do not require `parentRunId`, which Hashbrown's current request builder does not supply.

Browser tools are declarations in `RunAgentInput.tools`. The .NET integration forwards their schemas and yields tool-call events. Hashbrown executes the browser implementation and starts another run with its result. A newly requested call of the same tool must execute freshly; prior results must remain history, never a substitute for the new call.

Server tools are registered on the agent and execute in .NET. The upstream integration must emit correlated tool results before a successful terminal event, so Hashbrown does not attempt to execute them as browser tools. Browser and server tool names must be disjoint; reject collisions before model work.

Test mixed workflows in both orders: server then browser, and browser then server. Assert both model history and actual execution counts. Require one model response containing both kinds of call to either complete with correct ownership or fail explicitly without executing a call under the wrong authority; the supported behavior must be documented after the feasibility check. Sequential mixed workflows are required regardless of parallel-call behavior.

An interrupt commits the checkpoint before Hashbrown starts tool execution. Pending calls must remain pending across that boundary. Resume must not replay historical browser or server tool effects.

## Interrupt and resume behavior

The initial documented interruption is an application-owned input/confirmation gate. It pauses a workflow before a protected server step. It uses native .NET `InterruptRequestContent` and the upstream AG-UI event conversion, so CI exercises actual .NET interrupt serialization. After a valid answer, the workflow continues through the same real agent/model/tool path. A hand-authored SSE fixture is insufficient.

This is distinct from automatically approving arbitrary MAF tool proposals. The inspected upstream adapter suppresses some tool-approval interrupts during mixed invocation, and its approval-resume decoder expects a tool-call payload. Do not equate a successful generic interrupt test with blanket support for MAF `ApprovalRequiredAIFunction` behavior. The reference recipe guarantees its explicit application gate, including when browser tools are registered and have already run. Native automatic MAF tool approval is outside the initial guarantee unless the implementation can prove it without bypassing approval policy.

### Pending data and validation

Store a bounded, expiring pending batch before emitting its interrupt terminal. A record contains the initiating principal scope, thread ID, originating run ID, interrupt IDs and schemas, workflow checkpoint, server-owned tool arguments if any, expiration, and consumption state. The browser's `batchId` is local to Hashbrown and is never a server storage key.

Ordinary chat history stays client-owned. The pending store holds only what is necessary to resume the application workflow. Treat browser history and metadata as input, not as authoritative authorization for a privileged server step. Recover protected action parameters from the pending record, never from a client-supplied replacement tool-call payload.

For the reference host, use an in-memory store with a finite capacity and TTL, and expose expiration in the interrupt envelope. Scope records to the authenticated principal in the production recipe; the local fixture uses a fixed isolated identity. A restart invalidates pending resumes. The documentation identifies this process-lifetime limit and explains that applications needing multiple instances or restart recovery must supply durable storage and their own authorization policy.

Validate an entire resume batch before advancing it: exact interrupt ID coverage, no duplicates, matching principal/thread, unexpired batch, valid status and answer shape. Unknown/expired/consumed batches fail before new tool effects or model calls. Duplicate or concurrent submissions cannot advance a checkpoint twice. Use an atomic pending-to-in-progress transition; on completion retain a bounded consumed marker until expiry. Do not promise global exactly-once side effects: application server tools still need idempotency appropriate to their external system.

### Decisions and lifecycle

| Answer | Required behavior |
| --- | --- |
| `resolved` with an accepted answer | Continue the pending workflow using server-owned checkpoint data |
| `resolved` with `{ approved: false }` for a confirmation | Complete the decline path, with zero protected tool executions |
| `cancelled` | Abandon that pending workflow, with zero protected tool executions |
| Missing, invalid, expired, or already consumed | Reject with a clear error and no advancement |

Inspect the original AG-UI `resume.status`: the upstream generic resume-content conversion does not preserve that status on its content object. Do not infer cancellation from a missing payload. A batch may contain different answer schemas and decisions; validate all entries before deciding whether that workflow may proceed. For the reference confirmation workflow, every required confirmation must be resolved and accepted; a decline/cancellation ends that pending action.

End the first request with one `RUN_FINISHED` interrupt outcome containing the complete batch. Keep Hashbrown's pending batch visible while resume is in flight. A resumed request uses the same thread and current committed transcript; it returns ordinary agent events and one success, interrupt, cancelled, or error terminal as appropriate. There is no special browser transport or persistence API.

Cancel before protected work begins releases the in-progress claim for retry only when no effect has occurred. Once work has begun, cancellation cannot imply rollback of external effects; keep the consumed/in-progress state conservative and prevent automatic re-execution. Failures and lost responses must never blindly release a checkpoint for another execution.

## Serialization and error handling

Use the upstream AG-UI serializer configuration. Verify that the chosen package combination omits optional fields rather than writing invalid nulls and emits the required protocol version. If still needed for the pinned release, register native interrupt content using the upstream `AGUIJsonUtilities.RegisterInterruptContentTypes` extension. Keep any workaround narrow, version-documented, and tested. Never relax Hashbrown's event validation to accommodate a bad producer.

Before response headers, return appropriate non-success HTTP status for invalid configuration, schema, tool collision, or resume. After streaming begins, use the upstream failure mapping to emit `RUN_ERROR` when possible. If the stream truncates, Hashbrown must report a failed run rather than hang or treat it as success. A completed stream has one terminal event; user cancellation may close the transport without a terminal and must not create a synthetic failure in the browser.

Flow the ASP.NET request cancellation token into the real provider client and server tools. Tests distinguish transport cancellation, cancelling an interrupt, declining a confirmation, and native provider failure. These are different outcomes.

## Conformance infrastructure

### Matrix

Run the required scenarios in all four combinations: React/OpenAI, React/Azure OpenAI, Angular/OpenAI, and Angular/Azure OpenAI. Use one .NET 10 runtime initially.

| Scenario | Proof required |
| --- | --- |
| Text streaming | Browser shows a partial answer before completion; event identities and terminal are valid |
| Two turns | Exact history, stable thread, fresh run, no duplicated messages |
| Structured output | Exact schema on native model request; typed partial and final values in browser |
| Generative UI | Actual component schema on native request; partial props, trusted rendering, and browser action |
| Browser tool | Correct declaration and correlated result; exactly one browser execution per call |
| Repeated browser tool | Later call executes freshly and produces its own result |
| Server tool | Real .NET function runs; browser has no corresponding effect; model receives result |
| Mixed tools | Both orders preserve ownership, call identities, results, and execution counts |
| Input interrupt | Native .NET interrupt becomes a browser pending batch; resume carries the answer to the workflow |
| Tool then interrupt then server step | Earlier browser/server effects are not replayed; protected step runs only after acceptance |
| Batch decisions | Complete accepted batch resumes; invalid/incomplete batch cannot advance; declined/cancelled path performs no protected action |
| Duplicate/expired resume | No extra protected action or model call; clear rejection |
| Concurrent resume | One workflow advancement; competing request rejected |
| Provider error | Native upstream failure becomes observable HTTP/AG-UI failure without a hang |
| Cancellation | Real upstream connection closes; no late UI update or new tool effect |
| Truncated stream | Client rejects missing terminal; failed attempt is not committed |
| Wire compatibility | Every real event passes the pinned TypeScript schema; required fields and omission rules hold |
| Invalid schema or tool-name collision | Clear pre-stream rejection, zero native model requests, and zero tool effects |

Browser ownership checks, public resume API validation, and DOM assertions belong in Playwright. Store expiration, batch consumption races, and option immutability may use focused tests at the .NET boundary; keep at least one real HTTP negative-resume check in the browser matrix. Test actual validation logic, rather than reproducing it inside fixture helpers.

### aimock and request evidence

Use the existing `@copilotkit/aimock` dependency in strict replay mode, with no live fallback. Fixtures match the intended model messages and tool-result rounds. Use worker/test isolation so scenario responses and request journals cannot leak across cases. Explicitly fail on fixture misses and extra native model calls.

Retain original HTTP bodies, paths, queries, and the presence/type of fixture authentication at a capture proxy before aimock. Forward the requests and SSE byte stream without buffering the full response. Retain raw schema evidence even if aimock normalizes the request. Never persist real API keys in logs or fixtures.

Use observable gates to hold a response between chunks or hold model continuation while asserting a browser effect. Avoid timing-based sleeps. Cancellation tests observe the provider HTTP connection and fixture cancellation token; final text equality is insufficient evidence of streaming or cancellation.

The .NET host exposes loopback-only test controls for execution counters and isolated workflow setup. These live outside the recipe helpers and are not shown as application APIs. Scope them per test. Capture emitted AG-UI events without changing their serialization or lifecycle. Preserve stdout/stderr, Playwright traces, original request evidence, and protocol validation errors on failure.

### Nx and CI

Create a separate `dotnet-conformance` Nx project rooted at `tools/conformance/dotnet`. Provide `build`, `test`, `lint`, and an uncached `provider-e2e` target. `build` invokes locked restore and .NET build; `lint` verifies .NET formatting. `test` builds the host and runs focused HTTP integration tests with the repository's existing Jest tooling, including interrupt-store validation and concurrency, rather than calling `dotnet test` on a project without test cases. Keep that Jest selection separate from Playwright specs. TypeScript harness files remain covered by conformance lint/typechecking. No C# unit-test package is required initially; any additional test dependency requires explicit approval.

`provider-e2e` depends on building the .NET fixture and both runtime smoke hosts. Its Playwright configuration runs only this integration's specs against those hosts. The existing conformance Node-only targets remain independently runnable. Explicitly include the new TypeScript harness, HTTP tests, browser specs, and Playwright configuration in the appropriate TypeScript build configs; the existing configs use selective includes. Give the new project explicit dependencies on core, React, Angular, testing, conformance, and the runtime hosts so their changes select the .NET suite.

CI installs a pinned .NET 10 SDK when the project is affected, before the existing generic affected build/test/lint command can select that project. Add an explicit affected `provider-e2e` invocation for this integration: the existing workflow runs `example-e2e` and will not select the new target automatically. Update `.github/workflows/pr-main.yml` accordingly. Cover workflow/toolchain/lockfile changes as affected inputs. Reuse the repository's PR reporting conventions and upload failure diagnostics. Avoid requiring .NET on every unrelated local or CI command.

Commit a .NET SDK pin, exact compatible NuGet versions, and restore lock files. CI uses locked restore. Package restore/build may be cached; the e2e run is not cached. Record the successful dependency combination in the support table and update it through reviewed changes. Do not use floating prereleases.

## Documentation

Add a .NET integration recipe to both React and Angular docs. Each page shows server setup for OpenAI and Azure OpenAI, browser setup, structured output and trusted UI, browser/server tool ownership, and complete interrupt/answer/resume handling. Use the same tested reference source for both framework pages.

Document API-key configuration, the .NET 10 baseline, full-transcript ownership, absence of server chat persistence, process-local interrupt expiration, application-owned response validation, and the distinction between generic confirmation and native automatic tool approval. State what is covered by CI and list the exact supported package combination.

Link the recipe from each framework's platforms/custom-provider entry points. Explain the non-Node AG-UI boundary without changing existing provider APIs. New public core/React/Angular APIs are not planned; any runtime interoperability defect discovered must have a failing regression test and follow repository API/export rules.

## Dependencies and implementation gates

This design authorizes the scope, not installation of new dependencies. AGENTS.md requires approval before adding dependencies. Implementation planning must name the exact .NET packages and versions needed for the reference host, show their purpose, and obtain that approval before changing package references or installing them. Reuse the existing aimock/Playwright dependencies.

The initial feasibility task must establish:

1. The selected released hosting/AG-UI packages run on the pinned SDK and serialize native interrupts correctly with documented configuration.
2. A fresh conversation per request preserves the full transcript without server-side duplication.
3. Request-local schema configuration and the application interruption gate compose with upstream browser/server tool handling.
4. The genuine Azure client can use a localhost fixture endpoint while retaining its Azure request shape and fixture authentication.

If a point fails, first seek a narrow upstream configuration or supported extension point. Do not silently drop a required feature, route through a Node provider, or fork the upstream adapter. Bring any change to the support boundary back to design review.

## Acceptance and rollout

Implementation starts with failing request/behavior checks, then the smallest reference host, schema configuration, tools, and interruption lifecycle. Complete the four-way matrix and relevant build/test/lint checks before documenting the integration as supported.

Success requires all required scenarios to pass, docs to use the tested configuration, and dependency pins and CI affected selection to be verified. A test that skips .NET or Azure because the toolchain is missing cannot satisfy acceptance. Local environments missing prerequisites should fail with an actionable message; CI installs them.

The result ships as docs and internal conformance infrastructure. PR disposition is separate from this work; this design makes no GitHub comment or state change. Publishing a NuGet package, adding another runtime/provider, or supporting durable workflow recovery requires a later decision.
