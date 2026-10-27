---
title: 'Persist and Resume Threads: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Load and save authorized text conversations on the server, check versions, and recover from a conflicting save.'
---

# Persist and Resume Threads

Let's move a completed text conversation to our server. We'll load it before creating the chat, save after the reply finishes, then refresh and switch conversations. If another window saves first, we'll show the conflict instead of overwriting its work.

<hb-docs-demo demo="server-threads">
</hb-docs-demo>

This example stores completed user and assistant text. It does not restore canonical provider metadata, generated UI, tool history, shared state, or a paused interrupt checkpoint. Those require a persistence design for the agent and state your application actually uses.

## Start with the endpoint contract

Use the [authenticated text endpoint](/docs/angular/recipes/public-endpoint) and your application's existing session. The recorder supplies a local fixture session; no authentication secret is embedded in these clients.

| Request | Response | Boundary |
| --- | --- | --- |
| GET `/api/threads/:id` | `{ id, version, messages }` | Verify the user and authorize this thread |
| PUT `/api/threads/:id` | The next versioned snapshot | Verify Origin and owner; update only if `expectedVersion` still matches |
| POST `/api/chat` | AG-UI event stream | Authorize the thread and apply server policy before calling the provider |

A `threadId` is the identity sent with the run. It does not load history, authorize a read, or change the request into a message delta. The client sends its current transcript on every run. Storage is a separate application request.

## Define versioned storage

`ThreadStore` gives us an owner-scoped read and an atomic compare-and-swap. The local implementation below copies messages when accepting and returning them, so callers do not mutate the saved snapshot through a shared reference.

<hb-expander title="Complete server/thread-store.ts">

<hb-code-example header="server/thread-store.ts">

```ts
/** A completed visible message supported by this server's storage contract. */
export interface StoredTextMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** Validates and copies this application's bounded completed-text format. */
export function parseCompletedText(value: unknown): StoredTextMessage[] | null {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (message) =>
        typeof message !== 'object' ||
        message === null ||
        (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string' ||
        message.content.length > 10000 ||
        Object.keys(message).some((key) => key !== 'role' && key !== 'content'),
    ) ||
    (value.length > 0 && value.at(-1).role !== 'assistant')
  )
    return null;
  return value.map(({ role, content }) => ({ role, content }));
}

/** One application-owned snapshot; it is not an agent checkpoint. */
export interface ThreadSnapshot {
  readonly id: string;
  readonly version: number;
  readonly messages: StoredTextMessage[];
}

/** Persistence operations that must enforce owner scope and atomic version checks. */
export interface ThreadStore {
  read(ownerId: string, id: string): Promise<ThreadSnapshot | null>;
  compareAndSwap(
    ownerId: string,
    id: string,
    expectedVersion: number,
    messages: readonly StoredTextMessage[],
  ): Promise<ThreadSnapshot | null>;
}

/** A thread provisioned by the application, rather than by client identity claims. */
export interface ThreadSeed {
  readonly ownerId: string;
  readonly id: string;
  readonly messages: readonly StoredTextMessage[];
}

function copy(snapshot: ThreadSnapshot): ThreadSnapshot {
  return {
    ...snapshot,
    messages: snapshot.messages.map((message) => ({ ...message })),
  };
}

/**
 * Creates local demonstration storage. Data survives page refreshes, but not a
 * server restart, and is not shared across server processes. Use an atomic
 * database update scoped by both owner and version in a deployed application.
 */
export function createMemoryThreadStore(
  seeds: readonly ThreadSeed[],
): ThreadStore {
  let records = new Map<string, { ownerId: string; snapshot: ThreadSnapshot }>(
    seeds.map((seed) => {
      const parsed = parseCompletedText(seed.messages);
      if (parsed === null || !seed.id || !seed.ownerId)
        throw new Error('Invalid thread seed');
      return [
        seed.id,
        {
          ownerId: seed.ownerId,
          snapshot: { id: seed.id, version: 0, messages: parsed },
        },
      ] as const;
    }),
  );
  if (records.size !== seeds.length)
    throw new Error('Thread IDs must be unique');
  return {
    async read(ownerId, id) {
      const record = records.get(id);
      return record?.ownerId === ownerId ? copy(record.snapshot) : null;
    },
    async compareAndSwap(ownerId, id, expectedVersion, messages) {
      const record = records.get(id);
      if (
        !record ||
        record.ownerId !== ownerId ||
        record.snapshot.version !== expectedVersion ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 0 ||
        expectedVersion >= Number.MAX_SAFE_INTEGER
      )
        return null;
      const parsed = parseCompletedText(messages);
      if (parsed === null) throw new Error('Only completed text can be saved');
      const snapshot = {
        id,
        version: expectedVersion + 1,
        messages: parsed,
      };
      records = new Map(records).set(id, { ownerId, snapshot });
      return copy(snapshot);
    },
  };
}
```

