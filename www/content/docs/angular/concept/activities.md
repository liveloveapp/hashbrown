---
title: 'Activities: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Show the work your agent actually performed. Follow the canonical Angular workbench.'
---

# Activities

<p class="subtitle">Show the work your agent actually performed.</p>

<hb-docs-demo demo="canonical-workbench-activities-angular">
</hb-docs-demo>

Let's explain our two-step plan and show the work around the reply. The agent validates the plan context, creates an activity, and updates that activity when the provider finishes its explanation. A second turn gets a new activity ID.

These stages describe work the agent performed. They do not mean the demo was outlined or recorded. The plan remains application data.

<img src="/video/docs/canonical-workbench-activities-angular-result.png" alt="Angular workbench showing activities, the chat, paired inspector, and bottom player." width="1600" height="1000" loading="lazy" />

Run the [canonical workbench](/docs/angular/start/workbench), then open [`/angular.html?lesson=activities`](http://127.0.0.1:4370/angular.html?lesson=activities). The recording uses the [checked Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/workflow-workbench.ts) and [local agent](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-workflows.ts).

The client makes real Hashbrown requests. The local AG-UI agent explicitly maps shared state into model instructions and wraps the provider's streamed text with workflow events. Direct provider adapters do not create these events or approval decisions automatically.

## Let the Agent Report Progress

An activity is structured, display-only information from your agent. Use it for progress the user needs to see. Use a tool when the model needs a result to continue its reasoning.

Our agent creates one `plan-progress` activity after validating context:

<hb-code-example header="server/workbench-workflows.ts">

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

## Render Actual Activity Messages

Hashbrown exposes each activity as a `role: 'activity'` entry in `chat.value()`. Switch on `activityType` and validate `content` before rendering it. The workbench accepts only its two known progress stages and a bounded text label.

<hb-code-example header="runtime/workbench-workflows.ts">

```ts
export interface WorkbenchWorkflowProgress {
  readonly stage: 'context-checked' | 'reply-complete';
  readonly label: string;
}
```

</hb-code-example>

The client renders the validated message ID, label, stage, and actual SDK `links`. It does not synthesize progress from a timer or from text the model happened to write.

## Keep IDs and Links Stable

`ACTIVITY_SNAPSHOT` creates an activity or replaces the content for an existing ID. With `replace: false`, an existing activity keeps its content and merges metadata. `ACTIVITY_DELTA` applies an RFC 6902 JSON Patch. Hashbrown freezes the content and produces a new object for each update.

An ID must be unique within the thread. Reusing an ID in another run updates the old activity; it does not add a new one. Our agent creates a fresh ID for the follow-up request.

`links` capture the run, most recent assistant message, tool call, and subagent run when the activity first arrives. Later updates preserve those links. Restored activity links are recomputed from message order, except for `subagentRunId`, which cannot be inferred from position.

Activities remain in local history but are omitted from outgoing model conversation. A `MESSAGES_SNAPSHOT` containing activities replaces the activity set; one containing none retains existing activities. `reload` keeps activities before the reloaded answer and removes those after it.

## Inspect the Work Across Turns

Select an activity event in the bottom timeline. The chat and the paired Activities inspector follow that captured frame. Compare the actual activity messages with their validated stages and links. Raw keeps the full selected SDK observation available. Replay is read-only and does not call the agent again.

An activity does not execute an action or prove an external task succeeded. Emit stages when the underlying work actually reaches them. Continue with [Tools](/docs/angular/concept/functions) or [Shared Agent State](/docs/angular/concept/shared-agent-state).


## Group Activities by Turn

Use `groupTurns` from `@hashbrownai/core` when an activity belongs beside its assistant message or tool call. Each turn exposes `activitiesByAssistant`, `activitiesByToolCall`, and `unlinkedActivities`, alongside its user, assistants, and errors. The helper is pure and preserves input order in each group. Messages before the first user form a turn without a user.

## Receive or Produce Activity Events

Any AG-UI backend can emit activity events. A delta for an unknown ID or a patch that cannot apply is dropped with a console warning rather than ending the run; valid metadata is retained. Trailing activities do not cause `reload` or continuation to treat them as an unanswered conversation message.

Hashbrown adapters also offer an explicit `activities` option. See [Sending activities](/docs/angular/platform/openai#sending-activities). Use it when your server owns the progress; the model does not emit progress simply because the client renders an activity card.
