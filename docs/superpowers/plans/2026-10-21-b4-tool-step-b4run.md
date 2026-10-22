# b4.step contract, B4.run side (slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the versioned `b4.step` / `b4.answer` contract (types, schema, merge helpers, fixture corpus) from `@b4run/sdk`, and make `@b4run/ag-ui/view` consume it, so hashbrown and B4 share one tested wire contract.

**Architecture:** The contract lives in `@b4run/sdk`, which has no runtime dependencies. A pure reference folder, `foldToolStepEvents`, ships with the fixtures and defines what each fixture's expected output is. `reduceTurns` in `@b4run/ag-ui/view` learns to read `metadata["b4.step"]` and the v1 CUSTOM event. B4's emitters do not change in this slice; that work is slice 2.

**Tech Stack:** TypeScript, pnpm 10, Turbo, Vitest 4, Biome, Changesets (one fixed group).

**Repo:** `~/repos/b4run`. Work in a fresh worktree branched from `main`. The local checkout is on a stale branch with uncommitted changes, so leave it alone.

**Spec:** `docs/superpowers/specs/2026-10-21-b4-tool-step-contract-design.md` in the hashbrown repo (`/Users/blove/repos/hashbrown`, branch `blove/tool-step-design`). Read it first.

## Global Constraints

- Wire names are fixed: metadata key `"b4.step"`, answer key `"b4.answer"`, CUSTOM event `b4.step`, LangChain kwargs `b4_step`. All values are camelCase.
- `v: 1`. Additive fields never bump it. Consumers ignore unknown fields. An unknown `status` falls back to the lifecycle derived from the frames.
- Labels are at most 120 code points (`TOOL_DISPLAY_LABEL_MAX`).
- Merge rules:
  - `failed` wins.
  - `completed`, `denied` and `cancelled` settle the step unless it already failed.
  - `running` only lifts an unsettled step.
  - The ToolMessage's step beats the ToolCall's.
  - `failed`, `denied` and `cancelled` clear the running label and sources.
  - At `RUN_ERROR`, open steps become `failed`. At a cancelled or interrupt `RUN_FINISHED`, open steps become `cancelled`, except `pendingToolCallIds`.
- Legacy values normalize: a missing `v` becomes 1, `kind` becomes `'server'`, source ids become `<toolCallId>:<index>`, source kind becomes `'url'` if there is an `href` and `'record'` otherwise, and ISO times become epoch ms.
- Breaking nothing: keep `PersistedStep`, `readPersistedStep`, `B4StepEventValue` and `readStepEvent` exported and mark them `@deprecated`.
- B4 AGENTS.md:
  - Use the changesets fixed group, with **patch** bumps on 0.x.
  - `exactOptionalPropertyTypes`: use conditional spreads.
  - `src/` imports use `.js`, `test/` imports use `.ts`.
  - Run commands from the repo root. Never run a bare `biome check --write`.
  - Use one branch per PR.
- Tests follow this repo's existing Vitest style (`describe`/`it`, as in `packages/sdk/test/*.test.ts`). The hashbrown top-level-`test` rule does not apply here.

## Review Focus

1. **A completed RESULT that arrives after a CUSTOM `failed`** must stay failed. Tested in Task 2 by the fixture `failed-step-beats-later-result`.
2. **A step for an id never seen yet** (ag-ui-langgraph synthesizes START at `on_tool_end`) must apply when START arrives, and must never be dropped. Fixture `step-before-start`.
3. **A legacy B4 CUSTOM value** (no `v`, no `kind`, sources without ids) from a 0.14 server must still render. Fixture `legacy-custom-step`.
4. **An unknown future `status` string** must not hide the call; it falls back to the frame lifecycle. Fixture `unknown-status-falls-back`.
5. **An interrupt `RUN_FINISHED`** must not settle the parked call that is waiting for approval. Fixture `interrupt-keeps-pending-open`.

---

### Task 1: The contract module in `@b4run/sdk`

**Files:**
- Create: `packages/sdk/src/tool-step.ts`
- Modify: `packages/sdk/src/index.ts`. Export everything below. Also add `@deprecated` TSDoc to `PersistedStep` and `readPersistedStep` in `persisted-turn.ts`, pointing to `B4ToolStep` and `readToolStep`.
- Test: `packages/sdk/test/tool-step.test.ts`

