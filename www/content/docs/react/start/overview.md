---
title: 'Choosing an API: Hashbrown React Docs'
meta:
  - name: description
    content: 'Choose a Hashbrown API by result shape, conversation behavior, and runtime.'
---

# Choosing an API

<hb-docs-demo demo="canonical-workbench-ui-react">
</hb-docs-demo>

Start with what your interface needs to show: text, typed data, your own components, or a choice among known options. Then decide whether the request needs earlier conversation turns.

New to Hashbrown? Build the two-step plan in the [Quickstart](/docs/react/start/quick) first. The examples below extend that setup.

## Choose by result

| I want to…                                         | API                                                 | Context       | Continue with                                                       |
| -------------------------------------------------- | --------------------------------------------------- | ------------- | ------------------------------------------------------------------- |
| Render trusted components in a conversation        | @hashbrownai/react!useUiChat:function               | Earlier turns | [UI chatbot](/docs/react/recipes/ui-chatbot)                        |
| Build a text conversation                          | @hashbrownai/react!useChat:function                 | Earlier turns | [Messages and turns](/docs/react/concept/ai-basics)                 |
| Keep a conversation with typed data                | @hashbrownai/react!useStructuredChat:function       | Earlier turns | [Structured output](/docs/react/concept/structured-output)          |
| Generate text from the current input               | @hashbrownai/react!useCompletion:function           | Current input | [Chat or completion](/docs/react/start/overview#chat-or-completion) |
| Generate typed data from the current input         | @hashbrownai/react!useStructuredCompletion:function | Current input | [Predictive suggestions](/docs/react/recipes/predictive-actions)    |
| Generate trusted components from the current input | @hashbrownai/react!useUiCompletion:function         | Current input | [Exposing components](/docs/react/concept/components)               |
| Choose among named options                         | @hashbrownai/react!useDecision:function             | Current input | [Decisions](/docs/react/concept/decisions)                          |
| Narrow the components available to a chat          | @hashbrownai/react!useUiDecision:function           | Chat mode     | [UI Selection](/docs/react/recipes/ui-selection)                    |

The API links open the reference for exact options and return values. For UI selection, the recipe starts with application-owned views and props. Use the UI decision API's chat mode when a decision should narrow the components a UI chat can generate; its standalone mode can also select among supplied components.

## Chat or completion?

A chat keeps earlier turns in its current instance. Send a message when the user asks a follow-up or when the answer depends on the conversation so far. The [UI chatbot](/docs/react/recipes/ui-chatbot) reads application context, proposes a plan, and reads the accepted state on the next turn.

A completion responds to the current input. Use it for a focused transformation, such as generating suggestions from the current form values. Input changes can schedule another completion; keep the input absent until the application is ready to request it. See [Predictive suggestions](/docs/react/recipes/predictive-actions) for an explicit request and review flow.

Neither choice automatically persists a conversation after refresh. [Message history](/docs/react/concept/message-history) explains what the application must save and restore.

## Decide or generate?

Use a decision when the possible answers are known: choose a workflow, classify intent, or select a view. The application owns those options and handles unavailable or unsuitable results. Follow [Decisions in Agents](/docs/react/recipes/decisions-in-agents) to route a request through a server-owned decision contract.

Use structured output when the model must produce new values within a schema. Use generative UI when it should select trusted components and supply their props. A decision can narrow that component set before generation.

## Choose where the work runs

The framework API owns browser state and rendering. A [provider adapter](/docs/react/start/platforms) connects your server endpoint to a hosted model or an Ollama server. Keep provider credentials and endpoint policy on the server; see [Securing a public endpoint](/docs/react/recipes/public-endpoint).

For on-device inference, follow [Local Models](/docs/react/recipes/local-models). For parsing an existing JSON stream without a model or endpoint, use [JSON Parser](/docs/react/recipes/json-parser). For a finished chat interface around your runtime, see [Threadplane](/docs/react/recipes/threadplane).

## Explore it in the workbench

Use the workbench below to compare result shapes after choosing an API; the [workbench guide](/docs/react/start/workbench) covers every lesson. Start with **Messages and turns** for text, **Structured output** for typed data, and **Generative UI** for trusted components. Each lesson uses the same plan so the changed API is easier to spot.

<hb-workbench-launcher lesson="generative-ui">
</hb-workbench-launcher>

Inspect **Requests** and **JSON**, then compare the live renderer and application **State**. A different output API changes how the response is interpreted; it does not grant permission to apply it. The teaser demonstrates generative UI with real OpenAI output, not every API in the table.

## Follow one learning path

- **Typed data:** [Skillet schemas](/docs/react/concept/schema) → [Structured output](/docs/react/concept/structured-output) → [Streaming](/docs/react/concept/streaming) → [Natural language forms](/docs/react/recipes/natural-language-to-structured-data). Each guide first teaches the application contract, then applies it to the canonical plan.
- **A conversation with components:** [Messages and turns](/docs/react/concept/ai-basics) → [Tool calling](/docs/react/concept/functions) → [Exposing components](/docs/react/concept/components) → [UI chatbot](/docs/react/recipes/ui-chatbot).
- **An agent with shared state or approvals:** [Tool calling](/docs/react/concept/functions) → [Shared agent state](/docs/react/concept/shared-agent-state) → [Interrupt and resume](/docs/react/concept/interrupt-and-resume) → [Durable recovery](/docs/react/platform/b4run). This path needs an AG-UI agent that produces state events and checkpoints, beyond the Quickstart's direct provider adapter.
- **A production endpoint:** [Request customization](/docs/react/concept/transform-request-options) → [Securing a public endpoint](/docs/react/recipes/public-endpoint) → [Threads](/docs/react/recipes/threads).
