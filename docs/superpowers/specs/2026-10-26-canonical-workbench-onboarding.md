# Canonical onboarding and conversation fundamentals

## Approved scope and design

The user approved the recommended onboarding batch: Introduction, Quickstart,
How Hashbrown works, Messages and turns, and System instructions in Angular and
React. Continue the existing canonical plan, LLA styling, four visible panels,
bottom timeline and inert replay. Keep the user's explanatory voice, record real
SDK/provider interactions, open a PR and merge on green. No SDK release or new
dependencies.

## Learning sequence

1. **First plan:** generate the same title and two steps through an exposed
   application component. A minimal standalone Quickstart and the workbench use
   the same presentation component and props contract. This first lesson has no
   tools, acceptance, or application write; its video focuses on request, streamed
   props and trusted rendering. Introduction and How Hashbrown works share this
   focused recording, with different written explanations.
2. **Messages and turns:** retain two requests in one text-chat instance. The
   first user supplies a plan name, the follow-up refers to that name. Show the
   request envelope and retained conversation identifiers; multiple requests do
   not imply persistence. A new conversation starts empty. No tools or state write
   distract from history.
3. **System instructions:** use text chat to explain the fixed application-owned
   plan. Display a deliberately different browser instruction and the effective
   public server instruction captured at the real provider mapping callback.
   The endpoint pins trusted policy; do not imply the model itself enforces
   authorization. Two turns retain the same policy and conversation.

Add first-plan, conversation and system-instructions as explicit allowlisted
lessons, keeping all eleven existing lessons and the default unchanged. Prefer
small shared contracts and the existing capture/session machinery over separate
demo shells. A pure plan presentation component can be composed inside the
existing actionable SummaryCard and exposed alone by the minimal Quickstart.
Keep copyable Quickstart code compiled in the example host and checked against
published guide excerpts, including endpoint, framework provider and proxy.

## Evidence and recording

Both frameworks use actual Hashbrown hooks/resources and the shared OpenAI
adapter. First-plan captures actual partial props before completion. Conversation
checks inspect user/assistant messages, stable thread identity, fresh run identity,
fresh-conversation isolation and no initial request. Instructions checks compare
the browser declaration to a trace allowlist of public effective policy; capture
that trace only after the provider mapping callback has run. No credentials,
headers, raw provider input or arbitrary private instructions enter the trace.
The adapter currently maps system messages into provider `input`, rather than
`instructions`; select only the expected public system policy from that actual
mapped input. Preserve legacy WelcomeCard entry points, adding a separate
FirstPlanApp entry instead of rewriting their fixtures.
Model wording can vary; verify semantics without forcing fixture phrases onto
real output.

All three modes preserve cancellation, late-response isolation, error/recovery,
independent conversations and inert timeline replay. Fixture mode is visibly
labelled and separate from real recordings. Existing lesson checks remain green.
New deterministic text fixtures must preserve actual protocol event boundaries.

Publish six recordings (three lessons × two frameworks), each with MP4, WebM,
poster, result image, measured VTT and honest walkthrough. Preserve raw captures
and reports in unique ignored directories. Disclose filming-only pacing and
half-speed playback. Retain old welcome/conversation assets for bookmarks and
unrelated example tests; active onboarding guides use the new canonical media.

## Documentation and verification

Keep Quickstart runnable outside this repository: prerequisites, client/server
installation, component, resource/hook, framework provider, proxy, run steps and
short troubleshooting. The recording uses the corresponding component/API in the
workbench; explain the inspector wrapper without requiring it in readers' apps.
Teach messages/turns before persistence, and distinguish browser configuration,
server policy, output schemas and operation authorization. Prefer focused checked
excerpts to large API inventories. Read 2024-or-older Brian Love posts for voice.

Update both workbench overviews, README and media inventory, including stale old
coverage rows. Run affected www tests, production build, lint, full workbench
browser suite and route report. Decode both codecs, inspect frames/captions and
retain actual provider evidence. Review before PR. Merge only the current green
head, then verify deployed guides, all 36 new media files and browser playback.
