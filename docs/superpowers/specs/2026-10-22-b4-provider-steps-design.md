# Provider tool steps: slice 3 audit and Anthropic delivery

Status: Anthropic-first delivery approved by the user on 2026-10-22; independent spec review approved. The user deferred file search from slice 3 on 2026-10-22. Later-provider details remain deferred.

## Baseline and binding requirements

Hashbrown main `5e752cc707651890f51a335353dfc6e8d7b6dc73` includes slices 1 and its conformance work (#691, #708). B4.run slice 2 merged in [#1086](https://github.com/cacheplane/b4run/pull/1086) as `d5b7efdec3c2b823cf71d2d5a6b645b5f6250af2`, with all CI green. Publishing that B4 change is separate from this work.

The Rules in [the shared design](2026-10-21-b4-tool-step-contract-design.md) remain binding. In particular: stream START immediately; distinguish provider calls before client dispatch; settle from actual results; preserve readable failures; never replay a provider call as an app function; retain provider-native payloads; never invent calls for call-less grounding. Hashbrown remains headless. There is no runtime B4 dependency, new dependency, release-note work, live recording, or live model request in this proposal.

The existing Hashbrown implementation plan ends at slice 1 conformance. The shared design explicitly deferred detailed design for later slices. This document records the audit and proposes the first independently reviewable delivery within slice 3.

## Delivery options

1. **Separate provider PRs (recommended).** Anthropic first, then Google, Bedrock, and remaining OpenAI/Azure capabilities. Every PR includes request configuration, live mapping, native replay, annotations, docs, and tests. This isolates incompatible native replay formats and makes failures attributable.
2. One slice 3 PR covering all providers. This completes the capability table together, but combines three different stream/replay protocols, backend restrictions, and recorder work in one review.
3. Display-only mapping first, native replay later. Reject: native replay is a binding part of this effort, and provider calls must never leak into the ordinary function path.

The sequence delivers complete provider paths. File search is deferred from slice 3 across providers; a later design will address store configuration and its public API.

## Slice 3a: Anthropic

### Scope and API

Add `builtInTools` to `AnthropicTextStreamOptions` with `webSearch`, `webFetch`, and `codeExecution`. Existing SDK `0.122.0` supports these in the stable Messages client; no beta client or version change is needed.

Each property accepts `true` or provider configuration. Object configuration retains the SDK tool-version discriminator and all options unchanged; the adapter supplies the fixed tool name. `true` uses explicit compatibility defaults:

| Key             | Default native configuration                              | Contract builtin |
| --------------- | --------------------------------------------------------- | ---------------- |
| `webSearch`     | `web_search_20250305`, name `web_search`                  | `web_search`     |
| `webFetch`      | `web_fetch_20250910`, name `web_fetch`, citations enabled | `web_fetch`      |
| `codeExecution` | `code_execution_20250825`, name `code_execution`          | `code_execution` |

These are pinned defaults, not a promise of support on every model. Applications can select other SDK-supported versions through object configuration. Explicit object settings, including disabled fetch citations, are preserved. TSDoc explains defaults, model compatibility, display obligations, and the transform hook. Built-ins added through `transformRequestOptions` are mapped too.

Public types use Anthropic SDK types and normal package exports; reusable internal core helpers retain the `ɵ` prefix. No React/Angular public signature changes are needed.

### Live lifecycle and failures

Track native content blocks by index, independently from client tools and thinking:

1. `server_tool_use` starts a provider call immediately, with the native id/name, `provider: anthropic`, normalized builtin, and a running `b4.step` on START. Stream input JSON through ARGS. Preserve an initial nonempty input when no deltas arrive.
2. Closing the invocation block emits END with the current step. It does not claim execution succeeded.
3. Correlate result blocks using `tool_use_id`. Map search, fetch, Python, Bash, and text-editor result families. Emit one RESULT with settled step metadata and readable result content.
4. Typed result errors produce failed steps with native error codes. Nonzero code/Bash return codes mean failure; stderr alone does not. Keep encrypted output opaque rather than treating it as plaintext.
5. Server tools do not set the flag used to request a client tool continuation. A normal internally completed response ends as `stop`.

Map programmatic `caller.tool_id` to `parentToolCallId`. Pending provider calls can span responses when code invokes an app tool: initialize correlation from native history, retain the original call id, and allow the later result to settle it. Do not synthesize completion for `pause_turn`, invocation END, or a successful run with an unresolved call. Preserve native stop information; automatic pause continuation stays outside this slice.

Extend the shared label helper with plain wording for fetch/code/file/image capabilities. Derive query/URL details only from validated native fields. Preserve the existing 120-code-point bound and shared wording across providers.

### Native replay and content order

The current request mapper deliberately prepends thinking, joins text, and converts every tool to an app function. It cannot preserve a response such as thinking → text → server call → server result → thinking → text.

Keep complete ordered native response content in a provider history envelope, separate from public display fields. Also retain each provider invocation/result block in its call/result metadata, as required by the shared contract.

**Recommended persistence carrier:** a Hashbrown-owned CUSTOM `hashbrown.provider-history` footer. It does not change `b4.step`, its SDK, or its fixtures. Core folds it into the existing canonical owner's metadata under the same `hashbrown.provider-history` key; snapshot/history serialization then preserves it like other metadata. The value is `{v: 1, provider, ownerMessageId, responseId, complete, payload}`. Provider codecs own `payload`; Anthropic stores ordered native blocks plus the final container information. Native response ids may be supplemented by adapter-generated ids when absent.

Emit the footer after native response completion and before the run terminal. Its owner must be a canonical message created for this native response: prefer its assistant message created by text/invocation frames, then a new tool-result message for a result-only response, then its reasoning message. Give a result-only frame an explicit fresh message id so its envelope follows the preceding client results chronologically, even when its toolCallId belongs to an older response. Mark carriers with their provider/response identity, and reject a footer targeting a different response owner. One native response has one envelope owner. Repeated identical footers are idempotent; conflicting data for the same response is invalid. An empty response with no canonical content needs no envelope. Do not introduce an empty text bubble or overwrite an older response's envelope.

Core validates the footer envelope, preserves unrelated metadata, and stores the native payload without provider-SDK imports. Unknown/malformed footer versions are ignored. The footer never changes lifecycle, outcomes, or text. Request serializers validate claimed provider payloads before replay. A malformed or conflicting claimed payload fails input validation instead of sending invented content.

This explicit footer is needed because Anthropic's final container arrives in `message_delta`, after earlier block terminal events; Google's signatures can arrive in trailing empty-text fragments after call/result terminal events. Per-block metadata alone cannot reliably carry that tail. Delaying TOOL_CALL_RESULT until EOF would hide timely settlement, and synthetic text anchors could change visible message order. The footer is an additive wire extension requiring approval with this design, with real-store/snapshot tests before provider rollout.

At replay, prefer complete provider history envelopes, retain their chronological response order, and emit each native response once. Do not re-append canonical text, reasoning, calls, or provider results represented by an envelope. Ordinary client tool results remain user-role `tool_result` in their original positions. Histories with no envelope retain the legacy reconstruction path, filtering provider calls/results out of its app-function path. If an incomplete/aborted capture can still be emitted, mark it `complete: false`; a disconnected consumer may receive no footer. Never treat a missing/incomplete envelope as complete or suppress canonical content based on it. Reject unsafe native continuation if the remaining data cannot reproduce required signatures or server blocks.

Preserve signatures, redacted data, encrypted search content/indexes, encrypted code stdout, full fetch documents, and invocation caller values exactly. Restore the latest applicable final native container id to the request's `container` setting. A complete native response may contain a provider call still pending across responses: envelope completeness does not mean tool completion. Cross-provider histories never turn provider calls/results into app functions.

The footer remains display-independent and Hashbrown-specific. Other AG-UI consumers can ignore it and still receive the standard tool lifecycle and `b4.step`; Hashbrown's own history preserves the additional replay data. This does not change the B4 contract or the later plain LangGraph helper.

### Sources and citations

Search and fetch results become URL sources; code output files become file sources. Use call-scoped stable source ids such as `<toolCallId>:<nativeResultIndex>`, with a deterministic filename fallback for opaque file ids. Keep encrypted content separate from public sources.

Read citations both from initial text blocks and citation deltas. Match URL citations against known sources, preferring the nearest preceding matching source in native order. Deduplicate source identity, not citation occurrence. Citations without a collected source create an answer-level source rather than disappearing. Resolve document/search-result indices only against the corresponding native input/result collections; an index into app-supplied search results is not an index into server web search.

Carry `cited_text` as quote. Native document character/page/block positions are source coordinates, not answer spans: do not copy them into contract `start/end`. Omit `block` when the joined display representation cannot identify a reliable public text block. Retain native coordinates and individual text blocks for replay.

### Tests and acceptance

Use top-level `test(...)` with arrange/act/assert. Write failing tests before production changes. Add deterministic SDK-shaped native streams, clearly distinguished from recorded fixtures. No credentials or live recording are required.

- Success/error for all five result families, including encrypted code output and nonzero return codes.
- Immediate START, incremental ARGS, result-based settlement, empty arguments, cancellation, truncation, and pending calls across responses.
- Same-name client/provider collision and provider calls introduced by the transform hook.
- Search/fetch/file sources, duplicate URLs, source-coordinate versus answer-coordinate handling, initial and delta citations.
- Exact native two-turn replay, interleaved thinking, opaque fields, container reuse, client caller identity, tool-only/reasoning-only histories, legacy fallback, foreign-provider filtering, and input immutability.
- Drive mapper output through the real root store and history projection, then serialize the next request. Direct mapper tests alone cannot prove persistence or ordering.
- Existing Anthropic integration recordings must continue to replay successfully. They do not establish live built-in support; the new deterministic tests establish mapping/replay behavior only.

Run build, test, lint, e2e and API-report targets for Anthropic, affected core checks and conformance if core changes, and React/Angular builds for shared public-state compatibility. Update both framework provider docs and migration/API documentation as needed. Hashbrown release notes remain user-owned.

## Remaining slice 3 audits

### Google (next separate design)

SDK `@google/genai@2.19.0` supports native tool calls/responses, code execution, and grounding. Add web search, fetch, and code execution. File search is deferred from slice 3. Developer API invocation plumbing uses `includeServerSideToolInvocations`; mixed custom tools require VALIDATED rather than the existing AUTO mode. Vertex converters reject that flag, native toolCall/toolResponse parts, and file search, so the auth variants need capability-specific typing/documentation and different request plumbing.

Native streaming chunk indices are local. The installed SDK's Chat implementation retains each valid chunk Content in order, without merging signed parts. Preserve ordered Content fragments with chunk ordinal and local part index; do not deduplicate identical chunks or move signatures. Finalize the Google design around ordered native Content fragments and the footer, rather than applying Anthropic's block indexing to chunk-local indices.

Call-less grounding produces answer sources/citations/attribution, never a fabricated call. Grounding support offsets are UTF-8 byte positions within native parts; omit answer spans unless validated conversion is implemented. Search Suggestions HTML must pass through verbatim with `mustRender: true`. Google Maps is not an enabling key in the agreed capability table; full Maps attribution is not claimed by this delivery.

### Bedrock

SDK `3.1106.0` already supports `systemTool`, typed server invocation/result blocks, and citation deltas. Native `server_tool_use` determines identity. Invocation and result blocks correlate by `toolUseId`, not stream index. Native result blocks stay in assistant replay order; they must never become user app-tool results. Nova grounding can be call-less and must retain visible source links.

The current aimock `1.46.0` adapter dereferences `toolSpec` for system tools, loses `toolUse.type`, and drops provider results/citations. The existing framing shim does not repair this. Do not claim recorder coverage from that path. Use deterministic native stream tests for this session; raw native recording support is separate work if subsequently requested.

AWS now documents Nova code interpreter, but the agreed public option table defers Bedrock code execution. Keep the enabling key deferred; normalize supported native interpreter calls supplied through the transform hook without widening the public table silently.

### OpenAI and Azure

Web search is already implemented. Slice 3 also owes code execution on both adapters, plus OpenAI image generation. File search is deferred from this slice. Reuse the existing stateless replay policy and add file/container citations, result includes, failures, and shared labels.

Code execution `true` can choose an automatic container. **User decision (2026-10-22): defer file search from slice 3.** File search has no default store: OpenAI requires `vector_store_ids`, and Google's store names are semantically required despite optional SDK typing. Configuration and delivery belong in a later design; this slice adds no file-search enabling option.

Keep Azure image generation outside the enabling table for this streaming API. Its current documentation describes nonstreaming Responses image generation while explicitly excluding streaming; do not document Azure image generation as categorically absent.

## Primary references and evidence

- Installed SDK declarations and converter implementations at the versions above; provider source files under `packages/{anthropic,google,bedrock,openai,azure}/src/stream`.
- [Anthropic web-search replay](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [code execution](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool), [server-tool continuation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools).
- [Google tool circulation](https://ai.google.dev/gemini-api/docs/generate-content/tool-combination), [grounding and Search Suggestions](https://ai.google.dev/gemini-api/docs/generate-content/google-search).
- [AWS Nova grounding](https://docs.aws.amazon.com/nova/latest/nova2-userguide/web-grounding.html), [native tools](https://docs.aws.amazon.com/nova/latest/userguide/tool-built-in.html).
- [OpenAI file-search configuration/results](https://developers.openai.com/api/docs/guides/tools-file-search), [code interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter), [Azure Responses limitations](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses).

## Review gate

The user approved the separate-provider delivery and Anthropic design, including the defaults and native-history footer. Implementation follows `../plans/2026-10-22-anthropic-provider-steps.md`. Later provider designs must resolve their backend and replay-specific details before their code changes.
