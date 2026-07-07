---
title: 'Message History: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Persist, restore, and mutate Hashbrown chat message history in Angular.'
---
# Message History

<p class="subtitle">Persist, restore, and prune the messages your chat sends to the model.</p>

Hashbrown keeps chat state in a `messages` array. Each turn appends user, assistant, tool, and error messages to that array, and each request sends the current history so the model has conversational context.

Use message history when you want to:

1. Restore a chat after a page refresh
2. Persist conversations to local storage or your backend
3. Remove or summarize older turns before the next request
4. Let users delete or retry part of a conversation

---

## Initialize with Stored Messages

Pass `messages` when you create the resource. Hashbrown uses this array as the initial chat history.

<hb-code-example header="support-chat.component.ts">

```ts
import { Component, effect } from '@angular/core';
import { type Chat } from '@hashbrownai/core';
import { chatResource } from '@hashbrownai/angular';

const STORAGE_KEY = "support-chat-messages";

function loadMessages(): Chat.Message<string, Chat.AnyTool>[] {
  if (typeof window === "undefined") return [];

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
    model: 'gpt-4.1',
    system: 'You are a helpful support assistant.',
    messages: loadMessages(),
  });

  constructor() {
    effect(() => {
      if (typeof window === "undefined") return;

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

Reactive options such as `model`, `system`, `apiUrl`, `threadId`, tools, and transport are applied to future requests. Updating those options does not append a message, clear history, or resend the conversation by itself.

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
</hb-next-steps>
