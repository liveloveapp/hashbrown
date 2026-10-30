# Agent framework display conformance

These tests check how framework-produced AG-UI server-tool calls, background
activities and native delegation reach Hashbrown. They are test infrastructure,
not new runtime adapters. File search remains deferred.

The implementation plan is
[agent-framework-conformance-execution](../../../docs/superpowers/plans/2026-10-29-agent-framework-conformance-execution.md).
Frameworks require real bridge execution, the prepared root store and both browser
consumers before a capability is marked passed. A green capture harness does not
establish framework compatibility.

## Evidence boundaries

- Raw captures preserve every producer event and its order. Their hashes establish
  the integrity of saved evidence, not equality of independent random runs.
- Semantic comparisons consistently remap protocol IDs and omit envelope
  timestamps; they retain identity relationships and all application payloads.
- Captured traces prove consumer handling and ordering. Only a live blocked-tool
  test can prove START arrives before tool completion.
- Consumer canonical JSON restore and native framework checkpoint restore are
  separate tests. Native restore requires a second actual framework execution.
- Optional producer recipes and options are separate profiles. Missing evidence
  remains `not-tested`, `unsupported`, `missing-upstream` or `recipe-required`.

## Commands

```sh
npx nx agent-framework-harness-test conformance # capture/integrity helpers
npx nx agent-framework-test conformance         # pinned real hosts + corpus verification
npx nx agent-framework-capture conformance      # regenerate raw captures after reviewed changes
npx nx agent-framework-e2e conformance          # both built browser consumers
```

The initial isolated Node dependency set was approved on 2026-10-29; the additional
`@mastra/memory` 1.39.1 test dependency was approved on 2026-10-30. The install target
uses its own lock with scripts disabled; no root or published runtime dependency
changes. `conformance:test` depends on the real host/check target, and the existing
`example-e2e` spec glob includes these browser cases. CI therefore exercises both
without a new broad workflow lane. Explicit private-project metadata keeps fresh
production-mode graphs resolvable. Package-script inference is disabled so the
controlled parent targets own installation and execution; the shared capture file
is an explicit input to the cached helper-test target.

## Current baseline and limits

[capabilities.json](capabilities.json) records the exact versioned profiles and
gaps. The initial three real success profiles cover a LangGraph graph/ToolNode and Mastra's
default buffered and opt-in live server-tool profiles. LangGraph uses the published
bridge's public custom-client seam backed by real `graph.streamEvents`; it does
not exercise a LangGraph API server or qualify native SDK transport.

Host tests prove actual execution, configured START timing, safe error propagation,
and actual tool abort signals. The root-store tests prove frozen replay, canonical
commit/JSON restore and next-run serialization. Both browser consumers prove server
display and inert same-name completed calls; an independent client-tool control
still executes once. Per the binding design, a matching ordinary client tool keeps
its client projection. Only explicit provider classification overrides name matching.

Failures expose producer gaps: LangGraph includes error history in its final
snapshot without a failed-tool result event; Mastra puts error text in result
content without the AG-UI error marker. We preserve those facts and do not parse
result bodies to invent a failure status. Mastra cancellation has a cancelled
outcome; LangGraph's seam reaches the tool but its terminal lacks that outcome.

Native subagent lifecycle remains a versioned producer gap as documented below.
Observational-memory activities, richer metadata/citations and durable native
framework checkpoint restore remain follow-ups. Python, an actual
LangGraph API server and Strands are separately untested. The broader roadmap
remains in the design/plan; this first implementation does not complete it.

## Reference: Thread Plane

Source inspected in `/Users/blove/repos/angular-agent-framework` at
`2c7f01fa958441f3ed94e2559987217be284e94a`; its suites were not run in this effort.

- `scripts/react-parity/native-mastra-runner.ts` runs a real pinned Mastra service
  with deterministic models for approve, decline, cancel and lost-terminal paths.
  Its bridge/core baseline is 1.1.5/1.63.2; this is reference evidence, not proof
  for a different Hashbrown test dependency set.
- `fixtures/react-parity/native-ag-ui/README.md` distinguishes its synthetic
  shared-session browser walkthrough from the separate actual Mastra test.
- `fixtures/react-parity/langgraph-candidate/README.md` checks installed package
  isolation and both UI consumers. Its native SDK transport is outside our AG-UI
  boundary; the evidence and ownership checks are useful patterns.
- `fixtures/react-parity/native-strands-react` makes Strands a candidate for later
  inventory. It does not establish current Hashbrown Strands conformance.

## Existing Microsoft Agent Framework evidence

