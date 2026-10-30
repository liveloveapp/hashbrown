---
title: 'Activities: Hashbrown React Docs'
meta:
  - name: description
    content: 'Render structured progress tied to the work an agent actually performs.'
---

# Activities

<hb-docs-demo demo="canonical-workbench-activities-react">
</hb-docs-demo>

Activities describe work an agent is performing without asking the model to call another tool. They are structured, display-only messages: a search started, a document was checked, or a reply finished. Use them when progress helps the user understand a wait.

A tool result supplies information for the model’s next step. An activity supplies information for the interface and stays out of the outgoing model conversation. Emit progress from the code doing the work, and update it when that work reaches the reported stage. A timer or optimistic label is not evidence of completion.

<hb-concept-diagram concept="workflow"> </hb-concept-diagram>

## Group progress with the conversation

This complete view component requires `@hashbrownai/react` and receives UI chat messages from its parent. Your AG-UI agent must emit real activity events; `groupTurns` organizes existing messages and does not create progress. The component shows activity identities and types without trusting arbitrary activity content as markup.

```tsx
import { groupTurns, type UiChatMessage } from '@hashbrownai/react';

export function ReadingProgress({
  messages,
}: {
  messages: readonly UiChatMessage<never>[];
}) {
  const turns = groupTurns(messages);
  return (
    <section aria-label="Turn progress">
      {turns.map((turn, index) => (
        <div key={index}>
          {turn.unlinkedActivities.map((activity) => (
            <p key={activity.id}>
              {activity.activityType} ({activity.id})
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}
```

This view intentionally displays `unlinkedActivities`, the progress not attached to a particular assistant or tool. Use `activitiesByAssistant` and `activitiesByToolCall` beside those corresponding rows in a full conversation view. Validate `activityType` and `content` before rendering domain-specific stages or labels.

On the producer side, send `ACTIVITY_SNAPSHOT` with a unique message ID, an activity type, and JSON content. Send `ACTIVITY_DELTA` with RFC 6902 patches for that same ID when work advances. Preserve lifecycle facts: reporting “finished” must follow successful work, not merely the arrival of text. The workbench implementation below shows both events and their actual UI links.

## Explore it in the workbench

<hb-workbench lesson="activities">
</hb-workbench>

Let's explain our two-step plan and show the work around the reply. The agent validates the plan context, creates an activity, and updates that activity when the provider finishes its explanation. A second turn gets a new activity ID.

These stages describe work the agent performed. They do not mean the demo was outlined or recorded. The plan remains application data.

<img src="/video/docs/canonical-workbench-activities-react-result.png" alt="React workbench showing activities, the chat, paired inspector, and bottom player." width="1600" height="1000" loading="lazy" />

