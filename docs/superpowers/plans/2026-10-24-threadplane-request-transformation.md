# Threadplane and Request Transformation Implementation Plan

> For agentic workers: use subagent-driven-development and dispatching-parallel-agents for independent source research, transformation example/recording and retirement work. Parent runs Nx, recording, compilation and generated output sequentially.

**Goal:** Replace CopilotKit learning content with accurate Threadplane integration/migration guides and publish a checked request transformation workflow with its own demo.

**Architecture:** Preserve Hashbrown's server and AG-UI boundary while documenting optional Threadplane presentation. Request transformation runs in the provider adapter with trusted server context. No new dependencies or SDK changes.

**Tech Stack:** Next markdown docs, checked React/Angular/Express examples, Vitest, Playwright and ffmpeg already installed.

- [x] Verify Threadplane package exports, AG-UI compatibility, chat ownership and real integration contracts in the local reference source. Review design/plan before implementation.
- [x] Add failing CopilotKit discovery/menu/redirect tests. Run RED, remove recipe/menu, add two permanent redirects to recipes/threadplane and update inventory. Run GREEN.
- [x] Add failing request transformation runtime tests covering immutable provider options, trusted instructions/context, preserved tools/schema/store/include and context failure. Run RED, implement checked server/runtime and framework clients. Run GREEN and strict typecheck.
- [x] Write React/Angular recipes/threadplane and migrations/threadplane using verified APIs, explicit migration steps and preserved-backend boundaries. Add content/nav tests before implementation. Avoid unverified React npm install claims.
- [x] Add request transformation recorder using actual checked clients and server; fixture only the provider. Test fixture expectations before code. Compile, run both frameworks, record React, ffmpeg encode media/captions/transcript/result screenshot, inspect assets.
- [x] Review code/content independently and fix findings. Run all www tests, lint, typecheck, production build, route report. Browser-check new docs/video/disclosures/mobile/sidebar and redirects.
- [ ] Commit, PR with validation, attach PR, wait green, merge exact reviewed head, verify production/live routes/media. No release.

Verified on main d7d59ddd plus this change: 860 www tests; strict examples; lint; production build; route report (493 OG pages); six-page desktop/mobile browser checks and all six demo asset MIME responses. Threadplane exact source snippets pass TypeScript/Angular strict templates. External source package build/install was not executed. Request transformation recording is 10.1 seconds at 1440×900 with a 920×522 result image.
