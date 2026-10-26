# Canonical recipe workbench: Magic Text, predictions and UI selection

Continue the approved canonical two-step plan workspace and its LLA four-panel
layout, bottom timeline, independent conversations, captured frames and inert
replay. The next default batch is Magic Text, predictive suggestions and UI
selection, in both Angular and React. No SDK release or new dependencies.

## Lesson contracts

- **Magic Text** uses actual `useChat` / `chatResource` and the SDK's Magic Text
  renderer. A server-owned prompt explains the application-owned two-step plan
  in bounded Markdown (heading, emphasis, two-item list, supplied documentation
  footnote). A follow-up shortens the explanation. Capture raw Markdown,
  rendered text and actual citation selection; the contextual drawer shows the
  selected reference. A reference does not prove retrieval or correctness.
  Streaming text is labelled text rather than JSON. Finalization is separate
  from success. This lesson does not change the plan merely by rendering text.
- **Predictive suggestions** uses actual structured-completion APIs. Each explicit
  send supplies a fresh context ID, prompt and immutable application snapshot;
  it is a completion for that context, not an invented chat history API. The
  model returns that ID and zero to three catalogue action IDs with bounded
  reasons. Use the same app-owned record/review/clarify actions as Decisions.
  Only fresh, successfully completed, fully validated suggestions are actionable.
  Accept explicitly updates the application revision and accepted action IDs;
  Dismiss records a presentation change without applying an action. Accepting
  one suggestion makes sibling suggestions stale because the revision changed;
  request fresh suggestions rather than applying an outdated snapshot. Repeated
  acceptance, partial/error/cancelled, stale context and already accepted IDs
  cannot write. The follow-up includes accepted actions and excludes them.
- **UI selection** uses actual UI decision APIs in candidates mode, single select,
  with the existing TypeSafe provider and exact configured model. The app owns
  the plan and both candidate components/props: plan summary and ordered steps.
  The model chooses only a known candidate ID. Whole responses are shown as
  decisions, never a fictitious stream. Preview the actual SDK-selected UI.
  A fresh confident result (threshold 0.75) can be explicitly used, updating the
  selected view and revision. Low confidence, invalid/error/cancelled responses
  offer manual choice without applying the model's result. Manual choice is
  explicit, cancels pending work, and blocks late model overwrites.

## Shared capture and presentation

Add typed recipe observations to immutable frames and messages, and narrow
store methods for recording/applying recipe results. New recipe lessons begin
with the existing fixed app-owned plan at revision zero, unlike generated plan
proposals. Preserve all eight existing lessons. Current request identity,
revision, status, abort and cursor guards remain authoritative. Keep validators
and recipe rendering helpers in focused modules rather than expanding every
branch of the shared shell. All reusable additions have TSDoc comments.

New framework clients may own their chat rendering in both live and historical
mode through a small shell extension. Historical content uses the actual SDK's
Markdown renderer or the same trusted candidate registry, with handlers disabled;
no provider/tool requests or writes occur in replay. Plain frame data must never
contain React elements, Angular views, abort controllers or secrets. The
inspector shows lesson-appropriate text/JSON, component/candidate contracts,
requests and state; the contextual panel follows the selected item, including
citations. Streaming and terminal outcomes remain distinct.

Keep the real server boundary shared between normal host, verification and
recording. Pin system instructions, schemas, tools and selection questions on
server-owned lesson IDs. Dispatch the TypeSafe selection schema in both the normal
host and live verifier; an endpoint alone cannot change decision questions. Client data cannot replace policy or candidates. Use
bounded input, same-origin checks, no initial request, disconnect cancellation
and existing admission controls. The UI selection endpoint is a decision
protocol; it must not accidentally enter an AG-UI generation route. Prediction
requests expose no tool unless actually registered by that client.

## Guides and recordings

Replace the six matching recipe guides' primary packing/shopping examples with
this workbench, in the author's 2024-and-older teaching voice. Lead with separate
framework-specific recorded demos, include result screenshots, short checked
source excerpts, setup and focused error/recovery guidance. Update both overview
guides, media catalogue and inventory. Retain legacy assets only for bookmarks
or independent fixture checks, with their source notes intact.

Six new media IDs: canonical-workbench-{magic-text,predictions,ui-selection}-{react,angular}.
Record real Hashbrown/OpenAI for text and predictions, real Hashbrown/TypeSafe
for selection. Label fixtures and never publish them as live-model output.
Use ffmpeg, 1600×1000, MP4/WebM, measured captions, posters, results and honest
walkthroughs. Preserve original captures/reports. Disclose any filming-only
pacing and half-speed playback; no fabricated typing or simulated provider output.

## Acceptance

Tests first, top-level test calls with arrange/act/assert. Cover validators,
current-context/revision acceptance, source and historical rendering, cancellation,
stale errors/results, no automatic request, manual fallback and replay with zero
network/write effects. All 22 framework/lesson paths pass deterministic browser
verification; six selected paths additionally pass real-provider semantic checks
before recording. Run www test/build/e2e/lint sequentially, decode both codecs,
check caption bounds and inspect recorded frames. Review, PR and merge only on
green; verify production guides, all 36 new media files and browser playback.
