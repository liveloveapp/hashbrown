# Canonical documentation workbench implementation plan

**Goal:** Ship the approved LLA workbench in Angular and React, using real Hashbrown UI chats, browser tools, incremental output, and captured-event playback.

**Architecture:** Framework clients own `useUiChat` / `uiChatResource` and trusted SummaryCard rendering. A shared immutable trace stores requests, AG-UI events, parsed UI snapshots, tool results and explicit application state changes. Replay reads snapshots only; it cannot invoke tools, send requests or apply proposals. A local server keeps OpenAI credentials and output limits off the client. The same checked clients are the canonical recording hosts.

**Scope:** The two-turn plan example, examples/threads navigation, one chat feed, bottom timeline, synchronized replay and contextual inspector. No SDK changes, release, public unmetered model endpoint, or invented live results. Capture data is session-local. Deterministic browser fixtures are labelled test infrastructure; a separate live smoke uses the real provider when credentials are available.

**Style:** Follow LLA `origin/main:docs/{brand/guidelines,design-rules}.md` and ATC tokens: light canvas, white panels, ink, cobalt selection/focus; Hanken Grotesk and JetBrains Mono, 12px gutters, 14px panels, 10px rows, 150–200ms motion and reduced-motion support.

**Review acceptance:** The far-right drawer includes Details, raw payloads and Console, with tool results/errors/cancellations. Every historical assistant card stays beside its preceding user prompt. Play/pause, previous/next and turn selection share one cursor. Live restores current state without replaying writes. The deterministic test expects a single tool continuation; live verification reports the actual request count. Recordings and reports identify their provider or fixture provenance.

## Tasks

- [ ] Add failing shared trace tests: partial chunks, independent snapshots, backward seeking, request continuation, cancellation/errors, freshness and revision-checked acceptance, thread isolation. Implement capture transport and trace model with TSDoc.
- [ ] Implement both framework clients with real UI chat, streaming SummaryCard schemas, readContext browser tool, explicit acceptance, stop/retry and shared LLA shell. Add tests before reusable behavior. Do not replay framework effects or actions.
- [ ] Add Nx build/test/lint/serve targets and real local OpenAI endpoint with server-selected model/system/limits, disconnect cancellation, bounded request validation, no credential exposure. Add endpoint tests.
- [ ] Add cross-framework browser checks using real SDKs over deterministic HTTP events; verify two requests per tool turn, JSON/props progression, acceptance, follow-up history/context, playback without network or writes, stale/incomplete/error/cancel gating, responsive and keyboard behavior. Add a live-provider smoke path and recording support.
- [ ] Document the canonical example and how to run/record both frameworks in the author's voice. Link both framework guides to the shared example without replacing unrelated tutorials.
- [ ] Run affected build, test, lint, strict template/type checks and docs route report. Review spec compliance and quality, address findings, create PR, wait for checks, squash merge on green, then verify merged revision and deployment where affected.

## Verification

Use `npx nx <target> <project>` throughout. Targeted red/green tests precede implementation. No new dependencies. Preserve prior media and previews. Review capture provenance and ensure displayed playback values come from captured data rather than a scripted teaching clock.
