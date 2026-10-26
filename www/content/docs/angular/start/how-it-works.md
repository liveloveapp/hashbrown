---
title: 'How Hashbrown works: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Follow a welcome card from the browser through your endpoint, provider, and trusted component.'
---

# How Hashbrown works

Let's follow the welcome card from the [Quickstart](/docs/angular/start/quick). We ask for a card, the model supplies its text, and our application renders the component we wrote.

<hb-docs-demo demo="welcome-card">
</hb-docs-demo>

The recording uses the Quickstart component with a scripted model response. Running the Quickstart locally sends the request to your configured provider.

## Follow one request

1. **The browser sends the conversation.** In `src/app/app.ts`, the button calls `sendMessage()` on `uiChatResource()`. Hashbrown sends the current transcript and response schema to `/api/chat`, configured by `provideHashbrown()` in `src/app/app.config.ts`. The request includes an opaque `threadId` for the conversation and a `runId` for this run.
2. **Our endpoint calls the provider.** In `welcome-server/server.ts`, Express receives the request. During development, the frontend proxy forwards the same-origin `/api/chat` request to Express on port 3001. `HashbrownOpenAI.stream.text()` calls OpenAI using the key and model configured on the server.
3. **The adapter streams AG-UI events.** The adapter converts the provider response into AG-UI events. `EventEncoder` writes them as a server-sent event stream. Hashbrown reads run lifecycle events and content deltas as they arrive.
4. **Hashbrown parses and validates the output.** The browser uses the Skillet schema created from our exposed components. `WelcomeCard` accepts `title` and `message` strings, with no children. Generated values must satisfy that schema; partial JSON is processed as it streams.
5. **Our component renders the card.** `<hb-render-message>` creates our Angular `WelcomeCard` from `src/app/welcome-card.ts` with the validated inputs. The component supplies the markup and behavior. The model supplies the two strings.

We send component names, descriptions, and schemas to guide the model. Our component implementation stays in the application; the model does not generate or execute a replacement component.

The schema is also why an unsupported component name or a number in place of `title` can fail to produce a card. See [Debugging](/docs/angular/concept/debugging) to inspect those failures.

## Where browser tools run

The welcome card has no tools. When we add a [browser-side tool](/docs/angular/concept/functions), the model can request it by name with generated arguments. Hashbrown validates those arguments and calls the handler in our browser application. The result joins the conversation so the model can continue.

A handler can read local application state or call our server. Keep credentials and privileged operations on the server, and authorize each operation there. A tool's name, description, and argument schema describe how to call it; they do not establish the user's permission to perform the action.

## Where shared state goes

[Shared agent state](/docs/angular/concept/shared-agent-state) is a separate JSON-compatible value sent in the AG-UI run input. An agent can return state snapshots and deltas for the client to apply. Calling `setState()` replaces that shared value; it does not send a message or start a run.

The direct provider adapters do not automatically put shared state into the model's prompt. If the model needs a selected account or other application fact, explicitly supply it in message or tool content, or use an agent endpoint that reads the state field.

## What our application owns

The browser owns the exposed components and local tool handlers. The endpoint owns provider credentials and must enforce authentication, authorization, request validation, and usage limits. Treat the browser's transcript, schemas, tools, and state as client-supplied input when securing that endpoint. See [Securing a public endpoint](/docs/angular/recipes/public-endpoint).

Conversation storage also belongs to our application. Hashbrown sends the current transcript with each request; a `threadId` identifies a conversation but does not load its history. A page refresh recreates the browser runtime. Saving an ID alone restores neither messages nor a pending interrupt workflow.

Continue with [Message history](/docs/angular/concept/message-history) for storage and [Interrupt and resume](/docs/angular/concept/interrupt-and-resume) for workflows that pause for user input.

For the data contract itself, continue with [Skillet schemas](/docs/angular/concept/schema) and [Structured output](/docs/angular/concept/structured-output). The checked shopping-list example follows a typed response from generation through review and application validation.