</hb-code-example>

</hb-expander>


Before mounting the client, provision two thread records with the lowercase IDs `personal` and `work`, both owned by the account ID returned by your verified session resolver. Use an empty messages array and version 0 for each new record. The Personal and Work labels in the UI refer to those records. They keep the tutorial easy to follow; they are not an access-control mechanism. In a multi-account application, provision unique thread IDs and load the authorized thread list instead of hard-coding these two options. The recorder also provisions a different owner's thread to verify rejection.

This repository is in memory. A page refresh keeps the server's data, while a server restart removes it. For deployment, implement the same contract using a database. The update must atomically match the owner, thread ID, and expected version; a separate database read followed by an unconditional write is not sufficient.

## Validate responses at the client boundary

Use the [checked `text-history.ts`](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/text-history.ts) for this example's completed-text format and `restoreTextMessages()`. Keep that file beside the following files, or start with the [complete checked example](https://github.com/liveloveapp/hashbrown/tree/main/www/examples/quickstart).

The transport helper verifies the selected thread ID, message format, and version before a server response reaches the chat. A successful save must return exactly the next expected version. A 409 remains a conflict; it does not become a saved status.

<hb-expander title="Complete angular/src/app/server-history.ts">

<hb-code-example header="angular/src/app/server-history.ts">

```ts
import {
  decodeTextHistory,
  encodeTextHistory,
  type SavedTextMessage,
  type TextHistorySource,
} from './text-history';

/** A server-owned, versioned snapshot of a completed text conversation. */
export interface ServerHistory {
  readonly id: string;
  readonly version: number;
  readonly messages: SavedTextMessage[];
}

/** An HTTP failure whose status distinguishes authentication, missing data, and conflicts. */
export class ServerHistoryError extends Error {
  constructor(readonly status: number) {
    super(
      status === 409
        ? 'Another session saved this conversation. Reload the saved conversation.'
        : status === 401
          ? 'Sign in before loading or saving this conversation.'
          : status === 404
            ? 'This conversation is unavailable.'
            : 'The server could not load or save this conversation.',
    );
    this.name = 'ServerHistoryError';
  }
}

async function readSnapshot(
  response: Response,
  selectedId: string,
  expectedVersion?: number,
): Promise<ServerHistory> {
  if (!response.ok) throw new ServerHistoryError(response.status);
  try {
    const value: unknown = await response.json();
    if (
      typeof value !== 'object' ||
      value === null ||
      !('id' in value) ||
      value.id !== selectedId ||
      !('version' in value) ||
      typeof value.version !== 'number' ||
      !Number.isSafeInteger(value.version) ||
      value.version < 0 ||
      (expectedVersion !== undefined && value.version !== expectedVersion) ||
      !('messages' in value) ||
      Object.keys(value).some(
        (key) => !['id', 'version', 'messages'].includes(key),
      )
    )
      throw new Error();
    const decoded = decodeTextHistory(
      JSON.stringify({ version: 1, messages: value.messages }),
    );
    if (decoded.issue) throw new Error();
    return {
      id: selectedId,
      version: value.version,
      messages: decoded.messages,
    };
  } catch {
    throw new Error('Invalid server conversation');
  }
}

/** Loads a provisioned thread using the application's existing same-origin session. */
export async function loadServerHistory(
  id: string,
  signal?: AbortSignal,
  request: typeof fetch = globalThis.fetch,
): Promise<ServerHistory> {
  const response = await request(`/api/threads/${encodeURIComponent(id)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  return readSnapshot(response, id);
}

