---
title: 'Debugging: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Inspect requests, generated UI, and tool calls when an interaction fails.'
---

# Debugging

When an interaction fails, first find where it stopped: the browser request, the provider response, or the component rendering.

The ATC example includes a developer drawer that shows routing decisions, streamed UI JSON, and browser-side tool calls.

<hb-docs-demo demo="debugging">
</hb-docs-demo>

## Check the request

Open the browser's Network panel and trigger the interaction again. Confirm the endpoint path and response status. A 404 usually means the route or development proxy does not match the client configuration. A 401 or 403 points to endpoint authentication or provider credentials.

If the request succeeds but the UI stays empty, inspect the response's event stream and the server terminal. A provider failure can arrive as a `RUN_ERROR` event after the HTTP stream has started. A 200 status alone does not prove that the run succeeded.

## Inspect the chat

Set `debugName` when creating the chat. The [Messages and turns](/docs/angular/concept/ai-basics) example uses `debugName: 'onboarding'` and includes the required system instructions.

Hashbrown reports runtime actions to [Redux DevTools](https://chromewebstore.google.com/detail/lmhkpmbekcpmknklioeibfkpmmfibljd), where you can inspect the named chat. The ATC drawer is an example-specific interface; it is separate from the browser extension.

## Check generated UI

For a UI response, check three things:

1. The component is included in `components` and has the name the response references.
2. Its generated props match the exposed schema.
3. The application renders `<hb-render-message>` for assistant messages.

Start with the smallest component that reproduces the issue. The [Quickstart](/docs/angular/start/quick) uses two string props and no tools, which makes it a useful baseline.

## Check tool failures

Inspect the tool name, arguments, and handler result. A handler should return the information the model needs to continue. Keep application authorization in the handler or on your server, and avoid logging credentials or private user data while debugging.

See [Tool calling](/docs/angular/concept/functions) for argument schemas and handler behavior.

## Try again after fixing the cause

In the Quickstart, select **Generate a welcome card** again. In a conversation, decide whether to send a new message or reload the previous response. `chat.reload()` removes the last assistant response and resends the previous user message; it can repeat tool execution, so consider the effect of repeating an action.

Use [Message history](/docs/angular/concept/message-history) when you need to inspect, restore, or prune the conversation before another request.
