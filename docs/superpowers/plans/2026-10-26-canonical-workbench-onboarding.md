# Canonical onboarding implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or
> superpowers:executing-plans task by task. The user has authorized implementation,
> PR and merge on green; proceed in this session without another approval gate.

**Goal:** Make the first five learning pages in both frameworks teach the canonical
plan with real, focused recordings and a runnable standalone Quickstart.

**Architecture:** Add three bounded lessons using existing workbench sessions,
transport capture and replay. Share plan presentation between the minimal app and
workbench; reuse text session code for conversation/instructions while retaining
Magic Text behavior. Capture public effective instruction evidence at the actual
OpenAI mapping boundary.

**Tech Stack:** Existing Nx, React, Angular, Hashbrown, Express, Vitest, Playwright
and ffmpeg. No dependency additions.

## Task 1: Contracts and server evidence

Files: runtime/workbench-lessons.ts, new runtime/workbench-onboarding.ts,
server/workbench-app.ts, server/workbench-openai.ts, runtime/workbench-transport.ts,
runtime/workbench-view.ts; www/test/workbench-{server,openai,clients}.spec.* and new
www/test/workbench-onboarding.spec.ts.

- [x] Write failing tests for three allowlisted modes, first-plan UI policy without
      tools, plain text policies without UI schema/tools, forged policy removal,
      request history preservation and public trace redaction/origin.
- [x] Run focused tests with `npx nx test www -- test/<file>.spec.ts`; observe expected
      missing-behavior failures before implementation.
- [x] Add contracts, prompts and narrow public instruction evidence. Preserve
      prior eleven lessons, cancellation and secret-free capture. A custom event
      only originates from the adapter mapping callback, not a browser claim.
- [x] Expose instructions in the existing inspector without a new layout. Inspect
      both browser and effective policy with their distinct provenance.
- [x] Re-run focused tests and scoped lint; review diff.

## Task 2: Framework clients and minimal app

Files: new React PlanCard.tsx and Angular plan-card.ts; existing App/app,
Workbench/workbench and text workbench clients/session helpers. New source/guide
contract tests under www/test/docs and framework browser scenarios.

- [x] Write failing checks for actual APIs, shared component rendering and
      source-excerpt parity. Keep top-level tests and arrange/act/assert style.
- [x] Share pure plan presentation with existing SummaryCard composition and
      standalone first-plan examples. First-plan has no acceptance action/tools.
- [x] Add minimal checked client examples, preserving legacy fixture entry modes
      as needed. Compile snippets with framework providers and server setup.
- [x] Reuse bounded text lifecycle capture for conversation and instructions.
      Preserve Magic Text renderer/citation behavior. Show actual message history,
      plain text and the first lesson's fixed app context without invented writes.
- [x] Verify no initial request, streaming, two-turn retention, new-chat isolation,
      stop/replacement, error/recovery, historical inertness and navigation.

## Task 3: Browser verification and recording

Files: verify-workbench.ts, new verify-onboarding-workbench.ts,
record-workbench.ts, workbench-recording-cues.ts, recorder tests.

- [x] Extend fixture dispatch and adapter-callback evidence checks with failing
      tests. New first-plan check observes partial fields and a completed card;
      conversation checks actual envelope history and identities; instructions
      checks provider evidence on both requests.
- [x] Add all six paths to full deterministic verification. Preserve all old paths.
      Reject missing phase evidence and fixture publication.
- [x] Run builds/verification sequentially. Then record six actual provider flows
      into a unique capture directory; no fixture fallback for failed live runs.
- [x] Encode both formats with ffmpeg, measured readable captions and screenshots.
      Decode each file and visually inspect frames and result screenshots.

## Task 4: Learning pages and publication

Files: www/content/docs/{react,angular}/start/{intro,quick,how-it-works}.md,
concept/{ai-basics,system-instructions}.md, start/workbench.md, docs-demo-media.ts,
example README, docs/docs-media-inventory.md and matching docs tests.

- [x] Read older voice samples; write focused source/media guide checks first.
- [x] Replace WelcomeCard/name-greeting scenarios with the same plan. Keep
      standalone setup runnable, short explanations and useful troubleshooting.
      Lead all ten guides with matching real-framework videos.
- [x] Register six media IDs and update the fourteen-lesson overview and inventory.
      Preserve legacy media and specialized fixture tests.
- [ ] Run `npx nx test www`, `npx nx build www`, `npx nx e2e www`, and
      `npx nx lint www`. Fix failures and report existing warnings.
- [ ] Obtain scoped source/media review, commit and push; create/attach PR. Wait
      green checks on current main, merge without bypass, follow deployment and
      verify ten guides, 36 media files, overview counts and browser captions.
      Leave SDK release to the user.
