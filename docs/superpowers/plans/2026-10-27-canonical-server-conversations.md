# Canonical server conversations implementation plan

> Use superpowers:subagent-driven-development for implementation and independent reviews.

**Goal:** Add server-owned thread and public endpoint lessons to both canonical framework hosts with real streaming and recorded docs.
**Architecture:** Isolated server router reusing existing thread app/store, strict completed text codec, common guarded async controller, actual framework SDK clients and immutable history capture. Existing lessons remain intact.
**Tech Stack:** TypeScript, Express, Hashbrown React/Angular, Vitest, Playwright, ffmpeg, Next.js.

- [ ] Server/runtime contract: tests first for identity, ownership, version conflict, bounds, stream provenance and abort. Implement isolated router and common controller/capture types. Extend history app with optional immutable server snapshot and HTTP operations; lesson catalog adds two history lessons with Server/Access inspectors. Run focused tests.
- [ ] Framework bindings: tests first. Actual useChat/chatResource with loaded thread identity and guarded explicit actions. Keep LLA shell and playback. Framework root dispatch, appropriate prompts and safe inspector projections. Run tests and strict build.
- [ ] Verifier/recorder: deterministic both-framework full workflows and failure/replay guards; live-provider recordable phases, measured captions and source evidence. Extend recorder selection without paid calls until browser checks pass.
- [ ] Guides/media: read older author posts, rewrite threads/public-endpoint in both frameworks, update workbench overview/catalog registry/media inventory. Four actual recordings and image/caption/codec QA.
- [ ] Review and verify: independent spec then quality reviews; run Nx www test/build/lint/e2e and workbench matrix. Commit, push, create and attach PR, merge on green, verify exact production deployment and media. No SDK release.
