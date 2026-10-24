# Browser local tools and multimodal design

Status: reviewed design proposal; no new browser tool or media API is shipped
by this follow-up. The existing text-only transports keep their explicit
unsupported-input behavior. Scope is separate from the provider bug fixes.

## Outcome and constraints

Allow a future browser transport to use supported image/audio input and native
tool requests while preserving Hashbrown's schemas, permission interrupts,
tool execution, streaming and local-only data handling. Keep WebLLM entirely
application-owned and avoid new dependencies. An API exposed by a draft or a
browser dictionary accepting an unknown key is not evidence of model support.

## Evidence and alternatives

Chrome's shipped guide documents image/audio input and text output, exact
capability checks, and activation before a model download. Its current guide
does not advertise shipped tool output. [Chrome Prompt API guide](https://developer.chrome.com/docs/ai/prompt-api).

The October 16 draft describes declarative tools, typed tool-call content and
user-role tool responses. It remains experimental. [Prompt API draft](https://webmachinelearning.github.io/prompt-api/).

WebLLM 0.2.85 limits tool support to particular model IDs and disallows custom
system prompts/response formats with tools. Image support depends on a vision
model; audio is outside this pinned version. [Pinned request validation](https://raw.githubusercontent.com/mlc-ai/web-llm/v0.2.85/src/openai_api_protocols/chat_completion.ts).

Three approaches were considered:

1. Extend the existing experimental transports with explicit capability options.
   This preserves setup and ownership but makes the current string-only native
   session contract substantially wider.
2. Add a separate experimental typed browser transport and a common internal
   lifecycle primitive. This makes the changed stream shape and capability
   checks explicit; it adds an experimental entry point.
3. Leave translation to application adapters. This permits experiments now but
   duplicates call/result conversion and permission-sensitive lifecycle work.

Recommend option 2 for native tools and option 1 for a later text-output image
input extension. Keep the currently published factories stable while the typed
stream contract and real browser availability are established. Reconsider
unifying factories after the typed contract ships in a tested browser build.

## Capability negotiation

Expose a serializable capability result containing runtime/browser version,
input modalities, text/schema output, tools, schema-plus-tools and a reason for
unsupported or unavailable features. Separate runtime API support, model
availability/download state and verified adapter support. Unknown is distinct
from supported. Availability is checked with the exact requested modalities,
languages and tools; no automatic model download or off-device fallback.

The application explicitly enables desired capabilities. Tool creation declares
`expectedOutputs: [text, tool-call]`; restoring assistant call history and user
tool results declares `expectedInputs` containing `text`, `tool-call` and
`tool-response`, plus requested media. These are separate availability checks,
canary cases and session identity fields, not inferred from tool declarations. Tool support requires
both the typed native interface and a real canary round trip for the selected
browser/model. Property existence alone and ignored dictionary keys are
insufficient. Capability results are invalidated when browser, model,
languages, tool declarations or session options change. Selection remains
application policy; the adapter never silently removes tools or schemas.

## Tool flow and ownership

The future typed adapter accepts tool declarations from AG-UI run input. It
passes name, description and input schema to the browser, without executable
callbacks. It maps complete native tool-call IDs, names and JSON arguments to
canonical TOOL_CALL_START/ARGS/END events. Existing core validation, permission
interrupts and handlers execute the call. Browser-owned auto-execution is not
part of this design.

Null/incomplete arguments never produce TOOL_CALL_END. Unknown tools, invalid
argument objects, duplicate terminal call IDs and truncated calls produce a
non-retryable protocol error before execution. Each call is closed exactly
once; text and calls may interleave. A cancellation produces no executable call
or success after the cancellation boundary. One call failing must not execute
another call's arguments. Capability for multiple calls does not imply parallel
handler execution; the existing scheduler owns that decision.

Tool messages replay as native user-role tool-response content, correlated by
original call ID/name. Assistant history replays as typed tool-call content.
Text results are supported first. Errors map to the draft's error result, never
a successful result. A browser lacking serializable result-error support must
reject that replay explicitly. Native constructors remain inside the adapter;
public React/Angular types continue using public core/AG-UI types.

Session identity includes canonical tool declarations and requested modalities.
Any material change invalidates the session. Rehydration uses one authoritative
history path, avoiding appended history plus full-history replay duplication.
Cancellation destroys only the owned native session; WebLLM keeps interrupt and
drain ownership, and never unloads an application engine.

## Schema and tool composition

A JSON response schema controls the final answer, not executable tool arguments.
Do not send it to a tool-selection turn unless that runtime/model combination
has verified joint support. The current Ollama/model probe shows why: the model
can answer with a guessed JSON value while skipping a required lookup.

Initial typed support is tools-only or schema-only. Joint requests fail with a
specific capability error. A later explicit two-phase mode can select and run
tools, then request the final constrained answer. That mode needs a bounded
step budget, preserved history, cancellation across both phases and full agent
conformance; it must not be enabled by removing the schema silently. WebLLM's
pinned tool/system restrictions require a separate compatibility decision, not
an automatic rewrite of Hashbrown's instructions.

## Media flow

Start with user-role image parts and text output. Resolve AG-UI inline/file
sources into browser-supported Blob/ImageBitmap data using an application
resolver. Preserve order and MIME type. URL resolution requires explicit
application policy and the run AbortSignal; arbitrary remote URLs are not
fetched by the core transport. Decode failures, oversize inputs and unsupported
MIME types fail before session creation. Release owned object URLs and decoded
bitmaps after the native operation settles; do not release application-owned
resources. Cleanup covers every exit from resolution through execution: partial
multi-image resolution, decoding/validation failure, session creation failure
and cancellation all release resources acquired so far. Replaying history must re-resolve media instead of storing DOM
objects in serializable messages.

Audio input is a separate phase with GPU/model checks, bounded duration/size,
sample-rate conversion policy and explicit encoded-audio versus PCM semantics.
Video, documents, generated media and media tool results remain unsupported in
the initial implementation. No test or permission flow reads a microphone,
camera, user files or browser content automatically.

## Verification and release sequence

1. Probe the installed browser with no feature overrides beyond the existing
   local test launch settings. Save exact availability/errors and component IDs.
2. Add spec-faithful aimock-backed typed shims: text/call interleaving, null
   arguments, rejected tool names, multiple calls, denied/approved interrupts,
   result replay, error results, cancellation and session invalidation.
3. Add real browser canaries for a single read-only lookup, then error replay;
   add fixed generated-image fixtures separately. Require exact input/output
   feature checks. Unsupported hardware is reported, never counted as passing.
4. Run automatic tool execution and final UI rendering in both frameworks.
   Native tests and downloads retain separate local opt-ins and CI exclusion.
5. Ship the experimental typed API only after a real supported-browser round
   trip and an approved implementation plan. The current follow-up delivers
   the design, probes and provider fixes; it does not ship speculative tools.

## Open validation work

Windows and NVIDIA/AMD hardware are not available in this workspace. Keep those
matrix cells unmeasured and publish collection commands/metadata requirements.
A single successful image or lookup is not a quality evaluation. Track semantic
goldens, larger schemas, cold/loaded/warm timing, cancellation settlement and
model-specific combinations independently.
