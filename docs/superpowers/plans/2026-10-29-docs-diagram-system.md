# Documentation diagram system implementation plan

> Execute in the existing clean task worktree. The user approved the visual design and explicitly authorized implementation, audit, PR and merge; continue without another design gate.

**Goal:** Explain relationships and behavior throughout Angular and React documentation using accessible, source-backed diagrams.

**Architecture:** Server-rendered typed SVG definitions and separate graph/sequence renderers share a small client expansion frame. Markdown resolves stable catalog identifiers. Independent content families own separate catalog modules and audit records.

**Tech stack:** React, Next.js, TypeScript, CSS modules, Unified Markdown, Vitest, Playwright CLI. No graph runtime dependency.

## 1. Shared components

- [x] Add failing tests in `www/test/docs-diagrams.spec.tsx` for Markdown integration, SSR figures/SVG, multiple instances, unknown IDs and invalid edges.
- [x] Add types and validation in `www/src/components/diagrams/diagram-types.ts`, graph and sequence SVG renderers, client `DiagramFrame.tsx`, scoped CSS, shared rendering primitives and catalog resolver.
- [x] Register `hb-diagram` in `www/src/components/docs-components.tsx`; extend block normalization in `www/src/lib/rehype-concept-diagrams.ts` without changing existing tag behavior.
- [x] Run targeted Vitest and lint; verify representative graph/sequence/ERD and expanded dialog in the browser.

## 2. Full docs audit and diagram content

- [x] Audit concepts, recipes, start/guide, platform/migrations after component completion. Record every authored page in `docs/diagrams/` with add/retain/no-add rationale, placement and source evidence.
- [x] Author checked definitions in disjoint `www/src/components/diagrams/catalog/` modules; add tags and concise explanatory text to guides. Prefer shared framework-neutral definitions; preserve code, media, panels, bookmarks and teaching order.
- [x] Verify ERDs against actual TypeScript/Postgres reference files; label simplified models. Check tool location and provider/agent boundaries against the corresponding sample.
- [x] Cross-review diagrams and audit completeness. Add tests validating all catalog definitions and all documentation references, pair parity where appropriate and catalog usage.

## 3. Verification and delivery

- [x] Format touched source; run targeted tests then `nx lint www`, `nx check-docs-examples www`, `nx test www`, `nx build www`, and `nx e2e www` (production env and standard Nx environment settings).
- [x] Browser-check all five diagram families, mobile contained scrolling, keyboard open/close/focus return, multiple diagrams, and large diagram expansion. Review representative screenshots for label/connector collisions.
- [ ] Independent final review and corrections. Commit, push and create PR with actual validation evidence, attach it to this task, and merge only when required checks are green. Integrate main updates if necessary.
- [ ] Verify deployment provenance and production page/diagram behavior. Report merged PR and actual coverage. No SDK release.
