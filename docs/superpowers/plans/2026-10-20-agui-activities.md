# AG-UI Activities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface AG-UI activity messages in Hashbrown's message list, with public message ids, recorded links and a `groupTurns` helper, and let every provider send activities through an `activities` callback.

**Architecture:**
- **Core receives activities.** Core's canonical AG-UI history starts applying `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA` through a new pure module (`reducers/ag-ui-activity.ts`). Links are recorded at arrival and stored on the canonical activity record.
- **Projection and views.** The projection and view layers learn a fourth role, `activity`. User and assistant view messages gain a public `id`.
- **Providers send activities.** They wrap their event generator in `ɵwithActivities`, a core helper that merges callback events and holds the terminal event.

**Tech Stack:**
- TypeScript, `@ag-ui/core` / `@ag-ui/client` 1.0.2
- Jest (core, providers, conformance) and Vitest (React and Angular, as each package already uses)
- Angular signals, React hooks
- Playwright conformance hosts

**Spec:** `docs/superpowers/specs/2026-10-20-agui-activities-design.md`. Read it first. It decides every behaviour in this plan.

## Global Constraints

- **Prerequisite.** PRs #667 (OpenAI and Azure on the Responses API) and #668 (strip activity messages from run input) must be merged to `main` first. Rebase `blove/activities-design` onto that `main` before Task 1. Never undo either PR.
- **No new dependencies.** The only exception is the internal one the spec asks for: each provider package gains `"@hashbrownai/core"` in `dependencies`, pinned to the workspace version the way other internal deps are pinned.
- **Public versus internal exports.** Code that providers share is exported from core with the `ɵ` prefix. Public types (`ActivityMessage`, `ActivityLinks`, `ActivityContext`, `ActivityWriter`, `ActivityHandle`, `ActivityCallback`, `Turn`, `groupTurns`) carry no `ɵ`. No public signature exposes a `ɵ` type.
- **`ACTIVITY_SNAPSHOT` rules.**
  - A missing `replace` means overwrite. `replace: false` keeps the content and merges only `metadata`.
  - A replacing snapshot may change `subagentRunId`.
- **`ACTIVITY_DELTA` rules.**
  - A delta for an unknown id is dropped.
  - A delta whose patch fails is dropped but keeps any valid `metadata`.
  - Dropping a delta never fails the run, and logs a warning through `Logger` at WARN level.
  - Every delta Hashbrown emits includes `activityType`.
- **Activity `content`** is `Readonly<Record<string, unknown>>`, deep-frozen and copy-on-write. Reuse `applyJsonPatch` from `packages/core/src/utils/json-patch.ts`.
- **Links.**
  - The fields are `runId`, `assistantMessageId` (the last assistant message started in the current run), `toolCallId` (the latest tool call of any kind in the current run) and `subagentRunId`.
  - They are recorded on first creation and kept by later snapshots and deltas.
  - They are recomputed from position for activities arriving through `MESSAGES_SNAPSHOT`, `setMessages` or initial `messages`. Incoming links are never trusted.
  - They are stored on the canonical record as the field `hashbrownLinks`.
- **Public ids.**
  - User and assistant view messages have `readonly id: string`, which is the canonical id.
  - The id is stable while streaming and kept through lowering when the app supplies one. Lowering mints a new id only when none is supplied.
  - Error messages have no id.
- **Provider callback (`activities`).**
  - Events merge in arrival order, and the first callback event always comes after `RUN_STARTED`.
  - The provider's `RUN_FINISHED` or `RUN_ERROR` is held until the callback settles.
  - A callback error while the model is streaming aborts the model and ends the run with one `RUN_ERROR`. A callback error after the model ends replaces the held `RUN_FINISHED` with `RUN_ERROR`.
  - On abort there is no terminal event. Writes after abort are silent no-ops, and `model` rejects with an `AbortError`.
  - Writes after the run closes throw. So does a duplicate `snapshot` with a different `activityType`.
  - Without a callback, provider output is identical to today's.
