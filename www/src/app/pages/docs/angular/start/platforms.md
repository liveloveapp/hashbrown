---
title: 'Platforms: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Hashbrown uses the adapter pattern for supporting multiple platforms.'
---
# Platforms

Hashbrown uses the adapter pattern for supporting multiple platforms.

## Official Adapters

| Platform                                        | Adapter Package       |
| ----------------------------------------------- | --------------------- |
| [OpenAI](/docs/angular/platform/openai)         | `@hashbrownai/openai` |
| [Microsoft Azure](/docs/angular/platform/azure) | `@hashbrownai/azure`  |
| [Google Gemini](/docs/angular/platform/google)  | `@hashbrownai/google` |
| [Writer](/docs/angular/platform/writer)         | `@hashbrownai/writer` |

## Custom Adapters

Can't find your preferred AI provider? [Create a custom adapter](/docs/angular/platform/custom) for any LLM that supports streaming chat completions.

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
