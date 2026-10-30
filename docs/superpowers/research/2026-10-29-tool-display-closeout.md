# Activities and tool-call display: delivery closeout

Updated 2026-10-30 against Hashbrown main `82695371` (#844) and B4.run main
`c8e0583d` (#1124). GitHub merge state was checked for every PR below. This is the
current inventory; the original specs retain their historical baseline and
binding Rules. This report does not claim the entire effort is finished.

## Delivered

| Slice | Evidence | Result |
| --- | --- | --- |
| Shared v1 contract | [B4 #1071](https://github.com/cacheplane/b4run/pull/1071), [Hashbrown #691](https://github.com/liveloveapp/hashbrown/pull/691), [#708](https://github.com/liveloveapp/hashbrown/pull/708) | Metadata/CUSTOM steps, answer annotations, shared-fixture conformance and provider identity. |
| B4 emission and restore | [B4 #1086](https://github.com/cacheplane/b4run/pull/1086) | Versioned emitters and persisted failures, snapshot projection, inbound provider filtering. |
| Anthropic | [#715](https://github.com/liveloveapp/hashbrown/pull/715) | Provider steps, sources/citations and native history. |
| Google | [#730](https://github.com/liveloveapp/hashbrown/pull/730) | Provider steps, native history, grounding and required Search Suggestions attribution. |
| Bedrock | [#736](https://github.com/liveloveapp/hashbrown/pull/736) | Provider steps, native history and Nova citations. Native interpreter normalization does not add a public code-execution enabling key. |
| Plain LangGraph | [B4 #1098](https://github.com/cacheplane/b4run/pull/1098), [Hashbrown #743](https://github.com/liveloveapp/hashbrown/pull/743) | Node `/ui` helper, Python restore recipe, Hashbrown consumer fixture and both framework guides. |
| B4 provider built-ins | [B4 #1114](https://github.com/cacheplane/b4run/pull/1114) | Typed agent enabling, normalization, durable annotations and Google integration. |
| Headless UX helpers | [#805](https://github.com/liveloveapp/hashbrown/pull/805) | Labels, grouping, summaries, sources/attribution and duration/presentation policy. |
| Subagents | [#812](https://github.com/liveloveapp/hashbrown/pull/812) | Standard lifecycle and output provenance, nesting, suspension/resume and restore. |
| Framework baseline | [#832](https://github.com/liveloveapp/hashbrown/pull/832) | Real pinned Node LangGraph and Mastra bridge execution, captured events, prepared-store replay/restore and both browser consumers. |
| Framework activities and delegation | [#844](https://github.com/liveloveapp/hashbrown/pull/844) | Actual native child execution and Mastra background success/failure activities; seven profiles with explicit upstream provenance gaps. |
| OpenAI/Azure code execution | [#824](https://github.com/liveloveapp/hashbrown/pull/824), `95fd9a17` | Typed options, native results, generated-file references, known image sources and two-turn restore tests. |

OpenAI/Azure retain `store:false` and omit native provider display calls from
subsequent requests. Explicit container configuration is needed when applications
require retained execution state. Other adapters retain their own native-history
policies. A native execution image output is not OpenAI image-generation support.

## Release evidence and historical corrections

The actual plain-LangGraph import is `@b4run/langgraph/ui`, replacing the original
unshipped `/tool-step` proposal. On this review date npm lists 0.15.7 with both
`./dist/ui.js` and `./dist/ui.d.ts` under `exports['./ui']`. The original 0.15.2
release warning in Hashbrown's guides is stale. Version 0.15.3 is not currently
listed on npm; use verified available versions rather than treating its recovery
history as a current install instruction. This review inspects the published
export map and imports the installed 0.15.7 helper, verifying emitToolStep and
toolStepMiddleware are functions. It is not a fresh live agent qualification.

Early unchecked plans and statements such as “today neither project gets this
right” describe the October 21 baseline. Do not reinterpret their historical
checkboxes as missing implementation or rewrite the shared merge Rules.

## Still open

- **B4 open-icon release:** [B4 #1124](https://github.com/cacheplane/b4run/pull/1124)
  merged as `c8e0583d`. It accepts custom nonempty icon names through authoring,
  legacy/restore and parked-permission projections. The known-name predicate
  retains its narrowing semantics; bundled glyph kits fall back safely for
  custom names. Publication verification is pending; do not claim the existing
  0.15.7 package contains this change.
- **OpenAI image generation:** a separate remaining adapter slice. Azure image
  generation remains outside this streaming enabling table.
- **Upstream AG-UI contribution:** prepare a concrete profile proposal only with
  explicit authorization to post. No upstream issue/comment/PR was filed by this
  effort. Existing protocol support does not imply upstream adoption of b4.step.
- **Framework conformance expansion:** the Node baseline and native activity/
  child-execution profiles shipped in #832/#844. Remaining work includes actual
  LangGraph API-server/Python bridges, durable native checkpoint restart,
  rich metadata/attribution recipes, Mastra observational-memory activities and
  the existing Microsoft Agent Framework display gaps. Strands and other
  frameworks need their own inventory and versioned qualification.
- **File search stays deferred across this effort.** Generated-file citations
  from code execution do not enable file search. No store configuration is added.
- **Hashbrown release notes remain user-owned.** No publication is included here.

## Current framework evidence and limits

The executable inventory is
[`capabilities.json`](../../../tools/conformance/agent-frameworks/capabilities.json),
with test commands and evidence boundaries in the
[conformance README](../../../tools/conformance/agent-frameworks/README.md).
The seven profiles use `@ag-ui/langgraph` 0.0.45 / `@langchain/langgraph` 1.5.3
and `@ag-ui/mastra` 2.0.1 / `@mastra/core` 1.80.0. Exact peer and background-memory
versions are recorded per profile. These are isolated test dependencies, not
Hashbrown runtime adapters.

Actual blocked execution proves configured live START timing or native Mastra
background activity before completion. Raw generated captures pass through the
prepared root store, canonical commit/JSON restore, next-run serialization and
Angular/React browser consumers. In the covered same-name scenarios, completed
server calls stay inert; an independent ordinary client-tool control still
executes once. The capability inventory records per-profile coverage; the
native Mastra delegation profile does not claim that same-name check.

Consumer restore is not durable native framework restart. Activities survive the
canonical checkpoint but are intentionally excluded from outgoing model history;
restored positional links do not invent the former live run ID. LangGraph uses
the published bridge's custom-client seam backed by a real graph; an actual API
server and Python bridge remain untested.

Real LangGraph child StateGraph/ToolNode and Mastra `agents`/`agent-worker`
executions are covered. Both pinned bridges omit `SUBAGENT_*` and
`subagentRunId`. Hashbrown preserves their output without inventing child rows;
Mastra's JSON `subAgentThreadId` alone does not establish AG-UI ownership.
Hashbrown's standard subagent consumer support from #812 remains available when
a producer supplies the protocol events.

Mastra's separate background profiles supply running and terminal activity
patches, including explicit readable failure. They do not qualify observational
memory. LangGraph's real `dispatchCustomEvent` probe reaches the bridge as CUSTOM
progress, not standard ACTIVITY events; standard activity display is
`recipe-required`. Ordinary foreground failure/cancellation gaps remain in the
inventory: LangGraph omits a failed result and explicit cancelled terminal
outcome; Mastra foreground failures lack a top-level error marker. Never parse
human-readable result bodies to manufacture outcomes.

`tools/conformance/dotnet` retains its existing Microsoft Agent Framework native
server, package, browser-tool, approval and recovery coverage. The source audit
found gaps for activities, rich steps, readable tool errors and subagent display.
Extend that maintained host without weakening native history, admission or
recovery checks. Thread Plane is useful prior art, not evidence that Hashbrown
passed another repository's versions or tests.

## Closeout verification

The refreshed website suite passed 2,307 tests across 267 files, followed by
website lint and a production build. Existing API Extractor/compiler and
forgotten-export, color-environment and dynamic filesystem tracing warnings
remain. #832/#844's CI and the versioned corpus establish
the delivered conformance evidence; this documentation refresh does not claim a
new live agent qualification. No dependency declarations, shared contract Rules,
file-search support or user-owned Hashbrown release notes change here.