/** Atomically saves completed text against the last successfully loaded server version. */
export async function saveServerHistory(
  id: string,
  expectedVersion: number,
  messages: readonly TextHistorySource[],
  signal?: AbortSignal,
  request: typeof fetch = globalThis.fetch,
): Promise<ServerHistory> {
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0 ||
    expectedVersion >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('Invalid expected version');
  }
  const decoded = decodeTextHistory(encodeTextHistory(messages));
  const response = await request(`/api/threads/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion, messages: decoded.messages }),
  });
  return readSnapshot(response, id, expectedVersion + 1);
}
```

</hb-code-example>

</hb-expander>


## Load first, then create the chat

The parent loads the selected snapshot before mounting the child. A selection change invalidates the earlier load and creates a fresh chat instance for the new thread. While generating a reply or saving, the UI disables switching until the operation settles.

The child compares the completed text projection with the last successfully saved snapshot. It sends one save at a time and advances its version only after a validated successful response. A failed save leaves the current messages visible and blocks further sends until the user explicitly reloads.

<hb-expander title="Complete angular/src/app/server-conversations.ts">

<hb-code-example header="angular/src/app/server-conversations.ts">

```ts
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { chatResource } from '@hashbrownai/angular';
import type { Chat } from '@hashbrownai/core';
import { encodeTextHistory, restoreTextMessages } from './text-history';
import {
  loadServerHistory,
  saveServerHistory,
  type ServerHistory,
} from './server-history';

type ThreadId = 'personal' | 'work';

/** Owns one loaded runtime and saves completed responses one at a time. */
@Component({
  selector: 'app-server-thread',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label for="prompt">Your message</label>
    <input id="prompt" [value]="prompt()" (input)="onInput($event)" />
    <button
      type="button"
      [disabled]="
        chat.isLoading() ||
        saveState() === 'saving' ||
        saveState() === 'failed' ||
        !prompt().trim()
      "
      (click)="send()"
    >
      Send message
    </button>
    <button
      type="button"
      [disabled]="chat.isLoading() || saveState() === 'saving'"
      (click)="reload.emit()"
    >
      Reload saved conversation
    </button>
    @if (chat.isLoading()) {
      <p role="status">Waiting for a reply...</p>
    }
    @if (chat.error()) {
      <p role="alert">
        The request failed. The saved conversation is unchanged.
      </p>
    }
    @if (saveState() === 'saving') {
      <p role="status">Saving conversation...</p>
    }
    @if (saveState() === 'saved' && !chat.isLoading() && !chat.error()) {
      <p role="status">Saved on the server</p>
    }
    @if (saveState() === 'failed') {
      <p role="alert">
        {{ issue() }} Keep this page open to retain unsaved messages. Reload
        replaces them with the saved conversation.
      </p>
    }
    <ol aria-label="Conversation">
      @for (message of visibleMessages(); track $index) {
        <li>
          <strong>{{ message.role }}: </strong>{{ messageText(message) }}
        </li>
      }
    </ol>
  `,
})
export class ServerThread {
  private readonly initial = (() => {
    const loaded = inject(ServerConversations).snapshot();
    if (!loaded)
      throw new Error('Load a conversation before creating its runtime.');
    return loaded;
  })();
  readonly busy = output<boolean>();
  readonly reload = output<void>();
  protected readonly prompt = signal(
    'My name is Sam. Say hello in one sentence.',
  );
  protected readonly saveState = signal<'saved' | 'saving' | 'failed'>('saved');
  protected readonly issue = signal<string | null>(null);
  protected readonly visibleMessages = signal<
    Chat.Message<string, Chat.AnyTool>[]
  >([]);
  private saved = {
    version: this.initial.version,
    encoded: encodeTextHistory(this.initial.messages),
  };
  private inFlight = false;
  private failed = false;
  private controller: AbortController | null = null;
  protected readonly chat = chatResource({
    system:
      'You are a friendly onboarding assistant. Keep each reply to one sentence.',
    threadId: this.initial.id,
    messages: restoreTextMessages(this.initial.messages),
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
    effect(() => {
      if (this.chat.error()) {
        this.busy.emit(false);
        return;
      }
      const messages = this.chat.value();
      this.visibleMessages.set(messages);
      if (this.chat.isLoading() || this.inFlight || this.failed) return;
      let encoded: string;
      try {
        encoded = encodeTextHistory(messages);
      } catch {
        this.failed = true;
        this.saveState.set('failed');
        this.issue.set('Only completed text conversations can be saved.');
        this.busy.emit(false);
        return;
      }
      if (encoded === this.saved.encoded) {
        this.busy.emit(false);
        return;
      }
      this.inFlight = true;
      this.busy.emit(true);
      this.saveState.set('saving');
      const controller = new AbortController();
      this.controller = controller;
      void saveServerHistory(
        this.initial.id,
        this.saved.version,
        messages,
        controller.signal,
      )
        .then(
          (result) => {
            if (controller.signal.aborted) return;
            this.saved = { version: result.version, encoded };
            this.saveState.set('saved');
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            this.failed = true;
            this.saveState.set('failed');
            this.issue.set(
              error instanceof Error ? error.message : 'Saving failed.',
            );
          },
        )
        .finally(() => {
          if (!controller.signal.aborted) {
            this.inFlight = false;
            this.busy.emit(false);
          }
        });
    });
  }

  protected onInput(event: Event): void {
    this.prompt.set((event.currentTarget as HTMLInputElement).value);
  }
  protected send(): void {
    if (
      this.chat.isLoading() ||
      this.inFlight ||
      this.failed ||
      !this.prompt().trim()
    )
      return;
    this.busy.emit(true);
    this.chat.sendMessage({ role: 'user', content: this.prompt() });
    this.prompt.set('');
  }
  protected messageText(message: Chat.Message<string, Chat.AnyTool>): string {
    return 'content' in message && typeof message.content === 'string'
      ? message.content
      : 'Activity received';
  }
}

/** Loads server-owned history before mounting a fresh runtime for the selected thread. */
@Component({
  selector: 'app-server-conversations',
  imports: [ServerThread],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>A conversation saved on the server</h1>
      <label for="conversation">Conversation</label>
      <select
        id="conversation"
        [value]="selectedId()"
        [disabled]="busy()"
        (change)="select($event)"
      >
        <option value="personal">Personal</option>
        <option value="work">Work</option>
      </select>
      @if (issue()) {
        <p role="alert">{{ issue() }}</p>
      } @else if (!snapshot()) {
        <p role="status">Loading saved conversation...</p>
      }
      @for (
        active of snapshot() ? [snapshot()!] : [];
        track active.id + ':' + revision()
      ) {
        <app-server-thread (busy)="busy.set($event)" (reload)="reload()" />
      }
      @if (!snapshot() && issue()) {
        <button type="button" (click)="reload()">
          Reload saved conversation
        </button>
      }
    </main>
  `,
})
export class ServerConversations {
  private generation = 0;
  readonly snapshot = signal<ServerHistory | null>(null);
  protected readonly selectedId = signal<ThreadId>('personal');
  protected readonly revision = signal(0);
  protected readonly busy = signal(false);
  protected readonly issue = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const id = this.selectedId();
      this.revision();
      const current = this.generation;
      const controller = new AbortController();
      this.snapshot.set(null);
      this.issue.set(null);
      void loadServerHistory(id, controller.signal).then(
        (loaded) => {
          if (!controller.signal.aborted && this.generation === current)
            this.snapshot.set(loaded);
        },
        (error: unknown) => {
          if (!controller.signal.aborted && this.generation === current)
            this.issue.set(
              error instanceof Error ? error.message : 'Loading failed.',
            );
        },
      );
      onCleanup(() => controller.abort());
    });
  }

  protected select(event: Event): void {
    const id = (event.currentTarget as HTMLSelectElement).value;
    if (
      this.busy() ||
      id === this.selectedId() ||
      (id !== 'personal' && id !== 'work')
    )
      return;
    this.generation += 1;
    this.snapshot.set(null);
    this.selectedId.set(id);
  }
  protected reload(): void {
    this.generation += 1;
    this.snapshot.set(null);
    this.revision.update((value) => value + 1);
  }
}
```

</hb-code-example>

</hb-expander>


In `angular/src/main.ts`, bootstrap `ServerConversations` from `./app/server-conversations` with the existing application configuration. Replace `<app-root>` with `<app-server-conversations>` in the HTML and configure `provideHashbrown` with `/api/chat`.

Keep the client and endpoint on the same application origin, using your existing authenticated session and development proxy. The helper uses same-origin credentials and disables response caching. A server-rendered application should load authorized data through its own server data layer and mount the chat from that result; the browser's session cookie is not a client-supplied owner ID.

## Refresh and switch

1. Open **Personal**, introduce Sam, and wait for **Saved on the server**.
2. Refresh. The earlier exchange should load from the server without starting a model run.
3. Switch to **Work**, introduce Lee, and wait for the save.
4. Return to **Personal** and ask **What is my name?** The next request contains the restored Sam exchange.

The recorded provider output is scripted; the storage calls, version checks, runtime recreation, and restored request history are real. Both framework clients run the same sequence.

## Recover a conflicting save

<img src="/video/docs/server-threads-conflict.png" alt="A version conflict keeps the unsaved conversation visible and asks the user to reload the server snapshot explicitly." width="1000" height="463" loading="lazy" />

Suppose two windows load version 3. The first saves version 4. The second still submits `expectedVersion: 3`, so the server returns 409 and keeps version 4.

The second window keeps its unsaved messages visible. **Reload saved conversation** deliberately replaces them with the server's winning snapshot. The example does not silently merge histories or automatically replay a model run. If your product needs merging or branching, define that behavior as part of its conversation model.

The browser checks also delay loads and saves, reject a save, and create a real version conflict. They verify that a stale load cannot mount a chat for a different selection, pending saves prevent concurrent sends/switches, failures retain messages, and explicit reload shows the server winner.

## Choose a broader persistence contract deliberately

Saving public messages does not export Hashbrown's complete canonical agent checkpoint. Reusing a thread ID after refresh does not restore ownership of a pending interrupt. The text format here excludes tools, activities, UI values, reasoning metadata, and shared state.

Use [Message history](/docs/angular/concept/message-history) to understand that boundary and [Interrupt and resume](/docs/angular/concept/interrupt-and-resume) for the live workflow. Apply retention, account-switch behavior, deletion, and authorization in your application's persistence layer.