- **Repo rules.** Top-level `test(...)` only, with arrange/act/assert separated by blank lines. Write the failing test first. TSDoc on every public or reusable symbol.
- **Before each commit,** run `npx nx test <project>` and `npx nx lint <project>` for every touched project.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Activity before any assistant text.** A run whose first event after `RUN_STARTED` is an activity snapshot puts the activity before the assistant message in the view list, with no `assistantMessageId`, and the streaming assistant message still appears after it. Task 4 pins this.
2. **Restore round trip.** After `setMessages` with saved messages (ids included), every user and assistant id is unchanged, and each activity's links point at those ids. Task 3 pins this.
3. **Third-party malformed delta.** A delta whose patch fails (for example `replace` on a missing path) leaves the run streaming and the activity unchanged. Task 2 pins this.
4. **Slow callback.** While the model streams, its text events reach the consumer at once and are not held behind a pending callback. Only the terminal event waits. Task 7 pins this.
5. **App code that switches on role.** An Angular `uiChatResource` or React `useUiChat` consumer given a history containing an activity does not throw, and `reload()` regenerates from the last user message, not from an activity. Task 6 pins this.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/models/view.models.ts` | `id` on `UserMessage` / `AssistantMessage`; `ActivityMessage`, `ActivityLinks`; union |
| `packages/core/src/models/internal.models.ts`, `internal_helpers.ts` | Internal activity variant; ids passed through; activity conversions |
| `packages/core/src/reducers/ag-ui-activity.ts` (new) | Pure snapshot, delta, link, recompute and snapshot-merge functions |
| `packages/core/src/reducers/ag-ui-messages.reducer.ts` | Wires activity events; tracks `currentRunId`, `lastToolCallId` |
| `packages/core/src/reducers/ag-ui-message-history.ts` | Lowering keeps ids and lowers activities; projection projects activities; reasoning-reset fix |
| `packages/core/src/reducers/{index.ts,status.reducer.ts,streaming-message.reducer.ts}` | Role switches, streaming order, last-message logic |
| `packages/core/src/models/group-turns.ts` (new) | `groupTurns`, `Turn` |
| `packages/core/src/activities/with-activities.ts` (new) | `ɵwithActivities`, the writer, public callback types |
| `packages/angular/src/...` (`ui-chat.helpers.ts`, `ui-chat-resource.fn.ts`, `chat-resource.fn.ts`) | Angular types and role handling |
| `packages/react/src/...` (`use-ui-chat.tsx`, `use-chat.ts`, `use-structured-chat.ts`) | React types and role handling |
| `packages/{openai,azure,anthropic,bedrock,google,ollama}/src/stream/{types.ts,text.fn.ts}`, `package.json` | `activities` option, wrapping, core dependency |
| `tools/conformance/...` | e2e case: a server sending activities, both hosts showing them |
| `www/content/docs/{angular,react}/...` | Activities concept page, provider sections, message-history fix, v0.8 guide |

---

### Task 1: Public ids on user and assistant view messages

**Files:**
- Modify: `packages/core/src/models/view.models.ts` (`UserMessage`, `AssistantMessage`)
- Modify: `packages/core/src/models/internal_helpers.ts` (`toViewMessagesFromInternal`)
- Modify: `packages/core/src/reducers/ag-ui-message-history.ts` (`lowerViewMessagesToAgUi`)
- Modify: `packages/core/src/reducers/index.ts` (streaming view entry)
- Tests next to each

**Interfaces:**
- Produces:
  - `UserMessage = { id: string; role: 'user'; content: JsonValue }`
  - `AssistantMessage<…>` gains `readonly id: string`.
  - Input paths accept `id` as optional: `setMessages` and initial `messages` take `Chat.AnyMessage` with `id?`. Add a `Chat.MessageInput` alias, or loosen the input type, whichever reads more clearly. Name it in the TSDoc.
  - `lowerViewMessagesToAgUi` uses `message.id ?? options.createId()` for user and assistant messages.

- [ ] **Step 1: Write the failing tests**
  - `test('view messages expose the canonical id of user and assistant messages', …)`
  - `test('the streaming assistant message keeps the id it has after commit', …)`
  - `test('lowering keeps a supplied id and mints one only when absent', …)`
  - `test('setMessages round-trips user and assistant ids', …)`: Review Focus 2, ids part.
- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx nx test core`
Expected: the new tests FAIL, because `id` is undefined.
- [ ] **Step 3: Implement.** Pass the internal `id` through. Expose the streaming message's canonical id: the accumulator's `messageId`. Keep the supplied id when lowering.
- [ ] **Step 4: Fix the existing tests and fixtures the new field breaks.** Use `expect.any(String)` where an id is minted.

