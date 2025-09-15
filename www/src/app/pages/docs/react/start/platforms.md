# Platforms

Hashbrown uses the adapter pattern for supporting multiple platforms.

## Official Adapters

| Platform                                        | Adapter Package       |
| ----------------------------------------------- | --------------------- |
| [OpenAI](/docs/react/platform/openai)           | `@hashbrownai/openai` |
| [Microsoft Azure](/docs/react/platform/azure)   | `@hashbrownai/azure`  |
| [Google Gemini](/docs/react/platform/google)    | `@hashbrownai/google` |
| [Writer](/docs/react/platform/writer)           | `@hashbrownai/writer` |
| [Ollama](/docs/react/platform/ollama)           | `@hashbrownai/ollama` |

## Custom Adapters

Can't find your preferred AI provider? [Create a custom adapter](/docs/react/platform/custom) for any LLM that supports streaming chat completions.

## Platform Capabilities

| Platform        | Text | Streaming | Tools | Structured Output |
| --------------- | ---- | --------- | ----- | ----------------- |
| OpenAI          | ✅   | ✅        | ✅    | ✅                |
| Microsoft Azure | ✅   | ✅        | ✅    | ✅                |
| Google Gemini   | ✅   | ✅        | ✅    | ✅                |
| Writer          | ✅   | ✅        | ✅    | ✅                |
| Ollama          | ✅   | ✅        | ✅    | ✅                |

## Platform Limitations

| Platform        | Limitations                          |
| --------------- | ------------------------------------ |
| OpenAI          | None                                 |
| Microsoft Azure | None                                 |
| Google Gemini   | Requires emulated structured outputs |
| Writer          | Requires emulated structured outputs |
| Ollama          | Limited model support                |

## Where is X platform?

If you are an enterprise customer and want to use a platform that is not listed here, please reach out to us at [hello@liveloveapp.com](mailto:hello@liveloveapp.com). Or better yet, [create your own custom adapter](/docs/react/platform/custom)!