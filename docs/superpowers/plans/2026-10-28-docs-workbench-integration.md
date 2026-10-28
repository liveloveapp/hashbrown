# Docs Workbench Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every docs page with a workbench lesson shows an inline panel with Replay (a recorded run in the real workbench UI), Live (the hosted workbench) and Source (the lesson's files with highlighted lines). Code snippets get "See it run". Pages without a lesson get a launcher for their closest lesson.

**Architecture:**
- **Embed mode.** The hosted workbench (`workbench.hashbrown.dev`) gains an embed mode (`?embed=replay|live`) that hides the sidebar.
- **Messages.** It talks to the docs page over a versioned `postMessage` protocol:
  - the docs page fetches a recorded capture JSON from hashbrown.dev and posts it into the iframe
  - the docs page asks the iframe to seek to stable milestone IDs
- **Captures** are produced by the existing live recorder, next to the videos.
- **Source** files and snippet line ranges are resolved at docs build time. Unresolvable snippets or unknown moments fail the build.

**Tech Stack:**
- workbench runtime: framework-agnostic TS in `www/examples/quickstart/runtime`, with React and Angular wrappers
- Vite build: `www/src/tools/build-workbench.ts`
- Vercel Build Output: `tools/workbench`
- docs site: Next.js App Router in `www/`
- unified/rehype markdown: `www/src/lib/markdown.tsx`
- Shiki: `www/src/lib/rehype-shiki.ts`
- tests: Vitest (`www/vitest.config.mts`, `test/**/*.spec.{ts,tsx}`, jsdom opt-in per file) and Playwright verifiers (`www/src/tools/verify-*.ts`)

**Spec:** `docs/superpowers/specs/2026-10-27-docs-workbench-integration-design.md`

## Global Constraints

- **Branch.** Start each PR branch from current `origin/main`. This worktree is ~270 files behind; do not build on it.
- **Shipping order.** PR A (workbench) must be merged *and deployed* to `https://workbench.hashbrown.dev` before PR C is merged. Docs previews and local docs frame the production workbench.
- **Tests.** Top-level `test(...)` only, arrange/act/assert separated by blank lines. Write the failing test first. No `describe`/`it`/`beforeEach`.
- **Docs and dependencies.** TSDoc `/** */` on every new exported function and type. No new dependencies.
- **Checks per PR.** Run `npx nx lint www`, `npx nx test www`, `npx nx build www`, `npx nx workbench-e2e www`. Also run `npx nx build workbench` when `tools/workbench` or the workbench runtime changes. Report failures and warnings.
- **Framing origins.** Exactly `https://hashbrown.dev https://www.hashbrown.dev https://*.vercel.app http://localhost:*`.
- **Workbench origin in docs.** `process.env.NEXT_PUBLIC_WORKBENCH_ORIGIN ?? 'https://workbench.hashbrown.dev'`.
- **Loopback-only lessons.** `server-threads` and `public-endpoint` have Replay and Source but no Live. Their Live tab links to `/docs/<sdk>/start/workbench#run-the-example`.
- **Narrow viewports.** Below 800px viewport width the panel renders the existing `DocsDemoVideo` for the lesson's media ID, plus an "Open full workbench ↗" link.
- **No load or spend without the reader.**
  - Nothing (no iframe, no capture fetch) loads until the panel is within 200px of the viewport.
  - No model request is ever made without the reader clicking the Live tab and then Send.
- **`Sdk`.** Means `'react' | 'angular'`, from `www/src/lib/content.ts` (`SDKS`). If no named type is exported there, export `type Sdk = (typeof SDKS)[number]` from it in Task 10.
- **Message types.** All are prefixed `hb-workbench:`, and the protocol carries `version: 1`.
- **Snippet anchor attribute.** `moment="<milestone id>"`. Do not reuse `run`: it already exists on `CodeExample` and means a link URL.

## Review Focus

1. **Version mismatch.** The docs deploy before the workbench, or the capture version differs from the workbench's. The panel shows the video plus "Open full workbench ↗", never a blank or broken iframe. Tests: Task 10 (ready timeout), Task 6 (version rejection).
2. **Iframe blocked or offline.** CSP or the network fails, so no `ready` arrives within 8 s. The panel falls back to the video plus link. Test: Task 10.
3. **Foreign origins.** A message from an origin that is not the workbench (or not an allowed parent) is ignored. Tests: Task 6 (child side) and Task 10 (parent side).
4. **Stale anchors.** A `moment` on a snippet names a milestone that no longer exists after a re-record. The docs build fails, naming page, snippet header and moment. Test: Task 15.
5. **Oversized captures.** A capture is larger than 2 MB or reached the store's 2000-event cap (`status === 'error'`). Publishing refuses it. Test: Task 8.

