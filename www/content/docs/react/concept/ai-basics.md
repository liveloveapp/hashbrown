---
title: 'Messages and turns: Hashbrown React Docs'
meta:
  - name: description
    content: 'Follow messages, turns, and request identities in the same plan conversation.'
---

# Messages and turns

Let's give our two-step plan a name, then ask the assistant to use it in a follow-up. The second request keeps the earlier exchange in the same conversation.

<hb-docs-demo demo="canonical-workbench-conversation-react">
</hb-docs-demo>

This lesson uses text chat. There are no tools or generated components, so we can focus on the messages themselves.

## Create a conversation

Use the endpoint and provider from the [Quickstart](/docs/react/start/quick). Create `src/ConversationBasics.tsx`:

<hb-code-example header="src/ConversationBasics.tsx">

```tsx
import { useState } from 'react';
import { useChat } from '@hashbrownai/react';

/** A text conversation that keeps earlier turns in the current chat instance. */
export function ConversationBasics() {
  const [prompt, setPrompt] = useState(
    'Call my two-step demo plan Lighthouse. What should I do first?',
  );
  const chat = useChat({
    system:
      'Help discuss a small two-step plan. Remember the plan name in this conversation. Keep replies concise.',
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
          setPrompt('What did I name my plan, and what comes next?');
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

In the frontend entry, import `ConversationBasics` and render `<ConversationBasics />` inside `HashbrownProvider` in place of `<FirstPlanApp />`.

Send the first message, then ask **What did I name my plan, and what comes next?** The second reply should refer to Lighthouse. The wording can vary; the earlier user message is the context for that name.

## Inspect the two requests

Open the [workbench](/docs/react/start/workbench) at `http://127.0.0.1:4370/react.html?lesson=conversation`. Send **First prompt**, then **Follow-up**. Select **Requests**, pick each turn's request, and open **Raw request** to compare the envelopes:

| Value | What to look for |
| --- | --- |
| `messages` | The follow-up includes the earlier user message and assistant reply. |
| `threadId` | The conversation keeps the same thread identity. |
| `runId` | The next run has a fresh identity. |

Drag the bottom timeline, or the overview above the request table, to revisit either turn. The chat, current request, text, and captured state move together. Replay makes no new request.

<img src="/video/docs/canonical-workbench-conversation-react-result.png" alt="The React conversation workbench retains the Lighthouse plan discussion while the inspector shows the follow-up request." width="1600" height="1000" loading="lazy" />

## A message, a turn, and a request

A **message** is one item in the conversation, with a role and content. A user message starts the work we ask the assistant to do. The assistant's streamed reply becomes another message.

A **turn** can involve more than one model request. This lesson has no tools, so each of its two user turns needs one provider request. With [tools](/docs/react/concept/functions), the assistant may request a handler, receive its result, and make another provider request before finishing that turn.

The `system` option supplies feature guidance. It is not another user message. We'll inspect that distinction in [System instructions](/docs/react/concept/system-instructions).

## Start another conversation

Choose **New conversation** in the workbench. It starts with no messages and makes no request until you send one. The earlier conversation remains independently selectable in the sidebar.

The current chat instance retains its messages while it lives. A page refresh does not automatically load them again. A `threadId` identifies a conversation; it is not a database or a persistence strategy.

Continue with [Message history](/docs/react/concept/message-history) when you need to save and restore messages. That is separate from the workbench's read-only inspection timeline.
