# Workbench Source Explorer Implementation Plan

> Execute in this existing isolated worktree using the executing-plans and test-driven-development skills.

**Goal:** Ship the approved folder explorer with collapsed mobile navigation and a consistent light workbench aesthetic.

**Architecture:** Keep one tabbed panel across viewport changes. Render a recursive file explorer inside the Source view, with CSS container queries for its mobile disclosure. Add a light theme option to server-side highlighting for source files only.

**Tech Stack:** React, CSS modules, Shiki, Vitest/testing-library, Nx; no new dependencies.

## Tasks

1. Add failing regression tests in `www/test/workbench-panel.spec.tsx` for mobile source access, collapsed explorer, folder disclosure and focus after selection. Update existing filename expectations for the new filename/full-path split. Add source highlighting regression in `www/test/workbench-source-route.spec.ts`.
2. Run `npx nx test www --testNamePattern` or filtered positional test arguments with `--excludeTaskDependencies` to confirm the new behavior fails.
3. Add `www/src/components/workbench/WorkbenchFileExplorer.tsx` for recursive folder navigation and mobile disclosure. Integrate it in `WorkbenchSourceView.tsx`; preserve file highlights and selection semantics.
4. Update `WorkbenchPanelClient.tsx` to preserve the tabbed panel across viewport changes, use video on mobile and retain Source. Keep Live opt-in and desktop-only.
5. Update `WorkbenchPanel.module.css` with neutral workbench canvas/panels, shared mode controls, Hashbrown selection accents, contained scrolling and container-based source layout.
6. Add optional light theme to `www/src/lib/rehype-shiki.ts`, selecting it only in `workbench-source-files.ts`. Verify the route output has readable light syntax.
7. Run targeted tests, then `npx nx build www`, `npx nx test www`, `npx nx lint www`. Inspect responsive layout and review changes; fix regressions and report any external blockers or warnings.

## Verification

Completed all tasks. `NODE_ENV=production npx nx build www`, `npx nx test www --maxWorkers=2` (267 files, 2,311 tests), and `npx nx lint www` pass. The test target also checked 67 application modules from 58 docs pages. Explicit production mode avoids the local runner's nonstandard environment during prerendering.

Playwright checked the production page at 1440px, 375px and 320px: the tree is visible on desktop; mobile starts collapsed, closes after selection and restores focus; active file/mode survive resizing; code scrolls internally without widening the page. Mode controls and source links meet 44px mobile targets. Independent review passed.

The subsequent visual refinement matches the docs sidenav: Hanken Grotesk, 14px/20px file rows, 32px desktop height, 4px/12px padding, 8px corner radius, white background and soft Hashbrown selection. Folder labels use 13px/18px semibold text. Workbench file-code and chevron paths use rounded 24-unit, 2px stroke geometry. Removed highlight legend/dots and outer panel/card borders; GitHub uses an accessible icon link. Browser measurements confirm matching typography and spacing, a 44px mobile logo target, and no overflow at 320px or 375px.

Existing warnings remain in API extraction, Nx deprecations, Next middleware migration and filesystem tracing. The site's GitHub metadata request returned HTTP 403 during the browser check; source loading succeeded.

## Integration with main

Resolved conflicts with the subsequent hydration, source-cache and snippet-navigation improvements on main. Server markup retains its CSS-controlled video fallback; hydrated source pages keep one responsive tabbed panel, without mobile replay frames or observers. Deferred video posters and cached light source highlighting are preserved. Manual explorer selection clears the previous snippet scroll target.

Added regressions for mobile Source hydration and clearing snippet scroll targets. Production build, lint and all 2,396 docs tests pass after integration. Browser checks confirm mobile Source visibility, lazy source loading, the video poster, and selection persistence when resizing to desktop. Independent review found no further issues.
