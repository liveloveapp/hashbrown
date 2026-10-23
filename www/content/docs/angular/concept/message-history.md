---
title: 'Message history: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Keep context between turns and decide how a conversation is saved.'
---

# Message history

The next request needs the earlier exchange if we want the assistant to remember what we already told it. Hashbrown keeps that context in the current chat instance.

<hb-docs-demo demo="conversation">
</hb-docs-demo>

## Before we start

The [Messages and turns](/docs/angular/concept/ai-basics) example sends a name, receives a reply, and asks a follow-up question. The recording shows context within one active conversation. It does not demonstrate persistence after a refresh.

## Decide what should survive

| Event | What your app needs to do |
| --- | --- |
| Another message in the same chat instance | Hashbrown includes the current history |
| A page refresh or a new chat instance | Load saved history and provide it when creating the chat |
| A user switching conversations | Save and restore the selected conversation's messages |
| A long conversation | Decide which messages to keep, summarize, or remove |

Let's start by restoring messages when the chat is created. The examples below build on the [Quickstart endpoint and provider](/docs/angular/start/quick).

Treat stored messages as application data. Validate data loaded from storage and choose a retention policy appropriate for the information your users share. Local storage is readable by scripts on the same origin.

## Restore a simple text conversation

The local-storage example below is for text chat without tool calls or agent checkpoints. It saves the public messages, rather than exporting the runtime’s full internal history. Use a server-managed thread when your application needs durable agent state.

Pass `messages` when you create the resource. Hashbrown uses this array as the initial chat history.

<hb-code-example header="support-chat.component.ts">

```ts
import { Component, effect } from '@angular/core';
import { type Chat } from '@hashbrownai/core';
import { chatResource } from '@hashbrownai/angular';

const STORAGE_KEY = 'support-chat-messages';

function loadMessages(): Chat.Message<string, Chat.AnyTool>[] {
  if (typeof window === 'undefined') return [];

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

@Component({
  selector: 'app-support-chat',
  standalone: true,
  template: `
    @for (message of chat.value(); track $index) {
      <p>{{ message.content }}</p>
    }
  `,
})
export class SupportChatComponent {
  chat = chatResource({
    system: 'You are a helpful support assistant.',
    messages: loadMessages(),
  });

  constructor() {
    effect(() => {
      if (typeof window === 'undefined') return;

      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(this.chat.value()),
      );
    });
  }
}
```

</hb-code-example>

Keep the stored value as plain JSON. Do not store functions, component references, `Promise` values, or provider-specific request objects in message history.

---

## Replace History with `setMessages`

Use `setMessages` when your app needs to replace the current history. Always pass a new array instead of mutating `chat.value()` in place.

<hb-code-example header="support-chat.component.ts">

```ts
keepRecentMessages() {
  this.chat.setMessages(this.chat.value().slice(-8));
}

clearHistory() {
  this.chat.setMessages([]);
}

removeLastAssistantMessage() {
  const messages = this.chat.value();
  const index = messages.findLastIndex(
    (message) => message.role === 'assistant',
  );

  if (index === -1) return;

  this.chat.setMessages(messages.filter((_, i) => i !== index));
}
```

</hb-code-example>

This is useful for "clear chat", "delete message", "retry from here", and "trim old turns" controls.

---

## Order of Operations

Hashbrown creates one chat instance for the resource and keeps its message history until you intentionally replace it. The `messages` option seeds the initial history only; changing the value you passed to `messages` later does not reset an active chat.

Reactive options such as `system`, `apiUrl`, `threadId`, tools, and transport are applied to future requests. Updating those options does not append a message, clear history, or resend the conversation by itself.

Use `sendMessage` to add a new turn, `setMessages` to replace history, and `reload` to remove the last assistant message before retrying. For completion resources, `input` is different from chat history: changing `input` synchronizes the backing single user message for the next completion.

Put durable behavior and constraints in `system`. Put conversational facts, prior turns, summaries, and user-visible conversation state in message history.

---

## Summarize Older Turns

For long chats, keep recent messages verbatim and replace older turns with a summary. This preserves context while reducing payload size.

<hb-code-example header="support-chat.component.ts">

```ts
async compactHistory() {
  const messages = this.chat.value();
  const recentMessages = messages.slice(-8);
  const olderMessages = messages.slice(0, -8);

  if (olderMessages.length === 0) return;

  const summary = await summarizeMessages(olderMessages);

  this.chat.setMessages([
    {
      role: 'user',
      content: `Previous conversation summary:\n${summary}`,
    },
    ...recentMessages,
  ]);
}
```

</hb-code-example>

Put durable application rules in `system`. Use summarized messages for conversational facts, user preferences, and prior decisions.

---

## Public History and AG-UI Checkpoints

`chat.value()` remains Hashbrown's opinionated public view of the conversation. When an AG-UI agent sends a message checkpoint, Hashbrown retains the complete canonical AG-UI history internally and uses it for subsequent requests. User and assistant messages expose their stable canonical `id` in the public view. Metadata and roles that do not have a Hashbrown public representation remain in that internal checkpoint.

The public view continues to use Hashbrown's existing message shapes: user and assistant messages remain familiar, reasoning is correlated with assistant messages, and tool results settle their corresponding tool calls. Canonical system and developer messages are not added to `chat.value()`. Activity messages are: each one appears in `chat.value()` as a `role: 'activity'` message, in the position where it arrived. See [Activities](/docs/angular/concept/activities). The internal canonical history is not exposed as a separate public API.

Shared state is synchronized independently from message history. See [Shared Agent State](/docs/angular/concept/shared-agent-state) when your application and agent need to exchange structured state snapshots and deltas.


---

## Client History vs. Threads

Client-managed history sends the message array with each request. It is simple and works well for local storage, short conversations, and user-controlled editing.

Use [Threads](/docs/angular/recipes/threads) when you want the server to own persistence, rehydrate by `threadId`, and send only new message deltas after a conversation is established.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="recipes/threads">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>Threads</h4>
      <p>Persist chats on the server and send only message deltas.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/system-instructions">
    <div>
      <hb-functions />
    </div>
    <div>
      <h4>System Instructions</h4>
      <p>Keep durable behavior and constraints outside message history.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/shared-agent-state">
    <div>
      <hb-database-cog />
    </div>
    <div>
      <h4>Shared Agent State</h4>
      <p>Synchronize structured application state with an AG-UI agent.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