Run: `npx nx test core && npx nx test angular && npx nx test react && npx nx lint core`
Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/core packages/angular packages/react
git commit -m "feat(core)!: expose stable ids on user and assistant messages"
```

---

### Task 2: Activity events in canonical history

**Files:**
- Create: `packages/core/src/reducers/ag-ui-activity.ts`, `ag-ui-activity.spec.ts`
- Modify: `packages/core/src/reducers/ag-ui-messages.reducer.ts` (state `currentRunId`, `lastToolCallId`; the `ACTIVITY_*` cases in `applyCanonicalMessageEvent` ~:325)
- Modify: `ag-ui-messages.reducer.spec.ts` (replace the "activity events are no-ops" test at ~:1394-1435)

**Interfaces:**
- Produces (all `@internal`, in `ag-ui-activity.ts`):
  ```ts
  export interface ActivityArrival { readonly runId?: string; readonly assistantMessageId?: string; readonly toolCallId?: string; }
  export function applyActivitySnapshot(messages: readonly Readonly<Message>[], event: ActivitySnapshotEvent, arrival: ActivityArrival): readonly Readonly<Message>[];
  export function applyActivityDelta(messages: readonly Readonly<Message>[], event: ActivityDeltaEvent): { readonly messages: readonly Readonly<Message>[]; readonly dropped?: string };
  export function readActivityLinks(message: Readonly<Message>): ActivityLinks | undefined; // reads `hashbrownLinks`
  ```
- **Reducer state** tracks:
  - `currentRunId`, set from `RUN_STARTED.runId` and cleared on `generationAttemptStarted`;
  - `lastToolCallId`, set on `TOOL_CALL_START` and cleared on `generationAttemptStarted`.
- **`assistantMessageId`** is the existing `activeAssistantMessageId`, which already survives `TEXT_MESSAGE_END`. Clear it on `generationAttemptStarted` if it isn't cleared already.

- [ ] **Step 1: Write the failing tests** in `ag-ui-activity.spec.ts` and the reducer spec:
  - `test('a snapshot with a new id appends an activity message with links', …)`
  - `test('a snapshot without replace overwrites content in place and keeps links', …)`
  - `test('replace: false keeps content and merges metadata only', …)`
  - `test('a replacing snapshot may change subagentRunId', …)`
  - `test('a delta applies an RFC 6902 patch copy-on-write and freezes the result', …)`
  - `test('a delta for an unknown id is dropped', …)`
  - `test('a delta whose patch fails is dropped but keeps valid metadata', …)` (Review Focus 3)
  - `test('activity content is deep-frozen', …)`
  - Reducer tests:
    - `test('activity events update the draft and record run, assistant and tool-call links', …)`
    - `test('a dropped delta logs a warning and the run continues', …)`
    - `test('a failed attempt rolls activities back with the draft', …)`
- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx nx test core`
Expected: FAIL.
- [ ] **Step 3: Implement** `ag-ui-activity.ts`, then wire the reducer.
  - `hashbrownLinks` is written only on creation.
  - The warning goes through the reducer's existing logger path. If reducers have no logger, return the drop reason and log in the effect that dispatches events. Record which one you chose in the report.
- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx nx test core && npx nx lint core`
Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): apply AG-UI activity events to canonical history`

---

### Task 3: Snapshot activity rule and links from position

**Files:**
- Modify: `packages/core/src/reducers/ag-ui-activity.ts` (+ spec)
- Modify: `ag-ui-messages.reducer.ts` (`MESSAGES_SNAPSHOT` case ~:323)
- Modify: `ag-ui-message-history.ts` (`lowerViewMessagesToAgUi` lowers `role: 'activity'`)

**Interfaces:**
- Consumes Task 2.
- Produces:
  ```ts
  export function recomputeActivityLinks(messages: readonly Readonly<Message>[], runId?: string): readonly Readonly<Message>[];
  export function mergeSnapshotActivities(previous: readonly Readonly<Message>[], snapshot: readonly Readonly<Message>[]): readonly Readonly<Message>[];
  ```
  - `recomputeActivityLinks` takes `assistantMessageId` from the nearest assistant message before the activity, and `toolCallId` from that assistant's last tool call.
  - `mergeSnapshotActivities` works like this:
    - if the snapshot carries any activity, return the snapshot;
    - otherwise return the snapshot with each previous activity re-inserted directly after its linked assistant message;
    - if that message is gone, the activity goes at the end, in the original relative order.
  - Every other role keeps today's full replace.

