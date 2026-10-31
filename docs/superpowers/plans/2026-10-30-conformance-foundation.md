# Framework Conformance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Publish a reproducible, evidence-backed framework compatibility inventory without strengthening the seven delivered profiles' claims or adding dependencies.

**Architecture:** Preserve `agent-frameworks/capabilities.json` as the existing profile/corpus interface. A dependency-free program module validates a new scenario/planned-profile catalog and qualification provenance against existing captures and source files, then generates identical React/Angular compatibility content. A small Nx project checks reports without installing frameworks; existing real framework/core/browser targets remain the execution authority. A weekly baseline workflow reports their actual command outcomes without promoting public claims.

**Tech Stack:** Existing Node ESM/node:test, Nx, Jest, Next.js Markdown and GitHub Actions. No new dependencies, Python host, native transport or runtime package changes.

**Spec:** [Approved program design](../specs/2026-10-30-framework-conformance-program-design.md).

## Boundaries

- Foundation only. Pydantic AI is first new framework but stays explicitly not tested. Google ADK/Strands/other candidates are planned discovery rows.
- Keep all seven existing version/configuration profiles, all capability states and all six producer gaps unchanged. A `recipe-required` native gap never becomes a passing recipe profile.
- The catalog covers the full integration, but newly listed capabilities remain untested. .NET's display audit remains source inspection, not an executed display qualification.
- File search stays deferred; Hashbrown release notes stay user-owned.
- Weekly jobs run the approved pinned Node baseline; latest-version candidate execution remains not-run until reviewed version constraints exist. Report that limit explicitly rather than silently floating dependencies. This first weekly lane is not latest-version qualification or .NET/Python execution. Existing nightly workflows are unchanged.
- Exact package pins and historical CI identify the last qualification. Current runs are separate health records. Missing legacy runtime/protocol details are displayed as not recorded, not invented.

## File responsibilities

Create under `tools/conformance/agent-frameworks/program/`:

- `catalog.json`: stable capability-family/scenario IDs and planned framework profiles; requires no runtime dependencies.
- `qualification.json`: one reviewed provenance record per existing profile, exact versions inherited from the legacy inventory, qualification/source/CI references and evidence-stage file paths/hashes.
- `inventory.mjs`, `inventory.spec.mjs`: load/validate immutable catalog and qualification inputs against legacy capabilities, actual raw-capture hashes/versions/execution markers and source files. Expose a pure validation API plus filesystem loader with TSDoc.
- `report.mjs`, `report.spec.mjs`: deterministic Markdown rendering and generated-file write/check CLI, with no framework execution/imports. Check mode fails on stale/missing public output.
- `project.json`: private `framework-conformance-program` Nx project for lint/test/build(check) with precise inputs; does not depend on the Node framework host.
- `selection.spec.mjs`: actual Nx graph/affected selection contracts, including core/consumer/host/docs changes; no hand-built approximation of Nx selection.
- `weekly.mjs`, `weekly.spec.mjs`: bounded existing Nx commands, independently collected real outcomes, JSON and Markdown run-health reports, nonzero exit on failed/infra checks. Injection tests verify orchestration; live runs stay authoritative.

Modify `tools/conformance/project.json` only as needed to include program checks in its checks and connect common core/consumer changes through real Nx dependencies. Modify `www/project.json` for stale matrix checks/explicit program inputs without a runtime dependency on framework hosts. Add generated `www/content/docs/{react,angular}/platform/compatibility.md` and navigation via `www/src/components/menus/docs-menu.data.ts`. Add focused website navigation tests. Add `.github/workflows/framework-compatibility.yml` for once-weekly/manual baseline execution and retained health reports. Update the corpus README with commands, evidence meanings and follow-up limits.

## Task 1: Validated catalog and faithful evidence migration

