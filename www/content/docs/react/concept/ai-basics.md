---
title: 'Messages and turns: Hashbrown React Docs'
meta:
  - name: description
    content: 'Understand messages, assistant turns, and conversations with context.'
---

# Messages and turns

A conversation is an ordered set of messages. We send a user message, the assistant responds, and the next request can include those earlier turns.

Let's try a small example. Tell the assistant your name, then ask it to use that name in its next reply.

<hb-docs-demo demo="conversation">
</hb-docs-demo>

## Before we start

Use the endpoint and HashbrownProvider configuration from the [Quickstart](/docs/react/start/quick). This page switches to text chat so we can focus on the conversation itself.

## Create a conversation

<hb-code-example header="src/Conversation.tsx">

```tsx
import { useState } from 'react';
import { useChat } from '@hashbrownai/react';

/** A text conversation that keeps earlier turns in the current chat instance. */
export function Conversation() {
  const [prompt, setPrompt] = useState(
    'My name is Sam. Say hello in one sentence.',
  );
  const chat = useChat({
    system:
      'You are a friendly onboarding assistant. Keep each reply to one sentence.',
    debugName: 'onboarding',
  });

  return (
    <main>
      <h1>A conversation with context</h1>
      <label htmlFor="prompt">Your message</label>
      <input
        id="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <button
        type="button"
        disabled={chat.isLoading || !prompt.trim()}
        onClick={() => {
          chat.sendMessage({ role: 'user', content: prompt });
          setPrompt('');
        }}
      >
        Send message
      </button>
      {chat.isLoading && <p role="status">Waiting for a reply...</p>}
      {chat.error && (
        <p role="alert">The request failed. Check your server and try again.</p>
      )}
      <ol aria-label="Conversation">
        {chat.messages.map((message, index) => (
          <li key={index}>
            <strong>{message.role}: </strong>
            {message.role === 'user' ||
            message.role === 'assistant' ||
            message.role === 'error'
              ? typeof message.content === 'string'
                ? message.content
                : JSON.stringify(message.content)
              : 'Activity received'}
          </li>
        ))}
      </ol>
    </main>
  );
}
```

</hb-code-example>

Render `Conversation` inside `HashbrownProvider` in place of the Quickstart `App`.

Send the first message, then enter **What is my name?** and send again. The second request includes the earlier exchange, so the model can use that context. Your model's wording may vary.

## What is a message?

A user message has a `role` and `content`:

```ts
{ role: 'user', content: 'My name is Sam. Say hello in one sentence.' }
```

Hashbrown adds it to the current chat and starts a request. As the response arrives, the assistant's message becomes available in `chat.messages`.

| Role in Hashbrown | What it represents |
| --- | --- |
| `user` | A request from the user or your application |
| `assistant` | Generated content, tool calls, or both |
| `error` | A failure represented in the conversation |
| `activity` | A progress or status update from an agent |

The `system` option supplies guidance for the assistant. It is configuration for the conversation, rather than another user message. See [System instructions](/docs/react/concept/system-instructions).

<img src="/video/docs/conversation-result.png" alt="Two user messages and two assistant replies, with the second reply using the name supplied in the first turn." width="920" height="437" loading="lazy" />

## What happens during a turn?

A user message can lead directly to an answer. It can also lead to tool calls, tool results, and another model request before the answer is ready.

```text
User message → assistant calls a tool → tool result → assistant response
```

Hashbrown manages that exchange. Use `isLoading` when your interface should remain busy through the whole operation, including tool calls. If your feature needs to show tool progress or a paused operation, continue with [Tool calling](/docs/react/concept/functions), [Activities](/docs/react/concept/activities), and [Interrupt and resume](/docs/react/concept/interrupt-and-resume).

## Chat or completion?

Use `useChat()` for a text conversation that retains earlier messages in the current instance. Use `useCompletion()` for a response driven by the current input, such as rewriting a sentence.

If the response should contain your components, use `useUiChat()` instead. See [Choosing an API](/docs/react/start/overview) for the complete comparison.

## Keeping the conversation

The current chat instance keeps its messages while it lives. A page refresh or a newly created instance does not automatically restore them.

Continue with [Message history](/docs/react/concept/message-history) to save and restore a conversation. If a request fails, use [Debugging](/docs/react/concept/debugging) to inspect the endpoint and runtime state.