The maintained host is `tools/conformance/dotnet/Program.cs`; it constructs real
`AIAgent` instances and uses the package's `MapAGUIServer` endpoints. Its deterministic
model upstream is mocked, not the agent framework. Reuse this host.

| Capability             | Existing evidence                                                                      | Display gap                                                         |
| ---------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Server tools           | `dotnet/tests/tools.spec.ts`, `dotnet/specs/integration.spec.ts`                       | Rich step lifecycle is not asserted.                                |
| React/Angular          | `dotnet/dotnet.playwright.config.ts`, eight provider/API combinations                  | No activity/subagent display cases found.                           |
| Failure                | `dotnet/specs/lifecycle.spec.ts` model failure and truncated SSE                       | Useful tool error text not yet asserted.                            |
| Native history/restore | `dotnet/specs/native-sessions.spec.ts`, `native-wire.spec.ts`, `cold-history.spec.ts`  | Activities, rich steps and child provenance lack coverage.          |
| Cancellation metadata  | `dotnet/tests/native-recovery-client.spec.ts`, `dotnet/specs/native-approvals.spec.ts` | Admission checks are not a rich-step producer/display test.         |
| Activities/subagents   | No executable scenarios found in the audited .NET trees                                | Not tested; producer hooks need inspection before adding scenarios. |

This is a source inventory, not a fresh test-run result. Do not create a second
.NET service or weaken its native history, approval-journal or dispatch fencing.

## Native delegation profiles

The `native-subgraph` LangGraph profile embeds a compiled child graph containing
its actual weather ToolNode. The SDK seam serves boundary history from a real
in-memory checkpointer. This exercises published bridge checkpoint handling;
it does not qualify API-server transport or durable checkpoint restart.

The `native-delegation` Mastra profile uses `Agent({ agents: { worker } })` and
the framework-generated `agent-worker` tool. Both parent and child models execute.
Its result carries a native `subAgentThreadId` in JSON content. The consumer keeps
that content; it cannot turn a native thread identifier into AG-UI subagent
ownership.

Neither pinned bridge emits `SUBAGENT_*` or `subagentRunId` for these executions.
Host tests record the producer gap, and prepared-store/browser tests verify that
Hashbrown does not invent child rows. Passing these tests proves preservation
of the actual unattributed output, not native subagent display conformance.

For reproducibility, only the explicit Mastra `native-delegation` profile maps
`subAgentThreadId` in its `agent-worker` result using the same protocol identity
map. Other result fields, child text and nested results remain exact. The raw
capture and its integrity hash are unchanged. This profile-specific rule never
parses general application tool results.

## Native background activity profiles

The Mastra `background` and `background-failure` profiles run actual eligible
background tools with the public `Mastra` runtime, core's `InMemoryStore`,
`@mastra/memory` and bridge `untilIdle`. These options are a separate profile;
they do not change default buffered or opt-in live foreground tool behavior.
The deterministic model requests the real task, stays silent while it is
pending, then answers when Mastra re-enters the loop after task settlement.
Public runtime shutdown provides bounded cleanup.

A gated actual tool proves that ACTIVITY_SNAPSHOT is delivered before completion.
The bridge supplies running and terminal ACTIVITY_DELTA patches, including the
result or readable error. It suppresses the ordinary tool-call family in these
profiles. A completed activity is not inferred to be a tool-step outcome or a
subagent lifecycle event.

Prepared-store tests assert each supplied status transition, preserve content
through canonical commit/JSON restore and check the next-run input separately.
Activities are intentionally excluded from model-bound history. Restore recomputes
positional links without inventing the former live run ID. Both browser consumers
verify final activity content, original IDs and timestamps, no invented subagent
rows, and zero executions of an identically named browser tool.

Only the explicit background profiles normalize native task/tool identity fields
and absolute startedAt/completedAt values for independent capture comparisons.
Timestamp presence and wire type are preserved; these comparisons make no duration
claim. Raw capture bytes, consumer content assertions and host timing evidence
remain unchanged. Observational memory and durable native restart are untested.

The LangGraph host-only `native-progress` probe executes actual
`dispatchCustomEvent` callbacks around its real tool. The pinned bridge forwards
both values as `CUSTOM weather-progress`, not `ACTIVITY_SNAPSHOT`/`ACTIVITY_DELTA`.
That establishes a `recipe-required` gap, not native activity display support.
No standard events are synthesized, and no browser or restore qualification is
claimed for that progress callback profile.

The maintained smoke hosts are also copied by the .NET acceptance consumer, which
pins published SDK 0.8.3. Their optional subagent diagnostic tolerates that older
API. These current-SDK conformance cases require its capability marker to be true,
so an empty compatibility fallback cannot qualify the subagent observations.
