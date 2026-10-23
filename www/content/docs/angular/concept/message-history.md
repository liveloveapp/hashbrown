---
title: 'Message history: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Keep context between turns and decide what survives refresh, navigation, and a new chat instance.'
---

# Message history

The next request needs the earlier exchange if we want the assistant to remember what we already told it. Hashbrown keeps that context in the current chat instance. Your application decides whether it should survive beyond that instance.

<hb-docs-demo demo="persistence">
</hb-docs-demo>

## Decide what should survive

| Event | What happens |
| --- | --- |
| Another message in the same instance | Hashbrown includes its current transcript in the next request |
| A refresh or a new chat instance | Your application must load and supply the saved messages |
| A conversation switch | Load the selected transcript and create or reset the corresponding chat instance |
| A change to `threadId` | The identity changes; it does not load a conversation or automatically replace the visible history |
| A paused interrupt followed by runtime recreation | Saved text and the old thread ID do not restore the paused workflow |

The recording shows the [Save text conversations](/docs/angular/recipes/browser-history) example. It saves a completed exchange, refreshes, switches between Personal and Work, and sends a follow-up with the restored transcript.

## Restore a simple text conversation

Pass the loaded messages when creating the chat. That array is the initial history; changing the array later does not reset an active instance.

The complete [browser-storage recipe](/docs/angular/recipes/browser-history) validates its versioned data, recreates the chat when selecting another conversation, and reports storage failures. It deliberately saves only completed user and assistant text. Use it as a small text example, rather than an export format for every Hashbrown feature.

For asynchronous storage, finish loading before mounting the new chat, or use `setMessages()` deliberately after the load. Prevent an older load from replacing a newer selection. Avoid saving the empty initial view over a conversation that is still loading.

## Replace history deliberately

Use a new array with `setMessages()` when your interface clears, restores, or edits a conversation. For example, inside an existing chat component:

```ts
chat.setMessages([]);
```

Changing history does not undo an earlier action. If a tool submitted an order, deleting its message does not cancel that order. Authorize and track application actions independently of the transcript.

Wait for a run to settle before editing or saving its history. For a long conversation, preserve complete logical exchanges when pruning or summarizing; a tool result without its original call is not a useful standalone turn.

## Separate configuration from conversation data

Use `system` for the feature's behavior and constraints. Use messages for user requests, assistant responses, and the facts established during the conversation.

Updating `system`, tools, transport options, or `threadId` affects future requests. It does not append a message or send a new request by itself. Use `sendMessage()` when you want another turn.

## Public history and canonical checkpoints

`chat.value()` is the public view of the conversation. The runtime can also retain canonical AG-UI messages and provider metadata that do not have the same public representation. When an agent supplies a checkpoint, that complete internal history can be used for later requests in the live runtime.

Saving the public view as JSON does not export that full checkpoint. The text recipe intentionally projects just `role` and string `content`. It does not preserve reasoning replay data, tool effects, activities, or shared state. Use an agent and persistence layer designed for the state your workflow actually needs.

Activities are display-only progress and are not sent back as model conversation. Shared state is synchronized separately from message history. See [Activities](/docs/angular/concept/activities) and [Shared agent state](/docs/angular/concept/shared-agent-state).

## Thread identity and storage

`threadId` is an opaque identity sent with the AG-UI run. Hashbrown does not load or save a transcript just because you supply one. The current client transcript is sent on every run; it is not a message delta.

Your application owns storage, authorization, retention, and which conversation to restore. A server-side agent may maintain additional state, but that is an endpoint contract your application must implement. See [Threads](/docs/angular/recipes/threads) for application-owned storage.

Pending interrupt batches belong to the live runtime. Refreshing the page or creating another instance does not restore that ownership from saved text. Reusing the old thread ID is not a recovery strategy. See [Interrupt and resume](/docs/angular/concept/interrupt-and-resume).

## Next steps

Build the [browser-storage example](/docs/angular/recipes/browser-history), then use [Threads](/docs/angular/recipes/threads) when your app needs server-managed storage. Keep [Debugging](/docs/angular/concept/debugging) nearby when the restored request does not contain the context you expected.
