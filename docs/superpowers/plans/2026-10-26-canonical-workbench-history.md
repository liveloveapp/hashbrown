# Canonical history workbench implementation plan

> For agentic workers: use superpowers:subagent-driven-development for scoped
> implementation and two-stage review. The user has already approved continuing
> the canonical design, four demos, PR and merge on green. Continue in this chat.

**Goal:** Teach explicit message replacement and browser-saved completed text in
Angular and React, using the same plan and real SDK streaming.

**Architecture:** Shared bounded text codec/storage boundary and history capture;
separate framework-owned clients; existing plain OpenAI adapter and shell; two
new modes, four verified provider recordings and four updated guides.

**Tech stack:** Existing TypeScript, Nx, React, Angular, Vitest, Playwright and
ffmpeg. No dependencies or SDK changes.

## Task 1: Contracts, capture and lesson/server integration

Create `runtime/workbench-history.ts` for text projection/codec/storage operations,
history observations and operation eligibility. Add two fixed saved slots with a
distinct namespace. Add focused top-level tests before implementation: unsupported
roles/tools, final-turn guards, UTF-8 size bounds, immutability, unknown formats,
getters/read/write/remove failures and untouched previous values.

Modify `runtime/workbench.ts` with history format, immutable SDK/app observations,
idle history replacement and clear intent/observation semantics. Test actual
replacement after completed turns, stale observations during sends, cancellation
and historical read-only guards. Do not fabricate provider output. Update
`workbench-lessons.ts`, icons/groups, `workbench-timeline.ts`, `workbench-view.ts`
focused pairs/Raw and `server/workbench-app.ts` fixed plain policy/no tools/schema.
Add exact catalog/default preservation tests (nineteen lessons). Run focused tests
and scoped lint; get spec review followed by quality review.

## Task 2: Actual Angular and React clients

Create `react/src/HistoryWorkbench.tsx` and
`angular/src/app/history-workbench.ts`; dispatch from existing workbench roots.
Use actual public chat APIs and renderer bindings. Explicit Keep/Clear/Restore
and Save/Load/Clear saved text controls share the pure contracts. Storage reads
run after mount, never during React render; no automatic writes. Restore only
assistant-ended supported text. Save only successful completed live turns.

Write failing bindings/behavior tests first. Cover two slots, controls/SDK state
following replay, setters not fabricated chunks, idle restoration, paused/recovery
guards, error/stop/length, selection and teardown. Angular preserves healthy
messages when resource value throws. Keep normal sidebar/navigation unchanged.
Use existing shell/theme; small scoped form styles only. Scoped tests/lint, parent
strict build, spec then quality review before progressing.

## Task 3: Browser verifier and recording tooling

Add `src/tools/verify-history-workbench.ts` and deterministic fixture text helper,
integrate with `verify-workbench.ts` without changing prior thirty-four paths.
Use the same real server policy for fixture and provider paths. New four paths
verify actual HTTP/provider counts, transcript replacement/restore, two saved
slots, hard refresh/new runtime, follow-up context, storage failures/corruption,
save guard on stop/error/length, zero replay writes/requests and narrow layouts.
Use precise public scrubber selection (no forced click/store injection).

Extend `record-workbench.ts` allowlist and add measured caption/poster helper with
failing phase/readability tests. Save-text recording spans a real reload and
explicitly labels the new trace. Retain unique raw captures and cross-page phase
times. Do not change earlier captions or publish fixture recordings. No paid calls
by subagents. Parent runs strict build, four new browser paths then full38 before
recording real OpenAI demos.

## Task 4: Guides, media, verification and PR

Parent writes source/media guide tests first, reads older Brian posts, and updates
`www/content/docs/{react,angular}/concept/message-history.md` and
`recipes/browser-history.md`. Use same plan, video first and result screenshot.
Preserve initial-seed vs setter, trailing-user generation, text vs canonical
recovery, JSON/saved data limits, identity and storage lifetime boundaries. Register
four IDs `canonical-workbench-{message-history,save-text-conversations}-{sdk}`;
twenty-four assets: two codecs, captions, poster/result and walkthrough each.
Update both start/workbench pages, example README and media inventory to19/38.

After implementation review, run actual4provider recordings sequentially with
builds, decode8video files, inspect stream/clear/restore/reload/final frames and
VTT phase bounds/readability. Verify all affected www tests/build/lint and route
report. Keep raw masters. Final independent review, commit/push, create+attach PR,
follow current-head checks and integrate main changes as needed. Merge on green
without bypass, then verify deployed4guides/24media hashes and native playback.
Leave SDK release to the user.
