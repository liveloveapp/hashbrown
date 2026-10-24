# Google provider steps, native replay, and search attribution

Status: scoped by the user's 2026-10-23 instruction to review the existing design and implement Google next. This refines the Google audit in the approved provider delivery design. File search remains deferred across slice 3. No new dependency, live model request, recording, release notes, or other-provider implementation.

## Existing decisions and baseline

The Rules in [the shared contract](2026-10-21-b4-tool-step-contract-design.md#rules) bind this delivery. Follow [the provider design](2026-10-22-b4-provider-steps-design.md). Anthropic and the neutral `hashbrown.provider-history` footer landed in PR #715 as `ad9f9ada`. Branch `blove/google-provider-steps` starts from main `b39f70def` in the existing clean isolated worktree. Installed `@google/genai` is 2.19.0; Google baseline has 35 unit tests passing.

Use the existing approach: provider-native lifecycle events, canonical native-history persistence, exact provider replay, answer-level grounding and attribution. A display-only implementation cannot meet replay requirements; reconstructing native content from joined view text loses signatures and order. This delivery reuses the neutral footer without changing the B4 contract or core public signatures.

## Request API and backend capabilities

Add typed `builtInTools` with `webSearch`, `webFetch`, and `codeExecution`, each accepting `true` or supported native configuration. Defaults are `{googleSearch:{}}`, `{urlContext:{}}`, and `{codeExecution:{}}`. Object configuration is cloned and retained, without mutating caller input. No `fileSearch` property.

Use backend-specific exported built-in types in the existing auth union. Developer search configuration excludes `excludeDomains` and `blockingConfidence`; Vertex search excludes `timeRangeFilter`, matching SDK capability declarations. URL context and code configuration use existing SDK types on both backends. TSDoc documents backend/model differences, defaults, and mandatory Search Suggestions display. No SDK upgrade.

For Developer API built-ins, set `toolConfig.includeServerSideToolInvocations:true`. Mixed function declarations with circulation use `VALIDATED`; app-only requests retain existing AUTO behavior. Both backends support enabling search, URL context and code execution, but the installed Vertex converters reject the circulation flag and native `toolCall`/`toolResponse`. Vertex therefore retains call-less search/URL grounding and native code execution without the unsupported flag. Never fabricate a search invocation from grounding metadata.

Pass optional request context to `createGoogleRequestOptions` after its existing input/model/signal parameters. Pass actual transformed request and canonical input messages to the event mapper. Validate backend constraints after `transformRequestOptions`, including Developer-only native parts/flags and backend search fields, with actionable input errors before an SDK call. A transform can add native tools and explicit circulation; explicit supported transform settings remain authoritative. Automatically supplied defaults apply to the public built-in keys.

## Native lifecycle mapping

Select candidate zero as today. Track global chunk ordinal plus local part index; neither local index nor repeated content identifies a call across chunks.

- `toolCall` with `GOOGLE_SEARCH_WEB` or `GOOGLE_SEARCH_IMAGE` produces a provider `web_search` step; `URL_CONTEXT` produces `web_fetch`. Preserve the exact native tool type and whole Part in Google metadata. Other native tool types, including file search and Maps, remain RAW/native history without a new enabling option or claimed supported lifecycle.
- `executableCode` produces a provider `code_execution` step. Native ID wins; when absent, use an adapter-scoped stable generated ID. Stream START immediately when the invocation is observed, then ARGS and END. END retains running status.
- Correlate `toolResponse` by native ID and compatible type; code results use their ID. An ID-less code result may settle only a unique compatible pending call. Unknown IDs remain RAW; ambiguous matched results fail clearly instead of settling an arbitrary call. Recover pending invocation identity/timing from request-native history and canonical metadata for later-response results.
- `OUTCOME_OK` is success; failed/deadline code outcomes produce failed steps and readable result content. An unspecified/unknown code outcome is no evidence of success and must not create a successful result. Recognized native error values and URL retrieval failures produce failed steps. Tool-response objects have no universal SDK error schema, so inspect explicit error/status fields conservatively and retain their complete payload.
- A result emits a fresh `${messageId}:provider-result:<chunk>:<part>` canonical message ID, preserving result-only response chronology. Settlement happens before requesting later chunks, including trailing signatures.
- Provider calls never set the client-dispatch finish flag. Only `functionCall` causes client tool continuation. Same-named app tools remain app tools. Run finish/EOF do not settle unresolved provider calls.

Use the shared label table, producer timing, query/URL details from native invocation arguments, and stable call-scoped source IDs. Metadata includes `google.responseId`, `chunkIndex`, `partIndex`, `nativePart`; preserve legacy `thought` and `functionCall` markers. Native values are owned JSON, not shared mutable inputs. Preserve cancellation, cleanup-error precedence, reasoning, usage and finish metadata.

## Ordered native capture and replay

Capture each selected candidate's native `Content` fragment in arrival order, including repeated fragments, empty signed text parts, interleaved reasoning, executable code/results, native tool parts, and app function calls. Preserve all native fields. The SDK Chat implementation accumulates Content fragments this way; do not merge text parts, move signatures, or deduplicate fragments. Capture grounding/URL metadata separately for persistence and annotation provenance, without injecting response-only fields into replay Contents.

The neutral footer uses provider `google` and payload `{contents: Content[], representedMessageIds: string[]}` (with optional annotation/native response metadata as needed). Use a provider response ID when available, otherwise an adapter-owned fallback. Require consistent response identity across a response. Emit the complete footer only after normal stream completion, after reasoning/text END and before RUN_FINISHED. Aborted or failed streams emit no complete footer.

Owner choice and validation match Anthropic: assistant created by this response's text/invocation, otherwise a fresh result message, otherwise a reasoning message. Never invent an empty text owner, anchor a later result on an earlier assistant, or attach one response envelope to a different response. Mark every represented carrier. No canonical content means no footer.

At request serialization, validate the entire claimed envelope and its native required fields, JSON ownership, canonical represented IDs/roles/response markers, non-overlap, unique response owner, and result/invocation provenance. Replay complete captured Contents at the earliest represented canonical position once; suppress exactly those canonical messages and their preceding represented reasoning. Keep ordinary user content and app function results in chronological order. Preserve all opaque Part fields and IDs. Vertex rejects Developer-only native parts explicitly rather than silently stripping them.

Legacy histories retain existing reasoning/function reconstruction, but provider-marked calls/results never become app `functionCall`/`functionResponse`. Native server/code history lacking a usable complete capture must fail clearly if safe continuation cannot be established. Incomplete envelopes never suppress canonical content. Foreign-provider calls/results are filtered from app replay. A complete response can still contain a running provider invocation.

## Grounding, citations and Search Suggestions

Grounding metadata can arrive independently of content and across multiple chunks. Maintain response-wide ordered grounding-chunk references with stable source IDs, without confusing chunk-local Part indices with conversation IDs. Follow the SDK streaming contract: append every newly delivered grounding chunk, retaining duplicate entries as reference-index aliases. Deduplicate public source identity only; never use cumulative-prefix heuristics. Preserve original metadata in the native capture. Do not deduplicate native replay content.

Tool-produced URL sources belong to their step. Metadata with no provable native invocation linkage belongs on `b4.answer.sources`; do not guess ownership merely from a search-looking query. Citation references share those source IDs. Grounding web/image URLs and URL-context results become readable sources; preserve unknown provider metadata natively/RAW. Deferred Maps/file-search features gain no enabling keys or fabricated calls.

Translate grounding supports into quote-only citations using `segment.text`; retain repeated citation occurrences and deduplicate source identities. SDK segment offsets are source Part byte offsets. Omit contract start/end/block unless a separately validated mapping to public answer text exists; this delivery uses quote-only citations. Ignore invalid indices without assigning them to unrelated sources. Support metadata arriving before or after text, including sources announced before citation supports. Preserve native metadata for replay/provenance.

Carry `groundingMetadata.searchEntryPoint.renderedContent` verbatim as `{provider:'google',kind:'search-suggestions',html,mustRender:true}`. Preserve distinct required suggestion widgets, deduplicating exact repeated widgets only. Native tool-response `search_suggestions` HTML also supplies the same attribution carrier when present. Attribution is separate from sources. Do not sanitize, instrument, restyle, or execute the HTML in the adapter; document that applications must render it unchanged adjacent to the answer at full width with no link tracking. Attach cumulative annotations to TEXT_MESSAGE_END metadata. For an existing invocation-created assistant, emit a metadata-bearing TEXT_MESSAGE_END at normal completion even if no text started; core already merges this onto the real assistant owner. Verify that path through the root store and public projection. An entirely metadata-only response has no canonical assistant owner: preserve RAW metadata without fabricating an assistant or footer. Reasoning-only history can preserve native attribution in its footer without inventing an assistant annotation carrier.

## File boundaries and acceptance

- `google-history.ts`: owned native envelope codec, capture/footer and replay grouping, provider filtering and backend native-part validation; focused specs.
- `google-tools.ts`: recognized native provider invocation/result normalization, correlation-friendly IDs, labels/errors/sources; specs.
- `google-grounding.ts`: immutable response grounding/source/citation/attribution fold; specs.
- `google-request.ts`, `types.ts`, `index.ts`, `text.fn.ts`: typed request options, backend checks, plumbing and exported API.
- `google-events.ts`: immediate lifecycle, correlation, capture, annotation integration and normal completion. Keep helpers focused rather than growing one monolith.
- `google-provider-conformance.spec.ts`: deterministic mapper → real root store → public projection → JSON snapshot → native request replay, including a later-response provider result after an intervening app result.
- Both framework Google platform docs: built-ins, Vertex limits, visible citations/Search Suggestions, native persistence and legacy fallback. No release notes.

Top-level tests with arrange/act/assert and TSDoc on new reusable symbols. Observe red tests before code. Independent spec/quality review per unit and final integration review. No live calls or recordings. Existing recordings establish regression compatibility; deterministic streams establish the new native behavior.

Run Google test/build/lint/e2e/API report, core tests/build/lint/e2e/API report if core changes, React/Angular builds, existing conformance build/lint/test/browser/provider suites, and appropriate docs checks. Keep dependency builds sequential to avoid generated-output contention. Report existing warnings and intermittent failures transparently. Open and attach a focused PR; merge requires user instruction for that PR.

## Evidence

- Installed SDK `node_modules/@google/genai/dist/genai.d.ts` and node converter/Chat implementation, version 2.19.0.
- [Google tool circulation and combinations](https://ai.google.dev/gemini-api/docs/generate-content/tool-combination): native parts, signatures, matching IDs and VALIDATED mode.
- [Google Search grounding](https://ai.google.dev/gemini-api/docs/generate-content/google-search): grounding sources/supports and Search Suggestions HTML.
- Existing canonical footer reader/reducer and Anthropic implementation from PR #715.

Independent design/plan review approved after correcting grounding index aliases and the invocation-only annotation carrier.
