# API Overview

<p class="subtitle">Get familiar with Hashbrown's hooks and APIs.</p>

---

## Choosing a Hook

Choose the right hook for the task.

| Resource                                            | Multi-turn chat | Single-turn input | Structured output (schema) | Tool calling | Generate UI components |
| --------------------------------------------------- | --------------- | ----------------- | -------------------------- | ------------ | ---------------------- |
| @hashbrownai/react!useChat:function                 | ✅              | ❌                | ❌                         | ✅           | ❌                     |
| @hashbrownai/react!useStructuredChat:function       | ✅              | ❌                | ✅                         | ✅           | ❌                     |
| @hashbrownai/react!useCompletion:function           | ❌              | ✅                | ❌                         | ✅           | ❌                     |
| @hashbrownai/react!useStructuredCompletion:function | ❌              | ✅                | ✅                         | ✅           | ❌                     |
| @hashbrownai/react!useUiChat:function               | ✅              | ❌                | ✅                         | ✅           | ✅                     |
