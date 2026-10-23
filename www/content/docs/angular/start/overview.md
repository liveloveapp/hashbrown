---
title: 'Choosing an API: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Choose an API based on the result your feature needs.'
---

# Choosing an API

Start with the result you want to show. Then choose whether your feature needs one response or a conversation with earlier turns.

## Choose by goal

| I want to… | Start with |
| --- | --- |
| Render your components in a conversation | @hashbrownai/angular!uiChatResource:function |
| Build a text conversation | @hashbrownai/angular!chatResource:function |
| Keep a conversation with typed JSON output | @hashbrownai/angular!structuredChatResource:function |
| Generate text from one input | @hashbrownai/angular!completionResource:function |
| Generate typed data from one input | @hashbrownai/angular!structuredCompletionResource:function |
| Choose among named options | @hashbrownai/angular!decisionResource:function |
| Choose which UI components to offer | @hashbrownai/angular!uiDecisionResource:function |

New to Hashbrown? The [Quickstart](/docs/angular/start/quick) uses `uiChatResource()` to render a trusted welcome card.

## Compare capabilities

| Resource                                                   | Multi-turn chat | Single-turn input | Structured output (schema) | Tool calling | Generate UI components |
| ---------------------------------------------------------- | --------------- | ----------------- | -------------------------- | ------------ | ---------------------- |
| @hashbrownai/angular!chatResource:function                 | ✅              | ❌                | ❌                         | ✅           | ❌                     |
| @hashbrownai/angular!structuredChatResource:function       | ✅              | ❌                | ✅                         | ✅           | ❌                     |
| @hashbrownai/angular!completionResource:function           | ❌              | ✅                | ❌                         | ❌           | ❌                     |
| @hashbrownai/angular!structuredCompletionResource:function | ❌              | ✅                | ✅                         | ✅           | ❌                     |
| @hashbrownai/angular!uiChatResource:function               | ✅              | ❌                | ✅                         | ✅           | ✅                     |
| @hashbrownai/angular!decisionResource:function             | ❌              | ✅                | ✅                         | ❌           | ❌                     |
| @hashbrownai/angular!uiDecisionResource:function           | ❌¹             | ✅                | ✅                         | ❌¹          | ✅                     |

¹ In chat mode, uiDecisionResource narrows a chat created with uiChatResource, which supplies multi-turn chat and tool calling.


A completion responds to the current input. A chat keeps earlier turns in its current instance. Neither automatically persists your conversation after a refresh. See [Message history](/docs/angular/concept/message-history) for persistence and restoration.

## Next steps

Continue with [Messages and turns](/docs/angular/concept/ai-basics), [Structured output](/docs/angular/concept/structured-output), or [Decisions](/docs/angular/concept/decisions), depending on the result you need.