---

## PR A: Workbench embed mode (ships and deploys first)

### Task 1: Capture format

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-capture.ts`
- Test: `www/test/workbench-capture.spec.ts`

**Interfaces:**
- Produces:
  - `WORKBENCH_CAPTURE_VERSION = 1`
  - `interface WorkbenchCapture { version: 1; lesson: WorkbenchLessonId; framework: 'react' | 'angular'; commit: string | null; recordedAt: string; events: readonly WorkbenchEvent[] }`
  - `createWorkbenchCapture(snapshot: WorkbenchSnapshot, meta: { lesson: WorkbenchLessonId; framework: 'react' | 'angular'; recordedAt: string }): WorkbenchCapture`. `commit` is `null`; the publisher fills it.
  - `parseWorkbenchCapture(value: unknown): WorkbenchCapture | null`. Returns null on a wrong version, an unknown lesson, a bad framework, or `events` that is not an array of objects with numeric `sequence`, `turn` and `elapsedMs`.

- [ ] **Step 1:** Write the failing tests:
  - `test('creates a capture from a store snapshot with every event and no commit')`: use `createWorkbenchStore()`, `store.send('Plan')`, a few `store.record(...)` calls, then `createWorkbenchCapture(store.getSnapshot(), …)`. Expect `events.length` to equal the snapshot's and `commit` to be null. Round-trip through `JSON.parse(JSON.stringify(...))` and `parseWorkbenchCapture`, then `toEqual` the original.
  - `test('rejects captures with another version, an unknown lesson or malformed events')`: three cases, each `toBeNull()`.
- [ ] **Step 2:** Run `npx vitest run --config www/vitest.config.mts www/test/workbench-capture.spec.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement in `workbench-capture.ts`. Validate lesson IDs against `workbenchLessons` from `workbench-lessons.ts`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(www): add the workbench capture format`.

### Task 2: Read-only store hydration

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench.ts`. Edit the `WorkbenchStore` interface (≈:156–217) and `createWorkbenchStore` (≈:388; `seek` ≈:1404, `live` ≈:1418, the public `record` ≈:1070, `send`).
- Test: `www/test/workbench.spec.ts` (extend)

**Interfaces:**
- Consumes: `WorkbenchCapture` (Task 1).
- Produces:
  - `WorkbenchStore.load(events: readonly WorkbenchEvent[]): void`. It replaces events (frozen clones), sets `cursor = 0`, sets `status` and `application` from the last event, and marks the store read-only.
  - `WorkbenchSnapshot.readOnly: boolean`.
  - While read-only, `send`, `record` and every domain recorder are no-ops, and `live()` keeps the cursor at the last event instead of `null`. `seek` works as today.

- [ ] **Step 1:** Write the failing tests:
  - `test('load replays captured events read-only from the first event')`: after `load(capture.events)` the snapshot has `cursor 0` and `readOnly true`. `seek(3)` moves the cursor. `send('x')` and `record('user', …)` leave `events.length` unchanged. `live()` sets the cursor to `events.length - 1`.
  - `test('load refuses while a live run is loading')`: put the store in loading status via `send`, then `load` is a no-op.
- [ ] **Step 2:** Run `npx vitest run --config www/vitest.config.mts www/test/workbench.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `load` and the `readOnly` flag. `notify()` includes `readOnly` in the snapshot.
- [ ] **Step 4:** Run `www/test/workbench.spec.ts` and `www/test/workbench-workflow-seek.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(www): load a captured run into a read-only workbench store`.

### Task 3: Stable milestone IDs

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-timeline.ts`. `WorkbenchMilestone` is at ≈:6–10 and `workbenchMilestones` at ≈:13.
- Modify: `www/examples/quickstart/runtime/workbench-view.ts`, where milestone ticks render `data-index` (≈:1585): also render `data-milestone`.
- Test: `www/test/workbench-timeline.spec.ts` (extend)

**Interfaces:**
- Produces: `WorkbenchMilestone.id: string`. The ID is `` `${slug(label)}-${turn}` `` where `slug` lowercases and replaces runs of non-alphanumerics with `-`, for example `tool-result-1` or `plan-accepted-1`. A later duplicate in the same turn gets `-2`, `-3`, and so on: `streaming-json-1`, `streaming-json-1-2`.
- Also produces: `findWorkbenchMilestone(events: readonly WorkbenchEvent[], id: string, format?: WorkbenchLesson['format']): WorkbenchMilestone | null`.