**Interfaces:**
- Produces (all exported from `@b4run/sdk`):
  - `B4_STEP_METADATA_KEY = "b4.step"`, `B4_ANSWER_METADATA_KEY = "b4.answer"`, `B4_STEP_EVENT_NAME = "b4.step"`, `B4_STEP_VERSION = 1`.
  - `B4_TOOL_STEP_STATUSES = ["running","completed","failed","denied","cancelled"] as const`.
  - `B4_BUILTIN_TOOLS = ["web_search","web_fetch","code_execution","file_search","mcp","grounding","tool_search","image_generation"] as const`. These are the recommended values; the field stays an open string.
  - Types `B4ToolStep`, `B4StepSource`, `B4AnswerAnnotations`, `B4ToolStepStatus`, copied exactly from the spec's "Shape (v1)" block, with `readonly` added.
  - `readToolStep(value: unknown, toolCallId?: string): B4ToolStep | undefined`. It accepts v1 values, legacy `B4StepEventValue` values and legacy `PersistedStep` values, and normalizes them per Global Constraints. It returns `undefined` for non-records and for values with no recognisable `status`. An unknown status string returns a step with that status left out, so `status` is `undefined` and the caller falls back. Labels are trimmed to 120 code points.
  - `readAnswerAnnotations(value: unknown): B4AnswerAnnotations | undefined`.
  - `mergeToolStep(previous: B4ToolStep | undefined, next: B4ToolStep, source: "call" | "message"): B4ToolStep`. It applies the merge rules. `source: "message"` is the ToolMessage-beats-ToolCall rule, and every field present on `next` wins unless `previous.status === "failed"`.
  - `settleOpenSteps(steps: Readonly<Record<string, B4ToolStep>>, outcome: "failed" | "cancelled", keepOpen: ReadonlySet<string>, at: number): Record<string, B4ToolStep>`.
  - `B4_TOOL_STEP_JSON_SCHEMA` (a const JSON Schema draft 2020-12 object for `B4ToolStep`, with `additionalProperties: true`) and `B4_ANSWER_JSON_SCHEMA`.

- [ ] **Step 1: Write the failing tests.** One `it` per rule, at minimum:
  - `readToolStep` normalizes a legacy CUSTOM value `{toolCallId:"c1",status:"completed",label:"Fetched",sources:[{title:"A",href:"https://a"}]}` to `{v:1,toolCallId:"c1",kind:"server",status:"completed",label:"Fetched",sources:[{id:"c1:0",kind:"url",title:"A",href:"https://a"}]}`.
  - A legacy PersistedStep with `startedAt:"2026-10-21T00:00:00.000Z"` reads as `startedAt:1761004800000`.
  - A 130-character label is cut to 120.
  - `{v:1,kind:"server",status:"exploded"}` yields a step whose `status` is `undefined`.
  - `mergeToolStep(failedStep, completedStep, "message").status === "failed"`.
  - `mergeToolStep(runningWithLabel, {…status:"denied"}, "call")` has no `label` and no `sources`.
  - `mergeToolStep(completed, running, "call")` stays `completed`.
  - `settleOpenSteps({a: running, b: running}, "cancelled", new Set(["b"]), 5)` gives `a` the status `cancelled` and `settledAt: 5`, and leaves `b` running.
  - The schema accepts every value `readToolStep` returns in these tests. Validate with a minimal hand-written checker of `required` and `enum` only. **Do not add a JSON Schema dependency.**
- [ ] **Step 2: Run** `pnpm --filter @b4run/sdk test`. Expect FAIL with module not found.
- [ ] **Step 3: Implement `packages/sdk/src/tool-step.ts`.** Reuse `isToolDisplayIcon` and `TOOL_DISPLAY_LABEL_MAX` from `tool-display.ts`. Keep `icon` an open string on read: unknown icons pass through, because v1 says icon is open.
- [ ] **Step 4: Run** `pnpm --filter @b4run/sdk test`, `pnpm --filter @b4run/sdk typecheck` and `pnpm --filter @b4run/sdk lint`. Expect PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(sdk): the versioned b4.step tool-step contract"`

