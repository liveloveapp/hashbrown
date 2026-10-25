# Chrome schema finalization implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. User authorized proceeding through implementation and merge; routine design/implementation approval questions are unnecessary.

**Goal:** Opt-in native tool planning followed by schema-constrained final output, without changing default transports or adding dependencies.

**Architecture:** Extend the existing tools transport with an explicit policy. Own a fresh session per canonical run, suppress planning prose, return validated calls to core, and finalize only a call-free planning turn in the same native session. Preserve existing runtime schemas, handler/permission ownership and teardown.

**Tech stack:** TypeScript, Skillet, AG-UI, Jest, Nx, React/Angular, Playwright and existing aimock.

## 1. Core policy and phase implementation

Files: `packages/core/src/transport/experimental-chrome-tools-transport.ts`, `chrome-tool-messages.ts`, their `*.spec.ts`, and a focused internal phase helper if needed. All reusable helpers have TSDoc and no new public internal exports.

- [ ] Run current focused native transport/message tests as clean baseline.
- [ ] Add failing tests using `experimental_chrome_tools({ schemaFinalization: 'after-tool-planning' })` with forwarded responseSchema. Assert no native responseConstraint on planning; canonical tool events only when calls exist; no planning text leaked; exact schema on terminal second call, with original history sent once. Assert dependent replay still permits another tool call before finalization. No tools uses a single constrained prompt.
- [ ] Add failing validation tests: default still rejects schema, UI/media stay rejected, invalid policy rejected before creation, schema copied/frozen/bounded and invalid JSON rejected. Capability policy/structuredOutput distinguish opt-in while inference remains unknown.
- [ ] Implement minimal phase routing. Reuse existing full-turn tool validator, reader ownership and output bounds; do not duplicate ID repair or execute handlers. Finalization accepts only string chunks and errors on every typed tool/unknown chunk before any executable event. Keep raw final text untouched for Skillet.
- [ ] Add failing cancellation/timeout tests for planning and finalization, aborted/late prompt acquisition and hung cleanup; make them pass using the single deadline and existing cancellation ownership.
- [ ] Run focused tests, full `npx nx test core`, `build core`, `lint core`, `build-api-report core` with NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true. Record exact results and existing warnings.
- [ ] Independent spec review, then quality review; fix valid findings with red/green regression tests. Commit only owned source after reviewed.

## 2. Framework contracts and installed-model evidence

Files: `tools/conformance/hosts/{react,angular}/src/local-transport.ts`, framework local workflow hosts or separate focused schema host; `tools/conformance/local-models/native-tool-shim.ts`, new schema workflow e2e file; local-native-tools config or separate opt-in config/targets; README.

- [ ] Add failing actual React/Angular browser cases before host changes. Use existing framework tools and Skillet schema `{ token: string }` or `{ receipt: string }`; secret supplied only by handler result. Assert parsed exact value, real operation counts, no planning or synthetic instruction in public history, canonical replay intact, unconstrained planning and constrained finalization in recorded native prompts. Include dependent calls, finalization tool rejection, malformed final JSON and Stop/recovery. Keep native tests local-only.
- [ ] Update fixture shim to retain within-session conversation and record prompt constraints without executing/rewriting model output. Record corresponding options in real native observer. Preserve prior native suite semantics and history evidence.
- [ ] Implement opt-in host route without changing existing native/text/media routes. No framework public API changes. Run aimock contracts, existing native18/local24/media4 and standard72 sequentially after freshly built hosts.
- [ ] Run installed v4 single/dependent strict schema smoke cases in both frameworks sequentially on `/tmp/hashbrown-native-tools-model-profile`, refuse downloads/fallbacks, retain raw text/prompt/options and balanced session/reader evidence. Report actual failures; no fences stripped, xfails or assertion relaxation.
- [ ] Build/test/lint affected frameworks, conformance and hosts, plus docs site if changed. Native suites remain excluded from CI and cache false.

## 3. Documentation, review and release

- [ ] Document public opt-in example using existing chat schema, extra terminal pass, unsupported UI/media, capability-vs-inference distinction and measured quality limitations in both SDK recipes and research evidence.
- [ ] Final independent spec and quality review of integrated diff. Address feedback and rerun warranted checks.
- [ ] Commit, push, create PR with concrete behavior/evidence/limitations and attach it to this chat. Integrate current main safely and validate changed integration areas.
- [ ] Wait for exact-head required CI; review any feedback. Merge on green without bypass. Fetch main, compare reviewed/merged trees, verify merge ancestry and clean worktree. Report outcome and remaining genuine decisions.
