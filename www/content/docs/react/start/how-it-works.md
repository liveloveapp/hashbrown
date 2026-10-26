---
title: 'How Hashbrown works: Hashbrown React Docs'
meta:
  - name: description
    content: 'Follow the two-step plan through the browser, endpoint, provider, streaming parser, and trusted component.'
---

# How Hashbrown works

Let's follow the two-step plan from the [Quickstart](/docs/react/start/quick). We send one user message, the provider streams a response, and Hashbrown renders our trusted `SummaryCard`.

<hb-docs-demo demo="canonical-workbench-first-plan-react">
</hb-docs-demo>

The recording uses the real React client and OpenAI adapter. The workbench adds inspection and replay around the same component used by the standalone Quickstart.

## Follow the request

1. **We send a user message.** The button calls `sendMessage()` on `useUiChat()`. Hashbrown creates a run with the conversation history and the response schema built from our exposed component.
2. **The browser calls our endpoint.** The Quickstart uses `/api/chat`, with a local development proxy forwarding it to Express. The workbench uses its dedicated `/api/workbench/first-plan` route. The API key and model stay on the server.
3. **The adapter calls the provider.** `HashbrownOpenAI.stream.text()` maps the run to the provider request. The adapter converts the response into AG-UI lifecycle and content events; `EventEncoder` sends those events back over a server-sent event stream.
4. **Hashbrown parses the streamed values.** The schema describes a title and an array of steps. Streaming fields become available as the response arrives, so we can render a preview before the entire response is complete.
5. **Our component renders.** `message.ui` resolves `SummaryCard` to the application component we exposed. Its props come from the generated response. Its markup and behavior come from our code.

Open the [workbench](/docs/react/start/workbench) at `http://127.0.0.1:4370/react.html?lesson=first-plan`. Step through the bottom timeline and compare **Requests**, **JSON**, and **UI**. They describe the same run at the selected moment.

## What goes to the model?

The request includes the conversation and the generated output contract: component names, descriptions, and prop schemas. Our component implementation stays in the application.

The model can select an exposed component and supply its values. It does not provide a new React component or arbitrary markup for Hashbrown to execute. Use [Debugging](/docs/react/concept/debugging) when a component name or generated value does not match the contract.

## What changed in our application?

In this first lesson, nothing was saved. The card is a generated preview. The **State** view remains unchanged while the title and steps stream into the UI.

In [Exposing components](/docs/react/concept/components), we'll add an explicit **Accept plan** action. In [Tool calling](/docs/react/concept/functions), we'll expose a handler that reads the current application plan. A tool call can add a result and another provider request within the same user turn; the first-plan lesson has no tools.

## A conversation is more than one request

AG-UI identifies the conversation with a `threadId` and each run with a `runId`. A follow-up can retain the earlier messages while starting a new run. These identifiers do not load a saved conversation or write it to a database.

The workbench timeline captures observations for inspection. Replaying them does not call the provider or repeat an application action. Saving and restoring a conversation is a separate application concern covered in [Message history](/docs/react/concept/message-history).

Next, follow two requests in [Messages and turns](/docs/react/concept/ai-basics).
