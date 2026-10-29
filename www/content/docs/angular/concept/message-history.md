---
title: 'Message history: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Seed, replace, and retain conversation context with explicit storage boundaries.'
---

# Message history

<hb-docs-demo demo="canonical-workbench-message-history-angular">
</hb-docs-demo>

Message history is the conversation context sent with the next request. Earlier user messages establish facts and goals; assistant messages and tool exchanges show what happened. A model does not remember a browser session independently of the context your application provides.

Use initial messages to seed a new chat, and explicit replacement when the user selects a saved conversation or clears the current one. Storage, access control, retention, and selection are application concerns. A thread ID names a conversation; it does not load its transcript or make a browser text copy a durable agent checkpoint.

<hb-concept-diagram concept="persistence"> </hb-concept-diagram>

## Seed and replace a completed text exchange

Use the endpoint and client configuration from the [Quickstart](/docs/angular/start/quick). Keep `provideHashbrown` in `appConfig` and the `<app-root>` host. Import the standalone class below into `main.ts` and pass it to `bootstrapApplication()` with that same `appConfig`.

The seed below is explicit sample history, not a recording or a database lookup. It ends with an assistant message so initialization does not ask the model to answer a trailing user message. Clear and restore are explicit actions; a follow-up sends the currently installed transcript.

```ts
import { Component } from '@angular/core';
import { chatResource } from '@hashbrownai/angular';

const savedMessages = [
  { role: 'user' as const, content: 'Our book club is called Lighthouse.' },
  {
    role: 'assistant' as const,
    content: 'I will refer to your club as Lighthouse.',
    toolCalls: [],
  },
];

@Component({
  selector: 'app-root',
  template: `
    <button type="button" [disabled]="chat.isLoading()" (click)="clear()">
      Clear
    </button>
    <button type="button" [disabled]="chat.isLoading()" (click)="restore()">
      Restore sample
    </button>
    <button type="button" [disabled]="chat.isLoading()" (click)="ask()">
      Ask the club name
    </button>
    @if (chat.error()) {
      <p role="alert">The request failed.</p>
    }
    @for (message of chat.value(); track $index) {
      @if (message.role === 'user' || message.role === 'assistant') {
        <p>{{ message.content }}</p>
      }
    }
  `,
})
export class ReadingHistory {
  readonly chat = chatResource({
    system: 'Help the user organize a book club.',
    messages: savedMessages,
  });
  clear(): void {
    this.chat.setMessages([]);
  }
  restore(): void {
    this.chat.setMessages(savedMessages.map((message) => ({ ...message })));
  }
  ask(): void {
    this.chat.sendMessage({
      role: 'user',
      content: 'What is our club called?',
    });
  }
}
```

This tool-free example assumes no pending interrupts. Do not replace history during a run, resume, approval pause, or recovery. Changing the initial `messages` option after creation does not replace the transcript; use `setMessages` for a deliberate load. A replacement ending in a user or tool message can start generation.

For asynchronous storage, validate the entire saved envelope and confirm the selected conversation still owns the load before installing it. A narrow text archive omits activities, tool effects, shared state, provider metadata, and pending approvals. Use canonical server recovery for those workflows rather than treating text as a checkpoint.

## Explore it in the workbench

<hb-workbench lesson="message-history">
</hb-workbench>

Let's name our two-step plan **Lighthouse**. We'll ask the assistant to explain it, keep the completed text, clear the chat, and restore that exchange. Then we'll ask a follow-up. The next request should contain the conversation we restored.

The History inspector keeps the SDK transcript beside the app's retained copy. Clear removes the current messages. It leaves the retained copy alone. Restore puts that text back into the SDK; it does not replay the earlier request or execute a plan step.

<img src="/video/docs/canonical-workbench-message-history-angular-result.png" alt="Angular workbench showing restored Lighthouse messages, their history observation, and the synchronized bottom timeline." width="1600" height="1000" loading="lazy" />

