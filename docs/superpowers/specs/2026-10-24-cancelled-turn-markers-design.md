# Explicit cancellation in model history

Status: user approved preserving cancelled requests with an explicit marker. Technical design review identified and resolved the server-snapshot provenance edge case below before implementation. This follows native tools PR #737; it changes shared conversation semantics rather than patching a native transport.

## Problem and behavior

Chrome v4 Stop tests prove teardown and reader isolation, yet a fresh session can resume the cancelled instruction because canonical input contains the original user request followed immediately by a new user request. Preserve the exact original request and committed conversation, then add a truthful runtime cancellation record before the next request. Do not promise that the model will obey the marker; verify model quality separately.

Use one internal ownership-checked cancellation transaction after existing owned tool settlements and before logical generation release. It owns immutable canonical history and the corresponding local projection using the established `toolTurnSettled` preparation pattern. Explicit Stop appends the record. Superseding input inserts it immediately before the exact first canonical message ID from the replacement send action; that replacement has already reached the reducer by effect time. Never infer cancellation by scanning unmatched user messages.

The canonical record is an assistant text message with a stable ID and versioned reserved metadata identifying runtime cancellation and its generation. Its content explicitly states runtime origin and stopped/superseded reason, e.g. `[Hashbrown runtime: The user cancelled this request before completion. Do not continue it unless the user asks again.]`. Supersession wording must describe replacement by a new request rather than pressing Stop.

Assistant role preserves chronological meaning across providers that collect system/developer content into initial instructions. The marker is a runtime fact, not a model reply or successful generation. Hide it from ordinary public assistant projections, including schema/UI parsing and reconciled projection caches. Keep it in canonical/model history. Strip reserved cancellation provenance at the shared outgoing request boundary while preserving the factual text; no native-specific history inference or metadata exposure.

## Snapshot identity

Outgoing requests omit private provenance, so an agent may echo a metadata-free
marker in MESSAGES_SNAPSHOT. Preserve locally owned cancellation provenance
only when an incoming assistant message exactly matches an existing owned
marker's ID and content and remains a plain text record with no tool calls. Never recognize a marker from its text alone. Preserve
other incoming metadata, and restore the existing owned cancellation record
rather than trusting remote replacements for its private fields. A snapshot
that omits the marker remains an authoritative deletion; do not resurrect it.
A reused ID with different role/content or added tool calls is not an exact echo and must not gain
hidden-marker status. Verify request -> metadata-free snapshot -> ordinary,
structured and UI projections remain safe and keep unrelated content exact.

## Invariants and scope

- Original user IDs/content, committed assistant/tool rounds and existing cancelled-tool results remain exact and ordered.
- Existing rollback still discards incomplete assistant/tool drafts and speculative agent state. Do not retain newly incomplete tool declarations or add draft-to-diagnostic conversions.
- Stop before inference, while streaming and during tool work records one marker for the owned live generation. Superseding input records one before the replacement fragment.
- Respect accepted final completion: a briefly retained generation object alone does not imply unfinished work. Repeated/idle Stop, stale settlements, retries, disposal/thread retirement and authoritative setMessages add no marker.
- No fabricated success event, usage/result publication, error, retry or extra model request. Existing cleanup/settlement remains intact.
- Marker IDs are stable per generation and duplicate events are inert. Validate generation ownership and exact insertion anchors; do not alter unrelated/newer generations under reentrancy.
- No public message variant, package dependency, provider-specific default, or server-terminal-cancellation change. Existing handling of provider RUN_FINISHED(cancelled) remains outside this scoped user Stop/supersession change.
- Local model suites remain opt-in and prohibited in CI. Hardware item4 remains excluded.

## Verification

Write failing unit regressions first for ownership/order/deduplication, outgoing provenance stripping, ordinary/schema/UI projection exclusion, and effect cancellation boundaries (including accepted-final race and in-flight tools). Add actual React/Angular aimock second-request assertions and native Stop/history evidence. Require exact hidden-token assertions; preserve any remaining v4 semantic failures as failures without normalizing replies or xfail.

Run core build/test/lint/API, dependent framework build/test/lint, conformance build/test/lint, both smoke-host build/lint, standard browser conformance, local native aimock and available real native Stop cases. Run browser Nx targets separately and GPU suites sequentially. Review spec then code quality; create a separate PR, merge only on exact-head green CI and verify the resulting source.
