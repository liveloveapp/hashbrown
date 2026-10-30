# Agent framework display conformance

These initial tests check how framework-produced AG-UI server-tool calls reach
Hashbrown. Activities remain part of the follow-up roadmap. They are test infrastructure, not new runtime adapters. File search
remains deferred.

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

The isolated Node dependency set was approved on 2026-10-29. The install target
uses its own lock with scripts disabled; no root or published runtime dependency
changes. `conformance:test` depends on the real host/check target, and the existing
`example-e2e` spec glob includes these browser cases. CI therefore exercises both
without a new broad workflow lane. Explicit private-project metadata keeps fresh
production-mode graphs resolvable. Package-script inference is disabled so the
controlled parent targets own installation and execution; the shared capture file
is an explicit input to the cached helper-test target.

## Current baseline and limits

[capabilities.json](capabilities.json) records the exact versioned profiles and
gaps. Three real success captures cover a LangGraph graph/ToolNode and Mastra's
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

Activities, subagents, richer metadata/citations and durable native framework
checkpoint restore remain follow-ups. The empty activity observation in the host
is fixture diagnostics, not activity conformance evidence. Python, an actual
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

| Capability | Existing evidence | Display gap |
| --- | --- | --- |
| Server tools | `dotnet/tests/tools.spec.ts`, `dotnet/specs/integration.spec.ts` | Rich step lifecycle is not asserted. |
| React/Angular | `dotnet/dotnet.playwright.config.ts`, eight provider/API combinations | No activity/subagent display cases found. |
| Failure | `dotnet/specs/lifecycle.spec.ts` model failure and truncated SSE | Useful tool error text not yet asserted. |
| Native history/restore | `dotnet/specs/native-sessions.spec.ts`, `native-wire.spec.ts`, `cold-history.spec.ts` | Activities, rich steps and child provenance lack coverage. |
| Cancellation metadata | `dotnet/tests/native-recovery-client.spec.ts`, `dotnet/specs/native-approvals.spec.ts` | Admission checks are not a rich-step producer/display test. |
| Activities/subagents | No executable scenarios found in the audited .NET trees | Not tested; producer hooks need inspection before adding scenarios. |

This is a source inventory, not a fresh test-run result. Do not create a second
.NET service or weaken its native history, approval-journal or dispatch fencing.
