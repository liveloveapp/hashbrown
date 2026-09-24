---
title: 'Platforms: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown uses the adapter pattern for supporting multiple platforms.'
---

# Platforms

Hashbrown uses the adapter pattern for supporting multiple platforms.

## Official Adapters

| Platform                                           | Adapter Package          |
| -------------------------------------------------- | ------------------------ |
| [OpenAI](/docs/react/platform/openai)              | `@hashbrownai/openai`    |
| [Microsoft Azure](/docs/react/platform/azure)      | `@hashbrownai/azure`     |
| [Anthropic Claude](/docs/react/platform/anthropic) | `@hashbrownai/anthropic` |
| [Amazon Bedrock](/docs/react/platform/bedrock)     | `@hashbrownai/bedrock`   |
| [Google Gemini](/docs/react/platform/google)       | `@hashbrownai/google`    |
| [Ollama](/docs/react/platform/ollama)              | `@hashbrownai/ollama`    |

## Custom Adapters

Can't find your preferred AI provider? [Create a custom adapter](/docs/react/platform/custom) for any LLM that supports streaming chat completions.

## Platform Capabilities

| Platform         | Text | Streaming | Tools | Structured Output |
| ---------------- | ---- | --------- | ----- | ----------------- |
| OpenAI           | ✅   | ✅        | ✅    | ✅                |
| Microsoft Azure  | ✅   | ✅        | ✅    | ✅                |
| Anthropic Claude | ✅   | ✅        | ✅    | ✅                |
| Amazon Bedrock   | ✅   | ✅        | ✅    | ✅                |
| Google Gemini    | ✅   | ✅        | ✅    | ✅                |
| Ollama           | ✅   | ✅        | ✅    | ✅                |

## Platform Limitations

| Platform         | Limitations                                      |
| ---------------- | ------------------------------------------------ |
| OpenAI           | None                                             |
| Microsoft Azure  | None                                             |
| Anthropic Claude | Requires `@anthropic-ai/sdk` peer dependency     |
| Amazon Bedrock   | Native structured output support varies by model |
| Google Gemini    | Native structured output support varies by model |
| Ollama           | Limited model support                            |

## Where is X platform?

Need a platform that is not listed here? [Open an issue on GitHub](https://github.com/liveloveapp/hashbrown/issues/new) and tell us what you are building. If your team wants a finished, headful agent UI with enterprise support, take a look at [threadplane](https://threadplane.ai/?utm_source=hashbrown&utm_medium=docs).
