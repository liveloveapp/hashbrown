# Canonical UI kits and chatbot

## Scope and accepted direction

The user approved continuing the recommended UI Kits and generative UI chatbot batch, in Angular and React, with their established writing voice, recorded demos, PR and merge on green. Reuse the clean managed worktree and LLA shell, paired inspector, bottom playback and application-owned two-step plan. No SDK release or new dependency. Later runtime, local-model and Threadplane work is separate.

We considered extending the existing generic UI root, introducing dedicated lesson clients, or retaining standalone examples with new styling. Use dedicated lesson clients with the existing transport/store/shell so the actual kit APIs and lesson boundaries remain easy to read without changing older lesson behavior.

## Interactions

- `ui-kits`: expose SummaryCard and StepsCard through actual `useUiKit` / `createUiKit`. Both propose the same bounded two-step plan; one summarizes it and the other emphasizes ordered steps. First prompt asks for SummaryCard, follow-up for StepsCard with a shorter second step. Real readContext before each response. Explicit user acceptance after completion advances revision once. The inspector shows the actual normalized kit registry/schema and chosen trusted component. Use real framework fallback components while required props resolve; do not invent streaming or claim a simulated placeholder is an observed SDK fallback.
- `ui-chatbot`: expose SummaryCard and read-only PlanReading from a kit. First turn proposes a plan, user explicitly accepts it, second turn reads the actual accepted plan/revision with readContext and renders PlanReading. Model output does not write application state. PlanReading has no acceptance action. Generated readings are model reports; State shows authoritative application data.

Both lessons use actual framework UI chat and component rendering. The source never substitutes locally generated model output in provider recordings. Keep existing standalone examples/assets for bookmarks and independent fixtures.

## Shared boundaries

Add a narrow optional UI-lesson mode to the existing store; preserve all existing SummaryCard and structured behavior. A bounded shared helper owns allowed component names, descriptions/prop schemas, pinned instructions/prompts, normalization and inspector projection. Capture the actual kit registry's safe name/description/fallback metadata and actual serialized schema from each framework; no component implementations/functions are serialized. Preserve selected component identity in immutable frames/messages rather than relabelling every captured response as SummaryCard.

The original JSON must contain exactly one permitted component and a bounded valid two-step plan before acceptance. Actions must require current source success/stop, complete original values, current turn/revision, matching component and props, active mounted root, live cursor and once-per-turn application. Read-only PlanReading can never be accepted. Reject malformed, unknown, extra/multiple components and truncated/cancelled/error outputs. SDK props readiness and successful source completion remain separate. Keep disposal, navigation and stop stale-response guards. Replay uses captured values with no requests, component callbacks or writes; earlier cards retain their own component identity.

The server pins each lesson's system, readContext catalog and exact trusted wrapper response schema, stripping browser system/developer overrides as today. Hosted and local paths share the same environment factory. No authorization or persistence is implied.

## Presentation, guides and recordings

Add both lessons to Recipes: total 26 lessons / 52 framework paths. Keep all panels visible and current responsive behavior from main #807. Use neutral LLA cards, clear labels, restrained streaming fallback, concise prompts and the existing timeline. Avoid new app context or decorative panels.

Rewrite the four UI Kits/UI chatbot guides: video first, result image, short task, minimal real API example and checked complete source links, explicit trust/state boundaries, navigation/replay. Read 2024 and older brianflove posts for the user's concise first-person plural explanatory voice. Consolidate the append-only media inventory into a current source of truth with explicit remaining runtime/local-model/Threadplane work and retained legacy assets.

Record four actual provider flows with ffmpeg through existing recorder (MP4/WebM, measured VTT, poster/result and transcript for each). Preserve actual provider output and provenance; no staged output masquerading as live. Unchanged event pacing/half-speed must be disclosed. Verify selected component transitions, real tool results, acceptance revisions, streaming and inert replay before publishing. Keep unique masters/reports in ignored capture directories.

## Completion

TDD for reusable contracts/guards/fixtures/captions; independent spec/quality/final reviews; strict workbench build, www build/test/lint, hosted build/lint, full 52-path fixture suite and route report. Decode codecs and verify captions/images, native local production playback and hashes. PR, attach, merge only with required checks green, verify exact main deployments and public four guides/24 media/hosted paths. User handles SDK release.