- [ ] **Step 1: Write the failing tests**
  - `test('a snapshot carrying activities replaces the activity set', …)`
  - `test('a snapshot without activities keeps local activities after their linked assistant', …)`
  - `test('a kept activity whose assistant is gone moves to the end', …)`
  - `test('snapshot activities get links from position, ignoring incoming hashbrownLinks', …)`
  - `test('setMessages lowers activity messages and recomputes their links', …)`
  - `test('a saved transcript restored with setMessages keeps ids and activity links', …)` (Review Focus 2)
- [ ] **Step 2: Run the tests and confirm they fail.** `npx nx test core` FAILS.
- [ ] **Step 3: Implement**, then run `npx nx test core && npx nx lint core` and confirm they PASS.
- [ ] **Step 4: Commit** `feat(core): keep local activities across message snapshots`

---

### Task 4: Activity messages in the projection and the view list

**Files:**
- Modify: `packages/core/src/models/view.models.ts`: add `ActivityMessage` and `ActivityLinks` exactly as the spec defines them (with `toolCallId`), and add the activity variant to `Message` / `AnyMessage`.
- Modify: `internal.models.ts`, `internal_helpers.ts` (`toViewMessagesFromInternal`, `toInternalMessagesFromView`, `toApiMessagesFromInternal`)
- Modify: `ag-ui-message-history.ts`:
  - `projectAgUiMessages`, `ɵreconcileAgUiMessageProjection`, `ɵindexAgUiCanonicalMessageSources`, `ɵpairViewMessagesWithAgUi`;
  - the reasoning resets at ~:404, :557 and :615.
- Modify: `streaming-message.reducer.ts` (`findCanonicalAssistantIdForEvent` ~:188)
- Modify: `reducers/index.ts` (`selectViewMessages` ~:594-610; `selectShouldGenerateMessage` ~:636)
- Modify: `status.reducer.ts` (~:40)

**Interfaces:**
- Consumes Tasks 1–3.
- Produces: the public `ActivityMessage` and `ActivityLinks`, exported from core's public API, and a `Chat.Message` union that includes `ActivityMessage`.
- **Rule for "last message" logic:** skip trailing activity messages. An activity never counts as the last user or assistant message.

- [ ] **Step 1: Write the failing tests**
  - `test('activity messages appear in the view list in arrival order during a run', …)`
  - `test('an activity before any assistant text sits before the streaming assistant message, unlinked', …)` (Review Focus 1)
  - `test('an activity after the answer links to that assistant message', …)`
  - `test('reasoning still attaches to its assistant across an interleaved activity', …)` (spec Goal 7)
  - `test('selectShouldGenerateMessage and status ignore trailing activity messages', …)`
  - `test('view, internal and API conversions keep activity messages without dropping them', …)`
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement.** Every role switch handles `'activity'` explicitly; no `default` swallows it.
- [ ] **Step 4: Run and confirm they pass:** `npx nx test core && npx nx lint core && npx nx build core`.
- [ ] **Step 5: Commit** `feat(core)!: surface AG-UI activity messages in the message list`

---

### Task 5: `groupTurns`

**Files:**
- Create: `packages/core/src/models/group-turns.ts`, `group-turns.spec.ts`
- Export it from the public API.

**Interfaces:**
- Consumes Task 4's union and links.
- Produces `groupTurns<M extends AnyMessage>(messages: readonly M[]): readonly Turn<M>[]` and `Turn<M>`, with the fields from the spec:
  - `user?`
  - `assistants`
  - `activitiesByAssistant: ReadonlyMap<string, readonly ActivityMessage[]>`
  - `activitiesByToolCall: ReadonlyMap<string, readonly ActivityMessage[]>`
  - `unlinkedActivities`
  - `errors`
- **Turn boundaries.** A turn starts at a user message. Messages before the first user message form a turn with no `user`.
- **Bucket rule.** An activity goes to `activitiesByToolCall` when its `toolCallId` matches a tool call (client or server) of an assistant in the turn. Otherwise it goes to `activitiesByAssistant` when its `assistantMessageId` matches an assistant in the turn. Anything else goes to `unlinkedActivities`.

- [ ] **Step 1: Write the failing tests**
  - `test('groups messages into turns that start at user messages', …)`
  - `test('buckets activities by tool call, then assistant, else unlinked', …)`
  - `test('keeps input order inside each bucket and does not mutate its input', …)`
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement it as a pure function.**
- [ ] **Step 4: Run and confirm they pass:** `npx nx test core && npx nx lint core`.
- [ ] **Step 5: Commit** `feat(core): add groupTurns for turn-scoped activity rendering`

