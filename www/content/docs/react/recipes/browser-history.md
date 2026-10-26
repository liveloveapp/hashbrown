---
title: 'Save text conversations: Hashbrown React Docs'
meta:
  - name: description
    content: 'Save completed text conversations in browser storage, refresh, and switch between them.'
---

# Save text conversations

Let's keep two small conversations in this browser. We'll finish a reply, save its text, refresh the page, and continue with the right conversation.

<hb-docs-demo demo="persistence">
</hb-docs-demo>

<img src="/video/docs/persistence-result.png" alt="The Personal conversation restored in the browser, with Sam’s greeting and a follow-up that remembers the name." width="920" height="433" loading="lazy" />

## Before we start

Use the [Quickstart endpoint and provider](/docs/react/start/quick) with a text-chat client. The files below replace the Quickstart's root view; the server endpoint stays the same.

This example saves completed user and assistant text. It does not save tool calls, generated UI, activities, shared state, provider reasoning metadata, or a canonical agent checkpoint. A paused interrupt cannot be restored from this format. See [Message history](/docs/react/concept/message-history) for those boundaries.

## Define the storage format

Create `src/text-history.ts`. We keep the storage version beside the messages so that an incompatible value is rejected before it reaches the chat.

<hb-code-example header="src/text-history.ts">

```ts
import type { Chat } from '@hashbrownai/core';

/** One visible message in this example's deliberately text-only storage format. */
export interface SavedTextMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** A load result that distinguishes unavailable storage from incompatible saved data. */
export interface LoadedTextHistory {
  readonly messages: SavedTextMessage[];
  readonly issue: 'invalid' | 'unavailable' | null;
}

/** The runtime fields inspected before saving a completed text conversation. */
export interface TextHistorySource {
  readonly role: string;
  readonly content?: unknown;
  readonly toolCalls?: readonly unknown[];
  readonly serverToolCalls?: readonly unknown[];
}

function validTextMessages(value: unknown): value is SavedTextMessage[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.length <= 10000 &&
        Object.keys(message).every(
          (key) => key === 'role' || key === 'content',
        ),
    ) &&
    (value.length === 0 || value[value.length - 1].role === 'assistant')
  );
}

/** Namespaces a conversation's storage without treating its identity as authorization. */
export function textHistoryKey(threadId: string): string {
  return `hashbrown:text-history:${encodeURIComponent(threadId)}`;
}

/** Reads version 1 text history, rejecting malformed or unknown versions. */
export function decodeTextHistory(stored: string | null): LoadedTextHistory {
  if (stored === null) return { issue: null, messages: [] };
  try {
    const value: unknown = JSON.parse(stored);
    if (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      value.version === 1 &&
      'messages' in value &&
      validTextMessages(value.messages)
    ) {
      return {
        issue: null,
        messages: value.messages.map(({ role, content }) => ({
          role,
          content,
        })),
      };
    }
  } catch {
    /* Invalid storage is reported rather than passed into the runtime. */
  }
  return { issue: 'invalid', messages: [] };
}

/** Projects a completed text conversation; tool/checkpoint data is not a supported format. */
export function encodeTextHistory(
  messages: readonly TextHistorySource[],
): string {
  const text = messages.map(({ role, content }) => ({ role, content }));
  if (
    !validTextMessages(text) ||
    messages.some(
      (message) =>
        (message.toolCalls?.length ?? 0) > 0 ||
        (message.serverToolCalls?.length ?? 0) > 0,
    )
  )
    throw new Error('Only completed text conversations can be saved');
  return JSON.stringify({ version: 1, messages: text });
}

/** Loads one conversation, including a browser storage getter that may throw. */
export function loadTextHistory(
  threadId: string,
  storage?: Pick<Storage, 'getItem'>,
): LoadedTextHistory {
  try {
    return decodeTextHistory(
      (storage ?? globalThis.localStorage).getItem(textHistoryKey(threadId)),
    );
  } catch {
    return { issue: 'unavailable', messages: [] };
  }
}

/** Saves supported completed text only; failures leave the previous stored value intact. */
export function saveTextHistory(
  threadId: string,
  messages: readonly TextHistorySource[],
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    const encoded = encodeTextHistory(messages);
    (storage ?? globalThis.localStorage).setItem(
      textHistoryKey(threadId),
      encoded,
    );
    return true;
  } catch {
    return false;
  }
}

/** Deletes only the selected conversation and reports storage failures. */
export function deleteTextHistory(
  threadId: string,
  storage?: Pick<Storage, 'removeItem'>,
): boolean {
  try {
    (storage ?? globalThis.localStorage).removeItem(textHistoryKey(threadId));
    return true;
  } catch {
    return false;
  }
}

/** Recreates public text-chat inputs, without restoring a canonical agent checkpoint. */
export function restoreTextMessages(
  messages: readonly SavedTextMessage[],
): Chat.MessageInput<string, Chat.AnyTool>[] {
  return messages.map((message) =>
    message.role === 'assistant'
      ? { role: 'assistant', content: message.content, toolCalls: [] }
      : { role: 'user', content: message.content },
  );
}
```