- [x] Write top-level `test(...)` cases in `program/inventory.spec.mjs` with arrange/act/assert. Start with a valid minimal record and reject: a planned profile claiming passed; passed capability without stage evidence; changed capture hash/version/source hash; missing source file; duplicate IDs; unknown statuses/scenarios; native/recipe conflation; a claimed durable restart with only canonical restore; changes to the preserved legacy states/gaps. Freeze inputs and assert no mutation. Use temporary test-owned files and explicit cleanup.
- [x] Run `node --test tools/conformance/agent-frameworks/program/inventory.spec.mjs`; observe RED for the intended validator behavior before implementing it (a minimal exported stub may establish an assertion-level RED).
- [x] Implement immutable validators/loaders and data using the seven existing profiles. Existing corpus `eventsSha256` and `sourceSha256` remain intact; do not add files under the old fingerprinted `harness`/`node` directories. New evidence hashes reference the actual retained files. Record source qualification from #844 commit `826953718d22af984606c51645cb18e6acd3655b` and CI `41100895094`, dated 2026-10-30; label legacy missing runtime/wire details honestly.
- [x] Define families for conversation, tools, approvals, state, structured output, trusted UI, media, activities, delegation and recovery. Each scenario declares necessary evidence stages. Keep raw legacy capability cells visible; link them into families without inferring new passes (e.g. native child execution is not attributed subagent support).
- [x] Verify the repository inventory loads with seven exact profiles/six exact gaps; all new planned profiles stay not-tested and file search deferred. Existing capability/fixture files remain byte-identical.
- [x] Run focused tests GREEN and commit the data/validator after spec and quality reviews.

Reference API shape (implementation may decompose helpers, not change ownership):

```js
/** Validates versioned profile claims against retained producer and consumer evidence. */
export function validateInventory({ catalog, qualification, legacy, evidence }) {
  // Return immutable/plain validated data; throw precise errors for contradictions.
}
/** Loads the repository inventory without importing or installing a framework. */
export async function loadInventory(root) {
  // Read only declared local evidence; validate before returning.
}
```

## Task 2: Deterministic public report and stale-output gate

- [x] Write `program/report.spec.mjs` first. Assert exact versions and native transport limits are visible, both SDK pages carry the same evidence/status body, planned Pydantic is not tested, .NET remains an audit, `recipe-required` is not a tested recipe, gaps are retained, source links identify immutable commits, historical qualification differs from current health, Markdown is escaped, malformed records cannot render, and missing/stale files fail check mode.
- [x] Run the focused file RED, implement a small pure renderer and explicit `--write`/`--check` CLI, rerun GREEN. No current clock/randomness or live network in generation; qualification dates come from reviewed inputs.
  Reuse validation through a small `assertValidatedInventory` export: the validator registers its detached result and snapshot in a private WeakMap; rendering rejects unvalidated or subsequently changed objects. This avoids a second weaker schema validator in the renderer.
- [x] Generate the two compatibility pages with normal docs frontmatter and explanatory text, accessible status labels and per-profile detail tables. Use compact family overview plus exact cells/versions/evidence, not an unqualified framework badge. Include planned work and limitations. Do not claim latest compatibility from a pinned historical record.
- [x] Run the generator twice and confirm byte identity; alter a test-owned output and verify check mode fails. Check links and ensure no nested table layout forces an unusably wide mobile view.
- [x] Commit renderer/tests/generated content after spec and quality review.

## Task 3: Nx affected checks and weekly baseline health

- [x] Add failing tests for real Nx affected selection: core/Angular/React/common harness changes select existing real host/corpus and consumer checks; driver/lock/recipe/capture/evidence changes select relevant checks; compatibility prose/report changes select program/www checks without installing framework hosts; unrelated prose does not provision them. Test actual graph commands (`npx nx show projects --affected --files=... --json`) and task graph expansion. Define narrow project/input boundaries rather than weakening existing checks.
- [x] Add a dependency-free private program project with `test`, `lint` (syntax/TSDoc conventions using existing tooling), `build` (validate inventory and check generated pages), named generation/report targets as needed. Run all Nx commands with `npx nx`. The parent conformance project must still select real execution after common core/consumer changes. Add program as an appropriate consumer dependency/input, without making `www` install agent hosts.
- [x] Test weekly orchestration RED: each actual command result is retained, a failing command does not suppress later checks, infra/spawn errors are distinguished, failure exits nonzero, reports contain exact pinned versions/source revision and sanitized bounded diagnostics, and candidate status is explicitly not-run. No fabricated pass from missing evidence.
  Add an actual Nx process regression for deadline cleanup: Nx and Playwright detach child groups, so killing only the outer runner is insufficient. Give owned processes bounded graceful shutdown, then terminate and verify captured owned descendants/groups before recording timeout or continuing. Never signal unrelated processes. Keep this in a focused `process.mjs` helper if needed.
