# AG-UI activities in Hashbrown

Status: design, awaiting approval (2026-10-20)

## Intent

A user asked whether Hashbrown plans to support AG-UI's `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA` events. Today it does not. Core accepts the events and ignores them (`packages/core/src/reducers/ag-ui-messages.reducer.ts:325`). Activity messages that arrive in a `MESSAGES_SNAPSHOT` are kept in canonical history but never reach the developer's message list. The providers cannot send activities at all.

Activities are AG-UI's channel for **display-only, structured progress that is not conversation content**: plans, progress, workflow steps, background work, A2UI surfaces and MCP App surfaces. The model never sees them. Hashbrown is headless, so its job is:

- turn the event stream into clean, typed data;
- let our providers send activities;
- leave rendering to the app.

This design is also the base for the A2UI and MCP Apps work that comes next. In the AG-UI ecosystem both of those pair a tool call with an activity.

## Background: activity or tool call?

These rules come from the AG-UI 1.0 spec, CopilotKit, Mastra, Microsoft Agent Framework and the AG-UI middlewares. The research is summarised in this conversation's findings.

- **A tool call is conversation.** The model asked for it and continues from its result. A tool call the model makes and the server runs (OpenAI web search, Anthropic server tools) stays a tool call. Hashbrown already exposes those as `serverToolCalls` (`packages/core/src/models/view.models.ts:94`).
- **An activity is display material.** The client renders it, and it is never sent back to the agent. That rule shipped separately in PR #668.
- **Both can exist for the same piece of work.** A2UI and MCP Apps pair a tool call with an activity. The protocol has no field linking the two; integrations put the tool call id in the activity's `messageId` or `content`. Hashbrown keeps them separate and exposes the link.

## Goals

1. **Activities become messages.** Activity messages are their own entries in the public message list, a new `role: 'activity'` variant of `Chat.Message`, positioned where they arrived. This follows AG-UI, CopilotKit and OpenAI ChatKit.
2. **Public message ids.** User and assistant messages expose a stable public `id`, so activities and apps can refer to them. This was the user's decision.
3. **Snapshots and deltas follow the spec.**
   - `ACTIVITY_SNAPSHOT` creates or updates an activity in place.
   - A missing `replace` means overwrite, as the spec requires. `replace: false` keeps the existing content and only merges metadata.
   - `ACTIVITY_DELTA` applies an RFC 6902 patch.
   - Activities from earlier runs stay in history.
4. **Each activity records what it belongs to.** On arrival it gets a link to the run, the last assistant message started in that run (if any), the most recent tool call of any kind (if any), and `subagentRunId`.
5. **A pure grouping helper.** A public function groups a turn into its assistant message, that message's tool calls, and the activities linked to it. Apps that want nested cards use it; apps that want a flat timeline walk the list.
6. **Providers can send activities.** Every provider (OpenAI, Azure, Anthropic, Bedrock, Google, Ollama) gets an optional `activities` callback. It can send activities before, during and after the model call, and the provider holds back `RUN_FINISHED` until the callback settles.
7. **Activities never cut off reasoning.** An activity message between reasoning and its assistant message no longer separates them. Today it does (`ag-ui-message-history.ts:614`).

## Non-goals

- **Typed activity content.** `content` stays `Record<string, unknown>`, and the app narrows it by `activityType`. There are no schemas, no registry, and no Skillet integration. This is the user's decision.
- **Rendering components or a renderer registry.** Hashbrown is headless; apps render.
- **Moving built-in tools.** Moving Anthropic server tools from `RAW` to `serverToolCalls`, and mapping OpenAI built-in tools, is tool-call work for a separate design.
- **A2UI and MCP Apps support itself.** Those come next, built on this.
- **Computing deltas automatically.** There is no object-diff-to-patch helper, which would need a new dependency. Developers write patch operations by hand.
- **Changing the subagent model.** There is no `SUBAGENT_*` event handling and no subagent grouping beyond recording `subagentRunId`.
- **Activities across separate HTTP requests.** Activities are scoped to the run that sent them.

