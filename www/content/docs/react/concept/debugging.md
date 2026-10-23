---
title: 'Debugging: Hashbrown React Docs'
meta:
  - name: description
    content: 'Inspect requests, schema failures, tool calls, cancellation, and interrupted runs.'
---

# Debugging

When a card does not appear, first find where the interaction stopped: the browser request, the provider response, schema validation, or component rendering.

The ATC example includes a developer drawer that shows routing decisions, streamed UI JSON, and browser-side tool calls.

<hb-docs-demo demo="debugging">
</hb-docs-demo>

This drawer belongs to the ATC example. In your own application, start with the browser's Network panel and `chat.error`.

## Inspect the request and response

Open the Network panel, select **Generate a welcome card** in the [Quickstart](/docs/react/start/quick), and inspect the request to `/api/chat`.

- **404:** check the configured endpoint path and development proxy. Restart the frontend server after changing its proxy configuration.
- **401 or 403:** inspect your endpoint's authentication response and server logs. If the endpoint rejected a provider request, check the server-side credentials and model access.
- **200 with no card:** inspect the event stream and `chat.error`. A provider failure can arrive as a `RUN_ERROR` event after the HTTP stream has started. A 200 status alone does not prove that the run succeeded.

In the request payload, check `messages` for the current transcript and `tools` for the tool definitions. UI requests carry their response schema in `forwardedProps.hashbrown.responseSchema`, with `ui: true` in the same Hashbrown extension. Shared state travels in the separate `state` field.

Use `threadId` and `runId` to match the request to server events. `threadId` is an opaque conversation identity, not a request to retrieve saved history. The client sends its current transcript. If that transcript is empty after a refresh, investigate your application's history restoration.

In the response, check for `RUN_STARTED`, content events, and a terminal `RUN_FINISHED` or `RUN_ERROR`. The runtime rejects a stream that ends before either terminal event. For `RUN_ERROR`, inspect the event's `message` and optional `code`, then check the corresponding server logs. Remove credentials and private user content before sharing a captured request.

## Check the schema and component

Start with the Quickstart's `WelcomeCard`. Its exposed `props` schema accepts two strings, `title` and `message`, and no children.

Compare the generated output with that definition:

| Generated output                      | What to check                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `title` is a number                   | The model must supply a string, as declared by `s.string()`. Inspect the response schema actually sent in the request.       |
| The component is named `Welcome`      | The registered name is `WelcomeCard`. Check the exposed name and the system instructions.                                    |
| The card has children                 | The Quickstart uses `children: false`. Change the generated output or deliberately expose a component that accepts children. |
| The JSON ends halfway through a value | Check the full stream and its terminal event. An unfinished response cannot supply the completed props the card needs.       |

The runtime can report `Invalid structured output` when generated UI fails its response schema. That message does not identify every invalid field; compare the streamed content with the request's schema to find the mismatch.

If React reports `Unknown element type. WelcomeCard`, compare the generated name with the current component registry. This can also happen when rendering saved output with a different set of components.

If the values are valid but nothing appears, confirm that the application renders `message.ui` for assistant messages. A text chat response does not become UI just because its text mentions a component. Use the UI chat API from the Quickstart.

Partial output also matters: a component without a fallback may wait for valid props before appearing. See [Streaming props](/docs/react/concept/streaming) before treating that wait as a rendering failure.

## Inspect the chat and tools

Set `debugName` when creating the chat. The [Messages and turns](/docs/react/concept/ai-basics) example uses `debugName: 'onboarding'` and includes the required system instructions.

Hashbrown reports runtime actions to [Redux DevTools](https://chromewebstore.google.com/detail/lmhkpmbekcpmknklioeibfkpmmfibljd), where you can inspect the named chat. This is separate from the ATC drawer above.

For a tool failure, inspect the tool name, generated arguments, and handler result. `Invalid tool arguments for …` points to argument parsing or schema validation. Confirm that the model supplied the fields declared by the tool, then inspect the handler if validation passed. A browser handler needs to return the information the model requires to continue.

Keep authorization in your handler or server. A schema can validate an account ID without proving that the user can access that account. See [Tool calling](/docs/react/concept/functions) for handler behavior and cancellation signals.

## Check cancellation

`chat.stop()` cancels the active local generation or tool turn. Calling it when there is no active work throws. Connect the tool handler's abort signal to cancellable operations such as `fetch`, and connect a browser disconnect to the provider's abort signal in your endpoint, as the Quickstart does.

Stopping a request does not undo a completed tool action or prove that the server stopped processing it. Inspect the operation's result before repeating an action with side effects. Shared state streamed during a cancelled attempt rolls back to the attempt's starting value; earlier committed changes remain.

A pending interrupt is a different state: while the agent waits for answers, `chat.isLoading` and `chat.isResuming` are false and `chat.pendingInterrupts` contains the batch. Calling `stop()` is not an answer to that batch. Use `resume()` with the complete set of responses, including any `cancelled` entries your application needs to submit.

## Recover an interrupted run

If a resume fails, identify whether its matching `RUN_STARTED` arrived:

- **Before `RUN_STARTED`:** failure or stop releases the local claim. The same batch can be submitted again while it remains valid. Your endpoint must handle repeated decisions idempotently, because a lost response does not prove the server missed the request.
- **After `RUN_STARTED`:** failure or stop requires a new thread before further requests. Hashbrown does not automatically replay the accepted resume. Start a new workflow and inspect any earlier tool effects before repeating them.
- **The batch expired:** start a new thread. Setting the same thread ID does not reset the batch or clear the recovery requirement.
- **The page refreshed:** the pending batch belonged to the previous runtime. Reusing its thread ID or saving its local batch ID does not restore its canonical checkpoint. Recovery across refreshes requires an application and server persistence design.

Changing to a different thread retires local interrupt ownership; it does not cancel server work. See [Interrupt and resume](/docs/react/concept/interrupt-and-resume) for batch validation and recovery rules.

## Try again after fixing the cause

In the Quickstart, select **Generate a welcome card** again. In a conversation, decide whether to send a new message or reload the previous response. `chat.reload()` removes the last assistant response and resends the previous user message; it can repeat tool execution.

Use [Message history](/docs/react/concept/message-history) when you need to inspect, restore, or prune the conversation before another request. For the full request path, see [How Hashbrown works](/docs/react/start/how-it-works).
