# Opt-in HTTP response retry design

Status: approved for implementation by the user on October 26, 2026.

## Problem and scope

After cancellation, b4.run retains shared run admission until real execution and
checkpoint cleanup settle. In the hosted 0.15.5 check, an immediate follow-up
received 24 conflicts over about 30 seconds before succeeding. This ownership
behavior protects canonical history. Hashbrown's HTTP transport currently marks
all non-2xx responses nonretryable, so the browser surfaces an error instead of
waiting for the admitted follow-up.

A fresh browser-origin probe against the existing hosted preview confirmed:
HTTP 409, `Retry-After: 1`, and the body
`{"error":{"kind":"request_error","details":{"code":"run_in_flight"},"message":"..."}}`.
The code is under `error.details.code`, not `error.code`.

The user selected a reusable core API rather than an ATC-only retry mechanism.
Keep retries opt-in and application-classified. Preserve existing behavior for
all callers that omit the new option. No server ownership relaxation, production
backend switch, history restoration, new cancellation button, or dependency is
part of this change.

## Approaches and recommendation

1. **Add a response retry policy to `HttpTransportOptions` (recommended).** Core
   owns HTTP response disposal, header parsing, waits and cancellation; an app
   decides which failures are safe to repeat. Angular and React already accept
   a core transport through their providers.
2. Extend `TransportError` and the runtime's generation retry machinery. This
   requires carrying HTTP response information through more layers and mixes
   admission retries with protocol failures and generation-attempt bookkeeping.
3. Export a generic transport decorator. The current transport abstraction
   exposes an event iterator rather than raw HTTP responses, so it would still
   need additional error/metadata plumbing to inspect response bodies and hints.

## Proposed public API

```ts
interface HttpTransportOptions {
  // Existing baseUrl, middleware and fetchImpl remain.
  retry?: HttpResponseRetryPolicy;
}

interface HttpResponseRetryPolicy {
  maxRetries: number;
  maxElapsedMs: number;
  shouldRetry: (context: HttpResponseRetryContext) => boolean | Promise<boolean>;
  delayMs?: number;
}

interface HttpResponseRetryContext {
  readonly status: number;
  readonly headers: Headers;
  readonly bodyText: string;
  readonly bodyTruncated: boolean;
  readonly retryCount: number;
  readonly elapsedMs: number;
  readonly retryAfterMs: number | undefined;
  readonly signal: AbortSignal;
}
```

Export the policy and context types through core's transport barrel and generated
API report, with public TSDoc. No changes to Angular/React public signatures are
needed. The header object is an isolated copy; callback mutation cannot change
the original response or request. Body text is bounded to 16 KiB of bytes before
UTF-8 decoding; classification can reject truncated data. Use EOF or one-byte lookahead to distinguish a complete
body exactly at the limit from a truncated one. A read failure or deadline expiry
is a terminal HTTP failure: do not invoke the predicate on an incomplete snapshot
or report it as complete. No live `Response` or reader is exposed to the callback.

`maxRetries` must satisfy `Number.isSafeInteger` and be nonnegative; it counts
additional physical HTTP requests within one `Transport.send`. With no policy or
`maxRetries: 0`, skip all snapshot, predicate, deadline and replay validation work
and take the existing HTTP validation path, including its current full error-body
read and displayed-message truncation. `maxElapsedMs` is a finite positive
duration no greater than the timer limit (2,147,483,647 ms).
`delayMs` is a finite nonnegative duration no greater than the same timer limit,
defaults to 1000 ms, and is used only when no valid `Retry-After` is present. Reject invalid options before sending.
`retryCount` is zero on the first rejected response and increments after each
additional request starts. `shouldRetry` must explicitly return true.

## Execution and safety

- Serialize the input and run middleware once per `send`. Repeat the captured
  URL, method, body, run/thread IDs, headers and credentials with the same owned
  abort signal. Never reconstruct messages, tool results, schema or identifiers.
  With an enabled retry policy, require the final post-middleware body to be a
  string and reject unsupported bodies before the first fetch. Snapshot the
  final request options and clone headers so later middleware-owned object
  mutation cannot change a retry. No mutable buffers, FormData or ReadableStream
  bodies are replayed. Middleware runs once as today; retries do not refresh
  authorization middleware.
- Only classify non-2xx HTTP responses before exposing headers or AG-UI events.
  A 2xx response enters the existing streaming path immediately. Never replay
  successful streams, partial output, RUN_ERROR, protocol errors, or network
  exceptions through this policy. Applications must establish that their chosen
  HTTP rejection occurred before execution; status alone does not establish it.