</hb-code-example>

A stored conversation has `version: 1` and an array of text messages. This small example allows up to 100 messages, each no longer than 10,000 characters. It refuses a partial turn, a tool call, or a different message kind instead of silently dropping it.

`restoreTextMessages()` creates fresh public chat inputs. It does not recreate internal provider metadata or claim ownership of an interrupted run.

Storage reads and writes can fail, including when a browser blocks storage or its quota is full. The helper returns a result that the interface can show, and a failed encode leaves the earlier saved value intact. Unknown versions remain untouched until the user explicitly clears that conversation. If you change the format in your app, add and test a migration or ask the user to reset it.

## Create the conversation view

Create `src/SavedConversations.tsx`:

<hb-code-example header="src/SavedConversations.tsx">

```tsx
import { useEffect, useState } from 'react';
import { useChat } from '@hashbrownai/react';
import {
  deleteTextHistory,
  type LoadedTextHistory,
  loadTextHistory,
  restoreTextMessages,
  saveTextHistory,
} from './text-history';

type ThreadId = 'personal' | 'work';
interface Selection {
  readonly id: ThreadId;
  readonly initial: LoadedTextHistory;
  readonly revision: number;
}

/** Switches between two browser-stored, completed text conversations. */
export function SavedConversations() {
  const [selection, setSelection] = useState<Selection | null>(null);
  useEffect(() => {
    setSelection({
      id: 'personal',
      initial: loadTextHistory('personal'),
      revision: 0,
    });
  }, []);

  return (
    <main>
      <h1>A conversation that survives refresh</h1>
      {selection ? (
        <SavedThread
          key={`${selection.id}:${selection.revision}`}
          selection={selection}
          onSelect={(id) =>
            setSelection({ id, initial: loadTextHistory(id), revision: 0 })
          }
          onReset={() =>
            setSelection({
              ...selection,
              initial: loadTextHistory(selection.id),
              revision: selection.revision + 1,
            })
          }
        />
      ) : (
        <p role="status">Loading saved conversation...</p>
      )}
    </main>
  );
}

function SavedThread({
  selection,
  onSelect,
  onReset,
}: {
  selection: Selection;
  onSelect: (id: ThreadId) => void;
  onReset: () => void;
}) {
  const [prompt, setPrompt] = useState(
    'My name is Sam. Say hello in one sentence.',
  );
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>(
    'idle',
  );
  const chat = useChat({
    system:
      'You are a friendly onboarding assistant. Keep each reply to one sentence.',
    threadId: selection.id,
    messages: restoreTextMessages(selection.initial.messages),
  });

  useEffect(() => {
    if (chat.isLoading || chat.error || chat.messages.length === 0) return;
    if (selection.initial.issue) {
      setSaveState('failed');
      return;
    }
    setSaveState(
      saveTextHistory(selection.id, chat.messages) ? 'saved' : 'failed',
    );
  }, [
    chat.error,
    chat.isLoading,
    chat.messages,
    selection.id,
    selection.initial.issue,
  ]);

  function clear() {
    if (deleteTextHistory(selection.id)) onReset();
    else setSaveState('failed');
  }

  return (
    <>
      <label htmlFor="conversation">Conversation</label>
      <select
        id="conversation"
        value={selection.id}
        disabled={chat.isLoading}
        onChange={(event) => {
          const id = event.currentTarget.value;
          if (id === 'personal' || id === 'work') onSelect(id);
        }}
      >
        <option value="personal">Personal</option>
        <option value="work">Work</option>
      </select>
      {selection.initial.issue && (
        <p role="alert">
          Saved messages could not be restored. Clear this conversation to
          replace them.
        </p>
      )}
      <label htmlFor="prompt">Your message</label>
      <input
        id="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <button
        type="button"
        disabled={
          chat.isLoading ||
          !prompt.trim() ||
          selection.initial.issue === 'invalid'
        }
        onClick={() => {
          chat.sendMessage({ role: 'user', content: prompt });
          setPrompt('');
        }}
      >
        Send message
      </button>
      <button type="button" disabled={chat.isLoading} onClick={clear}>
        Clear this conversation
      </button>
      {chat.isLoading && <p role="status">Waiting for a reply...</p>}
      {chat.error && (
        <p role="alert">
          The request failed. The previous saved conversation is unchanged.
        </p>
      )}
      {saveState === 'saved' && !chat.isLoading && (
        <p role="status">Saved in this browser</p>
      )}
      {saveState === 'failed' && (
        <p role="alert">
          We could not save or clear this conversation. Keep this page open to
          retain its current messages.
        </p>
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
    </>
  );
}
```