Run the [canonical workbench](/docs/react/start/workbench), then open [`/react.html?lesson=activities`](http://127.0.0.1:4370/react.html?lesson=activities). The recording uses the [checked React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/WorkflowWorkbench.tsx) and [local agent](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-workflows.ts).

The client makes real Hashbrown requests. The local AG-UI agent explicitly maps shared state into model instructions and wraps the provider's streamed text with workflow events. Direct provider adapters do not create these events or approval decisions automatically.

### Let the Agent Report Progress

An activity is structured, display-only information from your agent. Use it for progress the user needs to see. Use a tool when the model needs a result to continue its reasoning.

Our agent creates one `plan-progress` activity after validating context:

<hb-code-example header="server/workbench-workflows.ts" moment="activity-observed-1">

```ts
      if (lesson === 'activities')
        yield {
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId: activityId,
          activityType: 'plan-progress',
          content: {
            stage: 'context-checked',
            label: 'Shared plan context validated',
          },
          replace: true,
        };
```

</hb-code-example>

The activity starts before the assistant message, so its `links` identify the run but need not include an assistant message ID. After a successful provider completion, the agent emits `ACTIVITY_DELTA` for the same message ID and changes its stage to `reply-complete`.

### Render Actual Activity Messages

Hashbrown exposes each activity as a `role: 'activity'` entry in `chat.messages`. Switch on `activityType` and validate `content` before rendering it. The workbench accepts only its two known progress stages and a bounded text label.

<hb-code-example header="runtime/workbench-workflows.ts">

```ts
export interface WorkbenchWorkflowProgress {
  readonly stage: 'context-checked' | 'reply-complete';
  readonly label: string;
}
```

</hb-code-example>

The client renders the validated message ID, label, stage, and actual SDK `links`. It does not synthesize progress from a timer or from text the model happened to write.

### Keep IDs and Links Stable

`ACTIVITY_SNAPSHOT` creates an activity or replaces the content for an existing ID. With `replace: false`, an existing activity keeps its content and merges metadata. `ACTIVITY_DELTA` applies an RFC 6902 JSON Patch. Hashbrown freezes the content and produces a new object for each update.

An ID must be unique within the thread. Reusing an ID in another run updates the old activity; it does not add a new one. Our agent creates a fresh ID for the follow-up request.

`links` capture the run, most recent assistant message, tool call, and subagent run when the activity first arrives. Later updates preserve those links. Restored activity links are recomputed from message order, except for `subagentRunId`, which cannot be inferred from position.

Activities remain in local history but are omitted from outgoing model conversation. A `MESSAGES_SNAPSHOT` containing activities replaces the activity set; one containing none retains existing activities. `reload` keeps activities before the reloaded answer and removes those after it.

### Inspect the Work Across Turns

Select an activity event in the bottom timeline. The chat and the paired Activities inspector follow that captured frame. Compare the actual activity messages with their validated stages and links. Raw keeps the full selected SDK observation available. Replay is read-only and does not call the agent again.

An activity does not execute an action or prove an external task succeeded. Emit stages when the underlying work actually reaches them. Continue with [Tools](/docs/react/concept/functions) or [Shared Agent State](/docs/react/concept/shared-agent-state).

### Group Activities by Turn

Use `groupTurns` from `@hashbrownai/react` when an activity belongs beside its assistant message or tool call. Each turn exposes `activitiesByAssistant`, `activitiesByToolCall`, and `unlinkedActivities`, alongside its user, assistants, and errors. The helper is pure and preserves input order in each group. Messages before the first user form a turn without a user.

<a id="derive-a-work-summary"></a>

#### Derive a Work Summary

`groupTurns` accepts UI chat messages directly. `summarizeTurn` returns plain
`text`, `meta`, lifecycle `status`, `live`, tool/outcome counts, source counts,
and an optional `durationMs`. These helpers render no components. Derive these values during render; no effect or duplicated state is needed.

```tsx
import {
  groupTurns,
  summarizeTurn,
  type TurnSummaryOptions,
  type UiChatMessage,
} from '@hashbrownai/react';

function WorkSummary({
  messages,
  currentTurnUserId,
  currentTurnOptions,
}: {
  messages: readonly UiChatMessage<never>[];
  currentTurnUserId: string;
  currentTurnOptions: TurnSummaryOptions;
}) {
  const summaries = groupTurns(messages).map((turn) =>
    summarizeTurn(
      turn,
      turn.user?.id === currentTurnUserId ? currentTurnOptions : undefined,
    ),
  );

  return (
    <ul>
      {summaries.map((summary, index) => (
        <li key={index}>
          {summary.text} {summary.meta}
        </li>
      ))}
    </ul>
  );
}
```

Here `currentTurnOptions` comes from application-owned run state. Pass
`{ status: 'working' }` while text is streaming, including turns with no tool
calls; messages alone cannot distinguish that state from a settled answer.
Pass `status: 'awaiting'` for approval or `status: 'cancelled'` after stopping a
run. `live` is true only for `working`; awaiting approval is not live.

An explicit status wins over inference, including run errors. Without it,
turn errors take precedence over pending calls, then pending client or open
server calls imply `working`, and otherwise the turn is `complete`. Individual
tool failures, denials, and cancellations contribute counts without making the
whole run failed. Activities do not count as tool calls.

Duration comes only from the application's explicit turn clock: supply
`startedAt` with `now` for an active turn, or `startedAt` with `settledAt` for a
settled turn, all from the same clock. Tool timestamps never stand in for a
turn clock. Missing or invalid timing stays unknown; restored history needs no
invented duration. See [tool display and timing policy](/docs/react/concept/functions#display-tool-steps) for optional presentation helpers.

### Receive or Produce Activity Events

Any AG-UI backend can emit activity events. A delta for an unknown ID or a patch that cannot apply is dropped with a console warning rather than ending the run; valid metadata is retained. Trailing activities do not cause `reload` or continuation to treat them as an unanswered conversation message.

Hashbrown adapters also offer an explicit `activities` option. See [Sending activities](/docs/react/platform/openai#sending-activities). Use it when your server owns the progress; the model does not emit progress simply because the client renders an activity card.

### Follow native subagent invocations

A producer can attribute concurrent work with native [AG-UI subagent events](https://docs.ag-ui.com/concepts/subagents). Hashbrown exposes that provenance and lifecycle; the producer still schedules and executes the child agents. Direct provider adapters do not invent these events.

`useChat()`, `useStructuredChat()`, and `useUiChat()` expose `readonly subagents: readonly SubagentRun[]`. Derive groups during render; no effect or copied state is needed. The core `ChatRuntime.subagents` property is a `StateSignal<readonly SubagentRun[]>`; `SubagentRun` is also exported from `@hashbrownai/core`. These frozen records start as an empty array.

```tsx
import { useChat, type SubagentRun } from '@hashbrownai/react';

export function ResearchProgress() {
  const chat = useChat({ system: 'Help with research.' });
  const rows = chat.subagents.map((run: SubagentRun) => ({
    run,
    outputs: chat.messages.filter(
      (message) =>
        message.role === 'assistant' &&
        message.subagentRunId === run.subagentRunId,
    ),
    activities: chat.messages.filter(
      (message) =>
        message.role === 'activity' &&
        message.links.subagentRunId === run.subagentRunId,
    ),
  }));

  return rows.map(({ run, outputs, activities }) => (
    <p key={run.subagentRunId}>
      {run.name ?? run.subagentRunId}: {run.status}
      {' — '}
      {outputs.length} replies, {activities.length} activities
    </p>
  ));
}
```

Use `subagentRunId` as the opaque identity of one invocation. `name` is a reusable display name, so two invocations may have the same name. Preserve `undefined` for the parent: an empty string is a valid child identifier, and a string sentinel can collide with a real ID. `parentSubagentRunId` describes nesting; `parentToolCallId` and `parentMessageId` connect an invocation to the call and message that spawned it. Activity ownership is in `links.subagentRunId`.

The observed statuses are `unknown`, `running`, `awaiting`, `complete`, `failed`, and `cancelled`. Attribution without lifecycle events creates an `unknown` record. Start, finish, suspension, and error events supply lifecycle facts. `timing.startedAt` and `timing.settledAt` appear only for finite timestamps explicitly supplied by the producer; they are not browser clock measurements. A child error does not fail the enclosing run or settle a tool call's outcome.

This lifecycle is local transactional display state, not a new wire format or storage API. Native message snapshots preserve provenance, but restored records have unknown names, outcomes, and timing; explicit retained interrupts can establish `awaiting`. A successful resume acknowledgement resolves the answered waits even if continuation uses a new invocation ID or later fails. Approval answers do not prove execution or completion. Continue using `pendingInterrupts` and `resume()` for approvals; there is no separate resume-by-subagent API.

Attributed state events still update the single root shared-state document. There is no per-subagent shared-state scope. Structured and UI replies continue using the configured response schema; attribution does not introduce per-child schema configuration.
