---
title: 'Save text conversations: Hashbrown React Docs'
meta:
  - name: description
    content: 'Explicitly save completed text in two browser slots, refresh, and continue with validated history.'
---

# Save text conversations

<hb-docs-demo demo="canonical-workbench-save-text-conversations-react">
</hb-docs-demo>

Let's keep our two-step plan after a refresh. We'll save a completed Lighthouse exchange, save a second conversation as **Harbor**, then refresh and load Lighthouse into a new chat. A follow-up will show which text actually reached the model.

The saved-text selector chooses a browser slot. The left sidebar still chooses a live conversation. Selecting a saved slot does not load its messages or send a request. We make those actions explicit so you can see what each one changes.

<img src="/video/docs/canonical-workbench-save-text-conversations-react-result.png" alt="React workbench showing Lighthouse's saved text beside the current operation and restored conversation." width="1600" height="1000" loading="lazy" />

Run the [canonical workbench](/docs/react/start/workbench), then open [`/react.html?lesson=save-text-conversations`](http://127.0.0.1:4370/react.html?lesson=save-text-conversations). The [checked React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/HistoryWorkbench.tsx) uses real Hashbrown requests and provider streaming.

## Save Text Deliberately

1. Complete the Lighthouse request and save it to the Lighthouse slot.
2. Create a new live conversation from the sidebar. Select Harbor, name its plan Harbor, and save the completed reply there.
3. Refresh the page. The live conversations and their old timeline are gone; the saved text remains.
4. Select Lighthouse and load its text. Loading makes no model request.
5. Send a follow-up, inspect the restored context in Requests, and save after the new reply succeeds.

The recording makes three provider requests across independent live instances. The timeline after refresh contains this page's load and continuation. It does not reconstruct the old requests or their timings. Replay makes no requests and writes no storage.

## Define a Small Format

The browser document has `version: 1` and messages with only `role` and string `content`:

```ts
const savedText = {
  version: 1,
  messages: [
    { role: 'user', content: 'Name our plan Lighthouse.' },
    {
      role: 'assistant',
      content: 'Lighthouse has two steps: outline, then record.',
    },
  ],
};
```

The helper permits at most 40 messages, 2,000 characters per message, and 64,000 serialized UTF-8 bytes. It rejects oversized data instead of truncating it. Those limits leave room for the workbench server's request envelope and another user message.

A nonempty document must include a user message and end with an assistant reply. Unknown fields, unknown versions, unsupported roles, malformed JSON, and tool-bearing histories are rejected. Load passes validated assistant-ended text to `setMessages`. It briefly schedules the replacement, then settles without a model request. The SDK assigns fresh IDs after restoration. The format does not preserve a canonical checkpoint, shared state, generated UI, activities, provider metadata, or pending interrupt ownership.

<hb-code-example header="runtime/workbench-history.ts">

```ts
export interface WorkbenchTextDocument {
  readonly version: 1;
  readonly messages: readonly {
    readonly role: 'user' | 'assistant';
    readonly content: string;
  }[];
}
```

</hb-code-example>

## Require a Successful Reply

The client checks `lastRunFinishReason === 'stop'` together with the current live cursor and SDK lifecycle. It also requires supported, nonempty text and no loading, resuming, error, pending interrupt, or required recovery.

Stopping a stream can leave partial text visible. A length limit, refusal, filtering, or failure can also end a request without producing a successful exchange. None of those outcomes replaces the last saved document. Restoring old text clears the SDK's completion evidence; saving becomes available after the next successful reply.

<hb-code-example header="react/src/HistoryWorkbench.tsx">

```ts
const chat = useChat({ system: workbenchHistorySystem, transport });
```

</hb-code-example>

The shared action helper checks the actual SDK observation as well as the selected capture:

<hb-code-example header="runtime/workbench-history-client.ts">

```ts
const savable = () =>
  mutable() &&
  observation().finishReason === 'stop' &&
  canSaveWorkbenchHistory(store.getSnapshot());
```

</hb-code-example>

Reads happen after mounting, when selecting a slot, and before loading it. They never run during server rendering. Saving is an explicit action; mounting, streaming, selecting, loading, refreshing, and replaying do not write an empty or partial conversation over the saved value.

## Handle Storage Failures

Browser storage can be blocked, full, or unavailable. Reads, writes, deletes, and even access to the storage getter can throw. The helper reports the failure while keeping the live conversation usable.

An invalid or unknown document stays untouched. Clear the selected saved slot explicitly before replacing it. Each slot has its own namespaced key and one atomic write. Clearing Lighthouse leaves Harbor alone. The inspector shows the last-read document; it is not a live view of changes from another tab.

## Choose the Right Persistence Boundary

Browser storage belongs to this origin and browser profile. It is plain text available to scripts on the origin. It provides neither server authorization nor cross-device synchronization or cross-tab conflict control. Decide what is appropriate to retain, how long to keep it, and what happens on sign-out. Do not save secrets here.

The Lighthouse and Harbor labels are application lookup keys. They are independent of the new SDK thread ID after refresh. Supplying an old `threadId` does not load a transcript or make a text document resumable.

Use [Message history](/docs/react/concept/message-history) to understand the setter, [Threads](/docs/react/recipes/threads) for application-owned server storage, and [Interrupt and resume](/docs/react/concept/interrupt-and-resume) for live workflow ownership.

For a runnable TypeScript/Postgres reference that survives a server restart, see [Durable recovery with b4.run](/docs/react/platform/b4run). It separates conversation checkpoints, native approval grants, and the application’s accepted plan.
