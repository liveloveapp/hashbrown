# OpenAI and Azure provider code execution

## Scope and approval

Continue the approved tool-step contract and remaining provider work described in
`2026-10-21-b4-tool-step-contract-design.md` and
`2026-10-22-b4-provider-steps-design.md` (OpenAI/Azure section). The user selected
this next slice with “Continue” after the status review. This document refines
that approved scope; the original contract's Rules remain binding.

Baseline: main `c155e8a2`, after #812 merged. Deliver code execution on OpenAI and
Azure together. OpenAI image generation is the following slice. File search,
MCP, downloads/uploads, public chat API changes, new dependencies, release notes,
and live recordings are outside this slice.

## Approach

Extend the existing provider-local request/event/input modules. Keep OpenAI's
and Azure's SDK bindings separate, with equivalent tests and matching behavior.
Small code-execution helpers keep new state-machine logic out of the already
large event mappers. Do not add an OpenAI dependency to core or introduce a
cross-provider runtime dependency merely to share these SDK-specific shapes.

Alternatives considered: rebuilding the two providers around a common Responses
engine is a broader refactor; adding native response-history footers changes
the established stateless replay policy. Neither is necessary for this slice.

## Enabling API

Both existing `*BuiltInTools` interfaces gain:

```ts
codeExecution?: true | Omit<
  Extract<OpenAI.Responses.Tool, { type: 'code_interpreter' }>,
  'type'
>;
```

`true` appends `{type:'code_interpreter', container:{type:'auto'}}`. An object
uses the native SDK configuration, cloned without mutation. Preserve app tools,
web search, structured output, reasoning, and the existing final request hook.
Append `code_interpreter_call.outputs` to includes without removing other
includes. Unsupported Azure deployments fail through the normal request path;
do not hard-code model or region lists.

## Live lifecycle and arguments

Observe `code_interpreter_call` items and native code delta/done events. Announce
START as soon as a call ID is available, with the native call name
`code_interpreter`, provider identity, and a v1 provider step whose builtin is
`code_execution`. This identity must precede any possible same-name app handler.

Keep immutable per-call state, so interleaved native calls cannot consume each
other's code. Arguments are JSON `{code:string}` when code is known, or `{}`
when none was provided. Preserve native `code:null` in results rather than
inventing empty code. Stream escaped string fragments
inside a single JSON object; never concatenate complete JSON objects. Native
code-done or the authoritative final item closes arguments and emits END once.
Backfill code when there were no deltas, and append a missing suffix only when
the native final code extends the streamed prefix. Contradictory final code is
a protocol error, not a silently rewritten argument value.

END means arguments ended, not successful execution. `in_progress` and
`interpreting` stay running. Only a native completed item produces success;
failed/incomplete items produce failure with a readable step error and result.
Do not infer failure from log text, or success from EOF/response completion.
The native completed phase event alone lacks outputs and does not fabricate a
result. Reconcile authoritative terminal-response output items when item-done
frames were absent; do not duplicate START/END/RESULT for unchanged items.
For `response.failed`, yield authoritative native call details before propagating
the enclosing run error; do not discard them through the current immediate-throw
path. A null final code means unavailable, not a contradiction of observed code.

The result retains native code, container ID, status, logs and image output
values. A later authoritative correction may update the same result identity;
it must not create a second tool result or turn a failed step successful.
Use shared code-execution labels, icon `run`, and producer timing consistent
with existing provider steps. Ordinary reasoning, app tools and finish reasons
remain on their existing paths. Provider calls do not request client tool
execution or make the enclosing turn's finish reason `tool_calls`.

## Sources and citations

Read both streamed annotations and annotations in native completed message
items/terminal output. Deduplicate identical delivery of one native annotation
using item ID, content index and annotation index, while preserving distinct
citation occurrences. Native final annotations are authoritative enrichment.
Annotations may arrive before the corresponding text delta.

Keep URL-source matching and its existing UTM normalization. Add `file_citation`
and `container_file_citation`: sources have kind `file`, native title/file ID and
container ID when supplied. Deduplicate source identity by the native file and
container tuple, not filename. Do not fabricate a download URL. A file-list
`index` is not a character offset. Only valid native character spans with an
established text-part offset produce global spans and quotes; otherwise retain
the citation/source without invented positions.
The provider references describe character indices without specifying their
Unicode unit. New file spans therefore stay absent when code-point and UTF-16
positions could differ, or interleaved text chunks make a part noncontiguous in
the merged answer. This does not change existing URL citation behavior.

Generated-file annotations belong to the assistant's `b4.answer`: they name a
file/container, not a code call. Do not guess a producing call when a container
can contain multiple executions. Native image outputs, when carrying a real
URL, may supply call-scoped URL sources. No file-search enabling option is
introduced by recognizing file annotations.

For final-message fallback, append only the native text suffix not already
streamed for that part, without duplicating text. Detect contradictory text
rather than computing citation positions against a different answer. Preserve
native source identity and annotation occurrence ownership across mixed URL and
file citations and multiple text parts. Ignore unsupported annotation shapes.

## Stateless history

Preserve `store:false` and the existing provider-call omission policy. A provider
code call and its synthetic result must never return as an undeclared function
call/result, even if its display step is missing, malformed or has an unknown
version: the provider-native `itemType` marker also identifies the call. Keep
ordinary app calls and their results, including a same-name app call without a
provider marker. OpenAI and Azure markers must not accidentally change each
other's ordinary history interpretation.

Dropping provider execution items means automatic container reuse from prior
native call context is not promised. Applications that require retained
container state supply an explicit native container ID through the typed
option. The result and file annotations expose provider container/file identity
for that purpose. Containers/files remain provider-owned and ephemeral;
Hashbrown does not implement storage or download endpoints.

## Verification and delivery

Tests are top-level `test(...)`, with arrange/act/assert separation. Verify
failure before implementation and preserve pure/immutable helper boundaries.
Request tests cover default/config cloning, combined includes/app tools/schema
and option-off behavior. Mapper tests validate AG-UI schemas, immediate START,
partial JSON, interleaved IDs, no-delta fallback, final reconciliation, duplicate
frames, success/failure/incomplete, EOF/abort and source/citation edge cases.

For each provider, drive mapped events through the real root store with
`reducers` and `ɵprepareRootAction`, inspect public calls/answers, restore the
native snapshot, then serialize a second request. Assert outcome/error/source
identity, provider-vs-client dispatch, exact app-call preservation, stateless
provider omission and unchanged inputs. Direct mapper tests alone are not
sufficient. Extend the existing HTTP/SDK request seam without a live key.

Run unit/build/lint/e2e/API-report targets for OpenAI and Azure, core unit/build/
lint and React/Angular builds for compatibility, and docs test/lint/build. Keep
dist-writing dependency builds sequential. Report warnings and genuine limits;
do not describe deterministic fixtures as live provider qualification.

Update the four framework OpenAI/Azure platform guides with enabling, results,
file handling and the explicit stateless container policy. Open and attach a
focused PR; no automatic merge without authorization for this new PR.

## Primary evidence

- Installed `openai` SDK declarations: code-call statuses, delta/done events,
  code-output include, native tool configuration and file annotation fields.
- [OpenAI Code Interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter):
  automatic/explicit containers and generated-file identity.
- [OpenAI streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events).
- [Azure Responses](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses):
  native code-interpreter enabling and containers.
- Existing stateless request/input modules and the binding shared contract.
