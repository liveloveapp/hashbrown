# Docs Workbench Housekeeping (cleanup PR C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the low-severity debt the docs workbench audit found:

- the core API-report warning;
- about 51 MB of unused media;
- redundant source-route work;
- small panel and workbench fixes.

**Architecture:** There is no new architecture. Every task removes duplication or dead weight, or fixes a small defect, inside the existing modules.

**Tech Stack:**

- Nx monorepo, with `packages/core` and the Next.js app in `www/`.
- The workbench runtime in `www/examples/quickstart/{runtime,server,react,angular}`.
- Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-docs-workbench-integration-design.md`. Findings are in `.superpowers/sdd/2026-10-28-docs-workbench-integration/audit/`: `code-docs.md` D5, D7, D8, D9, D13–D15, D18–D22; `code-workbench.md` W6, W10, W11, W13, W14, W16 and owed items 3 and 4. Read the finding rows for the evidence. This plan rules on what to do.

## Global Constraints

- **Tests:** AGENTS.md style: top-level `test(...)` only, arrange/act/assert separated by blank lines, and write the failing test first where behavior changes.
- **TSDoc:** add a TSDoc block to every new export.
- **No new dependencies.** Never touch `.env*` files.
- **Run from the repo root:** `npx nx test www`, `npx nx lint www` and `npx nx build www`, plus the core targets for Task 1.
- **Commits:** `git commit --no-verify` (the husky hook fails locally on dotnet), only after lint and test pass. End the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Flaky timeouts:** this machine can be heavily loaded. A 5 s timeout in `workbench-source-route` or `diagram-report-failure` that passes when the file is run alone is environmental. Say so in the report; don't "fix" it by raising timeouts.

## Review Focus

1. Deleting media must not remove anything a docs page, the `DOCS_DEMOS` table, an nx target or a still-used recorder needs. The docs build and the `nx e2e www` route report would catch a dangling reference.
2. Source-route JSON for each lesson must be byte-identical before and after the highlight memoization.
3. Live retry must remount a fresh frame, not reuse the dead one.
4. See it run on the third snippet of a file must scroll Source to that snippet's lines.
5. The single origin list must produce the same CSP header string that `vercel-config.mjs` produces today.

---

### Task 1: Export `TransportErrorOptions` from core

**Files:**

- `packages/core/src/transport/index.ts:11`
- `packages/core/src/transport/transport-error.ts`
- the core API report
- the generated www reference (`www/content/reference`)

- [ ] **Step 1: Export the type.** Change the re-export to `export { TransportError, type TransportErrorOptions } from './transport-error';`, and give the interface a TSDoc block with `@public`.
- [ ] **Step 2: Verify core.** Run `npx nx build core`, `npx nx build-api-report core`, `npx nx test core` and `npx nx lint core`. The `ae-forgotten-export` warning for `TransportErrorOptions` must be gone.
- [ ] **Step 3: Regenerate the reference.** Run `npx nx collect-docs www` and commit the regenerated reference files together with any API report change.
- [ ] **Step 4: Commit** as `fix(core): export TransportErrorOptions`.

### Task 2: Delete unused media

**Files:**

- `www/public/video/docs/**`
- `www/src/components/elements/docs-demo-media.ts` (`DOCS_DEMOS`)
- `www/src/tools/record-*.ts`, `www/src/tools/record-workbench.ts:335-340`
- the tests that pin the deleted ids
- `www/README` or the media docs, if they list them

- [ ] **Step 1: Remove the overview alias.** `record-workbench.ts` no longer copies the generative-ui recording to `canonical-workbench-{react,angular}.*`.
  - Delete those two 7-file sets (mp4, webm, vtt, poster, result, transcript, capture) and their `DOCS_DEMOS` entries.
  - First check that nothing in `www/content` still references `canonical-workbench-react` or `canonical-workbench-angular` exactly. PR A removed the top video from `start/workbench.md`.
- [ ] **Step 2: Remove the 30 legacy ids** listed in owed item 4, the two stray stills (`interrupts-approval.png`, `server-threads-conflict.png`) and their `DOCS_DEMOS` entries.
  - For each retired recorder in `www/src/tools/record-docs-*.ts`: if it is not wired to an nx target, a CI workflow or another recorder, and it only produces media this step deletes, delete it with its fixtures and tests.
  - If a recorder is still wired up, or also produces kept media, keep it. Remove only its outputs for the deleted ids, or leave it alone and list it in the report.
  - Grep `project.json`, `.github/workflows` and `www/src/tools` before deleting anything.
- [ ] **Step 3: Update the tests** that pinned the deleted ids (`recipe-media.spec.ts`, `DocsDemoVideo.spec.tsx`, `structured-guides.spec.tsx`, `parser-recorder.spec.ts`, and others). Keep each spec's remaining coverage.
- [ ] **Step 4: Verify.** `npx nx build www` passes. Report the bytes removed (`git diff --stat` summary).
- [ ] **Step 5: Commit** as `chore(www): delete unused docs media`.

### Task 3: Leaner source routes and build errors

**Files:**

- `www/src/lib/workbench-source-files.ts`
- `www/src/app/workbench-source/[sdk]/[lesson]/route.ts`
- `www/src/components/workbench/workbench-lessons.ts`
- `www/src/components/workbench/WorkbenchSourceView.tsx`
- `www/src/components/docs-markdown.tsx`
- `www/src/app/docs/[sdk]/[...slug]/page.tsx`
- `www/test/workbench-source-files.spec.ts` and `www/test/workbench-source-route.spec.ts`

- [ ] **Step 1: D13.** Memoize the highlighted HTML per file path within the process, with a module-level `Map`, the way `milestoneIdCache` works.
  - Test: building two lessons that share a file highlights it once (spy on the highlighter or count calls), and the output is equal.
- [ ] **Step 2: D14.** Inside `buildWorkbenchSource`, read each file once per header.
- [ ] **Step 3: D15.** Drop the dead `WorkbenchSourceHtml.commit` from the route payload and the type.
- [ ] **Step 4: D19.** `renderDocsMarkdown` takes a page label (for example `react/concept/functions`) and passes it to `workbenchPageData`. Snippet-drift and moment errors are prefixed with it.
  - Test: a bad moment's error message names the page.
- [ ] **Step 5: D18.** Add `docsPanelSdk(sdk: string): Sdk` and `findWorkbenchLesson(id)` helpers, and replace the duplicated narrowing and finds. `WorkbenchSourceView`'s `GITHUB` is built from `GITHUB_REPO_URL` (`site/links.ts`).
- [ ] **Step 6: D22.** In the source tests, pick snippets by distinctive content instead of hard-coded line numbers, and drop the mid-test `vi.unstubAllEnvs()` calls. Replace the permanent `Element.prototype.scrollIntoView ??=` patch with a `vi.spyOn`/stub per test.
- [ ] **Step 7: Verify.** For a few lessons, the JSON from `npx nx build www` is byte-identical to the pre-change build. Compare `.next/server/app/workbench-source/**` output before and after: build once before your changes, keep a copy, then diff.
- [ ] **Step 8: Commit** as `perf(www): highlight each workbench source file once`.

### Task 4: Panel and workbench lows

**Files:**

- `www/src/components/workbench/WorkbenchPanelClient.tsx`
- `WorkbenchSourceView.tsx`
- `WorkbenchLauncherToggle.tsx`
- `WorkbenchPanel.module.css`
- `www/src/lib/markdown*` (for the snippet-range attribute)
- `www/examples/quickstart/runtime/workbench-messages.ts`
- `runtime/workbench-capture.ts`
- `tools/workbench/vercel-config.mjs`
- the sites listed in W13
- `www/src/tools/record-workbench.ts:14`
- the panel, messages and source-view specs

- [ ] **Step 1: D5.** Hold the Source fetch's `AbortController` and timer in refs, and abort them in an unmount cleanup.
  - Test: unmounting during the load aborts the fetch.
- [ ] **Step 2: D7.** A failed Live shows a "Try again" button. It clears the failure and remounts a fresh live frame (use a new `key`).
  - Test: after a ready timeout, click "Try again". A new iframe element is mounted.
- [ ] **Step 3: D8.** The tablist's `onKeyDown` handles only Enter. Space is left to the native button click.
  - Test: Space activates once.
- [ ] **Step 4: D9.** Phones must not hydrate the tabbed panel and then swap to the video.
  - Render both the narrow video panel and the tabbed panel, and switch between them with the `(max-width: 799px)` CSS media query.
  - Keep the JS `useNarrow` only to avoid mounting frames and observers while narrow.
  - The server render must not flash tabs at phone width, and the poster `<img>` must not load at phone width (`display: none` on a lazy image is enough).
  - Test the server markup: both are present, and each has the matching class.
- [ ] **Step 5: D20.** See it run scrolls Source to the clicked snippet's line range, not the file's first highlight.
  - At build, code examples on workbench snippets carry `data-lines="<start>-<end>"` from the same resolution that builds the highlights.
  - The See it run event carries that range, and `WorkbenchSourceView` scrolls to it.
  - Test: with three snippets in one file, the third snippet's See it run scrolls to its own range.
- [ ] **Step 6: D21.** Wrap the "View on GitHub ↗" arrow in `<span aria-hidden="true">`. Rename the launcher region's label to "`<title>` workbench lesson".
- [ ] **Step 7: W10.** Add a test that `load`, `seek` and `play` sent to a `mode: 'live'` host are ignored and post nothing.
- [ ] **Step 8: W11.** Keep one exported list of allowed docs origins.
  - Both the CSP builder in `vercel-config.mjs` and `isAllowedParentOrigin` use it.
  - Test: the CSP string is unchanged, and every list entry is accepted.
  - If the `.mjs` config can't import TS runtime code, make the list a small `.mjs`/JSON module that both import.
- [ ] **Step 9: W13.** Dedupe `isRecord`, and derive every open-coded `['server-threads', 'public-endpoint']` list from the `host: 'loopback'` flag that PR B added.
- [ ] **Step 10: W14.** Move `record-workbench.ts`'s doc comment above the imports.
- [ ] **Step 11: Commit** as `fix(www): tidy docs workbench panel and runtime`. Split into two or three commits if that makes review easier.
