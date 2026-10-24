# Local-model documentation implementation plan

> For agentic workers: use subagent-driven-development and dispatching-parallel-agents for independent Remote MCP retirement and local-client work. Parent runs all Nx, compilation, GPU/profile and generated-output operations sequentially.

**Goal:** Publish a checked browser-local trip-brief workflow with real recorded inference, retire Remote MCP learning pages, and merge on green. SDK release excluded.

**Architecture:** Shared schema/preparation/readiness helper, explicit React/Angular structured-chat clients using the real Chrome transport, deterministic native shims for failure contracts, and dedicated native recorder using the existing test profile. Preserve advanced media/WebLLM guidance and redirect retired URLs.

**Tech stack:** Existing core/React/Angular, TypeScript/ngc, Vitest, Vite, Playwright, native Chrome, ffmpeg, Next.js. No new dependency.

- [ ] Review spec against APIs and current native eligibility; commit spec/plan.
- [ ] Remote MCP worker: add failing navigation/content/redirect tests, parent observes RED, then remove pages/menu/inventory entries and add four permanent redirects. No SDK changes.
- [ ] Local clients worker: failing preparation/readiness/client tests, parent observes RED; implement runtime/local-models.ts, react/src/LocalModels.tsx and angular/src/app/local-models.ts. Prepare/generate/cancel/retry, stale/partial/error guard, late preparation cleanup.
- [ ] Parent strictly typechecks examples and focused tests; review source/spec compliance.
- [ ] Build dedicated record-docs-local-models.ts plus focused helpers/tests as useful. Shim both real clients for adverse contracts, then native Chrome checks both clients and records React; no recorder downloads. Reuse ffmpeg helpers and measured phases/dimensions.
- [ ] Add failing guide/media contracts; rewrite both native-browser guides with exact checked source, visible setup/results/recovery, factual advanced media/WebLLM sections and official references. Add catalog, inventory/readmes.
- [ ] Record and visually review native video, screenshots, captions/transcript and playback; retain ignored masters/reports. Verify mobile and built pages/redirects.
- [ ] Run www test (single worker), lint, typecheck, build, route report; fix blockers and review final diff.
- [ ] Create/attach PR, merge exact green head, verify production and live pages/assets/redirects. No SDK publishing or worktree cleanup that removes masters.