Run the [canonical workbench](/docs/angular/start/workbench), then open [`/angular.html?lesson=message-history`](http://127.0.0.1:4370/angular.html?lesson=message-history). The recording uses the [checked Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/history-workbench.ts) and real provider streaming. The model's wording can vary.

### Follow the Conversation

Hashbrown includes the current transcript in the next request. Read it from `chat.value()`. Choose Requests in the inspector to see the actual request body, including the earlier user and assistant messages.

1. Send the prompt that names the plan Lighthouse. Wait for the reply to finish.
2. Select **Keep completed text**. The app holds a narrow text copy in memory.
3. Select **Clear messages**. The SDK transcript becomes empty without a model request.
4. Select **Restore kept text**. The SDK assigns fresh message IDs to the restored text.
5. Ask which plan we're working on. The new request includes the restored exchange.

Scrub the bottom timeline to compare those moments. Replay changes the selected view; it does not call a model, replace live messages, or write storage.

### Seed Once, Replace Explicitly

The `messages` option supplies the initial history when the chat runtime is created. Changing that option later does not replace an existing transcript. For a load that finishes after the runtime has mounted, use the public setter deliberately:

```ts
chat.setMessages([]);
```

`setMessages` can start generation when the final message needs an answer, such as a trailing user or tool message. This example restores only empty or validated assistant-ended text. Neither replacement needs an answer, so it sends no model request. The SDK briefly schedules the replacement before settling; the controls wait for that transition.

Keep history edits disabled while a request is running, resuming, awaiting an interrupt response, or requiring recovery. If an asynchronous load can outlive a selection, check that it still belongs to the current conversation before applying it.

### Keep a Completed Text Copy

The retained copy contains only user and assistant string content. Keeping it requires a successful completed `stop`, supported text, and a settled live runtime. Idle by itself does not prove success: a stopped or truncated response can leave partial assistant text on screen.

The shared helper validates the complete copy before replacing anything. It strips message IDs and excludes tool calls, activities, shared state, and provider metadata. The new runtime owns the restored IDs.

<hb-code-example header="runtime/workbench-history.ts">

```ts
export function encodeWorkbenchHistory(
  messages: readonly unknown[],
): string | null {
  if (
    !messages.every(
      (message) =>
        record(message) &&
        (message['role'] === 'user' || message['role'] === 'assistant') &&
        typeof message['content'] === 'string' &&
        ['toolCalls', 'serverToolCalls'].every(
          (key) =>
            message[key] === undefined ||
            (Array.isArray(message[key]) && message[key].length === 0),
        ),
    )
  )
    return null;
  const encoded = JSON.stringify({
    version: 1,
    messages: messages.map((message) => {
      const value = message as Record<string, unknown>;
      return { role: value['role'], content: value['content'] };
    }),
  });
  return decodeWorkbenchHistory(encoded) ? encoded : null;
}
```

</hb-code-example>

This in-memory copy belongs to the current page. Refreshing the page discards it. Use [Save text conversations](/docs/angular/recipes/browser-history) for an explicit browser-storage example.

### Keep Configuration Separate

Use `system` for behavior and constraints. Use messages for requests, replies, and facts established during the conversation. Changing `system`, tools, transport options, or `threadId` affects future requests; it does not append a message or load saved text.

A `threadId` is an opaque conversation identity. The client still sends its current transcript on each request, not a message delta. A thread ID does not load or save messages for you. Your application owns storage, selection, retention, and permission to read a conversation. See [Threads](/docs/angular/recipes/threads) for application-owned server storage.

### Respect the Checkpoint Boundary

A text copy is not a canonical agent checkpoint. It does not preserve reasoning replay metadata, tool effects, activities, shared state, or ownership of a pending interrupt. Reusing a thread ID does not restore those values.

Deleting a message also does not undo an action. If a tool submitted an order, track and authorize that action independently of the transcript. For longer histories, preserve complete exchanges when pruning or summarizing.

Activities are display-only progress. Shared state travels separately. Continue with [Activities](/docs/angular/concept/activities), [Shared agent state](/docs/angular/concept/shared-agent-state), or [Interrupt and resume](/docs/angular/concept/interrupt-and-resume) when your workflow needs those contracts.
