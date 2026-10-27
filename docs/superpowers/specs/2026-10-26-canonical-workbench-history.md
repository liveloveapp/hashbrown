# Canonical message history and saved text conversations

Continue the approved canonical workbench in Angular and React with two focused
lessons and four framework-specific recordings. Keep the same application-owned
two-step plan, LLA light shell, grouped sidebar, resizable paired inspector and
bottom player. The user authorized implementation, recorded demos, PR and merge
on green; the SDK release remains separate.

## Teaching boundaries

The current SDK transcript, an application-held text copy, and a browser-saved
text document are different values. Neither text copy is a canonical agent
checkpoint. This batch does not restore shared state, activities, tool history,
provider metadata, pending interrupts, server ownership or the old capture trace.

Use actual `useChat` and `chatResource` APIs and real OpenAI text streaming. No
tools or generated UI schema are registered. The endpoint pins a concise policy
about the fixed outline/record plan and remembers the plan name in the supplied
conversation. No plan step is executed. Keep the existing seventeen lessons and
default unchanged; append `message-history` and `save-text-conversations` for
nineteen lessons and thirty-eight framework paths.

## Lesson flows

### Message history

1. Name the two-step plan Lighthouse and request a brief explanation.
2. After a successful `stop`, explicitly keep a supported text copy in memory.
3. Clear the SDK transcript with `setMessages([])`. No request is sent.
4. Restore the retained assistant-ended text with the public setter. No request
   is sent; actual SDK observations show newly assigned message IDs.
5. Send a follow-up. The actual request contains the restored exchange. Replay
   shows the original request, clear/restore operations and continuation without
   another provider request or history mutation.

The copy is a deliberately narrow projection of actual completed model text, not
invented assistant content. Keep it independent from the current SDK transcript.
Initial `messages` seed a runtime once; reactive option changes do not replace
history. Explain that general `setMessages` calls can schedule generation when
the final message needs an answer. This lesson allows only empty or assistant-
ended replacement inputs, and ordinary history edits are disabled while running.

### Save text conversations

Use two app-owned saved slots, Lighthouse and Harbor, independent of the live
conversation's opaque SDK thread ID. The existing left sidebar still owns live,
in-memory conversations. A clearly labelled saved-text selector and explicit
Save, Load and Clear actions operate on the selected browser slot.

1. Complete and explicitly save Lighthouse's explanation.
2. Create a fresh live conversation, name its plan Harbor and save it to Harbor.
3. Refresh the page. Live sessions and the old trace are gone. Read saved data
   only after mounting; reading or selecting a saved slot does not call a model.
4. Load Lighthouse's validated text through `setMessages`, then send a follow-up
   in the new runtime. Save only after that reply completes successfully.
5. Inspect the saved document beside actual SDK messages and replay this page's
   restore/continuation trace. Never fabricate pre-refresh requests or timings.

Four recordings use the same named plan and controls. The save recording makes
three provider requests across independent live instances; the history recording
makes two. Verify these counts separately from HTTP requests. Local storage and
replay operations make no provider requests.

## Storage and lifecycle

Add a shared, dependency-free codec and storage boundary for these workbench
lessons. Leave existing standalone examples and their bookmarked fixture media
intact. Use a distinct namespace and one atomic `setItem` per selected slot:

```ts
{ version: 1, messages: [{ role: 'user' | 'assistant', content: string }] }
```

Reject unknown envelope fields/versions, unsupported roles/content, tool-bearing
messages, oversized documents and incomplete final turns. Bound to forty messages,
2,000 characters per message and 64,000 serialized UTF-8 bytes, leaving headroom
for the server's request envelope and a follow-up. Reject rather than truncate.
Nonempty saved text must include a user and end with an assistant. IDs are not
persisted; the SDK owns the new IDs after restoration. Empty decoded history is
safe to load, but saving an empty live transcript is disabled.

Saving or keeping a new copy requires actual SDK success: live cursor, settled
successful `stop`, supported text, no error, loading, resuming, pending interrupt
or required recovery. Idle and assistant-ended alone do not prove success.
Cancellation, truncation, filtering, refusal and errors preserve the previous
saved document. A restored copy is not evidence of a new successful generation;
Save remains disabled until a subsequent successful reply.

Read the selected slot on mount/selection/load. Catch unavailable storage getters
and get/set/remove failures. Invalid data stays untouched and cannot be silently
overwritten; an explicit Clear action affects only this namespace and slot.
Storage failure leaves the current live conversation usable and reports that
the last operation failed. No automatic writes on mount, streaming, reload,
selection, restoration, replay or failure. Browser storage is origin-local,
unencrypted application storage, not server persistence, identity or cross-tab
conflict control. Do not store secrets.

Use actual SDK pending/recovery flags to prevent text mutation from bypassing
an interrupted or acknowledged failed workflow. Switching away stops active work
through the existing safe stop helper. Angular must check `error()` before its
throwing `value()` getter and retain the last healthy observation for rendering.

## Capture and UI

Add a history-specific format and actual SDK observation to immutable workbench
frames. Capture transcript IDs/content and lifecycle flags separately from app
retained text, selected saved slot, last-read saved document and action/error
state. Support idle/replacement observations, not just loading turns. Guard stale
observations during new sends by the actual SDK user ID. Restored text appears
as current SDK history with an application restoration event, never synthesized
provider chunks or historical request frames.

The History inspector pairs actual SDK transcript/flags with the app's retained
copy and last action. Saved text pairs the last-read versioned document with
current operation/eligibility; label cached reads honestly. Requests retains
actual native bodies. State keeps the accepted application plan/revision separate.
Raw retains full selected SDK observation plus the original selected event.
Avoid repeating the entire conversation in both halves of every tab.

Every clear/keep/restore/save/load/delete/select handler guards live cursor,
activity and SDK lifecycle. Historical controls are inert even if events are
dispatched programmatically. All displayed data follows the same selected frame.
Replay, Raw and layout controls never call the provider or write browser storage.

## Verification and publication

TDD covers codec bounds/immutability, invalid/unavailable storage, save eligibility,
partial/error preservation, actual setters and capture/replay isolation. Exercise
both frameworks with deterministic HTTP provider events, including clear/load
with zero requests, two independent saved slots, hard refresh and a new SDK
identity, restored context in the next request, unsupported/corrupt data, storage
failures, stop/error/length, navigation and narrow layouts. Preserve all previous
thirty-four paths and add four (thirty-eight total).

After strict build, review and deterministic checks, record four real OpenAI
demos, then use ffmpeg for MP4/WebM, settled posters, result screenshots, measured
VTT captions and walkthroughs. Retain unique raw captures/reports. Disclose pacing
and half-speed presentation; no narration or fixture footage passed off as live.

Rewrite the four active guides in Brian's established voice, with video first,
checked source excerpts, clear lifecycle references and matching screenshots.
Update the catalog/overview/media inventory. Run affected www build/test/lint and
route checks, review, PR and attach it, merge only on current-head green checks,
then verify production pages, all twenty-four new media assets and actual native
video playback/captions. No new dependencies or SDK release.
