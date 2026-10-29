# Activities and tool-call display: delivery closeout

Reviewed 2026-10-29 against Hashbrown main `4f11a5c0` and B4.run main
`547c4ecbf`. GitHub merge state was checked for every PR below. This is the
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

- **B4 open-icon authoring:** the shared wire value is already an open string,
  and Hashbrown retains it. B4's ToolDisplay validator and several legacy and
  parked-permission projections still restrict names to ten built-in glyphs.
  Implementation is being prepared separately; no merged/released claim yet.
- **OpenAI image generation:** a separate remaining adapter slice. Azure image
  generation remains outside this streaming enabling table.
- **Upstream AG-UI contribution:** prepare a concrete profile proposal only with
  explicit authorization to post. No upstream issue/comment/PR was filed by this
  effort. Existing protocol support does not imply upstream adoption of b4.step.
- **External agent-framework qualification:** plan direct LangGraph and Mastra
  producer/bridge tests and extend the existing Microsoft Agent Framework lane.
  This is separate from Hashbrown's model-provider SDK adapters.
- **File search stays deferred across this effort.** Generated-file citations
  from code execution do not enable file search. No store configuration is added.
- **Hashbrown release notes remain user-owned.** No publication is included here.

## Existing test coverage versus proposed work

`packages/core/src/models/tool-step.conformance.spec.ts` exercises the shared SDK
fixtures through Hashbrown. `langgraph-tool-step.conformance.spec.ts` consumes a
fixture captured from the helper and checks public state/restore. It does not
execute a LangGraph bridge in this repository's CI. B4's helper has its own real
runnable and deterministic agent tests, covered by its delivery.

`tools/conformance/dotnet` exercises Microsoft Agent Framework and AG-UI through
native server, package, browser-tool and recovery paths. Audit its activity,
rich-step and subagent coverage individually before calling it full display
conformance. `tools/conformance` also tests Hashbrown's native model adapters and
local-model transports; those are not Mastra/LangGraph execution tests.

No executable Mastra suite was found in this Hashbrown checkout. Tests in sibling
repositories are prior art, not evidence that Hashbrown has passed them.

## Closeout verification

Documentation tests: 1782 tests / 246 files passed, followed by docs lint and
production build. The lockfile's existing dependencies were installed unchanged;
no dependency declarations or protocol Rules changed. Existing API Extractor,
Nx/tooling, color-environment and website tracing warnings remain. The framework
qualification design and outline are drafts for user review; no new framework
implementation or qualification claim is included in this documentation PR.
