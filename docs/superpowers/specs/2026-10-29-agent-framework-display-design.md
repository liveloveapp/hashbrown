# Agent-framework activities and tool-display qualification

**Status:** draft for user review, 2026-10-29. Planning only; no new adapter,
dependency installation for these frameworks, or compatibility claim is approved
by this document. The working recommendation is AG-UI interoperability first.

## Intent and terminology

A model-provider adapter (OpenAI, Anthropic, Google, Bedrock) translates model
API events. An agent framework (LangGraph, Mastra, Microsoft Agent Framework)
adds orchestration, persistence, approvals and delegation. Native provider tests
do not prove agent-framework compatibility. B4 is one such producer, not a
runtime requirement for Hashbrown.

Applications should receive the same neutral Hashbrown state for activities,
server/provider tool calls, readable failures, citations and subagent provenance
whenever their backend supplies equivalent protocol information. Preserve the
[shared contract Rules](2026-10-21-b4-tool-step-contract-design.md#rules).

## Approaches

1. **AG-UI qualification plus small producer recipes (recommended).** Run real,
   pinned framework and bridge packages with deterministic models, reuse the
   headless consumer and fix documented gaps at the boundary that owns them.
   This keeps client dependencies small and exposes upstream information loss.
2. **Native framework-specific transports/packages.** Potentially useful when a
   native SDK exposes more than its AG-UI bridge. Each needs independent run,
   cancellation, reconnect, history and dispatch semantics; substantially more
   maintenance. Treat a native LangGraph SDK transport as a separate proposal.
3. **Documentation/hand-authored traces only.** Cheapest, but insufficient to
   claim the bridge delivers execution-start events, preserves failed outcomes
   or survives restore. Use as discovery evidence, not qualification.

“LangGraph directly” needs a precise boundary: plain LangGraph through AG-UI
without a B4 agent is covered by approach 1. Bypassing AG-UI and consuming the
LangGraph SDK's native protocol is approach 2, outside this first milestone.
The user has been asked to choose the overall direction; this remains a draft.

## Existing evidence

| Backend | Hashbrown evidence today | Next qualification |
| --- | --- | --- |
| B4 | Shared fixtures, real-store consumer conformance; native app/workbench paths elsewhere in the repo | Reference rich-step profile; keep version ownership explicit. |
| Plain LangGraph | Captured helper fixture in core; JS/Python recipes; B4-owned runnable/helper tests | Execute actual JS and Python AG-UI bridges in isolated test hosts, with and without optional helper. |
| Microsoft Agent Framework/.NET | Native/package/browser/recovery suites under tools/conformance/dotnet | Audit and add activities, rich steps, failure/restore and subagent cases to that maintained host. |
| Mastra | No executable suite found in Hashbrown | Add first version-pinned real bridge host and qualify ordinary tools before opt-in background/delegation features. |
| Pydantic AI, Google ADK, CrewAI, AG2, Vercel AI SDK | No framework execution lane found here | Candidates after the first milestone; rank using actual protocol gaps and demand. |

The existing LangGraph fixture is not a real bridge running in Hashbrown CI.
Tests in sibling repositories are prior art only. Hashbrown's local-model tests
qualify model transports, not these orchestration frameworks.

## Protocol and producer boundary

- Standard TOOL_CALL events own argument and result lifecycle. Never turn a
  workflow node or a reasoning span into a tool just to show activity.
- ACTIVITY_SNAPSHOT/DELTA carry non-tool progress as native content. Preserve
  activity identity and patch ordering; apps choose how to render each type.
- b4.step/b4.answer are optional enrichment. Basic AG-UI must remain usable
  without them. If an upstream bridge omits labels or failure information,
  document the limit or add an opt-in producer recipe; do not infer a success,
  denial, cancellation or provider identity from names or human-readable text.
- A rich profile adds labels, opaque icon names, settled outcomes, actual start
  timing, sources and required attribution. Hashbrown keeps neutral public types
  and no runtime B4 dependency. Existing SDK fixtures remain the contract oracle.
- Use standard SUBAGENT_* events and provenance, with distinct tool and child-run
  settlement. Subgraph namespaces alone are not proof of subagent invocation.
- The backend owns durable checkpoints and next-turn native history. Persist
  rich metadata before claiming restore support; live CUSTOM events alone are
  insufficient. Keep activity snapshots, tool metadata and subagent provenance
  linked to their original owners.

## Framework-specific investigation

**LangGraph:** qualify Node and Python separately, including unstreamed late
START, held CUSTOM steps, errors, interrupts, checkpoint restore and parallel
children. Baseline without /ui first, then optional @b4run/langgraph/ui. The
published 0.15.7 export is available; do not imply it fixes every upstream bridge.
For Python, reuse the checkpoint-pinned snapshot projection recipe. For Node,
audit the bridge's current extension points before proposing a wrapper around
private methods. Native SDK event streaming remains a distinct transport design.

**Mastra:** inspect the official @ag-ui/mastra package at upstream revision
`7e7c1109f26e77cc32d87d351fb9e0b0bf56ff7f` (source package version 2.0.2).
Its source already provides opt-in live server tools, observational-memory
activities and attributed subagents. Qualify these instead of rebuilding them.
The streamServerToolCalls option documents suspension/background tradeoffs;
use separate scenario profiles rather than enable it globally. The untilIdle
option documents missing terminal background delivery for a checked Mastra
version; do not promise completion or synthesize it from parent-run success.
Inspect publication/version compatibility before choosing the install baseline.

**Microsoft Agent Framework:** extend existing tests and server registration,
not a parallel .NET host. First inventory what native serializer/history APIs
retain. Keep its approval journals, dispatch fencing and result ownership intact.

## Shared acceptance matrix

For each claimed capability, capture real producer/bridge output and pass it
through Hashbrown's real prepared root store, public projection and UX helpers.
Use React and Angular browser consumers for the final claimed display profile.

1. Live START and partial args are visible before a deliberately blocked tool
   returns; actual execution start differs from argument finality and approval.
2. Tool success, readable failure, denial, cancellation, abnormal EOF and run
   termination preserve the profile's outcomes. Missing producer evidence is a
   documented gap, not a manufactured success.
3. Parallel calls/children retain IDs, parent links and provenance; same-name
   client tools never execute for declared provider calls.
4. Activity snapshot/patch updates stay independent from tool results; restore
   reconstructs the same content without inventing background completion.
5. Labels/icons, sources, citations and required attribution survive live, commit,
   serialize/restore and next-turn boundaries whenever supplied by the backend.
6. Fresh snapshot restore and approval resume preserve failure and native replay;
   restored provider display calls never become undeclared application functions.
7. Ordinary app tools still dispatch exactly once; no model calls, credentials,
   production endpoints or live recordings are needed for qualification.

Record each capability as **qualified**, **unsupported**, **missing upstream**,
**recipe-required** or **not tested**, with exact versions and evidence. No single
“supports AG-UI” badge substitutes for this matrix. Honest gap rows can ship;
false green assertions cannot.

## Delivery boundaries

First deliver the shared harness and existing-host audit, then direct LangGraph,
then Mastra, with separate reviewable PRs and version evidence. .NET is the
existing-host follow-up, prioritized alongside the first framework where its
gaps overlap. A later decision can add Pydantic AI or Google ADK; neither is
currently an already-tested Hashbrown framework.

No runtime dependencies or new production packages in the first milestone.
Any new isolated test-package dependencies still require user approval before
addition. File search, OpenAI image generation, upstream posting and release
notes remain outside this proposal. No release or PR merge is authorized here.

## Primary sources reviewed

- [AG-UI integration source tree](https://github.com/ag-ui-protocol/ag-ui/tree/7e7c1109f26e77cc32d87d351fb9e0b0bf56ff7f/integrations).
- [Mastra bridge and options](https://github.com/ag-ui-protocol/ag-ui/blob/7e7c1109f26e77cc32d87d351fb9e0b0bf56ff7f/integrations/mastra/typescript/src/mastra.ts), [subagent translation](https://github.com/ag-ui-protocol/ag-ui/blob/7e7c1109f26e77cc32d87d351fb9e0b0bf56ff7f/integrations/mastra/typescript/src/subagents.ts).
- [LangGraph streaming documentation source](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/streaming.mdx).
- [Pydantic AI's AG-UI integration](https://pydantic.dev/docs/ai/integrations/ui/ag-ui/) is a candidate reference, not evidence of Hashbrown qualification.
- Local evidence: core langgraph-tool-step.conformance.spec.ts,
  tool-step.conformance.spec.ts, tools/conformance/dotnet and the
  [delivery closeout](../research/2026-10-29-tool-display-closeout.md).
