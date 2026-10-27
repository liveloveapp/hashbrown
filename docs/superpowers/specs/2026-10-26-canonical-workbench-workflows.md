# Canonical shared state, activities, and interrupt/resume

## Authorized scope

Continue the approved canonical plan workbench in Angular and React. Add three
lessons and six real, framework-specific recordings; rewrite their six concept
guides in the user's voice. Preserve the LLA four-panel layout, bottom timeline,
selected-item drawer, independent conversations and inert playback. PR, merge on
green and verify production. No SDK release or new dependencies.

## Teaching behavior

**Shared state:** edit the plan title locally through the actual SDK `setState`.
No request occurs until Send. The real request carries that value in `state`.
The demo agent explicitly includes validated state in model context, emits a
STATE_SNAPSHOT draft, streams a real model reply and emits a STATE_DELTA on
successful completion. Show the actual SDK state, including draft/commit and
rollback on failure or stop. A follow-up sends the latest committed value.

**Activities:** the real agent sends a plan-progress ACTIVITY_SNAPSHOT and
ACTIVITY_DELTA events around actual context validation and provider completion.
Render the SDK's actual `role: activity` messages in the feed and inspect their
stable IDs, content and links. A second turn creates a new activity ID. Progress
does not prove plan steps executed; no video recording, file write or external
operation occurs. Validate activity content before rendering it.

**Interrupt/resume:** the agent streams a real plan explanation, then returns two
server-owned approval interrupts with response schemas. The SDK publishes one
local pending batch. The form binds to that original batch ID and submits every
answer together using the actual resume API. Approval resumes real model work;
denial/cancellation performs no protected work. The server validates answers
against an in-memory, expiring, thread-owned pending record rather than trusting
browser state or invented interrupt IDs. Duplicate decisions must not repeat
provider work. A follow-up stays in the same conversation. Show paused,
resuming, terminal and error states honestly; do not turn resume into a fake new
user message. A local batch token is not sent to the server or persisted.

## Agent and runtime boundaries

Direct provider adapters do not invent AG-UI workflow events or automatically
turn `state` into prompt instructions. Implement a small real local AG-UI agent
around the existing OpenAI adapter. Its protocol events describe its own actual
work. Keep model output unmodified. Own the outer lifecycle without duplicate
RUN_STARTED/RUN_FINISHED events, preserve unsuccessful finish reasons and errors,
and close/abort the delegated stream. A failed or cancelled reply must not be
marked ready or create a pending approval. Use one shared agent factory in the
normal host and verifier.

Successful delegation requires a matching terminal with plain-text finish reason
`stop`. Preserve other terminal reasons as public outcome evidence, but emit an
error path for length, refusal, content filtering, other/unknown reasons and a
missing terminal so the SDK rolls draft state back rather than committing it.
Claim server approval records atomically before awaiting provider work. Keep
bounded expiring consumed-decision tombstones: identical duplicate submissions
may reject with no new provider call; conflicting duplicates always reject.

Keep all fourteen prior lessons and the default unchanged. Append allowlisted
`shared-state`, `activities`, and `interrupts` lessons, using a distinct workflow
format and chat protocol. Pin bounded plain-text policy, no UI schema or tools,
and validate a small JSON state contract before provider work. Reuse the same
application-owned two-step plan; keep runtime shared state distinct from the
existing accepted-plan application revision.

Extend captured frames with normalized, immutable actual SDK state, activity
messages, pending batch and lifecycle flags. Do not mutate or fabricate runtime
messages. The client retains its real SDK instance during historical inspection.
All historical controls are inert; selection cannot send, resume, call tools, edit
state or advance live work. Capture requests/events, local state changes, progress,
pause and resume at meaningful timeline milestones while retaining every raw
frame. Name panes and values by their real provenance.

## Error and ownership behavior

Test synchronous state-write locking, failure/cancellation rollback, stale/late
responses, independent threads and navigation cancellation. Test incomplete,
duplicate, stale, expired, denied and cancelled approval responses, duplicate
submission, same-thread pause/send restrictions and resume recovery boundaries.
Keep endpoint decision validation separate from runtime batch ownership. Do not
claim durable checkpoint restoration, production authentication or cross-process
exactly-once effects. The in-memory demo loses pending authority on restart and
rejects orphaned answers. Local map storage must be bounded and expiring.

## Documentation and media

Lead all six guides with their own recording, focused checked excerpts and result
images. Retain precise lifecycle/reference details that remain correct; reduce
dense inventories by linking generated reference where useful. Read 2024-or-older
Brian Love posts for voice. Retain legacy Lisbon examples/assets for existing
fixtures and bookmarks, but remove them from these active guides.

Record actual OpenAI replies through actual framework SDKs. Clearly disclose
that workflow events and approvals are authored by the local agent. Separate
deterministic fixtures from provider captures; do not publish fixtures as live
footage. Preserve raw reports/masters in unique ignored directories. Publish
MP4/WebM, poster, result image, measured readable VTT and walkthrough per ID.
Use ffmpeg and existing dependencies; disclose filming-only pacing and half speed.

Final checks include www build/test/lint, all 34 framework paths and route report,
both codecs and caption bounds/readability, source/media review and green CI.
Verify deployed six guides, all 36 new media files and native playback/captions.
Update both overviews, README and media inventory to seventeen lessons.
