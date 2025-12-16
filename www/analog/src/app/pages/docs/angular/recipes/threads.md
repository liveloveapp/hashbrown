---
title: 'Threads: Delta Sends & Chat Rehydration'
meta:
  - name: description
    content: 'Opt into Hashbrown Threads to persist chats, send only message deltas, and rehydrate Angular resources with threadId.'
---

# Threads: Persisted Chats with Delta Sends

<p class="subtitle">Enable threads to shrink payloads, resume chats, and surface clear loading/saving state in your Angular apps.</p>

What you'll learn:

1. How thread mode changes Hashbrown’s HTTP behavior (deltas instead of full history)
2. How to opt in by adding `loadThread` / `saveThread` to your adapter
3. How to rehydrate Angular resources by supplying a `threadId`
4. Where to read thread UI state (`isLoadingThread`, `isSavingThread`, errors)

---

## 0. What changes when threads are on?

- **Delta-only sends:** After a thread is established, Hashbrown only posts the **new messages since the last assistant turn**. Your backend merges them with the stored thread before calling the model.
- **State restoration:** Provide a `threadId` and Hashbrown will fetch the saved messages, letting you reopen chats and continue.
- **Explicit loading/saving flags:** Hooks/resources surface `isLoadingThread`, `isSavingThread`, and corresponding errors so you can show spinners or toasts.
- **Opt-in only:** If you don’t pass `loadThread` / `saveThread`, behavior is unchanged.
- **Not for local/browser transports:** Threads require server transports (OpenAI/Azure/Google/Writer/Ollama). Local browser models skip thread logic.

---

## 1. Opt in on the server adapter (save/load thread)

Add two callbacks to your Hashbrown adapter. `saveThread` should reuse a provided `threadId` or generate one; returning a new id flips the client into thread mode.

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

- `loadThread(threadId)` returns the full message history you’ve stored (DB, cache, KV, etc.).
- `saveThread(thread, threadId?)` persists the merged thread. Return the id you saved; if you generated one, that id activates delta sending for future calls.
- If you already had a `threadId`, return the same one—changing it mid-flight is treated as an error.

---

## 2. Start Angular resources in thread mode

Pass a `threadId` to any chat resource or hook to fetch history and continue with deltas. If messages are empty, Hashbrown auto-calls `load-thread` before generation; if you pre-seed messages, it skips the load.

<hb-code-example header="samples/kitchen-sink/angular/src/app/features/chat/chat-panel.component.ts">

```ts
import { uiChatResource } from '@hashbrownai/angular';

const chat = uiChatResource({
  model: 'gpt-4.1',
  threadId: 'a06c6efd-6e1d-428b-8419-1fb04538b6b2', // existing chat to rehydrate
  system: 'You are a helpful assistant for a smart home app.',
  components: [
    /* exposed UI components */
  ],
  tools: [
    /* createTool(...) definitions */
  ],
});
```

</hb-code-example>

Notes:

- To **start fresh but keep deltas**, omit `threadId`; the first `saveThread` return value will create one.
- To **resume** an existing chat, set `threadId` up front—Hashbrown will load history, then only send new messages.
- Same pattern works with all of Hashbrown's Angular resources.

---

## 3. Show loading/saving state in your UI

Thread flows surface state you can bind to spinners or error banners.

```ts
chat.isLoadingThread(); // true while loading history (init or pre-generate refresh)
chat.isSavingThread(); // true while persisting after generation
chat.loadThreadError(); // Error | undefined
chat.saveThreadError(); // Error | undefined
```

You can render these alongside `chat.isReceiving()` / `chat.isSending()` to distinguish network work from thread persistence.

---

## 4. How the request/response changes

1. **Initialize:** If `threadId` is set and messages are empty, Hashbrown sends `operation: 'load-thread'` to your backend. Backend returns the full thread; UI sets `isLoadingThread` during this call.
2. **Generate:** On each new turn, Hashbrown:
   - Refetches the stored thread via `loadThread` (payload omitted in the success frame).
   - Merges it with the client-side delta (new user/tool messages) before calling the LLM.
   - After streaming finishes, calls `saveThread` and emits `isSavingThread`.
3. **Subsequent turns:** Only the delta is sent; your backend combines it with stored history so the model still sees the full context.
