# Docs Workbench Robustness (cleanup PR B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "See it run" jumps can't silently break. Loopback-only lessons make no server calls when hosted or replayed. Error copy fits wherever the workbench runs. The docs panel's replay race and Source layout jump are fixed.

**Architecture:**

- Captures record their milestones at publish time.
  - The workbench resolves `seek` against the recorded list and rejects unknown ids.
  - The docs build validates `moment=` against the same recorded list.
- Lessons get a `host: 'loopback'` flag, which drives both the hosted workbench UI and the docs panel.

**Tech Stack:**

- Next.js (`www/`)
- React and Angular workbench clients in `www/examples/quickstart/{react,angular}`
- Shared runtime in `www/examples/quickstart/runtime`
- Server in `www/examples/quickstart/server`
- Vitest

**Spec:** `docs/superpowers/specs/2026-10-27-docs-workbench-integration-design.md`. The spec says "stable IDs that the capture records" and "no model or network requests beyond static files" in Replay. The audit that motivates this plan is `.superpowers/sdd/2026-10-28-docs-workbench-integration/audit/` (findings W1–W5, D3, D4, D6, D10, M1).

## Global Constraints

- **Tests:** follow AGENTS.md: top-level `test(...)` only, arrange/act/assert separated by blank lines, failing test first.
- **Docs:** TSDoc on new exports.
- **Dependencies and env files:** no new dependencies; never touch `.env*`.
- **Compatibility:** the docs site and the hosted workbench deploy separately, in either order.
  - A capture with `milestones` must still parse in the old workbench parser, so check whether it rejects unknown keys. If it does, accept that the old parser fails until the workbench deploys, and say so in the report.
  - A new workbench must still replay a capture without `milestones`, by computing them.
- **Protocol:** stays version 1. Additions are optional fields and a new `rejected` reason only.
- **Verification:** run from the repo root: `npx nx test www`, `npx nx lint www`, `npx nx build www`. Running vitest inside `www/` gives false ENOENT failures.
- **Commits:** `git commit --no-verify` (the husky hook fails locally on dotnet), only after www lint and test pass. End each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A re-record that changes event order must either keep a moment pointing at the same kind of event and tool, or fail the docs build. It must never seek somewhere else silently.
2. Replay of server-threads or public-endpoint in docs makes zero `/api/` requests.
3. The hosted `react.html?lesson=server-threads` shows how to run the lesson locally, with no enabled buttons that can only 403.
4. A second `ready` while the capture is still downloading must not undo a See it run seek.
5. Opening Source must not shrink the panel while loading.

---

### Task 1: Recorded, named milestones

**Files:**

- Modify:
  - `www/examples/quickstart/runtime/workbench-timeline.ts`
  - `runtime/workbench-capture.ts`
  - `runtime/workbench-messages.ts`
  - `www/src/tools/workbench-capture-file.ts` (publisher)
  - `www/src/lib/workbench-source-files.ts` (`assertWorkbenchMoments`)
  - the docs markdown that uses `moment=`
- Create: a one-off script under `www/src/tools/`, for example `stamp-capture-milestones.ts`, that rewrites existing `www/public/video/docs/*-capture.json` with `milestones`. Run it, commit the rewritten captures, and keep the script only if the publisher can reuse it; otherwise delete it after running.
- Tests:
  - the existing timeline, messages and capture specs under `www/test/`
  - `www/test/workbench-source-files.spec.ts`

**Interfaces:**

- **Produces:** `WorkbenchCapture.milestones?: readonly { id: string; index: number; label: string }[]`, written by the publisher.
- **Produces:** the reply `hb-workbench:rejected` with `reason: 'milestone'` for a seek to an unknown id. Find the existing `reason` union, extend it, and update the docs-side parser in `www/src/components/workbench/embed-client.ts` to accept it.

- [ ] **Step 1: Name tool milestones.**
  - Tool events are labelled with the tool name: `Tool <toolName>`, giving ids like `tool-readcontext-1`. Read the tool name from the event payload, and fall back to `Tool result` when there is none.
  - Repeated history actions in one turn (the `text-load-1-15` / `text-action-0-18` sprawl in server-threads and public-endpoint) collapse to the first action of each label per turn, the same way stream chunks already collapse.
  - Write the tests first, with ids asserted literally.
- [ ] **Step 2: Store milestones in captures.**
  - `createWorkbenchCapture` (or the publisher, whichever builds the published file) stores `milestones` computed with the lesson's format.
  - `parseWorkbenchCapture` accepts an optional, validated `milestones` array.
- [ ] **Step 3: Resolve seeks against the recorded list.**
  - On `load`, the workbench keeps the capture's recorded milestones, or computes them when absent.
  - `loaded.milestones` reports that list, and `seek` resolves against it.
  - An unknown id posts `rejected` with reason `milestone`.
  - Tests cover a recorded list that differs from what computing would give: the recorded one wins.
- [ ] **Step 4: Validate docs moments against the recorded list.**
  - `assertWorkbenchMoments` reads `milestones` from the published capture file.
  - It still fails the build on an unknown moment, and also fails when a capture has no recorded milestones.
  - Add a check that a `tool-…` moment's recorded label names the tool that the snippet's prose or header implies. At minimum, the event kind must be `tool` for ids starting `tool-`.
