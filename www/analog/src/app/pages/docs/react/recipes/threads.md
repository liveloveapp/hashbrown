---
title: 'Threads: Delta Sends & Chat Rehydration'
meta:
  - name: description
    content: 'Opt into Hashbrown Threads in React to persist chats, send only message deltas, and rehydrate useChat/useUiChat with threadId.'
---

# Threads: Persisted Chats with Delta Sends

<p class="subtitle">Enable threads to shrink payloads, resume chats, and surface clear loading/saving state in your React apps.</p>

What you'll learn:

1. How thread mode changes Hashbrown’s HTTP behavior (deltas instead of full history)
2. How to opt in by adding `loadThread` / `saveThread` to your server adapter
3. How to rehydrate `useChat` / `useUiChat` by supplying a `threadId`
4. Where to read thread UI state (`isLoadingThread`, `isSavingThread`, errors)

---

## 0. What changes when threads are on?

- **Delta-only sends:** After a thread exists, Hashbrown only posts the **new messages since the last assistant turn**. Your backend merges them with the stored thread before calling the model.
- **State restoration:** Provide a `threadId` and Hashbrown will fetch saved messages so users can reopen and continue chats.
- **Explicit loading/saving flags:** Hooks expose `isLoadingThread`, `isSavingThread`, plus errors for UI affordances.
- **Opt-in only:** If you don’t pass `loadThread` / `saveThread`, behavior stays the same.
- **Not for local/browser transports:** Threads require server transports (OpenAI/Azure/Google/Writer/Ollama). Local browser models skip thread logic.

---

## 1. Opt in on the server adapter (save/load thread)

Wire `loadThread` and `saveThread` on your Hashbrown adapter. Persist in your real data store; throw when a thread is missing.

<hb-code-example header="server/threads-example.ts">

```ts
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db'; // your persistence layer (SQL, NoSQL, KV, etc.)

app.post('/chat', async (req, res) => {
  const request = req.body as Chat.Api.CompletionCreateParams;

  const stream = HashbrownOpenAI.stream.text({
    apiKey: OPENAI_API_KEY,
    request,
    loadThread: async (threadId: string) => {
      // Fetch full message history from your database
      const thread = await db.threads.get(threadId);
      if (!thread) throw new Error(`thread not found: ${threadId}`);
      return thread;
    },
    saveThread: async (thread, threadId = uuidv4()) => {
      // Upsert the merged thread to storage
      await db.threads.put(threadId, thread);
      return threadId;
    },
  });

  res.header('Content-Type', 'application/octet-stream');
  for await (const chunk of stream) res.write(chunk);
  res.end();
});
```

</hb-code-example>

Key points:

- `loadThread(threadId)` must return the full message history from storage; throw if missing.
- `saveThread(thread, threadId?)` persists the merged thread and returns the id (reused or newly generated).
- Returning a new id when none existed flips the client into thread mode, enabling delta sends on subsequent turns.

---

## 2. Start React hooks in thread mode

Pass `threadId` to your chat hook to fetch history and continue with deltas. If messages are empty, Hashbrown auto-calls `load-thread`; if you pre-seed messages, it skips the load.

### useChat (text-only)

<hb-code-example header="hooks/use-threaded-chat.tsx">

```tsx
import { useChat } from '@hashbrownai/react';

export function useThreadedChat(threadId?: string) {
  const chat = useChat({
    model: 'gpt-4.1',
    threadId, // e.g., from route params or user profile
    system: 'You are a helpful assistant for a smart home app.',
  });

  return chat;
}
```

</hb-code-example>

### useUiChat (generative UI + tools)

<hb-code-example header="components/SmartHomeChat.tsx">

```tsx
import { useUiChat, exposeComponent, useTool } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { Markdown } from './Markdown';
import { LightCard } from './LightCard';
import { useUser } from './useUser';
import { useLights } from './useLights';

export function SmartHomeChat({ threadId }: { threadId?: string }) {
  const user = useUser();
  const lights = useLights();

  const getUser = useTool({
    name: 'getUser',
    description: 'Get the current user',
    handler: async (_signal) => user.data,
    deps: [user.data],
  });

  const getLights = useTool({
    name: 'getLights',
    description: 'List lights',
    handler: async (_signal) => lights.data,
    deps: [lights.data],
  });

  const chat = useUiChat({
    model: 'gpt-4.1',
    threadId, // pass an existing id to rehydrate
    system: 'You are a helpful assistant for a smart home app.',
    components: [
      exposeComponent(Markdown, {
        name: 'Markdown',
        description: 'Render markdown to the user',
        props: { data: s.streaming.string('Markdown content') },
        children: false,
      }),
      exposeComponent(LightCard, {
        name: 'LightCard',
        description: 'Show a light with brightness control',
        props: {
          id: s.string('Light id'),
          name: s.string('Light name'),
          brightness: s.number('Current brightness'),
        },
        children: false,
      }),
    ],
    tools: [getUser, getLights],
  });

  return (
    <div>
      {chat.isLoadingThread && <p>Loading history…</p>}
      {chat.threadLoadError && <p>Error loading thread</p>}
      {/* render chat UI using chat.messages, chat.sendMessage, etc. */}
    </div>
  );
}
```

</hb-code-example>

Notes:

- To **start fresh**, omit `threadId`; the first `saveThread` return value will create one.
- To **resume**, provide `threadId` up front (route param, user session).
- Works the same with `useChat` (text) and `useUiChat` (UI + tools).

---

## 3. Show loading/saving state in your UI

Thread flows surface state for spinners/toasts:

```ts
chat.isLoadingThread; // true while loading history (init or pre-generate refresh)
chat.isSavingThread; // true while persisting after generation
chat.threadLoadError; // { error, stacktrace? } | undefined
chat.threadSaveError; // { error, stacktrace? } | undefined
```

Render alongside `chat.isReceiving` / `chat.isSending` to distinguish network vs. persistence work.

---

## 4. How the request/response changes

1. **Initialize:** `threadId` + empty messages -> Hashbrown sends `operation: 'load-thread'`; backend returns full thread; `isLoadingThread` toggles.
2. **Generate:** Each turn refetches stored thread (payload omitted in the success frame), merges with client delta, calls the LLM, then runs `saveThread` (`isSavingThread`).
3. **Subsequent turns:** Only the delta is sent; backend merges with stored history so the model sees full context.
