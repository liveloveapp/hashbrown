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

---

## AI SDK

We love Vercel's AI SDK.

We also believe that Hashbrown needs to exist.
This is because we want to drastically change the landscape of the web through generative UI.

If you have some familiarity with the AI SDK, we hope this quick comparison will be helpful.

| Focus          | Hashbrown                                                          | Vercel AI SDK                                                |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Vision         | Generative UI: models can assemble your actual components.         | General AI toolkit: text/JSON outputs with ready-made UI.    |
| Frameworks     | React and Angular first-class.                                     | React/Next.js first-class; also Vue/Svelte.                  |
| Tools          | Client-side tool calling + safe WASM sandbox for AI-authored code. | Server-side tool calling.                                    |
| Streaming & DX | Binary-normalized streams + Redux DevTools for debugging.          | SSE streams with polished hooks; strong Next.js integration. |
| UI Approach    | AI renders real app components you whitelist.                      | Developers interpret outputs; AI Elements speeds up chat UI. |
