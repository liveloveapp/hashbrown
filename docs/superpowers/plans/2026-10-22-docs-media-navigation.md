# Documentation media and navigation implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement the checklist in this session. Review the completed changes before finishing.

**Goal:** Embed the five approved demos, restore independent documentation scrolling, and implement the approved navigation groups with Migrations last and initially collapsed.

**Architecture:** Keep existing documentation URLs and server-rendered Markdown. Add a reusable native video figure and static public media. Keep navigation data shared between SDKs and desktop/mobile; use a native disclosure for Migrations. Diagnose the shared flex/grid shell in a browser and repair the size constraints responsible for the failure.

**Tech Stack:** Next.js, React, CSS modules, Markdown, Vitest, browser verification, existing ffmpeg outputs.

## Task 1: Reproduce scrolling

- [x] Start `npx nx serve www --port=4320` and inspect a long docs page at desktop and mobile widths.
- [x] Record dimensions and computed overflow for the shell, grid, menu wrapper, navigation, and article panel. Verify actual scroll positions before changes.
- [x] Save a repeatable browser assertion under ignored `dist` that fails on the original independent-scroll behavior. Check keyboard reachability and header position.

## Task 2: Navigation

**Files:** `www/src/components/menus/docs-menu.data.ts`, `DocsMenu.tsx`, `DocsMenu.module.css`, `www/test/menus/docs-menu.spec.tsx`.

- [x] Update the section-order test and add tests for Fundamentals, previously unlisted guides, unique links, and a closed native Migrations disclosure.
- [x] Run `npx nx test www -- --testNamePattern=docs` as supported by the target; otherwise use `npx nx test www` to observe failing assertions.
- [x] Implement Getting started, Fundamentals, Generative UI, Agent workflows, Recipes, Production guides, Model providers, Migrations using the design's exact existing-page mapping. Preserve React-only CopilotKit filtering.
- [x] Render Migrations with `details` and `summary`, without an `open` attribute. Keep all other groups visible and the help link after the groups. Add focus and expanded-indicator styles.
- [x] Re-run tests to confirm green.

## Task 3: Scrolling repair

**Files:** `www/src/components/layout/SectionShell.module.css`, `www/src/components/menus/DocsMenu.module.css`, `www/src/components/site/MobileMenu.module.css` if its measured constraints also fail.

- [x] Apply the smallest sizing changes supported by the reproduction. Use bounded grid tracks and shrinkable flex/grid children where needed; retain horizontal code scrolling.
- [x] Run the original browser assertion unchanged and confirm independent movement and access to both bottoms.
- [x] Check API and blog pages that share the shell, short desktop windows, mobile drawer open/close, and search open/close.

## Task 4: Video integration

**Files:** create `www/src/components/elements/DocsDemoVideo.tsx`, `DocsDemoVideo.module.css`, `docs-demo-media.ts`, `www/test/elements/DocsDemoVideo.spec.tsx`; update `www/src/components/docs-components.tsx`, ten matching docs files, and add `www/public/video/docs/` assets.

- [x] Add failing tests for rendered Markdown demo figures, controls, no autoplay, no full preload, dimensions, accessible label, caption track, transcript, and complete local assets for all five IDs. Assert the matching SDK pages place each demo before their first section.
- [x] Copy the existing MP4/WebM, poster, VTT, and transcript outputs into the public asset directory. Use actual result screenshots on the component and decisions pages where they clarify the outcome. Keep source media labels about scripted model responses and fixture data visible.
- [x] Implement the typed immutable media catalog and native video figure with TSDoc. Map `hb-docs-demo` in the existing Markdown component registry. Reject unknown IDs clearly rather than rendering broken sources.
- [x] Insert the matching demo after the title and short introduction of components, streaming, functions, schema, and decisions for React and Angular. Include topic-specific captions and plain-text transcripts. Preserve written instructions.
- [x] Re-run tests and verify both source formats load through Next's public paths. Check desktop/mobile sizing and native keyboard controls.

## Task 5: Validation and review

