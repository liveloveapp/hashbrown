# Local Component UI Tools Implementation Plan

> **For agentic workers:** Use the executing-plans workflow inline; independent
> spec/plan and final code reviews provide checkpoints. The user already selected
> the design and authorized implementation through merge and verification.

**Goal:** Render trusted React and Angular component UI after Chrome native tool
planning using the existing finalization opt-in.

**Architecture:** Reuse the merged tools/schema transport and existing UI hooks,
Skillet schema and renderer. Validate UI requests at the transport boundary, keep
inference evidence distinct from adapter policy, and add local-only conformance.

**Tech Stack:** TypeScript, Nx, Jest, Playwright, existing aimock, Chrome 155/v4.

## Task 1: Guarded core support

- [x] Add failing tests in `packages/core/src/transport/chrome-tool-messages.spec.ts`
  and `experimental-chrome-tools-transport.spec.ts`: opt-in UI requires a response
  schema, default rejection remains, exact schema reaches terminal prompt only,
  no-tools UI constrains directly, UI capability follows policy/inference unknown.
- [x] Run `npx nx test core --runInBand --testPathPatterns='chrome-tool-messages|experimental-chrome-tools-transport'`
  and retain expected missing-feature failures.
- [x] Update `chrome-tool-messages.ts` guard to allow UI only with the existing
  policy and object schema. Update capability `ui` to boolean and set it from the
  policy. Extend public option docs. Preserve stream handling.
- [x] Re-run focused tests, then build/test/lint/API core and commit tested change.

## Task 2: Framework fixtures and local contracts

- [x] Add failing browser assertions in a new
  `tools/conformance/local-models/native-ui-workflows.e2e.ts`, a config extending
  `local-native-tools.playwright.config.ts`, and uncached local targets in
  `tools/conformance/project.json`. The initial run must fail at missing fixture.
- [x] Add React/Angular UI fixtures beside the schema fixtures, route them in
  `hosts/react/src/app.tsx` / `hosts/angular/src/app/app.ts`, and expose a bounded
  component kit using actual framework APIs. Share existing workflow tools and
  local transport selection. No new framework public API.
- [x] Script aimock from actual tool results. Assert exact native constraints,
  actual DOM/props, dependent handler correlation, progressive final rendering,
  canonical replay, no tools, malformed/unknown components/invalid props, terminal
  tool rejection, Stop/recovery and balanced sessions/readers. Run local contracts.
- [x] Run host builds/lint, conformance build/test/lint and its TypeScript checks;
  commit fixtures and tests after checks pass.

## Task 3: Real inference, docs and regression

- [x] Run real v4 leaf/dependent and bounded composition workflows sequentially
  with the existing downloaded profile and refusal of downloads/fallback. Retain
  raw prompts/chunks, exact schema, DOM and resource counts. Assess recursive
  schemas separately and record limitations honestly.
- [ ] Repeat successful workflows after explicit `NODE_ENV=production` builds.
- [ ] Update `tools/conformance/README.md`, local-model docs and research with the
  API, extra pass, commands, verified cases and failures. Update API report.
- [ ] Run core/react/angular builds/tests/lint where targets exist, conformance
  and host checks, standard conformance/provider suites and existing native
  schema/tools/local transport regressions. Run docs build/test/lint if edited.

## Task 4: Review and integration

- [x] Independent spec/plan review before implementation; fix actionable findings.
- [x] Independent final code review and diff check; fix and retest feedback.
- [x] Create PR with concrete behavior and measured validation; attach it.
- [ ] Wait for exact-head CI, address feedback, merge on green and verify the
  merged tree equals the reviewed tree and is on current origin/main.

## Native-quality decision checkpoint

PR #749 is open and attached, not merged. Initial broad-catalog v4 sample failed
8/8; clarified instructions passed 4/8. All 22 aimock contracts and listed standard
regressions pass. Recursive-schema copy canary passed separately. Successful
native workflow repetition remains unmet. The user approved narrowing tool and
component catalogs per workflow, verifying bounded support and retaining the
broad-catalog failures as research on October 25, 2026.

## Approved bounded qualification

- [x] Assert exact declared tools and response schemas for each workflow before
  narrowing fixtures. Preserve broad catalog access for research.
- [x] Lookup/stream/error/Stop use lookup + status; dependent uses lookup/follow +
  status; nested uses lookup + status/panel; no-tools uses status only.
- [x] Pass local deterministic contracts, then run two predetermined full native
  samples against production builds without changing strict result assertions.
  Retain any failure; do not rerun unchanged samples until green.
- [x] Record all native failures and bounded scope; update docs and PR.
- [ ] Review changes, synchronize current main, run affected checks and exact-head
  CI, merge on green and verify merge contents on main.

Bounded samples completed at `e80e25bf`: 2/8 and 4/8 passed. Only no-tools cases
passed both samples. Native qualification and successful repetition remain
unmet; a further scope decision is required before merging. CI alone is not the
remaining release gate.

## Interrupted verification checkpoint

Bounded fixture commit `6a8dcbdd` and main integration `e80e25bf` are local and
unpushed. Source checks passed after integration: production builds; applicable
lint; core API report; core 1,848, React 213, Angular 281, conformance 45 and site
937 unit tests; 22 UI contracts and 64 standard browser conformance cases.

The additional regression run hit host setup errors: Nx holds a per-target server
lock regardless of port, then provider tests used separate default port variables.
Independent static hosts fixed the first issue; corrected provider environment
variables were prepared, but interruption removed those hosts before retry.
Provider/local regression completion remains outstanding. Final docs edits also
need build/test/lint. Automatic approval review rejected that verification command
because application network permission was revoked; it reported a review failure,
not an unsafe action determination. Do not bypass it. PR body draft is saved at
`/tmp/hashbrown-ui-pr-body.md`; results/docs changes are uncommitted and unpushed.
Resume only after permissions allow the required commands, retain native failures
and obtain the next release-scope decision before merging.

The user subsequently approved application-controlled phase design and
implementation. Network permissions are available again. Continue in
[the phase plan](2026-10-25-chrome-tool-phases.md); the model-led failure evidence
stays retained and phase qualification is the active native release gate.
