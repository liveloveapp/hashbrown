---
title: 'Choosing an API: Hashbrown React Docs'
meta:
  - name: description
    content: 'Choose an API based on the result your feature needs.'
---

# Choosing an API

Start with the result you want to show. Then choose whether your feature needs one response or a conversation with earlier turns.

## Choose by goal

| I want to… | Start with |
| --- | --- |
| Render your components in a conversation | @hashbrownai/react!useUiChat:function |
| Build a text conversation | @hashbrownai/react!useChat:function |
| Keep a conversation with typed JSON output | @hashbrownai/react!useStructuredChat:function |
| Generate text from one input | @hashbrownai/react!useCompletion:function |
| Generate typed data from one input | @hashbrownai/react!useStructuredCompletion:function |
| Choose among named options | @hashbrownai/react!useDecision:function |
| Choose which UI components to offer | @hashbrownai/react!useUiDecision:function |

New to Hashbrown? The [Quickstart](/docs/react/start/quick) uses `useUiChat()` to render a trusted welcome card.

## Compare capabilities

| Resource                                            | Multi-turn chat | Single-turn input | Structured output (schema) | Tool calling | Generate UI components |
| --------------------------------------------------- | --------------- | ----------------- | -------------------------- | ------------ | ---------------------- |
| @hashbrownai/react!useChat:function                 | ✅              | ❌                | ❌                         | ✅           | ❌                     |
| @hashbrownai/react!useStructuredChat:function       | ✅              | ❌                | ✅                         | ✅           | ❌                     |
| @hashbrownai/react!useCompletion:function           | ❌              | ✅                | ❌                         | ✅           | ❌                     |
| @hashbrownai/react!useStructuredCompletion:function | ❌              | ✅                | ✅                         | ✅           | ❌                     |
| @hashbrownai/react!useUiChat:function               | ✅              | ❌                | ✅                         | ✅           | ✅                     |
| @hashbrownai/react!useDecision:function             | ❌              | ✅                | ✅                         | ❌           | ❌                     |
| @hashbrownai/react!useUiDecision:function           | ❌¹             | ✅                | ✅                         | ❌¹          | ✅                     |

¹ In chat mode, useUiDecision narrows a chat created with useUiChat, which supplies multi-turn chat and tool calling.


A completion responds to the current input. A chat keeps earlier turns in its current instance. Neither automatically persists your conversation after a refresh. See [Message history](/docs/react/concept/message-history) for persistence and restoration.

## Next steps

Continue with [Messages and turns](/docs/react/concept/ai-basics), [Structured output](/docs/react/concept/structured-output), or [Decisions](/docs/react/concept/decisions), depending on the result you need.
