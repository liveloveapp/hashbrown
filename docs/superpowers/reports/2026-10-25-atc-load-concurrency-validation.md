# ATC load and concurrent-run validation

**Production gate: blocked.** Independent conversations passed the bounded load
check, but overlapping execution on one thread can omit accepted responses from
its canonical history.
Simultaneous logical browser-tool callbacks can also generate two continuations.
Production remains on direct Hashbrown OpenAI.

## Scope

Tests ran on October 26, 2026 UTC (October 25 Pacific), against the same two
independent Vercel previews and dedicated Neon database recorded in the
[hosted validation report](./2026-10-25-atc-hosted-postgres-validation.md).
Both previews use the published b4.run 0.15.4 packages and the cancellation-enabled
artifact from `67a737bacdffd8dc71b28fcc9d0a64fb0cce42ef`.

All model calls were real OpenAI calls. Only synthetic test threads were written;
no production backend settings, dependencies, or application behavior changed.
No pruning or destructive database operations ran. Checkpoint inspection used
the public `postgresCheckpointer` API. Evidence excludes credentials, cookies,
and raw model payloads.

## Independent conversations: pass

Between `02:31:58.878Z` and `02:32:43.881Z`, the probe ran two waves at each of
1, 2, 4, and 8 concurrent conversations: 30 runs total, alternating deployments.
Each request used a new thread and user-message ID, no tools, a pinned response
schema, and a unique reference marker in a short aviation question.

All 30 returned HTTP 200 and `RUN_FINISHED`, with matching thread/run IDs,
schema-valid output, and the correct marker. Each latest checkpoint contained
exactly its own human and assistant messages. All provider metadata retained
the 4096-token cap, and all 30 provider response IDs were distinct.

| Measurement | Result |
| --- | --- |
| Successful runs | 30/30 |
| Peak concurrent conversations | 8 across two previews |
| Median validated-run duration | 4,441 ms |
| p95 validated-run duration | 5,896 ms |
| Maximum validated-run duration | 7,242 ms |

Durations include the HTTPS/model request and subsequent checkpoint inspection.
This brief, low-output sample is a bounded load smoke test, not a production
latency SLO, sustained-capacity claim, or replica autoscaling test.

## Overlapping turns on one thread: fail

For each attempt, A started a longer aviation response. Immediately after its
`RUN_STARTED` event, while its request was still active, B submitted another user
message on the same thread with the same signed visitor identity. The requests
had distinct run and message IDs.

Both initial attempts returned HTTP 200 and `RUN_FINISHED` for both requests,
with distinct provider response IDs. In both cases, only one response remained
in the canonical latest checkpoint. In one case the second human message was
also absent. Neither request received a conflict response.

- `overlap-ba4f8df2-1adb-4416-badd-0451ba5514c9`: latest state retained the first
  provider response and omitted the second human message and response.
- `overlap-f57731cb-b70a-4ca6-a727-11e24e8242d3`: latest state retained both human
  messages but only the second provider response.

A third attempt supplied the complete pending client history, including the
first human message, to B. It also returned two successful responses while the
latest checkpoint retained only the second response:
`overlap-aaa849c7-2854-4880-9de2-78b8aa19b1f1`.

The sequential control passed: A completed, then B received the complete history
including A's assistant message. Both human messages and both provider responses
remained in the latest checkpoint of
`sequential-5b9ed77d-91fa-4bd8-89b0-cdc7f5b22d75`.

“Absent from latest state” does not mean physical deletion of every historical
checkpoint. The failure is that subsequent conversation execution selects a
canonical checkpoint that omits accepted work.

Later inspection confirmed both provider responses exist across historical
checkpoints in all three attempts. Re-reading after execution settled
still found only the same single provider-response ID in latest state.

## Simultaneous browser-tool callbacks: fail

The probe first parked one `highlightAircraft` call. It then submitted identical
tool-result history, with fresh run IDs, concurrently to A and B. This models
duplicate logical delivery rather than byte-identical HTTP retries.

Both attempts returned HTTP 200 and `RUN_FINISHED` from both previews. The tool
row was answered once, and neither response introduced a new browser tool call.
Nevertheless, each request generated a different provider continuation, and only
one continuation remained in the latest checkpoint:

- `callback-race-6a5086c3-74c9-4cf4-8ddd-0588fa55bd68`.
- `callback-race-d2947669-6244-402d-8586-d04f0fd2cb72`.

This proves redundant provider execution and divergent state, not repeated
browser-side action execution. The row's `settled_at` value is not treated as
a separate defect.

An additional single attempt used byte-identical requests, including the same
run ID. That attempt produced one provider continuation and passed. A delayed
retry added no provider-response ID to canonical state. This control does not
negate the two reproductions with distinct run IDs or establish race-free identical retries
under every interleaving.

## Cause and rollout requirements

Inspection of the installed 0.15.4 runtime explains the boundary: its run
registry uses a handler-local `Map` and explicitly documents single-replica
scope. The fetch runtime constructs that registry and its resume claims per
handler. The AG-UI handler rejects a busy thread with 409 only when that local
registry already owns it. A different replica has another registry.

The Postgres tool-result store atomically accepts one answer, but that alone
does not serialize the graph continuations that consume it. Persisting shared
conversation data therefore does not provide distributed run admission.

Before enabling b4.run in production:

1. Add shared per-thread execution admission and safe stale-owner handling.
   Define whether overlapping turns are serialized or rejected with a retryable
   conflict. Ownership must cover execution and checkpoint completion, including
   work that outlives a disconnected response.
2. Make competing callbacks produce one winning continuation, including fresh
   run IDs, identical retries, delayed retries, and conflicting results. A stored
   answer must not independently authorize multiple graph resumes.
3. Verify crash/restart, expiry, and cancellation cannot let an old owner write
   over a newer checkpoint. A lease timeout alone does not establish that safety.
4. Repeat these cases against separate handlers and the actual autoscaling
   topology, checking canonical history after quiescence and on subsequent turns.
5. After correctness passes, run sustained traffic with browser-tool turns and
   provider-rate-limit scenarios against an agreed workload and latency target.

An independent read-only review confirmed the blocker and checked the harness
assumptions. Successful serial continuation, browser rendering, cancellation,
and independent-thread load remain valid; they do not establish same-thread
cross-replica execution safety.

The [sanitized evidence](./2026-10-25-atc-load-concurrency-evidence.json) records
the wave results, synthetic thread IDs, provider response IDs, and checkpoint
lineage checks without request contents or authentication material.
