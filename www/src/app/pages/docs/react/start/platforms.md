# Platforms

Hashbrown uses the adapter pattern to support multiple platforms.

| Platform                                        | Adapter Package       |
| ----------------------------------------------- | --------------------- |
| [OpenAI](/docs/react/platform/openai)           | `@hashbrownai/openai` |
| [Microsoft Azure](/docs/react/platform/azure)   | `@hashbrownai/azure`  |
| [Google Gemini](/docs/react/platform/google)    | `@hashbrownai/google` |
| [Writer](/docs/react/platform/writer)           | `@hashbrownai/writer` |

## Platform Capabilities

| Platform        | Text | Streaming | Tools | Structured Output |
| --------------- | ---- | --------- | ----- | ----------------- |
| OpenAI          | ✅   | ✅        | ✅    | ✅                |
| Microsoft Azure | ✅   | ✅        | ✅    | ✅                |
| Google Gemini   | ✅   | ✅        | ✅    | ✅                |
| Writer          | ✅   | ✅        | ✅    | ✅                |

## Platform Limitations

| Platform        | Limitations                          |
| --------------- | ------------------------------------ |
| OpenAI          | None                                 |
| Microsoft Azure | None                                 |
| Google Gemini   | Requires emulated structured outputs |
| Writer          | Requires emulated structured outputs |

\

## Where is X platform?

If you are an enterprise customer and want to use a platform that is not listed here, please reach out to us at [hello@liveloveapp.com](mailto:hello@liveloveapp.com).
