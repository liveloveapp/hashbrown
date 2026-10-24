# Non Node providers and .NET AG UI interoperability

Research date: October 23, 2026. Recommendation for [Hashbrown PR 466](https://github.com/liveloveapp/hashbrown/pull/466).

Support non-Node backends through AG-UI. Use the upstream .NET SDK and Microsoft Agent Framework hosting integration, with a small Hashbrown schema bridge where needed. Establish support with real HTTP and browser conformance tests against a .NET process and aimock. Supersede PR 466's old binary adapter rather than maintaining a second protocol implementation.

This is a research recommendation, not an approved implementation specification. Source inspection establishes the gaps below; a successful Hashbrown to .NET runtime test is still required before advertising compatibility.

## What support should mean

Separate three commitments:

1. **Protocol compatibility:** Hashbrown's React and Angular clients can use an AG-UI HTTP server regardless of its implementation language.
2. **Tested integrations:** Hashbrown CI exercises selected, pinned third-party integrations. Start with .NET because there is an existing contribution and an upstream implementation to reuse.
3. **Hashbrown feature compatibility:** Structured output, trusted component rendering, finish reasons, and decisions require their own semantics in addition to AG-UI transport. Document and test each capability rather than treating AG-UI as a blanket promise of feature parity.

Keep the browser packages in TypeScript. The non-Node boundary is the agent server, not a port of the React or Angular runtime. A .NET application can call any provider supported by its `IChatClient`; Hashbrown need not publish a separate adapter for every combination of language and model vendor.

### Options

| Approach | Benefit | Cost | Assessment |
| --- | --- | --- | --- |
| Upstream AG-UI SDK plus tested recipes and a small semantic bridge | Reuses protocol maintenance and allows existing .NET agents | Requires version pins, capability documentation, and cross-language CI | Recommended |
| Own and publish `Hashbrown.DotNet` | Branded setup API and a single package to recommend | NuGet releases, .NET support policy, security updates, and duplicated integration maintenance | Reconsider only if a recipe proves insufficient |
| Describe AG-UI compatibility without running a real .NET server | Lowest immediate work | Misses serializer, SDK, cancellation, and agent orchestration failures | Insufficient for a supported integration |

## PR 466 has been overtaken by the protocol change

The PR opened February 20, 2026, remains open, and adds 26 files / 4,638 lines. It introduces `MapHashbrownAgent`, `AddHashbrown`, custom message models, big-endian length-prefixed JSON frames, and `generate` / `load-thread` operations. Its service tests cover invalid inputs, missing thread configuration, and binary response headers; they do not run successful generation through a real browser and model SDK.

Current Hashbrown sends AG-UI `RunAgentInput` and consumes validated AG-UI events over SSE. Its structured-output extension is `forwardedProps.hashbrown.responseSchema`; the old request's `responseFormat` and binary frames do not match that contract. Current clients also send the conversation transcript on every model run and delegate persistence to the application. The PR's thread-loading protocol would reintroduce a different ownership model.

The PR also has inline findings about ignoring the requested thread ID, missing generation history hydration, and reporting thread-save success without persistence. Those findings concern its historical protocol; the history-hydration advice should not be copied into today's full-transcript contract. The substantive intent—use Hashbrown from ASP.NET Core—is worth preserving through a new integration.

Local evidence:

- `packages/core/src/transport/http-transport.ts`: SSE parsing and event validation.
- `packages/core/src/transport/hashbrown-run-agent-input.ts`: canonical transcript, tools, state, resume, and forwarded extension.
- `www/content/docs/react/recipes/threads.md` and Angular equivalent: application-owned persistence and transcript submission.
- `www/content/docs/react/platform/custom.md` and Angular equivalent: current provider obligations.

## Microsoft now supplies the reusable implementation

Microsoft announced its contribution of the .NET SDK to the AG-UI repository on September 25, 2026. There are two useful layers: the standalone `AGUI.*` packages and Microsoft's Agent Framework ASP.NET Core integration. The latter now builds on the former. [Microsoft announcement](https://devblogs.microsoft.com/dotnet/ag-ui-dotnet-sdk/)

- `AGUI.Abstractions`: protocol models and serialization.
- `AGUI.Formatting`: stream formatting, including SSE.
- `AGUI.Server`: converts `Microsoft.Extensions.AI` request/response objects and streams to AG-UI.
- `AGUI.Client`: consumes an AG-UI server from .NET; this is not what a Hashbrown browser needs.
- `AGUI.Protobuf`: optional binary format; use SSE for this integration.
- `Microsoft.Agents.AI.Hosting.AGUI.AspNetCore`: `AddAGUIServer()` / `MapAGUIServer()` for an `AIAgent`.

`AGUI.Server` 1.0.1 is a stable NuGet release from October 12 and supports .NET 8, 9, and 10. The broader target range of `AGUI.Abstractions` does not imply that the ASP.NET Core host supports .NET Framework. [NuGet package](https://www.nuget.org/packages/AGUI.Server), [SDK package overview](https://docs.ag-ui.com/sdk/dotnet/abstractions/overview)

The standalone server primitives are sufficient for an application that has an `IChatClient` and does not want Agent Framework orchestration. `ToChatRequestContext` adapts the input; `AsAGUIEventStreamAsync` produces the protocol events. For existing Microsoft agents, use the hosting integration and add a delegating client or equivalent middleware to apply Hashbrown semantics. [Microsoft getting started](https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/ui/ag-ui/getting-started)

### Version findings that affect the test baseline

| Component | Verified source or release | Consequence |
| --- | --- | --- |
| Hashbrown workspace | `45c952edeb4124c9733fe7288208a03b0e0579a5` | Uses `@ag-ui/core`, client, and encoder 1.0.3; aimock 1.46.0 |
| PR 466 | `ddd525537b2cf2a34ff9d66374eb984c9ec66d78` | Historical binary protocol |
| .NET AG-UI 1.0.1 release tag | `9a7508f081a8595e65db4e044460d494afd7d8f9` | Inspected server source matches the checked main snapshot; 1.0.1 adds `RUN_STARTED.protocolVersion` |
| AG-UI main snapshot | `73b04fdaec1f1b170a5efeeda3c050247a26075b` | Source reference for the SDK |
| Agent Framework main snapshot | `4982e4c61ec81cc4f9ba0cbdb5594ed530dbbcfe` | Includes the null-field resolver fix; no interrupt-content registration in the inspected hosting source |
| Agent Framework release | `dotnet-1.26.0`, October 23 | Release notes include null-field fix #7920; central dependencies still specify `AGUI.*` 1.0.0 |
| aimock release | `v1.46.0`, `f35d8daf7c159701595cf914e4cfe531475a4260` | Matches Hashbrown's package pin; supports request journal and deterministic tool-round fixtures |

Pin the actual hosting NuGet package separately: the hosting project carries a preview suffix even when Agent Framework's core release is stable. Do not infer a stable hosting package version from the GitHub release name. Resolve the exact published package and lock its complete dependency graph during implementation. Explicitly test any upgrade from its AG-UI 1.0.0 dependency to 1.0.1. [Release notes](https://github.com/microsoft/agent-framework/releases/tag/dotnet-1.26.0), [release dependency pins](https://github.com/microsoft/agent-framework/blob/dotnet-1.26.0/dotnet/Directory.Packages.props), [hosting project](https://github.com/microsoft/agent-framework/blob/4982e4c61ec81cc4f9ba0cbdb5594ed530dbbcfe/dotnet/src/Microsoft.Agents.AI.Hosting.AGUI.AspNetCore/Microsoft.Agents.AI.Hosting.AGUI.AspNetCore.csproj)

## Compatibility gaps

### Structured output needs an explicit schema bridge

The .NET SDK preserves `forwardedProps` as `RunAgentInput.ForwardedProperties`, a `JsonElement`. `ToChatRequestContext` stores the originating run input in chat options and exposes `TryGetRunAgentInput`. It does not translate Hashbrown's schema into `ChatOptions.ResponseFormat`.

For dynamic Hashbrown schemas, application middleware should read `ForwardedProperties.hashbrown.responseSchema` and set `ChatResponseFormat.ForJsonSchema` on a request-local copy of the options. Preserve the existing tool declarations and additional properties. Pin a server-owned schema instead where the endpoint's policy requires one. Use the ordinary text event stream to return JSON: Hashbrown incrementally parses that stream with Skillet.

This is a small semantic bridge, not a new encoder, parser, or protocol DTO hierarchy. A server-configured fixed schema can work without dynamic forwarding, but it does not establish support for arbitrary client schemas. [Released request adapter source](https://github.com/ag-ui-protocol/ag-ui/blob/9a7508f081a8595e65db4e044460d494afd7d8f9/sdks/dotnet/src/AGUI.Server/RunAgentInputExtensions.cs)

### Generative UI is more specific than AG-UI

Hashbrown's UI hooks send the schema for the exposed trusted components, with `ui: true`, then consume JSON carried in text events. The current OpenAI adapter enforces `responseSchema` without requiring separate behavior for the `ui` marker. A .NET bridge should preserve that marker and enforce the schema, rather than invent a new rendering format.

A2UI surfaces, state snapshots, activity events, and arbitrary tool-result JSON are different contracts. Microsoft or AG-UI demonstrations rendering a surface do not establish that Hashbrown's component schema, streaming parser, or renderer can consume it. Verify partial component props and browser actions in both framework hosts.

### Tool execution and history ownership need real interoperability tests

Hashbrown executes declared browser tools and submits their results on another AG-UI run. The .NET request adapter already handles frontend tool declarations and uses an approval/proxy pipeline for mixed client/server tools. Reuse that machinery. Its translation of past tool results, unresolved server calls, and newly repeated tool calls is complex enough that a happy-path text fixture is inadequate. [Microsoft frontend tools](https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/ui/ag-ui/frontend-tools), [SDK request adapter](https://github.com/ag-ui-protocol/ag-ui/blob/9a7508f081a8595e65db4e044460d494afd7d8f9/sdks/dotnet/src/AGUI.Server/RunAgentInputExtensions.cs)

Start with request-owned history and no persisted server session. Hashbrown sends the full transcript, whereas Microsoft's persisted-session recipe describes continuation with new messages and `parentRunId`. Combining those naively could duplicate history; that is a risk inferred from the two contracts, not a reproduced defect. Test two conversational turns, a tool continuation, and repeated use of the same tool. Add server-owned persistence only with an explicit deduplication/ownership policy. Thread identifiers alone are not authorization credentials. [Microsoft conversation continuity](https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/ui/ag-ui/getting-started)

Backend tools must complete server-side and produce their result events before terminal completion, so Hashbrown does not mistake an unresolved call for a browser tool.

### Serialization failures are real and version dependent

Microsoft issue #7919 reports optional fields emitted as explicit nulls and rejected by the TypeScript client. Fix #7920 merged October 16 and appears in the October 23 release. Assert actual wire omission and parsing with Hashbrown's pinned TypeScript validators; successful C# serialization is insufficient. [Issue 7919](https://github.com/microsoft/agent-framework/issues/7919), [merged fix 7920](https://github.com/microsoft/agent-framework/pull/7920)

Issue #8962 also reports interrupt-content serialization failures. Although that issue is closed, its separate fix, PR #9007, remains open. The inspected hosting configuration does not call `AGUIJsonUtilities.RegisterInterruptContentTypes`. Treat interrupt support as a capability to prove; a recipe may need that upstream-documented registration until the fix ships. Do not weaken the browser's event validation. [Issue 8962](https://github.com/microsoft/agent-framework/issues/8962), [open fix 9007](https://github.com/microsoft/agent-framework/pull/9007)

The generic .NET resume translation copies interrupt ID, payload, and metadata into `InterruptResponseContent`, but does not copy `AGUIResume.Status` into that content type. The original input remains accessible. Test resolved and cancelled responses separately; application handling may need to inspect the original resume envelope to distinguish cancellation from an empty answer.

### Streaming quality and optional metadata need capability boundaries

The .NET event adapter supports tool calls, reasoning, and extensible content mappings. Its source explicitly notes that incremental tool arguments need a configured fragment extractor; otherwise arguments are emitted atomically when the function call is complete. Complete tool arguments are enough for execution, but do not establish progressive tool-argument streaming. [Released event adapter](https://github.com/ag-ui-protocol/ag-ui/blob/9a7508f081a8595e65db4e044460d494afd7d8f9/sdks/dotnet/src/AGUI.Server/ChatResponseUpdateAGUIExtensions.cs)

State is preserved as protocol input and can be emitted through explicit state mappings; it is not automatically injected into the model prompt. Activities and state are separate from the final structured answer. Test round trips for any of these advertised capabilities.

The inspected .NET terminal helper carries usage but does not add Hashbrown's `metadata.hashbrown.finishReason`. Hashbrown's `lastRunFinishReason` therefore needs an explicit mapping if the integration promises that field. `RUN_FINISHED.result` likewise is not the text channel consumed by structured completion hooks. Browser decisions have a separate custom transport recipe and should not be included in a blanket .NET compatibility claim.

HTTP cancellation must propagate through ASP.NET's request token to the model client; verify upstream disconnection and absence of late UI/tool updates. Test HTTP failures separately from `RUN_ERROR`, premature EOF, and user cancellation.

## Existing tests leave a specific hole

`tools/conformance/specs/endpoint-interop.spec.ts` runs plain text, browser tools, structured output, and UI through `startIndependentEndpoint`. That fixture is a hand-authored Node HTTP server which emits selected events. It usefully verifies Hashbrown's contract independently of its provider packages, but bypasses .NET models, serialization, SDK translation, and agent orchestration.

`tools/conformance/provider/native-ui.spec.ts` goes further: a real Hashbrown OpenAI adapter uses aimock as its model upstream and the browser consumes real SSE. It covers both framework hosts. However, it still exercises a Node backend and the provider Playwright config currently selects only `native-ui.spec.ts`.

Keep both suites. Add real .NET integration coverage at the provider boundary; changing existing fixture labels to say "non-Node" would not fill the hole.

## Proposed aimock e2e design

The decisive path is:

```text
React / Angular browser host
  -> Hashbrown HTTP transport
  -> real ASP.NET Core /run endpoint
  -> Microsoft Agent Framework AG-UI adapter
  -> Hashbrown schema middleware
  -> real OpenAI .NET IChatClient
  -> aimock model API on localhost
```

Use the already-pinned aimock 1.46.0 at the model boundary. Do not replace the .NET endpoint with aimock's AG-UI mock: that would bypass the integration under test. A standalone `AGUI.Server` host can be a second small test variant once the MAF path passes; avoid two complete feature matrices initially.

Use Chat Completions for the first .NET model client if it keeps the fixture minimal; that is independent of Hashbrown's Node OpenAI adapter using Responses. Add a Responses-backed variant if the documentation recommends it. This work proves language/agent interoperability through one model wire, not every model provider supported by .NET.

### Acceptance matrix

Run every browser scenario against both React and Angular.

| Priority | Scenario | Essential assertions |
| --- | --- | --- |
| P0 | Ordinary text | Valid run/message IDs and events, partial text visible before completion, clean idle state |
| P0 | Two turns | Exactly one copy of each history message reaches aimock; stable thread ID, fresh run ID |
| P0 | Browser tool | Declaration reaches model, fragmented arguments assemble, handler runs once, result reaches next model call |
| P0 | Repeated browser tool | Same tool on a later round executes freshly; previous result is not replayed as the new result |
| P0 | Structured output | Exact requested schema reaches native model options/wire and typed output reaches the browser |
| P0 | Trusted UI | Actual exposed component schema reaches model, partial props stream, final component renders and action works |
| P0 | Mixed backend/browser tools | Backend result remains server-owned; browser tool runs once; continuation retains both results |
| P0 | Cancel | Browser stop cancels upstream model request, gates release during teardown, no late answer or action |
| P0 | Errors | HTTP rejection, native-model error, AG-UI `RUN_ERROR`, and truncated SSE fail clearly without hanging |
| P0 | Serialization | Optional fields omitted where required, `RUN_STARTED.protocolVersion`, every real event passes pinned TS schema |
| P1 | Interrupt/resume | Actual MAF interrupt survives serialization, resolved/cancelled cases remain distinct, no duplicate tool execution |
| P1 | State/messages | Snapshot and patch are visible and sent back correctly on the next run, if advertised |
| P1 | Reasoning/activities | Correct event ordering and rendering without contaminating final JSON, if advertised |
| P1 | Usage/finish | Usage survives; stop/length/refusal mapping matches the documented Hashbrown metadata capability |

Use controlled gates or paused fixture responses to prove streaming. Final text equality plus small mock chunks does not prove the browser rendered anything before completion. Gate model continuation while asserting the browser tool result or partial component, then release it. Use observable abort signals or connection closure to prove cancellation rather than relying on delays.

### Assert the model request as well as the UI

aimock can return JSON matching the UI even if the .NET bridge silently ignored the schema. Successful rendering alone would be a false positive. Assert the exact schema, model, tool declarations, and correlated tool results on the native-model request.

There is already a related limitation in `native-ui.spec.ts`: its comment explains that aimock normalizes Responses requests to Chat Completions shape and drops `text.format` from the journal. Inspection of aimock 1.46.0's Responses normalization agrees. For a Responses-backed .NET fixture, use a local transparent recording proxy before aimock, or an inspecting .NET HTTP handler that captures the original body and then forwards it to aimock. Preserve streaming and cancellation. Do not assume normalized `getRequests()` entries establish schema forwarding. [Pinned aimock source](https://github.com/CopilotKit/aimock/blob/f35d8daf7c159701595cf914e4cfe531475a4260/src/responses.ts)

Set strict matching so fixture misses fail. Isolate fixtures/journals by worker or test, fail on unexpected extra model calls, and retain .NET stdout/stderr, original model requests, emitted AG-UI events, browser errors, and Playwright traces for failures. Avoid production credentials and live fallback. [Pinned aimock documentation](https://github.com/CopilotKit/aimock/tree/v1.46.0)

### Repository and CI integration

Keep the .NET host under `tools/conformance`, consistent with internal runtime smoke hosts, rather than making it a public example or published package. Add a focused Nx target such as `dotnet-provider-e2e` that builds the fixture and both browser hosts, starts aimock/.NET with readiness checks, and runs the scenario matrix. Invoke .NET build/restore through that Nx target. Reuse the current browser driver and host scenarios.

Account for both `provider.playwright.config.ts` and `all.playwright.config.ts`: the existing file selection must include the new suite, or an explicit CI target must run it. Make changes to the .NET fixture, project files, package pins, and relevant browser/core packages trigger it through Nx's dependency graph. A CI job needs a pinned .NET SDK, locked restore, and browser runtime. Cache package restore/build artifacts; keep these e2e runs uncached, as the existing provider target does.

The initial supported baseline should name one concrete .NET runtime/package combination. If the recipe promises both .NET 8 and .NET 10, run both: Microsoft's hosting source uses a different SSE result path before .NET 10. Pin the integration first; exercise upstream upgrades in a separate compatibility job rather than floating production CI dependencies.

Any new NuGet dependencies require approval under this repository's AGENTS.md. No dependencies were added for this research.

## Recommended sequence and PR disposition

1. Agree on AG-UI as the language-independent boundary and on .NET as the first tested integration.
2. Resolve and approve the exact .NET SDK/NuGet dependency pins. Build an internal MAF endpoint fixture with real model SDK calls to aimock; start with text and tool continuation.
3. Add the schema bridge and prove structured output and trusted UI with native request assertions. Add the serialization regressions and cancellation/error cases before claiming support.
4. Verify interrupts and other optional capabilities separately, upstream defects where possible, and document any narrowly required configuration workaround with its affected versions.
5. Add React/Angular .NET recipes, a capability/version table, and CI coverage. Then propose closing/superseding PR 466 with the AG-UI integration as the supported successor. Keep its contribution credited; no need to port the binary framing or old thread lifecycle.

No GitHub comment or PR state change was made. No .NET or browser test was executed in this research environment: `dotnet` is unavailable on PATH and the checkout has no `node_modules`. The proposed matrix is acceptance work, not a list of passing tests.