- [ ] **Step 1:** Write the failing tests:
  - `test('milestones carry readable ids unique within a capture')`: a two-turn tools run. Expect IDs to include `prompt-1`, `tool-result-1`, `plan-accepted-1`, `prompt-2`. `new Set(ids).size === ids.length`.
  - `test('findWorkbenchMilestone returns the milestone by id and null for unknown ids')`
- [ ] **Step 2:** Run `www/test/workbench-timeline.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Labels and indices are unchanged.
- [ ] **Step 4:** Run `www/test/workbench-timeline.spec.ts` and `www/test/workbench-shell.spec.tsx`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(www): give workbench milestones stable ids`.

### Task 4: Embed mode layout

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-embed.ts`
- Modify: `www/examples/quickstart/runtime/workbench-view.ts`:
  - `WorkbenchMountOptions` (≈:338–363)
  - `mountWorkbench` (≈:373)
  - `renderNavigation` (≈:451–491)
  - the layout append (≈:847)
- Modify: `www/examples/quickstart/runtime/workbench.css`
- Test: `www/test/workbench-embed.spec.ts` (jsdom)

**Interfaces:**
- Produces:
  - `type WorkbenchEmbedMode = 'replay' | 'live' | null`
  - `getWorkbenchEmbedMode(search: string): WorkbenchEmbedMode`, which reads `?embed=`. Any other value gives `null`.
  - `WorkbenchMountOptions.embed?: WorkbenchEmbedMode`, defaulting to `getWorkbenchEmbedMode(globalThis.location?.search ?? '')`. Every React and Angular wrapper therefore gets it without edits.
- Embedded behaviour:
  - The root gets `wb-embed` and `data-embed="<mode>"`.
  - The sidebar nav is not appended, and the `toggle-sidebar` shortcut is ignored.
  - New conversation is disabled.
  - Layout is read from but never written to localStorage.
  - In `replay` the composer is hidden and the status shows "Waiting for recording".

- [ ] **Step 1:** Write the failing tests:
  - `test('getWorkbenchEmbedMode accepts replay and live only')`
  - `test('embedded mounts render chat, inspector and player without the sidebar')`: mount with `{ embed: 'live' }`. Expect no `.wb-lessons`, `.wb-embed` present, and the inspector and player present.
  - `test('embedded replay hides the composer until a capture loads')`
- [ ] **Step 2:** Run `www/test/workbench-embed.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx nx test www`. Expected: PASS, with no change to non-embed shell tests.
- [ ] **Step 5:** Commit `feat(www): add an embed mode to the workbench`.

### Task 5: Hosted framing header

**Files:**
- Create: `tools/workbench/vercel-config.mjs`, exporting `workbenchVercelConfig()`, which returns the Build Output `config.json` object.
- Create: `tools/workbench/vercel-config.test.mjs`
- Modify: `tools/workbench/build-vercel-output.mts`, to write `workbenchVercelConfig()`.
- Modify: `tools/workbench/project.json`, adding a `test` target: `node --test tools/workbench/*.test.mjs`.

**Interfaces:**
- Produces: `config.json` routes. First, `{ src: '^/(.*)$', headers: { 'Content-Security-Policy': "frame-ancestors https://hashbrown.dev https://www.hashbrown.dev https://*.vercel.app http://localhost:*" }, continue: true }`. Then the existing redirect and the API rewrite, unchanged.

- [ ] **Step 1:** Write the failing tests with `node:test`, top-level `test()`:
  - `test('every response allows framing only by the docs origins')`: assert the exact header string and `continue: true`.
  - `test('keeps the root redirect and api rewrite')`
- [ ] **Step 2:** Run `node --test tools/workbench/vercel-config.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire it into the builder.
- [ ] **Step 4:** Run `npx nx test workbench && npx nx build workbench`. Expected: PASS, and `tools/workbench/.vercel/output/config.json` contains the header.
- [ ] **Step 5:** Commit `feat(workbench): allow the docs site to frame the hosted workbench`.

### Task 6: postMessage protocol (workbench side)

**Files:**
- Create: `www/examples/quickstart/runtime/workbench-messages.ts`
- Modify: `www/examples/quickstart/runtime/workbench-view.ts` (`mountWorkbench`: attach when `embed !== null`; detach in `dispose`)
- Test: `www/test/workbench-messages.spec.ts` (jsdom)

**Interfaces:**
- Produces, in `workbench-messages.ts`:
  - `WORKBENCH_MESSAGE_VERSION = 1`
  - ``type WorkbenchParentMessage = { type: 'hb-workbench:load'; version: 1; capture: WorkbenchCapture } | { type: 'hb-workbench:seek'; version: 1; milestone: string } | { type: 'hb-workbench:play'; version: 1 }``
  - ``type WorkbenchChildMessage = { type: 'hb-workbench:ready'; version: 1; mode: 'replay' | 'live'; lesson: WorkbenchLessonId; framework: 'react' | 'angular' } | { type: 'hb-workbench:loaded'; version: 1; milestones: readonly { id: string; label: string }[]; commit: string | null } | { type: 'hb-workbench:rejected'; version: 1; reason: 'version' | 'lesson' | 'malformed' } | { type: 'hb-workbench:state'; version: 1; mode: 'replay' | 'live'; milestone: string | null; playing: boolean }``
  - `isAllowedParentOrigin(origin: string): boolean`. It matches the Global Constraints origins: exact `https://hashbrown.dev` or `https://www.hashbrown.dev`, any `https://<label>.vercel.app` with one label, and `http://localhost:<port>`.
  - `parseWorkbenchParentMessage(data: unknown): WorkbenchParentMessage | null`
- Behaviour in `mountWorkbench` when embedded:
  - Post `ready` to `window.parent` with `'*'`. It carries no secrets.
  - Accept messages only from `isAllowedParentOrigin`, and remember that origin for all later posts.
  - `load` in replay mode:
    - Parse with `parseWorkbenchCapture` and check that `capture.lesson` matches the page's lesson. A failure posts `rejected`.
    - On success, `store.load(capture.events)`, show "Recorded at `<commit.slice(0,7)>`" in the status, and post `loaded` with `workbenchMilestones(...).map(({id,label}) => ({id,label}))`.
  - `seek` calls `store.seek(findWorkbenchMilestone(...).index)`, stops playback, and posts `state`. An unknown ID is a no-op.
  - `play` starts playback. `state` is posted on every cursor change.

- [ ] **Step 1:** Write the failing tests:
  - `test('posts ready on mount and ignores messages from foreign origins')`
  - `test('loads a matching capture and reports its milestone ids')`
  - `test('rejects a capture for another lesson or version')`
  - `test('seek moves the replay to the named milestone and reports state')`
  - `test('isAllowedParentOrigin accepts docs, previews and localhost only')`: accepts `https://hashbrown.dev`, `https://hashbrown-www-abc-blovedev.vercel.app`, `http://localhost:3000`. Rejects `https://evil.com`, `https://a.b.vercel.app`, `http://hashbrown.dev`.
- [ ] **Step 2:** Run `www/test/workbench-messages.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx nx test www`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(www): let a docs page drive an embedded workbench`.

### Task 7: Ship PR A

- [ ] **Step 1:** Extend `www/src/tools/verify-workbench.ts` with one fixture check:
  - open `react.html?lesson=tools&embed=replay` in a page
  - post a fixture capture from a test harness page served on the same verifier server
  - assert `loaded` and seek behaviour
  - assert `.wb-lessons` is absent
- [ ] **Step 2:** Run all checks in Global Constraints. Expected: all pass.
- [ ] **Step 3:** Open the PR `feat(www): embed mode for the hosted workbench`, merge on green, and confirm the `main` deploy.
- [ ] **Step 4:** Verify live:
  - `curl -sI https://workbench.hashbrown.dev/react.html` shows the `frame-ancestors` header.
  - `https://workbench.hashbrown.dev/react.html?lesson=tools&embed=live` has no sidebar and sends a run.

---

## PR B: Live-recorded captures

### Task 8: Capture recording and publishing

**Files:**
- Modify: `www/examples/quickstart/runtime/workbench-view.ts`. In `mountWorkbench`, set `globalThis.hashbrownWorkbench = { capture: (recordedAt: string) => createWorkbenchCapture(store.getSnapshot(), { lesson, framework, recordedAt }) }` and delete it in `dispose`.
- Create: `www/src/tools/workbench-capture-file.ts`
- Modify: `www/src/tools/verify-workbench.ts`, before `page.video()` / `page.close()` (≈:1405), and each delegated `verify-*-workbench.ts` before its `video.saveAs`. Call `saveWorkbenchCapture` when `WORKBENCH_RECORD === '1'`.
- Modify: `www/src/tools/record-workbench.ts`, in the publish step (≈:129–131 and the generative-ui copy ≈:343–358).
- Test: `www/test/workbench-capture-file.spec.ts`

**Interfaces:**
- Consumes: `createWorkbenchCapture` and `parseWorkbenchCapture` (Task 1).
- Produces, in `workbench-capture-file.ts`:
  - `saveWorkbenchCapture(page: Page, path: string): Promise<void>` evaluates `globalThis.hashbrownWorkbench.capture(new Date().toISOString())` and writes the JSON.
  - `publishWorkbenchCapture(raw: string, commit: string): string` parses, sets `commit`, and returns the JSON. It throws `Capture for <framework>/<lesson> is <n> bytes; the limit is 2000000` when the output exceeds 2 MB. It throws `Capture for <framework>/<lesson> ended in error` when the last event's `status === 'error'`.
- Publishing:
  - `record-workbench.ts` reads `${framework}-${lesson}-live.capture.json` and calls `publishWorkbenchCapture` with `git rev-parse HEAD`.
  - It writes `www/public/video/docs/<id>-capture.json`, using the same `id` as the video. The generative-ui lesson also goes to `canonical-workbench-<framework>-capture.json`.

- [ ] **Step 1:** Write the failing tests:
  - `test('publishing stamps the commit and keeps every event')`
  - `test('publishing refuses captures over 2 MB')`
  - `test('publishing refuses captures that ended in error')`
- [ ] **Step 2:** Run `www/test/workbench-capture-file.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement, and wire it into the verifiers and the recorder.
- [ ] **Step 4:** Run `npx nx test www && npx nx workbench-e2e www`. Expected: PASS. Fixture runs do not write captures, because recording is off.
- [ ] **Step 5:** Commit `feat(www): record and publish workbench captures with the videos`.

### Task 9: Live re-record every lesson

- [ ] **Step 1:** Run `npx nx workbench-build www`.
- [ ] **Step 2:** For each batch of about 4 lessons, run `WORKBENCH_LESSONS=<ids> OPENAI_MODEL=gpt-4.1-mini TYPESAFE_MODEL=jev-1.14.0 node --env-file=<repo root>/.env node_modules/.bin/tsx www/src/tools/record-workbench.ts`. Cover all 28 lesson IDs from `workbench-lessons.ts`, both frameworks. Retry only the batch that flakes.
  - Known flake: the onboarding first-plan partial stream.
  - Verifiers select milestone ticks with `.press('Enter')`.
- [ ] **Step 3:** Check the output. `ls www/public/video/docs/canonical-workbench-*-capture.json | wc -l` should equal the number of `canonical-workbench-*` video IDs in `docs-demo-media.ts`. Each capture parses with `parseWorkbenchCapture` and has a 40-character `commit`.
- [ ] **Step 4:** Commit `docs(www): re-record the workbench media with captures`, then open the PR and merge on green.

---

## PR C: Docs panel with Replay and Live

### Task 10: `WorkbenchPanel` (Replay and Live)

**Files:**
- Create: `www/src/components/workbench/workbench-lessons.ts`
- Create: `www/src/components/workbench/WorkbenchPanel.tsx` (`'use client'`)
- Create: `www/src/components/workbench/WorkbenchPanel.module.css`
- Create: `www/src/components/workbench/embed-client.ts`
- Test: `www/test/workbench-panel.spec.tsx` (jsdom)

**Interfaces:**
- Consumes: the message types (Task 6), via a type-only import from `examples/quickstart/runtime/workbench-messages`. `WorkbenchCapture` type (Task 1).
- Produces:
  - `workbenchMediaId(lesson: WorkbenchLessonId, sdk: Sdk): DocsDemoId` maps lesson IDs to video IDs with the recorder's `names` (`generative-ui → ui`, `structured-output → structured`, everything else identity).
  - `LOOPBACK_LESSONS: readonly WorkbenchLessonId[] = ['server-threads', 'public-endpoint']`.
  - `workbenchOrigin(): string`, as in Global Constraints.
  - `createEmbedClient(frame: HTMLIFrameElement, origin: string, handlers: { ready(msg); loaded(msg); rejected(msg); state(msg) }): { post(msg: WorkbenchParentMessage): void; dispose(): void }`. It ignores messages whose `origin !== origin` or whose `source !== frame.contentWindow`.
  - `WorkbenchPanel(props: { lesson: WorkbenchLessonId; sdk: Sdk; source?: WorkbenchSourceData; moments?: readonly string[] })`. `source` and `moments` are optional until PR D/E.
- Behaviour:
  - The tabs (`role="tablist"`) are Replay (default), Live and Source. Source is hidden while `source` is undefined.
  - **Mounting.** Under 800px (`matchMedia('(max-width: 799px)')`), render `DocsDemoVideo demo={workbenchMediaId(...)}` plus the open link. Otherwise a placeholder (poster image) waits for an IntersectionObserver with `rootMargin: '200px'`, then mounts the Replay iframe.
    - Replay iframe: `src={origin}/{sdk}.html?lesson={lesson}&embed=replay`, `title="Hashbrown workbench replay: <lesson title>"`.
  - **Replay load.** On `ready`, fetch `/video/docs/<mediaId>-capture.json` and post `load`.
  - **Fallback.** Swap to the video plus link on any of: no `ready` within 8000 ms, a failed fetch, or `rejected`.
  - **Live** tab click:
    - Normal lessons mount a second iframe `…&embed=live` and keep the replay frame alive but hidden.
    - Loopback lessons show "This lesson runs only on a local server" with a link to `/docs/<sdk>/start/workbench#run-the-example`.
  - "Open full workbench ↗" always links to `{origin}/{sdk}.html?lesson={lesson}`.

- [ ] **Step 1:** Write the failing tests:
  - `test('renders nothing heavy until the panel nears the viewport')`: no iframe before the observer fires.
  - `test('loads the capture into the replay frame after ready')`: stub `fetch` and the iframe `contentWindow.postMessage`, then dispatch a `MessageEvent` from the workbench origin.
  - `test('falls back to the recorded video when ready never arrives')`: fake timers, 8000 ms.
  - `test('falls back when the workbench rejects the capture')`
  - `test('ignores messages from other origins or frames')`
  - `test('Live mounts a live frame only after the tab is clicked')`
  - `test('loopback lessons link to running locally instead of Live')`
  - `test('narrow viewports get the video and an open link')`
  - `test('workbenchMediaId maps generative-ui and structured-output to their media names')`
- [ ] **Step 2:** Run `www/test/workbench-panel.spec.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. Style with the www LLA tokens and 4px spacing tokens already used by `DocsDemoVideo.module.css`.
- [ ] **Step 4:** Run the same file. Expected: PASS.
- [ ] **Step 5:** Commit `feat(www): add the inline workbench panel`.

### Task 11: Replace the videos with the panel

**Files:**
- Modify: `www/src/components/docs-components.tsx` (≈:32–62). Add `'hb-workbench': (props: { lesson: string }) => <WorkbenchPanel lesson={assertWorkbenchLesson(props.lesson)} sdk={sdk} />`.
- Create, in `www/src/components/workbench/workbench-lessons.ts`: `assertWorkbenchLesson(value: string): WorkbenchLessonId`, which throws `Unknown workbench lesson: <value>`.
- Modify: every `www/content/docs/{react,angular}/**.md` that has `<hb-docs-demo demo="canonical-workbench-…">`. Replace it with `<hb-workbench lesson="<lesson id>">\n</hb-workbench>`, using the page and lesson table from the spec research. `threadplane` and non-workbench demos stay `hb-docs-demo`. `start/workbench` uses `generative-ui`.
- Test: extend `www/test/element-inventory.spec.ts` and `www/test/docs/workbench-guides.spec.ts`.

- [ ] **Step 1:** Write the failing tests:
  - `test('no docs page embeds a canonical workbench video directly')`: grep content for `hb-docs-demo demo="canonical-workbench`. Expect zero matches.
  - `test('every hb-workbench lesson is a known lesson with a published capture')`: each lesson's `www/public/video/docs/<mediaId>-capture.json` exists for both SDKs, and `parseWorkbenchCapture` accepts it. A format-version bump without a re-record fails here.
- [ ] **Step 2:** Run both specs. Expected: FAIL.
- [ ] **Step 3:** Do the content replacement with a one-off script that is not committed, then register the element.
- [ ] **Step 4:** Run `npx nx test www && npx nx build www && npx nx e2e www`. Expected: PASS. The route report renders every page.
- [ ] **Step 5:** Commit, then open the PR `feat(www): run the workbench inline on docs pages`. Before merging, verify on the preview (label `preview`):
  - React Tools Replay plays.
  - Live sends a run.
  - Narrow width shows the video.
  - A Lighthouse performance score on React Tools that is no lower than on `main`.

---

## PR D: Source view

### Task 12: Snippet line resolution

**Files:**
- Create: `www/src/lib/workbench-source.ts`
- Test: `www/test/workbench-source.spec.ts`

**Interfaces:**
- Produces:
  - `resolveSnippetLines(file: string, snippet: string): { start: number; end: number } | null`. Line numbers are 1-based and inclusive. Lines are compared after `trim()`, ignoring leading and trailing blank snippet lines. This is the same normalization as `www/test/docs/workbench-guides.spec.ts`. The first match wins.
  - `WORKBENCH_SNIPPET_ROOTS = ['react/', 'angular/', 'runtime/', 'server/'] as const`: header prefixes resolved under `www/examples/quickstart/`.

- [ ] **Step 1:** Write the failing tests:
  - `test('finds an indented snippet by trimmed lines')`
  - `test('returns null when the snippet is not in the file')`
  - `test('every workbench snippet in the docs resolves')`: loop all `hb-code-example header="(react|angular|runtime|server)/…"` blocks in `www/content/docs`. The survey found 80, all resolvable.
- [ ] **Step 2:** Run the spec. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the spec. Expected: PASS.
- [ ] **Step 5:** Commit `feat(www): resolve workbench snippets to source lines`.

### Task 13: Build-time source data and the Source tab

**Files:**
- Create: `www/src/lib/workbench-source-files.ts`
- Modify: `www/src/components/docs-markdown.tsx` (`renderDocsMarkdown` ≈:19–26). After `parseMarkdown`, collect `hb-code-example` nodes with workbench headers and the page's `hb-workbench` lesson. Build `WorkbenchSourceData` and pass it to the `hb-workbench` mapping in `docsComponents`. Add a third parameter: `docsComponents(sdk, popovers, workbench?: WorkbenchPageData)`.
- Modify: `WorkbenchPanel.tsx`, to render the Source tab.
- Test: `www/test/workbench-source-files.spec.ts`, plus extend `workbench-panel.spec.tsx`.

**Interfaces:**
- Consumes: `resolveSnippetLines` (Task 12) and `highlightCode` (`www/src/lib/rehype-shiki.ts:114`).
- Produces:
  - `WORKBENCH_LESSON_FILES: Record<WorkbenchLessonId, { react: readonly string[]; angular: readonly string[] }>`: repo paths under `www/examples/quickstart/`. The framework wrapper comes first, then the server route or schema, then shared runtime files. Choose per lesson by reading which wrapper `Workbench()` / `Workbench` selects for it (React `Workbench.tsx:300–336`, Angular `workbench.ts:444–462`). The test pins `tools` exactly: react `['react/src/Workbench.tsx', 'server/workbench-app.ts', 'runtime/workbench.ts']`.
  - `interface WorkbenchSourceData { commit: string; files: readonly { path: string; html: string; highlights: readonly { start: number; end: number }[] }[] }`
  - `buildWorkbenchSource(lesson: WorkbenchLessonId, sdk: Sdk, snippets: readonly { header: string; code: string }[]): Promise<WorkbenchSourceData>`. It throws `<header>: snippet not found in www/examples/quickstart/<header>` for an unresolvable snippet. `commit` is `process.env.VERCEL_GIT_COMMIT_SHA ?? execSync('git rev-parse HEAD')`.
  - `type WorkbenchPageData = { source: WorkbenchSourceData; moments: readonly string[] }`. `moments` stays empty until Task 15.
- Source tab UI:
  - A file list, then the highlighted file.
  - Highlighted lines carry `data-highlighted`, a 4px left border marker and a visually hidden "highlighted" label, so color is not the only signal.
  - The panel scrolls to the first highlight.
  - Link text "View on GitHub ↗", pointing to `https://github.com/liveloveapp/hashbrown/blob/<commit>/www/examples/quickstart/<path>#L<start>-L<end>`.

- [ ] **Step 1:** Write the failing tests:
  - `test('tools source lists its files and highlights the page snippets')`
  - `test('an unresolvable snippet fails with its header')`
  - `test('every lesson has source files that exist')`
  - In the panel spec: `test('Source tab shows files, marks highlighted lines and links to GitHub at the commit')`
- [ ] **Step 2:** Run the specs. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx nx test www && npx nx build www`. Expected: PASS.
- [ ] **Step 5:** Commit, then open the PR `feat(www): show workbench source on docs pages` and merge on green.

---

## PR E: "See it run"

### Task 14: `moment` on code examples

**Files:**
- Modify: `www/src/components/CodeExample.tsx`. Add a `moment?: string` prop that renders a `<button type="button">See it run</button>`. On click it dispatches `new CustomEvent('hb-workbench:see-it-run', { bubbles: true, detail: { moment, snippet: <the example's DOM node id> } })`. Give each example a stable `id` derived from header and order.
- Modify: `WorkbenchPanel.tsx`. Listen on `document`. On the event:
  - `scrollIntoView({ block: 'center', behavior: 'smooth' })`
  - switch to Replay, mounting it if needed and waiting for `loaded`
  - post `seek`
  - set `data-highlighted` on the snippet element
  - select the snippet's file and range in Source
- Test: extend `www/test/workbench-panel.spec.tsx` and add `www/test/code-example.spec.tsx` (jsdom).

- [ ] **Step 1:** Write the failing tests:
  - `test('a code example with a moment renders See it run and dispatches its moment')`
  - `test('See it run scrolls to the panel, seeks the replay and highlights the snippet')`
  - `test('See it run before the replay loads seeks once loaded')`
- [ ] **Step 2:** Run the specs. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the specs. Expected: PASS.
- [ ] **Step 5:** Commit `feat(www): jump from a code example to the moment it runs`.

### Task 15: Validate and author moments

**Files:**
- Modify: `www/src/components/docs-markdown.tsx`. Collect `moment` attributes into `WorkbenchPageData.moments`, and validate each against `workbenchMilestones(capture.events, lesson.format)` IDs from `www/public/video/docs/<mediaId>-capture.json`.
- Modify: docs content, adding `moment="…"` to the workbench snippets on each concept page with a matching milestone. At minimum, React and Angular `concept/functions` `readContext` gets `moment="tool-result-1"`. Check IDs against the published captures.
- Test: extend `www/test/docs/workbench-guides.spec.ts`.

- [ ] **Step 1:** Write the failing tests:
  - `test('every snippet moment names a milestone in its lesson capture')`: the failure message names the page, header and moment.
  - `test('the Tools pages link readContext to the tool result')`
- [ ] **Step 2:** Run the spec. Expected: FAIL.
- [ ] **Step 3:** Implement validation (it throws at build), then add `moment` attributes across the concept pages.
- [ ] **Step 4:** Run `npx nx test www && npx nx build www && npx nx e2e www`. Expected: PASS.
- [ ] **Step 5:** Commit, then open the PR `feat(www): see code examples run in the workbench`. Verify on the preview that clicking React Tools "See it run" seeks to the tool result and highlights in both places.

---

## PR F: Launcher for pages without a lesson

### Task 16: Closest-lesson launcher

**Files:**
- Create: `www/src/components/workbench/workbench-page-lessons.ts`
- Create: `www/src/components/workbench/WorkbenchLauncher.tsx`
- Modify: `www/src/app/docs/[sdk]/[...slug]/page.tsx`, to render `<WorkbenchLauncher>` after the page body when the slug is mapped and the body has no `hb-workbench`.
- Test: `www/test/workbench-launcher.spec.tsx`

**Interfaces:**
- Produces:
  - `WORKBENCH_CLOSEST_LESSON: Readonly<Record<string, WorkbenchLessonId>>`, keyed by slug path without SDK (for example `'concept/ai-basics'`). Fill it by reading each docs page that has no `hb-workbench` and choosing the lesson whose concept it discusses. Leave out pages with no sensible lesson, such as migrations and API reference.
  - `WorkbenchLauncher(props: { lesson: WorkbenchLessonId; sdk: Sdk })`: a compact card, "Try this in the workbench: <lesson title>", whose button expands into `<WorkbenchPanel lesson sdk />`.

- [ ] **Step 1:** Write the failing tests:
  - `test('every mapped page exists for both sdks and has no inline panel')`
  - `test('every mapped lesson is a known lesson')`
  - `test('the launcher expands into the panel for its lesson')`
- [ ] **Step 2:** Run the spec. Expected: FAIL.
- [ ] **Step 3:** Implement and fill the map.
- [ ] **Step 4:** Run `npx nx test www && npx nx build www && npx nx e2e www`. Expected: PASS.
- [ ] **Step 5:** Commit, then open the PR `feat(www): offer the closest workbench lesson on every docs page`, merge, and verify on production that a mapped page's launcher opens a working Replay.
