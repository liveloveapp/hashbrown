---
title: 'How Hashbrown works: Hashbrown React Docs'
meta:
  - name: description
    content: 'Follow the two-step plan through the browser, endpoint, provider, streaming parser, and trusted component.'
---

# How Hashbrown works

<hb-docs-demo demo="canonical-workbench-first-plan-react">
</hb-docs-demo>

A Hashbrown application has two cooperating parts. The client owns the interface and conversation state. Your server owns the provider connection and required policy. They exchange run input and AG-UI events so the interface can update while a response arrives.

Let's look at that flow independently of any particular demo. A support assistant, a form helper, and a planning app can use the same boundaries.

<hb-concept-diagram concept="client-server">
</hb-concept-diagram>

## Follow the application flow

1. **The user asks.** A chat API adds the message to the current conversation and starts a run with the configured schemas and tools.
2. **Your endpoint checks the request.** It authenticates and authorizes the caller, validates input, and selects the trusted provider configuration. Hashbrown does not supply your account system.
3. **The adapter calls the provider.** It maps the run into a provider request and returns canonical AG-UI events for lifecycle, content, and tool activity.
4. **The client interprets the response.** Text can grow as it arrives. Schema-driven output resolves typed values. A UI response maps to the components you exposed.
5. **Your application handles the result.** Rendering a preview and writing business data are separate operations. Check completion, freshness, and application rules before applying a change.

A run may include tool calls and further provider requests. A new user message begins another turn with relevant history. A thread identifier connects the conversation logically; it does not save messages or create a durable checkpoint on its own.

## Connect a reusable server boundary

This server helper uses the OpenAI adapter. It assumes the packages from the [OpenAI guide](/docs/react/platform/openai). The caller supplies validated AG-UI input and an optional abort signal; the HTTP endpoint still owns access checks and event encoding.

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';

export function createReply(input: RunAgentInput, signal?: AbortSignal) {
  const apiKey = process.env['OPENAI_API_KEY'];
  const model = process.env['OPENAI_MODEL'];
  if (!apiKey || !model)
    throw new Error('Set the server provider configuration');
  return HashbrownOpenAI.stream.text({ apiKey, model, input, signal });
}
```

Use the [Quickstart](/docs/react/start/quick) for the complete HTTP handler and React client. The same endpoint can serve ordinary text, structured output, or a trusted component contract when configured for that task. Keep sensitive configuration and authorization on the server.

## Explore it in the workbench

Now follow those boundaries in a concrete implementation. The recording uses the real React client and OpenAI adapter. Its `first-plan` lesson renders `SummaryCard`; the inspector and timeline record what happened without becoming part of the component API.

### Follow the request

1. **We send a user message.** The button calls `sendMessage()` on `useUiChat()`. Hashbrown creates a run with the conversation history and the response schema built from our exposed component.
2. **The browser calls our endpoint.** The Quickstart uses `/api/chat`, with a local development proxy forwarding it to Express. The workbench uses its dedicated `/api/workbench/first-plan` route. The API key and model stay on the server.
3. **The adapter calls the provider.** `HashbrownOpenAI.stream.text()` maps the run to the provider request. The adapter converts the response into AG-UI lifecycle and content events; `EventEncoder` sends those events back over a server-sent event stream.
4. **Hashbrown parses the streamed values.** The schema describes a title and an array of steps. Streaming fields become available as the response arrives, so we can render a preview before the entire response is complete.
5. **Our component renders.** `message.ui` resolves `SummaryCard` to the application component we exposed. Its props come from the generated response. Its markup and behavior come from our code.

Open the [workbench](/docs/react/start/workbench) at `http://127.0.0.1:4370/react.html?lesson=first-plan`. Step through the bottom timeline, drag it anywhere, and compare **Requests**, **JSON**, and **UI**. They describe the same run at the selected moment.

### What goes to the model?

The request includes the conversation and the generated output contract: component names, descriptions, and prop schemas. Our component implementation stays in the application.

The model can select an exposed component and supply its values. It does not provide a new React component or arbitrary markup for Hashbrown to execute. Use [Debugging](/docs/react/concept/debugging) when a component name or generated value does not match the contract.

### What changed in our application?

In this first lesson, nothing was saved. The card is a generated preview. The **State** view remains unchanged while the title and steps stream into the UI.

In [Exposing components](/docs/react/concept/components), we'll add an explicit **Accept plan** action. In [Tool calling](/docs/react/concept/functions), we'll expose a handler that reads the current application plan. A tool call can add a result and another provider request within the same user turn; the first-plan lesson has no tools.

### A conversation is more than one request

AG-UI identifies the conversation with a `threadId` and each run with a `runId`. A follow-up can retain the earlier messages while starting a new run. These identifiers do not load a saved conversation or write it to a database.

The workbench timeline captures observations for inspection. Replaying them does not call the provider or repeat an application action. Saving and restoring a conversation is a separate application concern covered in [Message history](/docs/react/concept/message-history).

Next, follow two requests in [Messages and turns](/docs/react/concept/ai-basics).
