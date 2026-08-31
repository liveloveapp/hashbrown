---
title: 'Persist and Resume Threads: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Persist Hashbrown Angular messages in your application and resume a chat with an opaque AG-UI threadId.'
---

# Persist and Resume Threads

<p class="subtitle">Keep conversation storage in your application while Hashbrown handles the active AG-UI run.</p>

Hashbrown treats `threadId` as opaque AG-UI identity. On every model run, the client sends that identity and its current transcript to POST `/run`. Hashbrown does not load or save conversations for you.

This separation keeps the model transport focused on streaming and lets your application own authorization, retention, indexing, titles, branching, and storage.

## Data Flow

1. Your application creates or resolves a thread ID.
2. Your data layer loads the stored messages for that ID.
3. Pass those messages to the chat resource, or call `setMessages(...)` after loading.
4. Hashbrown sends the current transcript with each AG-UI run.
5. Your application persists the updated transcript after generation and tool calls settle.

The request is not a message delta. The current transcript is included so the provider can generate with the complete context that the client is using.

## Keep `/run` Focused on the Model

The Hashbrown endpoint maps a run to provider events. Conversation storage is a separate application concern.

<hb-code-example header="server/run.ts">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const events = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
    input: req.body as RunAgentInput,
    signal: abortController.signal,
  });
  const encoder = new EventEncoder();

  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Content-Type', encoder.getContentType());
  res.header('Connection', 'keep-alive');
  res.flushHeaders();

  for await (const event of events) {
    res.write(encoder.encodeSSE(event));
  }

  if (!res.writableEnded) {
    res.end();
  }
});
```

</hb-code-example>

Expose authenticated application endpoints or server functions for thread storage. Store the full Hashbrown message shape, including assistant tool calls and tool results.

```ts
import type { Chat } from '@hashbrownai/core';

export async function readThreadMessages(
  threadId: string,
): Promise<Chat.Message<string, Chat.AnyTool>[]> {
  const response = await fetch(`/api/threads/${threadId}`);
  if (!response.ok) throw new Error('Unable to load thread');
  return response.json();
}

export async function writeThreadMessages(
  threadId: string,
  messages: Chat.Message<string, Chat.AnyTool>[],
): Promise<void> {
  const response = await fetch(`/api/threads/${threadId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!response.ok) throw new Error('Unable to save thread');
}
```

These functions belong to the application. They are not provider-adapter options and are never called by `/run`.

## Hydrate `chatResource`

Load history through your application data service. Use `setMessages(...)` when the load completes, then persist only after hydration and active generation settle.

<hb-code-example header="thread-chat.component.ts">

```ts
import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { Chat } from '@hashbrownai/core';
import { chatResource } from '@hashbrownai/angular';
import { ThreadStorage } from './thread-storage';

@Component({
  selector: 'app-thread-chat',
  templateUrl: './thread-chat.component.html',
})
export class ThreadChatComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly storage = inject(ThreadStorage);
  readonly threadId = this.route.snapshot.paramMap.get('threadId')!;
  readonly isHydrating = signal(true);
  readonly chat = chatResource({
    model: 'gpt-5',
    system: 'You are a helpful assistant.',
    threadId: this.threadId,
  });
  private lastSaved = '[]';

  constructor() {
    effect(() => {
      const messages = this.chat.value();
      if (this.isHydrating() || this.chat.isLoading()) return;

      const snapshot = JSON.stringify(messages);
      if (snapshot === this.lastSaved) return;

      this.lastSaved = snapshot;
      void this.storage.writeMessages(this.threadId, messages);
    });
  }

  async ngOnInit() {
    const messages = await this.storage.readMessages(this.threadId);
    this.lastSaved = JSON.stringify(messages);
    this.chat.setMessages(messages);
    this.isHydrating.set(false);
  }

  send(content: string) {
    this.chat.sendMessage({ role: 'user', content });
  }
}
```

</hb-code-example>

Use the same pattern with `uiChatResource` and `structuredChatResource`. Persist their complete message values rather than extracting text, because UI payloads, structured values, tool calls, and tool results are part of the conversation state.

## Operational Guidance

- Authorize every read and write using application identity; an opaque ID is not an access-control mechanism.
- Decide whether to save only completed turns or periodic streaming checkpoints. The example saves after Hashbrown's aggregate loading state settles.
- Use optimistic concurrency or version checks when the same thread can be open in multiple tabs.
- Apply retention, redaction, and encryption policies in the persistence layer.
- Keep provider credentials and model policy on the server-side `/run` endpoint.