- [ ] **Step 5: Stamp the captures and migrate the moments.**
  - Run the stamping script over all captures.
  - Migrate the docs `moment=` values that changed. Today only `tool-result-1` on `concept/functions.md` (both SDKs) is affected: pick the id whose event is the `readContext` tool result. List the others with `grep -rn 'moment=' www/content/docs`.
  - `npx nx build www` must pass.
- [ ] **Step 6: Commit** as `feat(www): record named workbench milestones in captures`.

### Task 2: Loopback-only lessons

**Files:**

- `www/examples/quickstart/runtime/workbench-lessons.ts`: the `host` union gains `'loopback'`. Set it on `server-threads` and `public-endpoint`.
- `react/src/ServerWorkbench.tsx:159` and `angular/src/app/server-workbench.ts:144`: their `controller.initialize()` calls.
- `runtime/workbench-server-history.ts` and `runtime/workbench-server-controls.ts`
- Wherever the hosted sidebar groups lessons.
- `www/src/components/workbench/workbench-lessons.ts`: replace the hand-kept `LOOPBACK_LESSONS` with the flag.
- `www/src/tools/verify-embed-workbench.ts`

**Interfaces:** `WorkbenchLesson.host?: 'production-reference' | 'loopback'`. Docs `workbenchLiveAvailability` derives loopback from it.

- [ ] **Step 1: Write the failing tests.**
  - Replay embed mode (`getWorkbenchEmbedMode(location.search) === 'replay'`) never calls `initialize()` and sends no session request.
  - Off a loopback host, a loopback lesson renders a static notice instead of the session controls: "This lesson runs on a local server. [Run the example](/docs/<sdk>/start/workbench#run-the-example)". "Start local session" and "Try anonymous request" are not rendered, and no `/session` call is made.
  - Cover both the React and Angular clients. Follow the existing `workbench-server-*.spec.ts` patterns.
- [ ] **Step 2: Implement.**
  - **Lesson routing:** `hostedWorkbenchLessons` must keep serving loopback lessons in replay embeds. Check how the lesson query resolves, so that `?lesson=server-threads&embed=replay` still loads that lesson on the hosted build. If excluding them from `hostedWorkbenchLessons` would break that, keep them in it and key the UI off the flag instead.
  - **Detecting loopback:** use whatever the server already uses to answer 403 "Use the loopback local demo host" (`server/workbench-threads.ts:53-55`); do not invent a new rule.
  - **Docs panel:** loopback lessons still show no "Open full workbench" link and keep the local Live instructions, as today.
- [ ] **Step 3: Assert no API calls in the embed harness.**
  - `verify-embed-workbench.ts` asserts that zero requests whose path starts with `/api/` happen during a replay. Add a `server-threads` replay case next to `tools`.
  - It needs running servers, so run it only if they start cleanly; otherwise say so.
- [ ] **Step 4: Commit** as `fix(www): keep loopback-only lessons off the hosted server`.

### Task 3: Copy that fits every host

**Files:**

- `www/examples/quickstart/server/workbench-app.ts:306,388`
- `www/src/components/workbench/workbench-lessons.ts` (`workbenchLiveAvailability`)
- `WorkbenchPanelClient.tsx` (the Live loopback notice)
- `www/test/workbench-panel.spec.tsx:600`, which locks in the wrong copy

- [ ] **Step 1: Write the failing tests.**
  - Server failure, rate limit and abort messages contain no "local server".
  - The `production-recovery` Live notice says it needs the B4.run Postgres host and links to `/docs/<sdk>/platform/b4run`.
  - The loopback notice still says "runs only on a local server" and links to run-the-example.
- [ ] **Step 2: Implement.**
  - Use neutral server copy, for example "The demo request failed. Try again in a moment."
  - `WorkbenchLiveAvailability`'s `live: false` branch gains `reason: 'loopback' | 'production-reference'`, and the panel renders copy that matches the reason.
- [ ] **Step 3: Commit** as `fix(www): neutral workbench error copy`.

### Task 4: Docs panel robustness

**File:** `www/src/components/workbench/WorkbenchPanelClient.tsx`, plus `WorkbenchPanel.tsx`, `docs-components.tsx`, `WorkbenchPanel.module.css` and `www/test/workbench-panel.spec.tsx`.

- [ ] **Step 1: Write the failing tests.**
  - **Double ready:** two `ready` messages before the capture fetch resolves post exactly one `load`, from the latest ready. A pending See it run moment still seeks after `loaded`.
  - **Re-seek after reload:** a second `ready` after a seek re-seeks to the last moment (the `lastMoment` path, currently untested).
  - **Unknown moment:** a `rejected` with reason `milestone` after a See it run leaves the replay playable. The panel shows the "Open full workbench" link as the fallback where it exists; no other UI is needed. It never throws.
  - **Region:** the narrow panel's focus target has `role="region"` and `aria-label="<title> workbench"`.
- [ ] **Step 2: Implement.**
  - Add a ready-generation counter, so only the latest generation's capture `.then` posts `load`.
  - Remove the dead `moments` prop from `WorkbenchPanel`, `WorkbenchPanelClient` and `docsComponents`. Keep `WorkbenchPageData.moments` only if a test uses it.
  - Give the Source tabpanel a `min-height` equal to the Replay frame's reserved box while loading (the audit measured 623 px, then 230 px, then 672 px). Use the same aspect-ratio box rather than a magic number.
  - Add the narrow region's role and label.
- [ ] **Step 3: Commit** as `fix(www): steady docs workbench replay and source`.
