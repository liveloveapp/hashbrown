---
title: 'Activities: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Render AG-UI activities, display-only progress such as plans and workflow steps, in an Angular chat and send them from your server.'
---

# Activities

<p class="subtitle">Show plans, progress, and background work that the user should see and the model should not.</p>

Show the work as it happens. This example updates a three-step itinerary through display-only activities.

<hb-docs-demo demo="activities">
</hb-docs-demo>

The recorded agent emits activity snapshots and deltas. The application renders them as progress; they are not sent back as model conversation. See the [recorded example source](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/workflows.ts).

An activity is AG-UI's channel for display-only, structured progress: a plan, a progress bar, a workflow step, a background job. Activities are not part of the conversation. The model never sees them, and Hashbrown never sends them back to the agent.

Hashbrown is headless. It turns the activity events into typed messages in `chat.value()`, and your app renders them.

---

## Activities, Tool Calls, and Server Tool Calls

| Kind             | Who asked for it             | Does the model continue from it? | Where it appears                  |
| ---------------- | ---------------------------- | -------------------------------- | --------------------------------- |
| Tool call        | The model                    | Yes, from the tool's result      | `toolCalls` on an assistant       |
| Server tool call | The model, run by the server | Yes                              | `serverToolCalls` on an assistant |
| Activity         | Your server or a third party | No                               | Its own `role: 'activity'` entry  |

