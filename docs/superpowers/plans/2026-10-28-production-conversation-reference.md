# Production conversation reference implementation

Follow the approved TypeScript/Postgres and docs/reference scope. Use existing b4.run 0.15.5 and Hashbrown recovery APIs; do not add dependencies.

1. Verify installed runtime contracts; review the design for owner isolation, native approval recovery, shared admission, and truthful recovery projection.
2. Add failing tests and implement a focused reference server: bounded owner-scoped edge, explicit same-origin mutation checks, shared Postgres stores/admission, fixed server tools, transactionally accepted plan/receipt, and read-only recovery projection. Add an isolated disposable-Postgres integration target and server build/lint checks.
3. Add failing client/controller tests and Angular/React production-recovery workbench clients. Keep real SDK requests, native pending interrupt batches, revision-guarded explicit restoration and resume, and observed application state. Keep all inspectors and bottom playback visible. Add an opt-in reference host; never silently route this lesson to the process-memory demo.
4. Add matching b4.run platform guides, navigation and cross-links from threads, saving text and interrupt/resume. Explain verified identity, application data versus checkpoints, configuration binding, operations, retention and unknown outcomes. Use Brian's 2024-and-older posts as the voice reference.
5. Verify native protocol with Postgres and both framework browsers, including actual process replacement and independent replicas. Record short real-provider demos with ffmpeg, posters, readable captions and transcripts; publish only after the complete batch passes checks.
6. Run all affected build/test/lint and docs route/mobile reports; perform spec and quality reviews, fix findings, then PR and attach it. Merge on green and verify deployed guides and media. Do not release SDK packages.