</hb-code-example>

Let's look at the choices in this example:

1. **Load before creating the chat.** The `messages` option seeds the new instance. It does not become a live connection to storage.
2. **Save after the reply finishes.** We skip loading and error states, so a partial response does not replace the last saved conversation.
3. **Recreate the chat when switching.** React uses the selected ID and revision as the child key. That keeps the transcript and thread identity together.
4. **Show failures.** If storage fails, the current conversation remains visible in memory. The interface warns the user to keep the page open.
5. **Clear one conversation.** Reset removes only that conversation's stored value and creates a fresh text-chat instance.

The fixed Personal and Work IDs make the example easy to follow. In your app, choose IDs and storage keys that match your account and conversation model. An ID is a lookup key, not permission to read another user's data.

## Render the example

In the Quickstart `src/main.tsx`, import `SavedConversations` from `./SavedConversations` and render `<SavedConversations />` inside `HashbrownProvider` in place of `<App />`.

This is a browser-rendered example. If your application renders on the server, load browser storage after the browser takes over and create the chat from that client-side result. Do not treat a server-rendered empty snapshot as a reason to overwrite an existing browser conversation.

## Refresh and switch conversations

1. In **Personal**, send the message that introduces Sam. Wait for **Saved in this browser**.
2. Refresh. The earlier exchange should return without starting a new model request.
3. Switch to **Work**, introduce Lee, and wait for the save confirmation.
4. Switch back to **Personal** and ask **What is my name?** The next request should include the Sam exchange.
5. Select **Clear this conversation** to remove Personal. Work should still be available.

The recording uses deterministic AG-UI responses through the real client and storage code. Your model's wording can vary. The visible result and restored request history are what matter.

## Choose what should be stored

Browser storage is plain text available to scripts on the same origin and to someone using the browser profile. It does not provide cross-device sync or server authorization. Decide what is appropriate to save, how long it should remain, and what should happen when a user signs out.

For application-owned server storage and opaque thread identity, continue with [Threads](/docs/react/recipes/threads). Hashbrown sends the current transcript on each run; a thread ID alone does not load it or turn the request into a message delta.
