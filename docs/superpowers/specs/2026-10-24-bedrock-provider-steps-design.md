# Bedrock provider steps and native replay

Status: scoped by the user's 2026-10-24 instruction to review the existing design and implement Bedrock next. This refines the Bedrock audit in the provider design. File search stays deferred. The public Bedrock code execution option stays deferred by the existing capability map; native interpreter calls supplied through the transform hook are supported.

## Baseline and decisions

The Rules in [the shared contract](2026-10-21-b4-tool-step-contract-design.md#rules) bind this delivery. Follow the separate-provider approach and native-history envelope in [the provider design](2026-10-22-b4-provider-steps-design.md). Google PR #730 merged as `3f91cc83`; this branch `blove/bedrock-provider-steps` starts at up-to-date main `9b4ef137`. The clean existing managed worktree is reused. Installed and declared AWS SDK is 3.1153.0; baseline Bedrock has 34 passing unit tests.

Use the same complete provider path as Anthropic and Google: native lifecycle, canonical persistence, exact native replay, annotations, documentation and deterministic tests. Display-only mapping would violate the binding replay requirement. No new dependency, runtime B4 dependency, live model call, recording, core public API, other-provider feature, or release notes.

## API and classification

Add exported `BedrockBuiltInTools` with `webSearch?: true | Omit<SystemTool, 'name'>`. True supplies `{systemTool:{name:'nova_grounding'}}`; object settings are owned and the name is fixed. The SDK currently has no other system-tool configuration fields. Preserve app tool declarations and existing auto tool choice. Document Nova/model/region/IAM requirements and mandatory display of returned citations and links. Do not hard-code model IDs or reject application functions solely by their names; a native `server_tool_use` discriminator determines provider ownership before client dispatch.

Recognize `nova_grounding` as `web_search` and transformed `nova_code_interpreter` as `code_execution`. Unknown native server tools remain provider-owned without an invented builtin. Map all native server tool calls regardless of their enabling path. Same-named ordinary app calls remain ordinary app calls. Only client calls affect the continuation finish flag.

## Lifecycle and result normalization

At `contentBlockStart.start.toolUse`, emit provider START immediately, with `toolUseId`, native name/type, running `b4.step`, producer timing and native provenance. Stream input fragments as ARGS. Closing the invocation emits END carrying its fully assembled native payload and running step; END/EOF never claims success. Native block index locates stream assembly only. Correlate results by `toolUseId`, including pending calls restored from prior canonical/native history.

A result starts through `start.toolResult` and streams through `delta.toolResult`, an array of text/JSON members. Preserve array/delta order. JSON members are already Documents, not JSON fragments: never parse their contents or merge objects. Text fragments remain ordered text members for native replay; join readable text for public content. At result block STOP, emit RESULT under a fresh `${messageId}:provider-result:<index>` message ID, before reading another chunk. Preserve result type/status and opaque payload. Unmatched results remain RAW/native capture, never synthetic app results. Reject conflicting duplicate identities and mismatched known result families instead of settling an arbitrary call. Native result type may be absent, generic server_tool_result, the invocation name, or its _result suffix (AWS documents nova_code_interpreter_result). These do not replace toolUseId identity; a result declaring a different concrete family is invalid.

Status error, explicit interpreter `isError`, or nonzero `exitCode` produces failed steps with readable error content and error code where supplied. Stderr alone is not failure. Respect explicit native success/error result evidence; no success inferred from the run ending. The native interpreter schema can occur as JSON or JSON text; public normalization can read that documented object while native capture retains the original. Use shared labels, validated query fields only, and producer timing. Calls marked provider never enter client dispatch or app-function replay.

## Native capture and binary codec

Create a focused immutable indexed stream assembler for text, client/server tool use, native results, reasoning (including redacted bytes), citations, and supported image fragments. Retain block order by native index, not grouped display order. Concatenate only fields whose SDK delta semantics are strings/bytes: text, tool input, reasoning text/signature/redacted data, and image byte fragments. Retain ordered result Document members and citation records without inventing JSON merge semantics. Citation deltas are retained in arrival order; public source identity may deduplicate independently. Unknown stream payloads remain RAW and retained as native provenance; if they cannot safely reconstruct a native ContentBlock, mark the capture unusable for continuation and reject replay clearly rather than silently suppressing canonical content.

Store ordered native `ContentBlock[]` in the neutral footer's provider-owned payload with `representedMessageIds`, optional response metadata, and capture completeness. Bedrock lacks a streamed native response ID; use an adapter-owned stable response identity. Every represented carrier has `bedrock.responseId` and native provenance. Native blocks on invocations/results remain available separately in their metadata.

Binary data needs a reversible JSON codec: encode typed bytes explicitly as base64, distinguish ordinary records from byte tags so user/native JSON cannot collide, and decode to fresh Uint8Array values. A recursively tagged value representation is acceptable. Accept only SDK JSON/bytes with owned data properties; reject cycles, accessors, nonfinite values and arbitrary classes. Omit SDK optional undefined object fields at live ingress; persisted claims must validate strictly. Never stringify a Uint8Array into a numeric-key object. Preserve signed reasoning and redacted byte order exactly through wire JSON and snapshots.

Emit the complete footer after normal iterator completion, an observed native messageStop, and closure of every begun block (including text/citation blocks implicitly opened by deltas), before RUN_FINISHED. A closed invocation followed by EOF before messageStop is truncated, not a usable complete response. Abort/error/truncation yields no complete usable capture. A complete native response can still contain a running server invocation. Prefer a real assistant text/invocation owner, then a fresh result owner, then a reasoning owner. Do not fabricate a text owner or attach later results to an earlier assistant. Empty or entirely call-less ownerless metadata remains RAW without a footer.

## Replay and validation

Reuse core's neutral envelope reader/reducer without provider SDK imports in core. Validate claimed Bedrock envelopes, codec, required native fields, represented ID uniqueness, canonical carrier roles/response markers, response ownership, no overlaps, exact invocation/result identity/type/provenance and chronology. Reject malformed/conflicting complete claims. Missing/incomplete captures never suppress canonical messages; unsafe native continuation fails with an actionable input error.

Replay the complete ordered assistant content once at the earliest represented canonical position. Suppress exactly represented text/reasoning/invocation/provider-result carriers. Keep app tool results user-role in their chronological positions, merging adjacent user messages under the existing Converse policy. Native server results remain assistant content. Resolve pending calls from native/canonical history, preserve their IDs/timing and allow a later response to settle them after intervening client results. A tool-only/reasoning-only/result-only response must replay correctly.

Legacy histories retain safe text/client-tool/reasoning reconstruction. Filter provider calls and messages (including foreign providers and future step versions) from app tool conversion. Native Bedrock provider history without a usable capture must fail closed rather than lose server payload/signatures. Never confuse a result's canonical toolCallId with evidence of its native provenance.

## Citations and sources

Fold `delta.citation` into answer annotations, including call-less Nova grounding. Preserve title, source text, full native location and sourceContent for replay. URLs from `location.web.url` or an explicit HTTP(S) `source` create stable readable sources; document locations create document sources when their native reference is usable. Native source positions are not answer offsets: public citations are quote-only from available sourceContent and omit start/end/block. Source identity deduplicates while citation occurrences remain ordered.

Sources with explicit proven native tool-result provenance belong on that step. An exact URL link may reuse a known tool source; mere adjacency, query/name similarity or a citation index never proves tool ownership. Otherwise citations produce answer-level sources. Never fabricate a provider invocation from grounding. Annotation-only updates may attach to an invocation-created assistant through TEXT_MESSAGE_END; wholly ownerless citations remain RAW. There is no Google-style HTML attribution in Bedrock.

## Boundaries, tests and documentation

- `bedrock-native.ts`: owned native JSON/bytes codec and indexed capture; focused tests.
- `bedrock-history.ts`: footer, native validation, canonical grouping/replay; focused tests.
- `bedrock-tools.ts`: provider classification, correlation, results and shared labels; focused tests.
- `bedrock-annotations.ts`: source/citation fold; focused tests.
- Existing request/types/index/text functions: public built-in option and history/context plumbing.
- Existing event mapper: lifecycle orchestration using helpers, preserving cancellation, reasoning, cleanup-error precedence, usage and finish metadata.
- `bedrock-provider-conformance.spec.ts`: mapper through real root store, public projection, canonical commit, wire JSON, snapshot restore, exact next native request, pending later result.
- Both framework Bedrock guides: defaults/capabilities, citation display, native persistence, legacy limits and recorder limitations.

Tests use top-level test with arrange/act/assert. Write and observe red before production code; independent spec then quality reviews. Deterministic SDK-shaped streams cover native tools/results/citations/binary replay. Existing aimock 1.46 cannot represent system tools/type/results/citations faithfully: run existing recordings as app-tool regressions only, without claiming built-in recorder coverage. No live recordings.

Run Bedrock test/build/lint/e2e/API report; core test/build/lint; React/Angular builds; conformance build/lint/test and sequential browser/provider suites; docs test/lint/format. Run dependency-sharing commands sequentially, including docs test (its prerequisites rebuild packages). Report all warnings, failures and reruns. Create and attach a focused PR and leave unmerged for user instruction on that PR.

## Evidence

- Installed AWS SDK 3.1153.0 declarations and Smithy schemas: SystemTool, ToolUseBlock/Start, ToolResultBlock/Start/Delta, CitationsDelta, ContentBlock and byte sources.
- [AWS Nova web grounding](https://docs.aws.amazon.com/nova/latest/nova2-userguide/web-grounding.html): systemTool name, visible citations/links, model and region limits.
- [AWS Nova built-in interpreter](https://docs.aws.amazon.com/nova/latest/userguide/tool-built-in.html): native server discriminator, result type and documented output schema.
- [AWS result deltas](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolResultBlockDelta.html): ordered text/Document members.