### Task 2: The fixture corpus and reference folder in `@b4run/sdk/testing`

**Files:**
- Create: `packages/sdk/src/testing/tool-step-fixtures.ts`
- Create: `packages/sdk/src/testing/fold-tool-step-events.ts`
- Modify: `packages/sdk/src/testing/index.ts` (export both)
- Modify: `packages/sdk/package.json`. Add a `build` step that writes `dist/tool-step.schema.json` from `B4_TOOL_STEP_JSON_SCHEMA`, using a small `scripts/write-schema.mjs` run after `tsc -b`. Add an `"./tool-step.schema.json": "./dist/tool-step.schema.json"` export.
- Test: `packages/sdk/test/tool-step-fixtures.test.ts`

**Interfaces:**
- Consumes: Task 1's exports.
- Produces:
  - `interface ToolStepFixture { readonly name: string; readonly events: readonly ToolStepFixtureEvent[]; readonly expected: { readonly steps: Readonly<Record<string, B4ToolStep>>; readonly answers?: Readonly<Record<string, B4AnswerAnnotations>> } }`
  - `ToolStepFixtureEvent`, a structural subset of AG-UI events (`type` string plus the fields used). The SDK must not import `@ag-ui/core`.
  - `TOOL_STEP_FIXTURES: readonly ToolStepFixture[]`
  - `foldToolStepEvents(events: readonly ToolStepFixtureEvent[]): ToolStepFixture["expected"]`. This is the reference semantics: frames supply the lifecycle, metadata and CUSTOM are merged with `mergeToolStep`, ids not yet seen are buffered, and `settleOpenSteps` is applied at `RUN_ERROR` and at a cancelled or interrupt `RUN_FINISHED`. A call whose step is still missing after frames is given `{v:1, kind:"server", status: <frame-derived>}`, where `running` covers START through RESULT and `completed` comes from RESULT.

- [ ] **Step 1: Write the failing test.** For every fixture, assert `foldToolStepEvents(f.events)` equals `f.expected`. Also assert that the fixture names are exactly this list:
  - `metadata-lifecycle`
  - `custom-only-lifecycle`
  - `legacy-custom-step`
  - `step-before-start`
  - `failed-step-beats-later-result`
  - `denied-clears-label`
  - `message-step-beats-call-step`
  - `run-error-settles-open`
  - `cancelled-run-settles-open`
  - `interrupt-keeps-pending-open`
  - `unknown-status-falls-back`
  - `provider-web-search-with-citations`. This one is OpenAI-shaped: START, END, RESULT with a step that has `kind:"provider"`, `builtin:"web_search"`, `provider:"openai"`, `queries:["KSFO weather"]` and two sources with ids `ws_1:0` and `ws_1:1`. A `TEXT_MESSAGE_END` carries `b4.answer.citations:[{sourceId:"ws_1:0",quote:"…",block:0,start:0,end:42}]`.
  - `frames-only-no-step`
- [ ] **Step 2: Run** `pnpm --filter @b4run/sdk test`. Expect FAIL.
- [ ] **Step 3: Implement the fixtures and `foldToolStepEvents`.**
- [ ] **Step 4: Run** `pnpm --filter @b4run/sdk build`. Check that `dist/tool-step.schema.json` exists and that `dist/testing/index.d.ts` exports `TOOL_STEP_FIXTURES`. Then run `pnpm --filter @b4run/sdk test`, `typecheck` and `lint`. Expect PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(sdk): publish the tool-step fixture corpus and reference folder"`

### Task 3: One source for the step-event name and types

**Files:**
- Modify: `packages/ag-ui/src/step.ts`. Re-export `B4_STEP_EVENT_NAME` from `@b4run/sdk`. Keep `B4StepEventValue` and `B4_STEP_STATUSES` as `@deprecated`, with unchanged shapes.
- Modify: `packages/langchain/src/tool-display.ts:10-24`. Import `B4_STEP_EVENT_NAME` from `@b4run/sdk`. The snake_case `StepEventData` stays because the emitters change in slice 2, but add a comment saying so.
- Test: the existing suites for both packages.