- [x] Run `npx nx build www`, `npx nx test www`, and `npx nx lint www`. Report warnings and failures. Run `npx nx e2e www` because the Markdown renderer changes; report any environmental blocker.
- [x] Inspect the final browser experience for both SDKs, including collapsed Migrations on a direct migration route and desktop/mobile video playback.
- [x] Request an independent code review, address material findings, and rerun checks affected by fixes.
- [x] Confirm `git diff --check`, inspect the final file list, and leave a reviewable change without publishing or uploading anything externally.


## Verification outcome

- Production build: `npx nx build www` passed with default Turbopack and strict TypeScript checking, prerendering all 583 static pages.
- Route report: `npx nx e2e www` passed. Coverage: 93/93 docs, 240/240 API routes, 14/14 blog routes, 108/108 share cards, and 465/465 pages with Open Graph images. All custom components, including fourteen recorded-demo embeds, rendered successfully.
- Website tests: 91 files, 556 tests passed. The nine route-export regression cases failed on the original entrypoints and now pass. Existing endpoint behavior and lifecycle cleanup-budget tests pass after extraction.
- Website lint and `git diff --check`: passed.
- Browser: independent sidebar/article scrolling, both SDKs, desktop and short mobile viewports, native Migrations keyboard controls, direct migration-page loads, video playback, all ten media pages, public media assets, API/blog layouts, search dismissal, wheel/PageDown input, and four responsive result screenshots were checked.
- Independent reviews: the screenshot sizing issue and lifecycle cleanup binding issue were fixed and re-reviewed; no material findings remain.
- Route factories live in adjacent handler modules; Next entrypoints export only supported handlers and literal configuration. Share-card content is independently testable in an adjacent content module.
- Environment: the worktree now has a local copy of the existing dependencies instead of an external symlink. Package versions and lockfiles are unchanged. Normal Nx plugin isolation avoids the Vitest environment leak caused by the earlier forced-inline plugin setting.
- Existing warnings remain for API Extractor compiler-version/forgotten exports, deprecated Nx executors and Next middleware conventions, broad Open Graph asset filesystem tracing, and the NO_COLOR/FORCE_COLOR environment conflict. Website lint emits no warnings.
- Local verification artifacts and logs are retained under `dist/docs-ui-checks/`.

## Production build follow-up

The user authorized correcting the blockers after reviewing the documentation changes.

- [x] Add a failing route-entry export contract test covering the nine rejected helper exports.
- [x] Extract growth endpoint factories into adjacent `handler.ts` modules and docs share-card content into an adjacent content module. Keep only supported HTTP handlers and literal Next configuration in route entrypoints. Update behavior tests to import the extracted helpers while retaining route configuration checks.
- [x] Replace this worktree's external dependency symlink with a local copy of the existing installation, preserving package versions and the package lock. Keep the default Turbopack configuration and strict type checking.
- [x] Run `npx nx test www`, `npx nx lint www`, `npx nx build www`, and `npx nx e2e www`. Investigate and fix any further build or route-report errors exposed by these changes.
- [x] Request a focused review of route behavior preservation and record the final results.


## Replace legacy Vimeo recordings

- [x] Inventory all documentation embeds: six remaining Vimeo instances across both SDKs.
- [x] Add failing tests for no Vimeo references, one relevant local recording per affected page, and complete debugging media.
- [x] Remove duplicated streaming embeds and use the current schema/filter recording for Structured Output. Preserve all written examples.
- [x] Record actual ATC developer-drawer interactions, edit and encode with ffmpeg, and ship a matching local debugging video with posters, captions, and walkthrough text. Distinguish this app inspector from the separate Redux DevTools integration instructions.
- [x] Verify browser playback on the six affected pages and rerun website test, lint, build, and route-report targets.


Vimeo replacement validation: all six legacy embeds are gone across both SDKs, with no Vimeo URLs in source or regenerated LLM exports. Both debugging encodes decoded without errors. All six affected pages played their local recording without errors or Vimeo requests; the debugging recording also played at mobile width. Website build, route report, lint, and all 556 tests passed. The route report rendered all fourteen documentation-demo embeds. Independent review found no material issues. Existing tooling and asset-tracing warnings remain as noted above.
