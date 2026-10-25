# Documentation Learning Paths Implementation Plan

> For agentic workers: use subagent-driven-development for scoped stage implementation and dispatching-parallel-agents for independent review. Parent owns all Nx, compilation, generated outputs, recording and delivery sequentially.

**Goal:** Complete four approved documentation follow-ups in order and deliver verified live guides.

**Architecture:** Small checked examples under www/examples/quickstart, real framework APIs, explicit fixture boundaries and recorded browser interactions. Reuse established video encoders and source disclosures. Keep the existing navigation and stable URLs.

**Tech Stack:** React, Angular, Skillet, existing Vitest/Playwright/Vite/Nx/ffmpeg; no new repository dependencies.

- [ ] Review spec and actual parser/chat APIs; read Brian's older writing; independently review plan.
- [ ] Parser: write meaningful failing tests for stream data/state and source contracts, observe RED, implement shared runtime plus React/Angular clients, compile and verify real parser behavior. Rewrite both recipes with exact source/disclosures. Record and inspect separate actual framework demos and accessible media.
- [ ] Chatbot: write failing application-rule/tool/UI tests, observe RED, implement shared local-light domain and real React/Angular UI chat clients. Verify tool read -> trusted proposal -> explicit Apply -> follow-up, errors, invalid/stale props, cancellation and mobile. Rewrite guides around checked files, record separate actual demos and inspect companions.
- [ ] Audit: inspect both SDK learning paths and API references, document concrete findings, fix prerequisites/version/API/link/repetition issues, add meaningful route/content guards only where needed. Preserve routes and navigation.
- [ ] Overview/platforms: verify source-backed capability statements, simplify comparisons and ownership guidance, link to relevant checked tasks, mark deliberate video exceptions. Update media inventory.
- [ ] Run www test/lint/typecheck/build/e2e sequentially. Verify built pages/media on desktop/mobile, scroll regions, source disclosures and Migrations last/collapsed. Independent final code/content/media review.
- [ ] Commit/push, PR and attach, wait for all required checks and merge exact reviewed head. Verify merged production deployment and canonical pages/media. Leave SDK release to user; preserve raw captures and masters.
