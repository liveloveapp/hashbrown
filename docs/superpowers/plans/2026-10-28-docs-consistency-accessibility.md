# Docs Consistency and Accessibility Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for focused implementation and independent spec/quality review.

**Goal:** Make the existing canonical workbench and recorded guides consistently navigable and understandable with keyboard and assistive technology.

**Architecture:** Shared small DOM tab behavior integrates into both tablists while preserving existing store and focus ownership. Player semantics and shortcut exclusions stay in shared shell/player. Server-rendered video figures use stable React IDs for accessible caption references. Existing recordings and layout stay intact.

**Tech Stack:** Existing TypeScript DOM, React/Next.js, Angular/React clients, Vitest, Playwright and Nx; no dependencies.

- [x] Shared tabs: write failing tests for roving Tab stop, arrow wrap/Home/End, modifier/Up/Down exclusion, active panel labelling, stable focus during streaming and request detail rebuild. Add runtime/workbench-tabs.ts; integrate workbench-view.ts and workbench-requests-view.ts, add focused tests.
- [x] Player: failing tests in workbench-player.spec.ts and workbench-shell.spec.tsx for link/summary/ARIA-widget exclusions, meaningful scrubber aria-valuetext and deduplicated polite lifecycle status. Implement minimal shared changes; preserve busy/replay and framework ownership behavior.
- [x] Video and content: failing tests in elements/DocsDemoVideo.spec.tsx for described-by caption association and context-specific walkthrough names. Update DocsDemoVideo.tsx with stable IDs and retain native controls/provenance. Audit canonical guide/asset references; update both start/workbench.md guides, missing useful overview links and public/video/docs/README.md in Brian's voice.
- [x] Browser verification: add keyboard checks for both framework tablists and Requests rebuild, native scrubber semantic value, body vs focused widget shortcuts, no requests/writes while navigating. Check video descriptions/captions and narrow layout in built site.
- [ ] Delivery: focused then full tests/typecheck/lint/build, complete browser matrix and route/mobile report; independent review; create and attach PR; merge current green head and verify exact deployment/public keyboard and media. Do not release SDK.

## Evidence

Both actual framework Tools paths pass keyboard Tab/arrow/Home/End navigation, synchronous request-detail rebuild focus, native scrubber values, focused link/separator exclusions, body shortcuts and unchanged requests/state. Both Decisions paths retain cancellation/recovery with the additional status region. Focused runtime suites pass 94 tests; the full suite passes 1,687 tests with bounded worker concurrency. A concurrent unrestricted run hit an existing five-second docs-popover timeout; that test passed in isolation, and no timeout or assertion was changed. All 60 active recordings / 64 guide embeds have complete companions; 388 measured cues fit video duration and the 20-character/second target (maximum19.51). Twenty VTT files and matching transcripts were shortened without altering timestamps or binary media. The recorder now rejects invalid captions and stages the entire selected batch before publication; incomplete staged companions preserve existing media. Independent review approved keyboard/video/content changes. Full production browser/route/mobile and deployment checks are pending delivery gates.

Final local verification: all 56 framework paths pass; the readable-panel shortcut regression is additionally checked in both actual framework Tools paths after the final source rebuild. Full 1,687-test suite, TypeScript, lint, final production build, route parity and mobile14×4 pass. Hosted workbench packaging passes. Public deployment/keyboard/caption verification remains the final delivery gate.
