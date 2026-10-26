# Application-controlled Chrome tool phases

The user approved designing and implementing application-controlled tool phases
on October 25, 2026, through PR, green CI, merge and verification. Continue in
the existing worktree/PR #749; no dependencies or package release. This follows
the failed broad and bounded model-led UI samples, whose evidence stays intact.

## API

Add an optional synchronous `toolPhase(context)` to
`ExperimentalChromeToolsTransportOptions`. It returns a `ChromeToolPhase`:
`{ type: 'tool', name: string }` or `{ type: 'finalize' }`.
Require `schemaFinalization: 'after-tool-planning'` and a response schema when
using this selector. Without the option, preserve existing behavior exactly.

Export TSDoc-documented public `ChromeToolPhase`, `ChromeToolsTurnContext` and
`ChromeToolPhaseResult` types. The deeply owned/frozen context contains threadId,
runId, userMessage `{ id, content }`, and `completedCalls` since the most recent
actual canonical user message. A completed call contains callId, name, arguments
(a readonly JSON object) and `result: { type: 'success' | 'error', text: string }`.
Keep result text raw; do not infer success from parsed content. Require an actual
user message for this opt-in and reject otherwise. Use original canonical roles,
not native translated tool responses (which have user role).

Evaluate once per send, after validation of the full canonical input/history and
before native capability checks, downloads or session creation. Validate and own
the returned decision. Callback throws/malformed decisions fail before native
resources. Context is request-local and contains no shared phase counter. The
application may choose another tool, finalize or throw after an error result;
Hashbrown does not advance on success/error automatically.

## Phase semantics

For a tool phase, expose exactly the selected declared tool to Chrome. Preserve
full canonical history, including completed calls to other tools. Hide planning
prose. Buffer and validate the entire native turn before emitting executable
calls: require exactly one call to the selected tool. Reject no calls, duplicates,
multiple calls, other names or malformed output before any handler executes.
Disable call-free automatic finalization in this mode. Framework handlers,
argument schemas and application permission gates remain the execution boundary.

For finalization, permit zero executable calls and constrain the complete authoritative input
directly with the existing response schema. Stream through existing Skillet/UI
renderers. Reject every non-text chunk and do not perform another planning pass.
Chrome requires nonempty declarations to replay typed tool history. Retain only
exact declarations referenced by validated historical calls (including prior
turns and errors), in original catalog order. Retain none when history contains
no calls. These declarations initialize native replay; finalization accepts no
executable call, including retained names, even after partial text. Capability
metadata must report actual native declarations.

Retain the existing schema and component catalog; this feature controls tool
phases and does not guarantee component cardinality or model quality.

Explicit phases append one private native user directive to the same prompt,
after the complete unchanged canonical-history prefix. The tool directive names
the selected tool with JSON quoting and requests exactly one call; the terminal
directive says the application completed its tools and requests only the final
schema answer. Select the phase from original canonical input before appending.
These instructions are visible in raw native evidence but never enter selector
context, canonical framework history or renderer output. They add no inference
pass and do not replace strict call validation or model-quality qualification.

Validate history against the full supplied catalog before narrowing active tool
declarations/new-call validation. Preserve all historical IDs for uniqueness.
Retain native typed call/result replay, resource bounds, timeouts, cancellation,
canonical markers and disposal. Do not flatten history to prose, repair output,
silently restore tools, add hosted fallback or retry unchanged samples until green.

## Feasibility and evidence

The initial native gate passed selected follow_secret replay after lookup, but
Chrome rejected typed history with zero declarations during finalization. The
reviewed compatibility adjustment above preserves the application execution
boundary and typed history. It does not silently restore executable permissions.
A separate retained-declaration probe accepted replay but failed exact property
extraction; keep that quality failure and qualify actual framework workflows.
Do not flatten history, insert dummy tools or restore unused declarations.

Test first: immutable current-turn context, raw success/error results, previous
turn exclusion, missing user/schema, malformed/unknown phase, callback throws,
exact declarations and phase prompts, exactly-one-call atomic validation,
terminal rejection, abort/dispose, IDs, interleaved turns and unchanged defaults.
Add aimock contracts through both actual frameworks for lookup, dependent and
nested UI, no-tools direct answer, replay and Stop/recovery; retain existing
model-led 22 contracts and broad-failure research. Local suites remain uncached,
opt-in, single-worker and refuse CI.

Use the existing downloaded profile/production hosts for a native compatibility
probe, then two predetermined full native phase workflow samples against the
same code/instructions/assertions. Retain every result. Run affected package
build/test/lint/API and standard/provider/local regressions, review source and
spec, wait for exact-head CI and merge only with the selected native gate met.
A native quality failure requiring a change in scope must return to the user.
