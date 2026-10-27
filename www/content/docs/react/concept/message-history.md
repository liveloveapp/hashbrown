---
title: 'Message history: Hashbrown React Docs'
meta:
  - name: description
    content: 'Keep, clear, and restore completed text, then follow the restored context into the next real request.'
---

# Message history

<hb-docs-demo demo="canonical-workbench-message-history-react">
</hb-docs-demo>

Let's name our two-step plan **Lighthouse**. We'll ask the assistant to explain it, keep the completed text, clear the chat, and restore that exchange. Then we'll ask a follow-up. The next request should contain the conversation we restored.

The History inspector keeps the SDK transcript beside the app's retained copy. Clear removes the current messages. It leaves the retained copy alone. Restore puts that text back into the SDK; it does not replay the earlier request or execute a plan step.

<img src="/video/docs/canonical-workbench-message-history-react-result.png" alt="React workbench showing restored Lighthouse messages, their history observation, and the synchronized bottom timeline." width="1600" height="1000" loading="lazy" />

Run the [canonical workbench](/docs/react/start/workbench), then open [`/react.html?lesson=message-history`](http://127.0.0.1:4370/react.html?lesson=message-history). The recording uses the [checked React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/HistoryWorkbench.tsx) and real provider streaming. The model's wording can vary.

## Follow the Conversation

Hashbrown includes the current transcript in the next request. Read it from `chat.messages`. Choose Requests in the inspector to see the actual request body, including the earlier user and assistant messages.

1. Send the prompt that names the plan Lighthouse. Wait for the reply to finish.
2. Select **Keep completed text**. The app holds a narrow text copy in memory.
3. Select **Clear messages**. The SDK transcript becomes empty without a model request.
4. Select **Restore kept text**. The SDK assigns fresh message IDs to the restored text.
5. Ask which plan we're working on. The new request includes the restored exchange.

Scrub the bottom timeline to compare those moments. Replay changes the selected view; it does not call a model, replace live messages, or write storage.

## Seed Once, Replace Explicitly

The `messages` option supplies the initial history when the chat runtime is created. Changing that option later does not replace an existing transcript. For a load that finishes after the runtime has mounted, use the public setter deliberately:

```ts
chat.setMessages([]);
```

`setMessages` can start generation when the final message needs an answer, such as a trailing user or tool message. This example restores only empty or validated assistant-ended text. Neither replacement needs an answer, so it sends no model request. The SDK briefly schedules the replacement before settling; the controls wait for that transition.

Keep history edits disabled while a request is running, resuming, awaiting an interrupt response, or requiring recovery. If an asynchronous load can outlive a selection, check that it still belongs to the current conversation before applying it.

## Keep a Completed Text Copy

The retained copy contains only user and assistant string content. Keeping it requires a successful completed `stop`, supported text, and a settled live runtime. Idle by itself does not prove success: a stopped or truncated response can leave partial assistant text on screen.

The shared helper validates the complete copy before replacing anything. It strips message IDs and excludes tool calls, activities, shared state, and provider metadata. The new runtime owns the restored IDs.

<hb-code-example header="runtime/workbench-history.ts">

```ts
export function encodeWorkbenchHistory(
  messages: readonly unknown[],
): string | null {
  if (
    !messages.every(
      (message) =>
        record(message) &&
        (message['role'] === 'user' || message['role'] === 'assistant') &&
        typeof message['content'] === 'string' &&
        ['toolCalls', 'serverToolCalls'].every(
          (key) =>
            message[key] === undefined ||
            (Array.isArray(message[key]) && message[key].length === 0),
        ),
    )
  )
    return null;
  const encoded = JSON.stringify({
    version: 1,
    messages: messages.map((message) => {
      const value = message as Record<string, unknown>;
      return { role: value['role'], content: value['content'] };
    }),
  });
  return decodeWorkbenchHistory(encoded) ? encoded : null;
}
```

</hb-code-example>

This in-memory copy belongs to the current page. Refreshing the page discards it. Use [Save text conversations](/docs/react/recipes/browser-history) for an explicit browser-storage example.

## Keep Configuration Separate

Use `system` for behavior and constraints. Use messages for requests, replies, and facts established during the conversation. Changing `system`, tools, transport options, or `threadId` affects future requests; it does not append a message or load saved text.

A `threadId` is an opaque conversation identity. The client still sends its current transcript on each request, not a message delta. A thread ID does not load or save messages for you. Your application owns storage, selection, retention, and permission to read a conversation. See [Threads](/docs/react/recipes/threads) for application-owned server storage.

## Respect the Checkpoint Boundary

A text copy is not a canonical agent checkpoint. It does not preserve reasoning replay metadata, tool effects, activities, shared state, or ownership of a pending interrupt. Reusing a thread ID does not restore those values.

Deleting a message also does not undo an action. If a tool submitted an order, track and authorize that action independently of the transcript. For longer histories, preserve complete exchanges when pruning or summarizing.

Activities are display-only progress. Shared state travels separately. Continue with [Activities](/docs/react/concept/activities), [Shared agent state](/docs/react/concept/shared-agent-state), or [Interrupt and resume](/docs/react/concept/interrupt-and-resume) when your workflow needs those contracts.