- Read rejected response text into a bounded snapshot, preserving the existing
  error message truncation for the final failure. Body-reading and callback work
  are abort-aware and bounded by the remaining retry time. Cancel/release each
  rejected response reader before another fetch. Await normal cleanup before
  retrying, while racing cleanup against abort and the remaining budget. If
  cancellation never settles, abort/deadline must still finish the operation
  without another fetch. Observe cleanup settlement, releasing locks after any
  pending read settles. Cancel late fetch response bodies and observe their
  cleanup without leaking rejections.
- Parse `Retry-After` as nonnegative integral delta-seconds or an HTTP date.
  Zero and past dates allow immediate retry. Malformed values, including decimal
  delta-seconds, use `delayMs`. Syntactically valid values exceeding the safe
  timer range are terminal no-retry hints, never fallback or immediate timers.
  A valid hint takes precedence over the fallback. Do not shorten a server hint
  to fit the remaining budget: return the HTTP error if it would exceed it.
- Measure elapsed budget from the first physical fetch using a monotonic clock;
  use wall time only to interpret HTTP dates. Recheck abort/count/time immediately
  before scheduling and again before starting a request. Abort removes timers
  and listeners and prevents a later request from being sent. Each send owns its
  state; disposing one transport response cannot stop another request.
- `maxElapsedMs` bounds retry decisions and scheduled waits, not the duration of
  an already-issued fetch or an accepted SSE stream. Do not terminate accepted
  model execution when this retry budget expires. Cancellation remains the
  caller's mechanism for bounding an active request.
- Predicate false/throw, exhausted count/time, or a hint outside the budget ends
  with the current HTTP failure as a nonretryable `TransportError`. A predicate
  failure must not authorize a retry or erase the status. Cancellation returns
  the existing abort outcome. Existing generation `retries` continue to govern
  other failures; HTTP budget exhaustion cannot restart through that mechanism.
  A subsequent network exception still follows existing runtime behavior, so
  this policy is not a global wall-time cap across generation attempts.

## ATC integration

Add a framework-free shared transport factory that configures the public core
API. Require status 409, request-error kind, exact `error.details.code` of
`run_in_flight`, a complete parseable JSON snapshot, and a valid positive
`Retry-After`. Use 60 maximum retries and a 60,000 ms elapsed retry budget.

Install that transport through `provideHashbrown` and `HashbrownProvider`. Keep
`/api/filter` and decision transports on their existing paths. The direct OpenAI
backend normally returns no matching admission error and keeps its behavior.
The existing loading state remains active during waiting. On expiry or any other
failure, retain the current error/Retry UI. A cancelled or retired generation
must not dispatch a late retry or overwrite the next generation.

The fixture and hosted checks exercise resource cancellation via existing
Hashbrown controls/testing surfaces; adding a new ATC Stop control is out of
scope. Reload still creates a new anonymous conversation rather than restoring
or retrying the previous one.

## Verification and documentation

Write failing tests before implementation, using the repository's top-level
`test` style and fake timers where appropriate:

- Default behavior unchanged, including non-2xx error formatting.
- Explicit predicate selection, 409/429/503 examples, rejected/malformed/truncated
  bodies, thrown predicates, and no retries for unrelated statuses.
- Delta/date/zero/past/invalid/oversized Retry-After; fallback; boundary counts,
  invalid options, time-budget exhaustion and no early send for long hints.
- Identical bytes/IDs/schema/tool results, middleware called once, and no replay
  after success headers or partial/terminal AG-UI events.
- Abort before fetch, during response reading, async predicate and delay, plus
  late fetch completion, dispose, supersession, independent concurrent sends,
  and a response whose underlying stream cancellation never resolves.
- Real chat-runtime cancellation then follow-up: admission conflicts resolve to
  one accepted run and one final response without duplicate browser tool actions.
- ATC shared configuration and Angular/React browser recovery, exhaustion/error
  UI, reload during waiting and pinned schemas across successful tool turns.

Run core build/test/lint/API report; affected ATC shared, server, Angular, React
and e2e checks, both backend builds, and browser checks for both frameworks.
Then deploy a preview and repeat real hosted cancellation/follow-up, verifying
canonical checkpoints after quiescence. Preserve production backend selection.

Document the opt-in API, application safety responsibility, two distinct retry
budgets and ATC configuration. Update the 0.15.5 validation report only after new
browser/hosted evidence exists. A normal Hashbrown package release is separate
from this design/implementation task.
