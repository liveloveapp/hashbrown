---
title: 'Choosing an API: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Choose a Hashbrown API by result shape, conversation behavior, and runtime.'
---

# Choosing an API

<hb-docs-demo demo="canonical-workbench-ui-angular">
</hb-docs-demo>

Start with what your interface needs to show: text, typed data, your own components, or a choice among known options. Then decide whether the request needs earlier conversation turns.

New to Hashbrown? Build the two-step plan in the [Quickstart](/docs/angular/start/quick) first. The examples below extend that setup.

## Choose by result

| I want to…                                         | API                                                        | Context       | Continue with                                                         |
| -------------------------------------------------- | ---------------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| Render trusted components in a conversation        | @hashbrownai/angular!uiChatResource:function               | Earlier turns | [UI chatbot](/docs/angular/recipes/ui-chatbot)                        |
| Build a text conversation                          | @hashbrownai/angular!chatResource:function                 | Earlier turns | [Messages and turns](/docs/angular/concept/ai-basics)                 |
| Keep a conversation with typed data                | @hashbrownai/angular!structuredChatResource:function       | Earlier turns | [Structured output](/docs/angular/concept/structured-output)          |
| Generate text from the current input               | @hashbrownai/angular!completionResource:function           | Current input | [Chat or completion](/docs/angular/start/overview#chat-or-completion) |
| Generate typed data from the current input         | @hashbrownai/angular!structuredCompletionResource:function | Current input | [Predictive suggestions](/docs/angular/recipes/predictive-actions)    |
| Generate trusted components from the current input | @hashbrownai/angular!uiCompletionResource:function         | Current input | [Exposing components](/docs/angular/concept/components)               |
| Choose among named options                         | @hashbrownai/angular!decisionResource:function             | Current input | [Decisions](/docs/angular/concept/decisions)                          |
| Narrow the components available to a chat          | @hashbrownai/angular!uiDecisionResource:function           | Chat mode     | [UI Selection](/docs/angular/recipes/ui-selection)                    |

The API links open the reference for exact options and return values. For UI selection, the recipe starts with application-owned views and props. Use the UI decision API's chat mode when a decision should narrow the components a UI chat can generate; its standalone mode can also select among supplied components.

## Chat or completion?

A chat keeps earlier turns in its current instance. Send a message when the user asks a follow-up or when the answer depends on the conversation so far. The [UI chatbot](/docs/angular/recipes/ui-chatbot) reads application context, proposes a plan, and reads the accepted state on the next turn.

A completion responds to the current input. Use it for a focused transformation, such as generating suggestions from the current form values. Input changes can schedule another completion; keep the input absent until the application is ready to request it. See [Predictive suggestions](/docs/angular/recipes/predictive-actions) for an explicit request and review flow.

Neither choice automatically persists a conversation after refresh. [Message history](/docs/angular/concept/message-history) explains what the application must save and restore.

## Decide or generate?

Use a decision when the possible answers are known: choose a workflow, classify intent, or select a view. The application owns those options and handles unavailable or unsuitable results. Follow [Decisions in Agents](/docs/angular/recipes/decisions-in-agents) to route a request through a server-owned decision contract.

Use structured output when the model must produce new values within a schema. Use generative UI when it should select trusted components and supply their props. A decision can narrow that component set before generation.

## Choose where the work runs

The framework API owns browser state and rendering. A [provider adapter](/docs/angular/start/platforms) connects your server endpoint to a hosted model or an Ollama server. Keep provider credentials and endpoint policy on the server; see [Securing a public endpoint](/docs/angular/recipes/public-endpoint).

For on-device inference, follow [Local Models](/docs/angular/recipes/local-models). For parsing an existing JSON stream without a model or endpoint, use [JSON Parser](/docs/angular/recipes/json-parser). For a finished chat interface around your runtime, see [Threadplane](/docs/angular/recipes/threadplane).

## Explore it in the workbench

Use the [workbench](/docs/angular/start/workbench) to compare result shapes after choosing an API. Start with **Messages and turns** for text, **Structured output** for typed data, and **Generative UI** for trusted components. Each lesson uses the same plan so the changed API is easier to spot.

Inspect **Requests** and **JSON**, then compare the live renderer and application **State**. A different output API changes how the response is interpreted; it does not grant permission to apply it. The teaser demonstrates generative UI with real OpenAI output, not every API in the table.

## Follow one learning path

- **Typed data:** [Skillet schemas](/docs/angular/concept/schema) → [Structured output](/docs/angular/concept/structured-output) → [Streaming](/docs/angular/concept/streaming) → [Natural language forms](/docs/angular/recipes/natural-language-to-structured-data). Each guide first teaches the application contract, then applies it to the canonical plan.
- **A conversation with components:** [Messages and turns](/docs/angular/concept/ai-basics) → [Tool calling](/docs/angular/concept/functions) → [Exposing components](/docs/angular/concept/components) → [UI chatbot](/docs/angular/recipes/ui-chatbot).
- **A production endpoint:** [Request customization](/docs/angular/concept/transform-request-options) → [Securing a public endpoint](/docs/angular/recipes/public-endpoint) → [Threads](/docs/angular/recipes/threads).
