---
title: 'Platforms: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Hashbrown uses the adapter pattern for supporting multiple platforms.'
---
# Platforms

Hashbrown uses the adapter pattern for supporting multiple platforms.

## Official Adapters

| Platform                                         | Adapter Package         |
| ------------------------------------------------ | ----------------------- |
| [OpenAI](/docs/angular/platform/openai)          | `@hashbrownai/openai`   |
| [Microsoft Azure](/docs/angular/platform/azure)  | `@hashbrownai/azure`    |
| [Anthropic Claude](/docs/angular/platform/anthropic) | `@hashbrownai/anthropic` |
| [Amazon Bedrock](/docs/angular/platform/bedrock) | `@hashbrownai/bedrock`  |
| [Google Gemini](/docs/angular/platform/google)   | `@hashbrownai/google`   |
| [Writer](/docs/angular/platform/writer)          | `@hashbrownai/writer`   |
| [Ollama](/docs/angular/platform/ollama)          | `@hashbrownai/ollama`   |

## Custom Adapters

Can't find your preferred AI provider? [Create a custom adapter](/docs/angular/platform/custom) for any LLM that supports streaming chat completions.

## Platform Capabilities

| Platform        | Text | Streaming | Tools | Structured Output |
| --------------- | ---- | --------- | ----- | ----------------- |
| OpenAI           | ✅   | ✅        | ✅    | ✅                |
| Microsoft Azure  | ✅   | ✅        | ✅    | ✅                |
| Anthropic Claude | ✅   | ✅        | ✅    | ✅                |
| Amazon Bedrock   | ✅   | ✅        | ✅    | ✅                |
| Google Gemini    | ✅   | ✅        | ✅    | ✅                |
| Writer           | ✅   | ✅        | ✅    | ✅                |
| Ollama           | ✅   | ✅        | ✅    | ✅                |

## Platform Limitations

| Platform         | Limitations                                 |
| ---------------- | ------------------------------------------- |
| OpenAI           | None                                        |
| Microsoft Azure  | None                                        |
| Anthropic Claude | Requires `@anthropic-ai/sdk` peer dependency |
| Amazon Bedrock   | Requires emulated structured outputs        |
| Google Gemini    | Requires emulated structured outputs        |
| Writer           | Requires emulated structured outputs        |
| Ollama           | Limited model support                       |

## Where is X platform?

If you are an enterprise customer and want to use a platform that is not listed here, please reach out to us at [hello@liveloveapp.com](mailto:hello@liveloveapp.com).
