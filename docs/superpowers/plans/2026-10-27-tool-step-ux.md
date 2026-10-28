# Headless tool-step UX implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development task by task, with test-first implementation and independent spec then quality review. Tests are top-level test(...) with arrange/act/assert.

**Goal:** Give Hashbrown apps pure, shared tool labels/grouping, turn summaries,
source/attribution projections and timing utilities without adding UI or dependencies.

**Architecture:** Small core model modules consume existing public calls/turns.
React and Angular re-export the same implementations and neutral public types.
No timer, wall-clock read, wire change or B4 runtime dependency.

**Tech Stack:** Existing TypeScript, Nx, Jest, React and Angular tooling.

**Spec:** `docs/superpowers/specs/2026-10-27-tool-step-ux-design.md` and the binding
Rules of `2026-10-21-b4-tool-step-contract-design.md`.

## Task 1: Call labels and grouping

Files: new `packages/core/src/models/server-tool-call-display.ts` and
`server-tool-call-display.spec.ts`.

- [x] Write failing tests for all status labels, client-first overrides, empty/throwing callbacks, own-key lookup, Unicode bounds, consecutive-success grouping, failure/denial/cancel/running barriers, exclusions, provider/kind/builtin/parent separation, phrase/fallback labels, frozen inputs and stable source ids.
- [x] Run `npx nx test core --testFile=server-tool-call-display.spec.ts --runInBand`; confirm the missing implementation failure.
- [x] Implement the public types/functions from the spec; keep phrase/source/provider readers private and documented. Do not modify exports yet.
- [x] Run the focused test and scoped lint; spec review first, then quality review. Fix findings and rerun before proceeding.
- [x] Parent commits reviewed files explicitly; no shared Git-index changes by subagents.

## Task 2: Sources, attribution and timing

Files: new `packages/core/src/models/turn-annotations.ts`,
`turn-annotations.spec.ts`, `tool-step-timing.ts`, `tool-step-timing.spec.ts`.

- [x] Write failing tests: source ids/order across assistant and call sources; same URL/different ids; first occurrence; attribution remains per assistant, including duplicate HTML under different owners and widget tokens; all inputs frozen. Timing tests cover unknown/NaN/infinite/negative values, 0/999/1000/60000 ms, 300 ms boundaries and future clocks.
- [x] Run each focused core test with `--runInBand` and confirm failure.
- [x] Implement pure collection/formatting/constants/no-flash helpers with TSDoc. Preserve attribution references verbatim. No Date.now/setInterval.
- [x] Run focused tests/scoped lint; independent spec then quality review.
- [x] Parent commits reviewed files.

## Task 3: Turn summary

Files: new `packages/core/src/models/summarize-turn.ts` and
`summarize-turn.spec.ts`.

- [x] Write failing tests for text-only working status supplied by caller, open client/server calls, latest active label, explicit awaiting/cancelled/failed, synthetic errors overriding a still-pending client call, mixed completed outcomes, call/source counts, legacy rejected results, unknown and explicit timing, input immutability and no wall-clock access.
- [x] Run `npx nx test core --testFile=summarize-turn.spec.ts --runInBand`; confirm failure.
- [x] Implement the exact spec projection using Tasks 1/2 helpers. Do not infer turn duration from tool times or turn failure from one failed tool.
- [x] Run focused tests/scoped lint; independent spec then quality review.
- [x] Parent commits reviewed files.

## Task 4: Public integration, docs and delivery

Files: `packages/core/src/models/index.ts`,
`packages/react/src/public-api.ts`, `packages/angular/src/public_api.ts`, the
existing public-package compatibility checks under `packages/{react,angular}/e2e`,
`www/content/docs/{react,angular}/concept/{activities,functions}.md`, generated
API reports under each package root, and a local upstream-gap note under
`docs/superpowers/research/2026-10-27-tool-step-upstream.md`.

- [x] Export functions/types from core and both frameworks, including existing groupTurns/Turn. Public signatures must use neutral core types and no private ɵ types.
- [x] Add a meaningful public consumer/distribution check to existing compatibility coverage where appropriate; avoid tests that only mirror export statements. Verify the helper APIs accept the frameworks' existing UI message types.
- [x] Document label/group overrides, status and timing inputs, live/settled derived state, separate per-answer attribution, and no-flash/tick policy. Keep file search deferred and add no release notes.
- [x] Record verified upstream links/current gaps; no external issue or discussion writes.
- [x] Run `npx nx test core --runInBand`, `npx nx build core`, `npx nx lint core`, `npx nx e2e core`.
- [x] Run `npx nx test react --run`, `npx nx build react`, `npx nx eslint:lint react` (the inferred lint target), and `npx nx e2e react` for its distribution target.
- [x] Run `npx nx test angular --watch=false`, `npx nx build angular`, `npx nx lint angular`, `npx nx e2e angular`.
- [x] Run `npx nx build-api-report core`, `npx nx build-api-report react`, `npx nx build-api-report angular`; inspect reports for accidental API or dependency leaks.
- [x] Run `npx nx test www`, `npx nx lint www`, `npx nx build www` for changed docs. Scope/bound workers when required and report every failure/warning accurately.
- [x] Final independent review: approved with no actionable findings.

Delivery: commit and publish the branch, then open and attach the PR; record its
URL in the chat. Keep the feature worktree for review. No merge without
authorization for this PR.

## Scope decision

On 2026-10-27 the user confirmed: UX helpers first; SUBAGENT_* lifecycle and
output attribution next. Keep the subagent state model out of this PR, and keep
file search deferred.

## Verification results

All required local checks passed on the final implementation:

- Core: 101 unit suites / 2,333 tests; 2 distribution suites / 5 tests; build and lint.
- React: 21 unit files / 213 tests; 2 distribution suites / 4 tests, including clean ESM/CJS consumers; build and inferred `eslint:lint` target.
- Angular: 24 unit files / 281 tests; 2 clean-consumer tests; build and lint.
- API reports for core, React and Angular generated successfully and were inspected. Reports and generated reference files remain ignored, following repository convention.
- Docs: 187 test files / 1,374 tests; lint and production build.
- Each implementation task passed independent specification then quality review; aggregate review found no actionable issues.

Warnings remain:

- Core lint: three existing unused destructuring warnings in `tool-step.ts`. React lint: ten existing hook dependency, overload/redeclaration and explicit-any warnings in unchanged files. No lint errors or warnings in the new helper files.
- Nx executor/Vite plugin deprecations, native Vite configuration warnings, conflicting NO_COLOR/FORCE_COLOR settings, and a local pyenv shim permission warning.
- Existing API documentation warnings (release tags, TSDoc and export/link references); first-run package API reports are created under ignored paths.
- Docs extraction also reports four helper-related external type/namespace references per framework. Minimal experiments proved that qualified imports merely rename/coalesce warnings without fixing canonical targets. Public types are already available through core's Chat namespace, standalone package API reports and strict installed consumers pass, and no source change or warning suppression was made. Experiments were reverted and core rebuilt from restored sources.
- Next.js reports the existing deprecated middleware file convention.

No dependency, protocol, release-note, file-search or subagent lifecycle changes
were made. No upstream issue/comment was posted.