---

### Task 6: Angular and React handle the activity role

**Files:**
- Angular:
  - `packages/angular/src/.../ui-chat.helpers.ts` (`UiChatMessage` ~:70-73)
  - `ui-chat-resource.fn.ts` (~:192-227; must not throw)
  - `chat-resource.fn.ts` (`reload` ~:362)
  - re-export `groupTurns` and the activity types if Angular re-exports core helpers
- React:
  - `packages/react/src/.../use-ui-chat.tsx` (`UiChatMessage` ~:74-75, ~:213-221)
  - `use-chat.ts` (~:352), `use-structured-chat.ts` (~:387)
  - re-exports as for Angular
- Tests next to each.

**Interfaces:**
- Consumes Tasks 1, 4 and 5.
- Produces `UiChatMessage` unions that include `ActivityMessage` as is (activities are not UI-parsed), and `UiAssistantMessage` / `UiUserMessage` carrying `id`.

- [ ] **Step 1: Write the failing tests** (Review Focus 5)
  - Angular:
    - `test('uiChatResource passes activity messages through without throwing', …)`
    - `test('reload regenerates from the last user message when activities trail', …)`
  - React:
    - `test('useUiChat passes activity messages through', …)`
    - `test('useChat and useStructuredChat reload ignore trailing activities', …)`
- [ ] **Step 2: Run the tests and confirm they fail.** `npx nx test angular && npx nx test react` FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and confirm they pass:** `npx nx run-many -t test,lint,build -p angular react`.
- [ ] **Step 5: Commit** `feat(angular,react): handle activity messages and message ids`

---

### Task 7: `ɵwithActivities` and the public callback types

**Files:**
- Create: `packages/core/src/activities/with-activities.ts`, `with-activities.spec.ts`, `index.ts`
- Export the public types from core, and export `ɵwithActivities` with the `ɵ` prefix.

**Interfaces:**
- Produces:
  ```ts
  /** @public */ export type ActivityCallback = (context: ActivityContext) => Promise<void> | void;
  /** @public */ export interface ActivityContext { readonly activity: ActivityWriter; readonly model: Promise<void>; readonly signal: AbortSignal; }
  /** @public */ export interface ActivityWriter { snapshot<T extends Record<string, unknown>>(messageId: string, activityType: string, content: T): ActivityHandle<T>; }
  /** @public */ export interface ActivityHandle<T> { patch(operations: readonly JsonPatchOperation[]): void; replace(content: T): void; }
  /** @internal */ export function ɵwithActivities(
    createEvents: (signal: AbortSignal | undefined) => AsyncIterable<AGUIEvent>,
    activities: ActivityCallback | undefined,
    signal: AbortSignal | undefined,
  ): AsyncIterable<AGUIEvent>;
  ```
  `JsonPatchOperation` comes from `@ag-ui/core`.
- **Without a callback,** it returns `createEvents(signal)` unchanged.
- **With a callback,** it:
  - owns an `AbortController` linked to `signal` and passes the controller's signal to `createEvents`;
  - starts the callback right after forwarding the provider's `RUN_STARTED`;
  - merges the two sources through an internal async queue;
  - forwards provider events immediately and holds only the provider's terminal event;
  - has `model` resolve on the provider's `RUN_FINISHED`, or reject with `Error(message)` on its `RUN_ERROR` or with an `AbortError` on abort;
  - applies every rule from Global Constraints → Provider callback.

- [ ] **Step 1: Write the failing tests** with a fake provider generator. Every emitted event goes through `EventSchemas.parse`, and each finished sequence goes through `@ag-ui/client`'s `verifyEvents`:
  - `test('without a callback the provider events pass through unchanged', …)`
  - `test('activities sent before, during and after the model arrive in order inside the run', …)`
  - `test('provider text events are not delayed by a pending callback', …)` (Review Focus 4)
  - `test('RUN_FINISHED is held until the callback settles', …)`
  - `test('a callback error while streaming aborts the model and emits one RUN_ERROR', …)`
  - `test('a callback error after the model ends replaces RUN_FINISHED with RUN_ERROR', …)`
  - `test('a model failure waits for the callback, then emits RUN_ERROR', …)`
  - `test('abort ends without a terminal event, makes writes no-ops and rejects model', …)`
  - `test('a write after the run closes throws', …)`
  - `test('a duplicate snapshot with a different activityType throws', …)`
  - `test('patch emits ACTIVITY_DELTA with activityType', …)`
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement.** Also confirm that importing `@hashbrownai/core` in plain Node (`node -e "require('<built core>')"` after `npx nx build core`) loads no browser-only modules. If it does, add a server-safe subpath export and use it in Task 8, and say so in the report.
- [ ] **Step 4: Run and confirm they pass:** `npx nx test core && npx nx lint core && npx nx build core`.
- [ ] **Step 5: Commit** `feat(core): add the activity writer and run helper for providers`