Use a tool call when the model needs the result. Use an activity when the user needs to see something. The two can describe the same piece of work. Hashbrown keeps them separate and records the link, which [links](#links) explains.

---

## The Activity Message

Each activity is its own entry in `chat.value()`, positioned where it arrived.

```ts
type ActivityMessage = {
  role: 'activity';
  id: string;
  activityType: string;
  content: Readonly<Record<string, unknown>>;
  metadata?: Metadata;
  links: ActivityLinks;
};
```

- `id` is the AG-UI activity message id. Later events for the same id update the same message. Ids must be unique within the thread: reusing one, even in a later run, updates the earlier activity in place instead of adding a new one.
- `activityType` is the producer's kind, for example `plan` or `progress`. Switch on it to choose a component.
- `content` is untyped. Narrow it by `activityType` in your app. Hashbrown deeply freezes it and replaces it with a new object on every update, so a signal or `computed` over `chat.value()` sees each change.

An activity arrives in one of two ways. An `ACTIVITY_SNAPSHOT` event creates the activity, or replaces its content when the id exists. A `replace: false` snapshot keeps the existing content and only merges metadata. An `ACTIVITY_DELTA` event applies an RFC 6902 JSON Patch to the content.

Activities from earlier runs stay in history. A `MESSAGES_SNAPSHOT` that carries activities replaces the activity set. A snapshot that carries none keeps the activities you already have.

---

## Links

Each activity records what it belonged to when it first arrived.

| Field                | Meaning                                                    |
| -------------------- | ---------------------------------------------------------- |
| `runId`              | The run that delivered it. Set for the current run only.   |
| `assistantMessageId` | The last assistant message started in that run, if any.    |
| `toolCallId`         | The most recent tool call of any kind in that run, if any. |
| `subagentRunId`      | The subagent run that sent it, if the agent reports one.   |

An activity sent after the model's answer links to that answer, including an answer that only calls tools. One sent before any assistant message has started has no `assistantMessageId`. Later snapshots and deltas keep the links, and incoming links are never trusted: activities restored with `setMessages` or a `MESSAGES_SNAPSHOT` get their links recomputed from their position. `subagentRunId` is the exception. It is kept on restore, not recomputed, because position cannot tell which subagent sent an activity.

`reload` keeps the activities the reloaded turn sent before its answer and drops the ones that came after it. The kept activities are relinked from their position, like any restored activity.

User and assistant messages expose a stable `id`, so a link always has something to point at. The streaming assistant message keeps the id it has once it is committed.

---

## Render a Flat Timeline

When activities should appear in the order they arrived, switch on `role` and render each one in place.

<hb-code-example header="timeline.component.ts">

```ts
import { Component } from '@angular/core';
import { chatResource } from '@hashbrownai/angular';

@Component({
  selector: 'app-timeline',
  standalone: true,
  template: `
    @for (message of chat.value(); track $index) {
      @switch (message.role) {
        @case ('user') {
          <p class="user">{{ message.content }}</p>
        }
        @case ('assistant') {
          <p class="assistant">{{ message.content }}</p>
        }
        @case ('activity') {
          @if (message.activityType === 'plan') {
            <ul class="plan">
              @for (step of planSteps(message.content); track step) {
                <li>{{ step }}</li>
              }
            </ul>
          }
        }
      }
    }
  `,
})
export class TimelineComponent {
  chat = chatResource({ system: 'You are a helpful assistant.' });

  planSteps(content: Readonly<Record<string, unknown>>): string[] {
    const steps = content['steps'];

    return Array.isArray(steps) ? steps.map(String) : [];
  }
}
```

</hb-code-example>

Always handle `'activity'` in a `@switch` on `role`, even if you ignore it. An activity message is a normal member of the list.

An activity that arrives mid-run shows up immediately, next to the streaming assistant message. It does not wait for the run to finish.

---

## Render Nested Cards

When activities belong with the assistant answer or tool call they describe, use `groupTurns`. It groups the flat list into turns and buckets each turn's activities by their links.

<hb-code-example header="turns.component.ts">

```ts
import { Component, computed } from '@angular/core';
import { groupTurns } from '@hashbrownai/core';
import { chatResource } from '@hashbrownai/angular';

@Component({
  selector: 'app-turns',
  standalone: true,
  template: `
    @for (turn of turns(); track $index) {
      @if (turn.user) {
        <p class="user">{{ turn.user.content }}</p>
      }
      @for (assistant of turn.assistants; track assistant.id) {
        <article>
          <p>{{ assistant.content }}</p>
          @for (
            activity of turn.activitiesByAssistant.get(assistant.id) ?? [];
            track activity.id
          ) {
            <aside>{{ activity.activityType }}</aside>
          }
        </article>
      }
      @for (activity of turn.unlinkedActivities; track activity.id) {
        <aside>{{ activity.activityType }}</aside>
      }
    }
  `,
})
export class TurnsComponent {
  chat = chatResource({ system: 'You are a helpful assistant.' });
  turns = computed(() => groupTurns(this.chat.value()));
}
```

</hb-code-example>

Each `Turn` holds:

- `user`: the user message that opened the turn, if any.
- `assistants`: the assistant messages of the turn, in order.
- `activitiesByAssistant`: activities linked to an assistant message, keyed by its `id`.
- `activitiesByToolCall`: activities linked to a client or server tool call, keyed by `toolCallId`. Use this to render a card next to the tool call it belongs to.
- `unlinkedActivities`: activities in the turn with neither link.
- `errors`: the error messages of the turn.

`groupTurns` is a pure function. It does not change its input and keeps the input order inside every bucket. Messages before the first user message form a turn without a `user`.

---

## Receiving Activities from Third-Party Backends

Any AG-UI backend can send `ACTIVITY_SNAPSHOT` and `ACTIVITY_DELTA` events, and Hashbrown handles them the same way. Your app needs no extra setup.

Hashbrown is forgiving about malformed input from a backend you do not control:

- A delta for an unknown id is dropped.
- A delta whose patch fails to apply is dropped. Valid metadata on it is kept.
- A dropped delta logs a warning to the console and never ends the run.

Activities are display material, so Hashbrown removes them from the messages it sends back to the agent on later runs.

`chat.reload()` and the logic that decides whether the last message needs an answer skip trailing activities. An activity never counts as the last user or assistant message.

---

## Sending Activities from Your Server

Hashbrown's own adapters can send activities too. See [Sending activities](/docs/angular/platform/openai#sending-activities) for the `activities` option, available on every adapter.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/message-history">
    <div>
      <hb-database-cog />
    </div>
    <div>
      <h4>Message History</h4>
      <p>Persist, restore, and prune chat messages.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="platform/openai">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>OpenAI</h4>
      <p>Send activities from your server with the OpenAI adapter.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/functions">
    <div>
      <hb-functions />
    </div>
    <div>
      <h4>Tool Calling</h4>
      <p>Let the model call functions and continue from their results.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