- [x] Implement orchestration around existing `npx nx agent-framework-test conformance`, targeted root-store core tests and `npx nx agent-framework-e2e conformance`. CLI writes artifacts even on failure. Reuse existing baseline install/browser setup. Workflow permissions are contents:read; once-weekly and manual on main; bounded timeout, no provider credentials, no publication or dependency upgrades. Upload health evidence with `always()`.
  The core command is `npx nx test core --testFile=agent-framework-display.conformance.spec.ts --runInBand`. Producer/core/browser command deadlines are 15/10/15 minutes respectively; the workflow is capped at 50 minutes. A timeout is a failed/infra attempt with retained results, not a skipped pass.
- [x] Run actual selected baseline with the runner or equivalent commands and inspect its JSON/Markdown. Weekly candidate versions are not silently selected; no range was approved. Existing nightly remains byte-identical.
- [x] Commit selection/weekly checks after spec and quality review.

## Task 4: Docs integration and final verification

- [x] Write a failing website test that the compatibility page is reachable in both SDK menus and generated records remain the only source of its capability claims. Use existing test conventions; no runtime MDX component is needed.
- [x] Add both menu links; document generation/check, state meanings, weekly baseline limitations and contribution process in the conformance README. Mark this plan's actual completed steps with evidence, keeping later slices unimplemented.
- [x] Run `npx nx test framework-conformance-program`, `npx nx build framework-conformance-program`, `npx nx lint framework-conformance-program`; `npx nx build conformance`, `npx nx test conformance`, `npx nx lint conformance`; `npx nx agent-framework-e2e conformance`; targeted existing core conformance test; `npx nx test www`, `npx nx lint www`, `npx nx build www`. Run website route/layout e2e for the new public routes, and fix actual issues test-first. Report existing warnings and any failed invocations accurately.
- [x] Confirm no package manifests/locks or runtime packages changed, no legacy corpus/capability states were rewritten and no secrets appear in new artifacts. Independent final spec and quality review; fix blockers and rerun affected checks.
- [ ] Open a PR ending its description with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`; attach it to the task. Follow hosted checks/review, address actual failures, update after main advances as necessary without freezing other merges, and merge normally with exact-head guard only when green. Confirm actual MERGED state.

The user explicitly authorized plan → implementation → PR → merge in this live
session. No additional execution-choice or merge confirmation is required.

## Execution evidence

- Task 1: 30 inventory tests, independent spec/quality reviews.
- Task 2: 44 inventory/report tests including CLI failures, independent reviews.
- Task 3: 67 tests including real Nx selection and detached-process cleanup; build/lint passed.
- Real uncached baseline at `be014d0b`: all three producer/capture, prepared-core/next-request and React/Angular browser stages passed for seven pinned profiles. Latest-version candidate remains not-run.
- Integration program gates after Task 4: 68 tests/build/lint passed. Conformance build/lint and 128 tests across 20 suites passed.
- Initial full website invocation: 2,460 passed, four new-page policy/audit failures; the explicit reference-page registration fix passed all 297 focused checks; final full website verification follows the main refresh.
- After the current-main refresh and narrow website metadata cache regression, program gates passed 69 tests/build/lint; the complete website suite passed 2,432 tests across 268 files and lint passed. Production build and route/layout checks are next.
- The mandatory global lint hook initially lacked exact .NET SDK 10.0.402 (machine had 10.0.403); an official hash-verified temporary SDK resolved it without changing repository pins or bypassing hooks.
- Final production website build and `npx nx e2e www` passed, including all 61 deterministic workbench checks, route parity, mobile layout with no issues, and diagram validation. Existing module/color/API Extractor, filesystem tracing and workbench bundle-size warnings remain.
- Implementation and independent reviews are complete; PR submission and hosted green merge are the remaining integration step.