---

### Task 8: `activities` option on every provider

**Files:** for each of `openai`, `azure`, `anthropic`, `bedrock`, `google` and `ollama`:
- `packages/<p>/src/stream/types.ts` (or the provider's options type file): add the option
- `packages/<p>/src/stream/text.fn.ts`: rename today's generator to a private `textEvents`, and make `text(options)` return `ɵwithActivities((signal) => textEvents({ ...options, signal }), options.activities, options.signal)`
- `packages/<p>/package.json`: add the `@hashbrownai/core` dependency
- `packages/<p>/src/index.ts`: re-export `ActivityCallback` and the related public types as type exports
- `packages/<p>/src/integration.spec.ts`: one test

**Interfaces:**
- Consumes Task 7.
- Produces `activities?: ActivityCallback` on every provider's options type, with TSDoc.

This is a batch of the same small change across six packages, so one dispatch does all of them.

- [ ] **Step 1: Add one aimock integration test per provider:** `test('<Provider> sends callback activities inside the run', …)`. The callback snapshots `plan-1` before the model, awaits `model`, then patches it. The test expects, in order: `RUN_STARTED`, `ACTIVITY_SNAPSHOT`, the model's events, `ACTIVITY_DELTA`, then `RUN_FINISHED`.
- [ ] **Step 2: Run the tests and confirm they fail:** `npx nx run-many -t e2e -p openai azure anthropic bedrock google ollama` FAILS on the new cases.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and confirm they pass:** `npx nx run-many -t build,test,lint,e2e,build-api-report -p openai azure anthropic bedrock google ollama`. Every existing case must stay unchanged; that is the "no callback, no change" rule.
- [ ] **Step 5: Commit** `feat(providers): send AG-UI activities through an activities callback`

---

### Task 9: Conformance end-to-end

**Files:** `tools/conformance/` (the provider route used by `provider/routes.spec.ts`, and the native-ui hosts)

- [ ] **Step 1: Add an e2e case.** A conformance server route uses the OpenAI provider with an `activities` callback that sends a `plan` activity and patches it after the model. Both the Angular and React hosts list the activity before the answer with its patched content, using a minimal flat renderer in each host.
- [ ] **Step 2: Run the suites:** `npx nx test conformance && npx nx example-e2e conformance`. All must pass.
- [ ] **Step 3: Commit** `test(conformance): activities from a provider reach both hosts`

---

### Task 10: Documentation

**Files:**
- Create: `www/content/docs/{angular,react}/concept/activities.md`, plus their sidebar entries
- Modify: `www/content/docs/{angular,react}/concept/message-history.md:27`
- Modify: `www/content/docs/{angular,react}/platform/{openai,azure,anthropic,bedrock,google,ollama}.md` (add a "Sending activities" section)
- Modify: `www/content/docs/{angular,react}/migrations/v0-8.md` (`Chat.Message` gains `activity`; user and assistant messages gain `id`; checklist item)
- Modify: the sitemap count in `search-index.spec.ts`

- [ ] **Step 1: Write the concept page.** It covers activities versus tool calls versus server tool calls, the activity message, links, `groupTurns`, a flat-timeline example and a nested-cards example, and receiving activities from third-party AG-UI backends.
- [ ] **Step 2: Update the other pages** listed above.
- [ ] **Step 3: Run the checks:** `npx nx lint www && npx nx test www && npx nx build www`. All must pass.
- [ ] **Step 4: Commit** `docs: AG-UI activities`

---

### Task 11: Whole-branch verification

- [ ] **Step 1: Run the full check**

Run: `npx nx affected -t lint,test,typecheck,build,e2e --base=origin/main && npx nx example-e2e conformance`
Expected: everything passes.
- [ ] **Step 2: Open the PR.** List the breaking changes (`Chat.Message` gains `activity`, and messages gain `id`) and point to the migration guide. Say that the 0.8 CHANGELOG line belongs in #663.
