# Decisions in Agents Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development and superpowers:dispatching-parallel-agents for independent server/client work. Parent runs all Nx and generated-output operations sequentially.

**Goal:** Publish a checked server-side decision workflow with React/Angular tutorials and two recorded demos, then merge on green and verify production.

**Architecture:** A server-pinned schema and injected decision function route bounded AG-UI user input to fixed read-only support handlers. Express composes that workflow; TypeSafe startup supplies the real classifier. Framework clients use normal chat APIs. A dedicated recorder runs these actual clients/server with scripted decision responses, not scripted final replies.

**Tech Stack:** Existing core/TypeSafe, React, Angular, Express, AG-UI, Vitest, ngc, Vite, Playwright and ffmpeg. No new dependencies.

## Execution

- [ ] Review this plan and `docs/superpowers/specs/2026-10-24-docs-agent-decisions-design.md` against public APIs and approved scope; commit the documents.
- [ ] Add failing tests in `www/test/docs/agent-routing.spec.ts` for confidence, known errors, invalid envelopes, application ID validation, abort propagation and immutable request state. Parent observes RED before creating `www/examples/quickstart/server/agent-routing.ts`.
- [ ] Add failing HTTP tests in `www/test/docs/agent-app.spec.ts` for bounded AG-UI validation, browser policy isolation, success/clarification/error terminals and disconnect cancellation. Implement `server/agent-app.ts` and `server/agent-server.ts`; use server-only TYPESAFE_API_KEY/TYPESAFE_MODEL and pinned schema.
- [ ] Add React `react/src/AgentDecisions.tsx` and Angular `angular/src/app/agent-decisions.ts`, plus `www/test/docs/agent-clients.spec.tsx` guards for initial idle/explicit fresh requests/plain text. Parent observes RED, then agents implement. Verify actual interaction in both clients via recorder, not only static source assertions.
- [ ] Review example spec compliance and quality; run focused tests and `NX_DAEMON=false npx nx typecheck www`. If runtime imports for recorder need bundling, bundle checked server with Vite/build aliases instead of importing workspace CJS sources through bare tsx.
- [ ] Add `www/src/tools/record-docs-agent-decisions.ts`, focused browser/video helpers as needed, and www:docs-agent-decisions-demo. Compile static clients with existing ngc config. Inject only scripted classifier responses/errors into the actual server. Observe request start before terminal assertions, verify both SDKs and adverse cases before replacing public captures.
- [ ] Add failing guide/media contracts in `www/test/docs/agent-guides.spec.tsx`; rewrite both `recipes/decisions-in-agents.md` pages with exact checked files in closed disclosures and visible setup/recovery. Keep advanced AG-UI transport guidance concise and accurate.
- [ ] Record/review `agent-routing` and `agent-fallback`, including MP4/WebM/poster/VTT/transcript/result images. Add catalog metadata and update inventory/example/media READMEs. Preserve ignored capture masters and reports.
- [ ] Run www test with one worker, typecheck, lint, build and e2e. Reuse fresh dependency outputs when appropriate. Check built desktop/mobile pages, video playback, scrolling, closed source and Migrations. Review final diff.
- [ ] Create and attach PR; merge the exact green commit; verify successful production deployment, both SDK live pages and all media assets. SDK publishing excluded.