## Anti-goals

The design has failed if any of these happen:

- an activity message reaches the agent in run input (PR #668 must stay true);
- an existing app breaks at runtime because a message has `role: 'activity'`. Every internal switch on message role must handle it explicitly, and none may crash or silently drop it. Type-level breaks for apps are acceptable and documented, because 0.8 is a breaking release;
- a provider emits any event after `RUN_FINISHED` / `RUN_ERROR`, or emits two terminal events;
- an activity callback's failure or slowness hides the model's answer. The answer events still stream as they arrive;
- a malformed or out-of-order `ACTIVITY_DELTA` from a third-party backend breaks the run. The client drops it, like threadplane does (`libs/ag-ui/src/lib/reducer.ts:608-619`), and does not end the stream.

## Constraints

- **Repo rules.** Follow AGENTS.md: write the failing test first; use top-level `test(...)` with arrange/act/assert; add TSDoc to public symbols; use `ɵ` exports for code shared across packages; keep `ɵ` types out of public signatures; add no new dependencies.
- **AG-UI 1.0.2** (`@ag-ui/core`). Follow the activity spec: <https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/events/activity.mdx>.
- **Core gains a JSON Patch apply function.** Core already has `utils/json-patch.ts` for `STATE_DELTA`; reuse it if it fits.
- **The shared provider helper lives in `@hashbrownai/core` as `ɵ` exports**, and providers gain a dependency on `@hashbrownai/core` (user decision). The builder must check that importing core in Node pulls in no browser-only code or heavy side effects. Core vendors QuickJS for the browser only. If the root import is not light, add a server-safe subpath export.
- **Breaking changes go into the v0.8 migration guides** (Angular and React). The CHANGELOG entry goes in the release-notes PR (#663).
- **Branch base.** This work starts from `main` after PR #667 (Responses API) and PR #668 (strip activities) merge. It must not undo either.

## Decisions

### Client: public message ids (user decision)

User and assistant view messages gain a public, stable `id: string`. It is the canonical AG-UI message id. Activities link to it, and `groupTurns` keys by it.

- **Where it is exposed.** `UserMessage` and `AssistantMessage` in `packages/core/src/models/view.models.ts` gain `readonly id: string`. Angular `UiChatMessage` / `UiAssistantMessage` and React `UiChatMessage` carry it through. Error messages are synthetic and stay without an id.
- **`toViewMessagesFromInternal`** (`internal_helpers.ts:259-269`) passes the internal id through instead of dropping it.
- **Lowering keeps ids.** `setMessages`, initial `messages` and other lowering keep an `id` when the app supplies one, and only mint a new id when it is absent. Today lowering always mints new ids (`ag-ui-message-history.ts:38`). This makes save and restore keep links. The input types accept an optional `id`.
- **Streaming ids are stable.** The streaming assistant message exposes the same id it will have once committed, so keys don't change mid-run.
- **Breaking change.** Apps that build view messages by hand, in tests or initial `messages`, may omit `id` on input. Code that compares whole message objects may see the new field. This goes into the v0.8 migration guides.

### Client: the activity message

```ts
/** @public */
export type ActivityMessage = {
  role: 'activity';
  /** The AG-UI activity message id. */
  id: string;
  /** Producer-defined kind, e.g. 'plan', 'progress', 'a2ui-surface'. */
  activityType: string;
  /** Untyped payload; the app narrows it by `activityType`. */
  content: Readonly<Record<string, unknown>>;
  /** Provider metadata, preserved. */
  metadata?: Metadata;
  /** What this activity belongs to, recorded when it first arrived. */
  links: ActivityLinks;
};

/** @public */
export type ActivityLinks = {
  runId?: string;
  /** The assistant message open when the activity first arrived. */
  assistantMessageId?: string;
  /** The most recent tool call (client or server) in that run when it arrived. */
  toolCallId?: string;
  subagentRunId?: string;
};
```

- **Union.** `Chat.Message` / `AnyMessage` gain `ActivityMessage`. Angular `UiChatMessage` and React `UiChatMessage` include it.
- **What the links mean** (these are this design's calls):
  - `runId` is passed from the run that delivered the event. The reducers do not track runs today, so the effects supply it.
  - `assistantMessageId` is the **last assistant message started in the current run**, not only one whose text is still streaming. It resets when a new run or attempt starts. An activity sent after the model's answer therefore links to that answer, and one sent before any assistant text is unlinked.
  - `toolCallId` (rename from `serverToolCallId`) is the most recent tool call of **any** kind started in the current run. Client and server calls are distinguished only at projection, so registration changes can't stale it. This also covers A2UI and MCP Apps, which pair activities with client tool calls.
- **Where links are stored.** Links live as an extra field on the canonical activity record, and that record never reaches the agent (PR #668). Activities that come in through `setMessages`, initial `messages` or `MESSAGES_SNAPSHOT` get links recomputed from their position:
  - `assistantMessageId` is the nearest assistant message before them in the same run or snapshot;
  - `toolCallId` is the last tool call on that assistant.

  Incoming links are never trusted.
- **When links are recorded.** Links are set when the activity is first created (snapshot with a new id). Later snapshots and deltas keep them. A replacing snapshot may update `subagentRunId`, as the spec allows. Activities that arrive through `MESSAGES_SNAPSHOT` get `links` from their position:
  - `runId` is the snapshot's run;
  - `assistantMessageId` is the nearest assistant message before them in the same snapshot.
- **Content is immutable.** `content` is deeply frozen, and every delta produces new objects (copy-on-write).

### Client: event handling (core)

- **Activities are canonical messages.** `applyCanonicalMessageEvent` stops ignoring `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA` and inserts or updates `role: 'activity'` messages at their arrival position.
  - The existing draft/commit transaction applies: a failed attempt rolls activities back with everything else.
  - Threadplane's `applyActivityMessage` (`~/repos/angular-agent-framework/libs/ag-ui/src/runtime/activity-messages.ts`) is the reference for the semantics. Do not copy its `reducer.ts` merge-on-missing-`replace` bug.
- **Deltas.**
  - A delta for an unknown id is dropped.
  - A delta whose patch fails to apply is dropped, but any valid `metadata` it carries is kept.
  - A dropped delta never fails the run, unlike `STATE_DELTA`.
  - Log a warning through Hashbrown's logger.
- **`MESSAGES_SNAPSHOT` follows the spec's activity-set rule, for activities only** (this design's call). Non-activity roles keep today's wholesale replace, so existing ordering does not change. A snapshot that carries any activity replaces the activity set. A snapshot that carries none keeps the local activities and re-inserts each one directly after its linked assistant message, matched internally. If that message is gone, the activity goes at the end. Adopting `@ag-ui/client`'s full id-merge for every role is out of scope.
- **Projection and streaming.**
  - The projection (`ɵreconcileAgUiMessageProjection` and `projectAgUiMessages` in `ag-ui-message-history.ts`) projects activity messages instead of skipping them, and no longer resets `pendingReasoning` when it passes one (Goal 7). Make the same fix in `ɵindexAgUiCanonicalMessageSources` (~:404) and `findCanonicalAssistantIdForEvent` (`streaming-message.reducer.ts` ~:188).
  - An activity that arrives mid-run shows in the view list immediately, in arrival order, next to the streaming assistant message. It does not wait for the run to commit. The builder must keep `selectViewMessages`' streaming swap (`index.ts:590-608`) ordering correct.
- **Every role switch handles `'activity'` explicitly.** The analysis found these:
  - `lowerViewMessagesToAgUi`, which would crash today (`ag-ui-message-history.ts:24-50`)
  - `ɵpairViewMessagesWithAgUi` (:103-128)
  - `toViewMessagesFromInternal`, `toInternalMessagesFromView`, `toApiMessagesFromInternal` (`internal_helpers.ts`)
  - Angular `uiChatResource`, which throws on unknown roles (`ui-chat-resource.fn.ts:192-227`)
  - React `useUiChat` (`use-ui-chat.tsx:213-221`)
  - checks of the last message's role: `chatResource.reload` (`chat-resource.fn.ts:362`), React `useChat` (:352) and `useStructuredChat` (:387), `status.reducer.ts:40`, `selectShouldGenerateMessage` (`index.ts:636`)

  "Last message" logic skips trailing activity messages. An activity never counts as the last user or assistant message.
- **`setMessages` and initial `messages` round-trip activity messages.** They lower back to AG-UI `role: 'activity'`, and PR #668 strips them from run input.

### Client: the grouping helper

```ts
/** @public */
export function groupTurns<M extends AnyMessage>(messages: readonly M[]): readonly Turn<M>[];

/** @public */
export type Turn<M> = {
  /** The user message that opened the turn, if any. */
  user?: Extract<M, { role: 'user' }>;
  /** Assistant messages in the turn, in order. */
  assistants: readonly Extract<M, { role: 'assistant' }>[];
  /** Activities linked to each assistant message, keyed by its id. */
  activitiesByAssistant: ReadonlyMap<string, readonly ActivityMessage[]>;
  /** Activities linked to a tool call (client or server), keyed by toolCallId. */
  activitiesByToolCall: ReadonlyMap<string, readonly ActivityMessage[]>;
  /** Activities in the turn with no assistant or tool-call link. */
  unlinkedActivities: readonly ActivityMessage[];
  errors: readonly Extract<M, { role: 'error' }>[];
};
```

The function is pure and keeps the input's order within each bucket. The exact shape is left to the builder, as long as it is pure, keeps order, exposes all three buckets, and is exported from core with Angular and React re-exports where those packages re-export core helpers.

### Providers: the `activities` callback

The option is added to every provider's options type:

```ts
/** @public */
activities?: (context: ActivityContext) => Promise<void> | void;

/** @public */
export interface ActivityContext {
  /** Sends AG-UI activity events into this run. */
  readonly activity: ActivityWriter;
  /** Resolves when the model stream ends (before RUN_FINISHED is sent). Rejects if the model call fails. */
  readonly model: Promise<void>;
  /** The run's abort signal. */
  readonly signal: AbortSignal;
}

/** @public */
export interface ActivityWriter {
  /** Creates or replaces an activity. Sends ACTIVITY_SNAPSHOT (replace: true). */
  snapshot<T extends Record<string, unknown>>(
    messageId: string,
    activityType: string,
    content: T,
  ): ActivityHandle<T>;
}

/** @public */
export interface ActivityHandle<T> {
  /** Sends ACTIVITY_DELTA with the given RFC 6902 operations. */
  patch(operations: readonly JsonPatchOperation[]): void;
  /** Sends ACTIVITY_SNAPSHOT (replace: true) with new content. */
  replace(content: T): void;
}
```

- **Shared helper.** The behaviour is implemented once in core as `ɵ` exports, for example `ɵwithActivities(providerEvents, callback, { signal })`. Each provider wraps its event generator with it.
  - The public types above (`ActivityContext`, `ActivityWriter`, `ActivityHandle`) are non-`ɵ` and exported from core.
  - Providers re-export them as needed, so provider signatures expose no `ɵ` types.
  - `JsonPatchOperation` comes from `@ag-ui/core`.
- **Ordering.**
  - Callback events and provider events merge in arrival order.
  - The callback runs only after the provider has emitted `RUN_STARTED`, so the first callback event always follows `RUN_STARTED`.
  - The provider's `RUN_FINISHED` is **held** until the callback's promise settles.
  - If the model fails, the provider's `RUN_ERROR` is still held until the callback settles, so the callback can close its activities (for example, mark a plan failed).
- **Callback errors.** If the callback throws or rejects:
  - while the model is still streaming: abort the model, emit one `RUN_ERROR` carrying the callback's message, and emit no `RUN_FINISHED`;
  - after the model finished: replace the held `RUN_FINISHED` with `RUN_ERROR`.
- **Writer rules** (each throws in the callback, which counts as a callback error):
  - a write after the run has closed;
  - a second `snapshot` for an existing id with a different `activityType`;
  - `patch` on a handle whose snapshot has not been emitted. The handle API makes this hard, but it must still be checked.
- **Cancellation.** When `signal` aborts, the provider keeps today's behaviour: stop yielding, emit no terminal event. The callback's writes become silent no-ops after abort, and are not errors. `model` rejects with an `AbortError`.
- **No callback, no change.** When `activities` is unset, provider output must be byte-identical to today's, apart from the new import.
- **No backpressure.** Writes are synchronous enqueues. A run never needs flow control for display events, and the queue is drained as the consumer pulls.

### Documentation

- **Concept page.** Add `www/content/docs/{angular,react}/concept/activities.md`. It explains activities versus tool calls versus server tool calls, the activity message, links, `groupTurns`, rendering patterns for a flat timeline and for nested cards, and receiving activities from third-party AG-UI backends.
  - Add a sidebar entry.
  - Raise the sitemap count in `search-index.spec.ts`.
- **Platform pages.** Add a short "Sending activities" section to each provider platform page, with an example plan activity patched when the model finishes.
- **Message history.** Fix `concept/message-history.md:27`, which says activity messages never reach `chat.value()` / `chat.messages`.
- **Migration guides.** Update the v0.8 guides with the new `Chat.Message` variant and what apps must change.

## Testing

- **Core unit tests:**
  - creation, update, `replace: false`, and patch application by snapshot and delta;
  - unknown and malformed deltas dropped without failing the run;
  - copy-on-write;
  - links recorded at arrival during streaming, after tool rounds, with `subagentRunId`, and through `MESSAGES_SNAPSHOT`;
  - the `MESSAGES_SNAPSHOT` activity-set rule;
  - rollback on a failed attempt;
  - reasoning kept across an interleaved activity (Goal 7);
  - public ids: exposed on user and assistant messages, stable while streaming, and kept through a `setMessages` round-trip;
  - every changed role switch, including lowering round-trip and last-message skipping;
  - `groupTurns`.
- **Helper unit tests** (`ɵwithActivities`):
  - events before, during and after the model, and their order;
  - the held terminal event;
  - a callback throw mid-stream and after the model finished;
  - a model failure while the callback is pending;
  - abort;
  - writes after close;
  - no callback means identical output;
  - every emitted event passes `EventSchemas.parse`;
  - each sequence passes `@ag-ui/client`'s `verifyEvents`.
- **`ActivityHandle.patch`** must include `activityType` in the `ACTIVITY_DELTA` it sends; 1.0.2's schema requires it.
- **`ɵwithActivities` owns an `AbortController`.** It passes that controller's signal to the provider, linked to the caller's `signal`, so a callback error can stop the model. Provider `signal` is optional today.
- **Provider tests:** one aimock integration test per provider showing a callback activity arriving between `RUN_STARTED` and `RUN_FINISHED`.
- **Framework tests:** Angular `uiChatResource` and React `useUiChat` / `useChat` show activity messages in the list, and do not throw.
- **Conformance:** an e2e case (`tools/conformance`) where a server sends activities and both framework hosts show them in order.

## Left to the builder

- Internal names and file layout, apart from the public names above.
- The exact `Turn` shape, within the constraints above.
- Whether `ɵwithActivities` uses an async queue or an Observable internally.
- How log warnings for dropped deltas are worded.
- The order of work across core, frameworks, providers and docs.
