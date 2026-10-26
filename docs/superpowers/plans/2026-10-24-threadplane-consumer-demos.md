# Threadplane Consumer Verification and Demo Implementation Plan

> For agentic workers: use dispatching-parallel-agents for independent source/consumer research and document review; parent owns source builds, installation, Nx/generated output and recording sequentially. Apply subagent-driven-development for isolated code/doc tasks.

**Goal:** Verify installed Angular/React consumers, repair installation gaps, and publish separate recorded Threadplane tutorials.

**Architecture:** Disposable consumer roots resolve installed packages with no source aliases. Exact guide components call a real checked Hashbrown server/OpenAI adapter, with a fixture only at provider HTTP. Recorder produces distinct framework assets using existing ffmpeg helpers.

**Tech Stack:** Existing Node/npm, Nx, Vite, Angular compiler, React, Playwright and ffmpeg. Temporary consumer dependencies only.

- [x] Review spec and plan against actual package/build layouts. Read older Brian posts for voice.
- [x] Build pinned React source packages in disposable checkout; run documented --install-links install in fresh consumer and verify realpaths/peer resolution. Install public Angular packages in separate fresh consumer. Preserve manifests/versions and logs in ignored dist.
- [x] Add meaningful failing setup/recorder/content tests, observe RED, fix discovered setup problems and add checked source/harness. Keep external dependencies out of Hashbrown manifests.
- [x] Build/typecheck installed consumers; run actual server/adapter HTTP fixture through both clients; verify first turn/follow-up, streaming, stop/failure/recovery, no initial request, keyboard and mobile layout. Record each SDK separately; encode and inspect all 12 assets and video dimensions/captions.
- [x] Update recipes/migrations/media inventory/catalog and recorder Nx target with exact source and visible verified setup. Review implementation and disclosures.
- [x] Run www tests, lint, strict typecheck, production build and route report sequentially. Verify built pages, scrolling/Migrations/disclosures, desktop/mobile and assets.
- [ ] Commit, PR and attach; merge exact reviewed head after all CI green. Verify production deployment and canonical live pages/media. User handles SDK release.
