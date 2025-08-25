# API Overview

<p class="subtitle">Get familiar with Hashbrown's resources and APIs.</p>

---

## Choosing a Resource

Choose the right Angular resource for the task.

| Resource                                                   | Multi-turn chat | Single-turn input | Structured output (schema) | Tool calling | Generate UI components |
| ---------------------------------------------------------- | --------------- | ----------------- | -------------------------- | ------------ | ---------------------- |
| @hashbrownai/angular!chatResource:function                 | ✅              | ❌                | ❌                         | ✅           | ❌                     |
| @hashbrownai/angular!structuredChatResource:function       | ✅              | ❌                | ✅                         | ✅           | ❌                     |
| @hashbrownai/angular!completionResource:function           | ❌              | ✅                | ❌                         | ❌           | ❌                     |
| @hashbrownai/angular!structuredCompletionResource:function | ❌              | ✅                | ✅                         | ✅           | ❌                     |
| @hashbrownai/angular!uiChatResource:function               | ✅              | ❌                | ✅                         | ✅           | ✅                     |