- [ ] **Step 1:** Make the edits.
- [ ] **Step 2: Run** `pnpm --filter @b4run/ag-ui test`, `pnpm --filter @b4run/langchain test`, and `typecheck` and `lint` for both. Expect PASS with no snapshot changes.
- [ ] **Step 3: Commit.** `git commit -m "refactor: one b4.step event name, owned by @b4run/sdk"`

### Task 4: `reduceTurns` consumes the contract

**Files:**
- Modify: `packages/ag-ui/src/view/turns.ts`:
  - `StepStatus` gains `"cancelled"`.
  - TOOL_CALL_START, END and RESULT apply `metadata?.["b4.step"]` through `readToolStep` and `applyStep`; RESULT uses the `"message"` source rule.
  - The CUSTOM path (lines ~565-571) switches from `readStepEvent` to `readToolStep(custom.value)`, which still accepts legacy values.
  - Steps for unknown ids are buffered on the turn (a new private `pendingSteps` map on `TurnView`) and applied in TOOL_CALL_START.
  - `settleOpen` at a cancelled or interrupt RUN_FINISHED settles as `"cancelled"`. It currently settles as failed.
- Modify: `packages/ag-ui/src/view/step.ts`. `readStepEvent` stays, now implemented through `readToolStep`, and is marked `@deprecated`.
- Modify: `packages/ag-ui/src/view/labels.ts`. Add the fallback label `Cancelled <tool>`.
- Modify: the React `Step` and Angular step components. Render `cancelled` the way `denied` is rendered: muted, and no running treatment.
- Test: create `packages/ag-ui/test/view/tool-step-contract.test.ts`.

**Interfaces:**
- Consumes: `readToolStep`, `mergeToolStep`, and `TOOL_STEP_FIXTURES` from `@b4run/sdk/testing`. Add an alias for `@b4run/sdk/testing` to `packages/ag-ui/vitest.config.ts`, matching the existing sdk aliases.
- Produces: `toContractSteps(view: TurnsView): Record<string, B4ToolStep>`, exported from `view/index.ts` for B4's own use. It maps view statuses to contract terms: `pending|running` becomes `running`, `done` becomes `completed`, and `failed`, `denied` and `cancelled` map to themselves.

- [ ] **Step 1: Write the failing test.** For every `TOOL_STEP_FIXTURES` entry, fold the events through `reduceTurns` and compare `toContractSteps(result)` with `fixture.expected.steps`. Compare these fields: `status`, `label`, `sources`, `error` and `kind`.
- [ ] **Step 2: Run** `pnpm --filter @b4run/ag-ui test`. Expect FAIL on the metadata, `cancelled` and before-START fixtures.
- [ ] **Step 3: Implement the changes listed under Files.**
- [ ] **Step 4: Run** `pnpm --filter @b4run/ag-ui test`. Existing parity snapshots must not change. If a snapshot changes, stop and explain why rather than regenerating it. Then run `typecheck` and `lint`. Expect PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(ag-ui): the activity view reads b4.step metadata and the v1 event"`

### Task 5: Docs, changeset, release

**Files:**
- Modify: `apps/web/content/docs/ag-ui.mdx`, the "Step events" section at lines 730-734. Describe the v1 contract: both carriers, the key names, the field table, the merge rules, versioning, and the legacy values still accepted.
- Modify: `apps/web/content/docs/api/sdk.mdx`. Add rows for every Task 1 and Task 2 export, and mark `PersistedStep` and `readPersistedStep` deprecated.
- Modify: `apps/web/content/docs/upgrading.mdx`. Add a new version entry: "No action required; `b4.step` is now versioned…".
- Create: `.changeset/tool-step-contract.md` with patch bumps for `@b4run/sdk`, `@b4run/ag-ui` and `@b4run/langchain`.

- [ ] **Step 1:** Write the docs and the changeset, then run `pnpm --dir apps/web seo:lastmod` after committing the docs content, as AGENTS.md requires.
- [ ] **Step 2: Run** `pnpm ci:validate`. Expect PASS.
- [ ] **Step 3: Commit, push, and open the PR.** `git commit -m "docs: the versioned b4.step contract"`. Opening the PR, merging it and releasing all need the user's OK. The release is the normal Version Packages flow, and the new version is what hashbrown pins.
