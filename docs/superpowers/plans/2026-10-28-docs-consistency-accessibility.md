# Docs Consistency and Accessibility Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for focused implementation and independent spec/quality review.

**Goal:** Make the existing canonical workbench and recorded guides consistently navigable and understandable with keyboard and assistive technology.

**Architecture:** Shared small DOM tab behavior integrates into both tablists while preserving existing store and focus ownership. Player semantics and shortcut exclusions stay in shared shell/player. Server-rendered video figures use stable React IDs for accessible caption references. Existing recordings and layout stay intact.

**Tech Stack:** Existing TypeScript DOM, React/Next.js, Angular/React clients, Vitest, Playwright and Nx; no dependencies.

- [ ] Shared tabs: write failing tests for roving Tab stop, arrow wrap/Home/End, modifier/Up/Down exclusion, active panel labelling, stable focus during streaming and request detail rebuild. Add runtime/workbench-tabs.ts; integrate workbench-view.ts and workbench-requests-view.ts, add focused tests.
- [ ] Player: failing tests in workbench-player.spec.ts and workbench-shell.spec.tsx for link/summary/ARIA-widget exclusions, meaningful scrubber aria-valuetext and deduplicated polite lifecycle status. Implement minimal shared changes; preserve busy/replay and framework ownership behavior.
- [ ] Video and content: failing tests in elements/DocsDemoVideo.spec.tsx for described-by caption association and context-specific walkthrough names. Update DocsDemoVideo.tsx with stable IDs and retain native controls/provenance. Audit canonical guide/asset references; update both start/workbench.md guides, missing useful overview links and public/video/docs/README.md in Brian's voice.
- [ ] Browser verification: add keyboard checks for both framework tablists and Requests rebuild, native scrubber semantic value, body vs focused widget shortcuts, no requests/writes while navigating. Check video descriptions/captions and narrow layout in built site.
- [ ] Delivery: focused then full tests/typecheck/lint/build, complete browser matrix and route/mobile report; independent review; create and attach PR; merge current green head and verify exact deployment/public keyboard and media. Do not release SDK.
