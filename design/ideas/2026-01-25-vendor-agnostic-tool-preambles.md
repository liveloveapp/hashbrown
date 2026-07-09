# Idea

Define a vendor-agnostic “tool preamble” concept that can be attached to tool definitions to steer model behavior before tool selection. The preamble would be serialized consistently across providers and injected into the provider’s supported prompt or tool metadata channel, enabling consistent tool-use guidance without provider-specific prompt hacks. Open question: whether legacy OpenAI Completions can carry this preamble, or if it should be limited to Responses/Chat Completions and equivalent APIs.

# Research

OpenAI’s GPT-5.2 guidance describes “preambles” as user-visible explanations emitted before tool calls, and it notes they are enabled via system or developer instructions (not a dedicated API field). This suggests a vendor-agnostic preamble could map to provider-specific instruction channels rather than a formal tool attribute. See the GPT-5.2 guide.

OpenAI’s tool calling for Chat Completions is configured via `tools` and `tool_choice`, with tool metadata provided as part of the tool definition object. There is no explicit “tool preamble” field in the Chat Completions reference, so a portable preamble may need to be represented in tool descriptions or injected via instruction channels. See the OpenAI Chat Completions API reference.

The OpenAI Completions API is a legacy, prompt-only interface that accepts a single freeform `prompt` string rather than a list of messages or tool definitions. That implies a fallback strategy may be needed for providers that only support prompt text. See the OpenAI legacy Completions guide.

References:
- https://platform.openai.com/docs/guides/latest-model
- https://platform.openai.com/docs/api-reference/chat/completions/create
- https://platform.openai.com/docs/guides/completions/completions-api-legacy

# Sketch

```text
Tool Definition
  name: "search"
  schema: {...}
  preamble: "Use when factual freshness is required."

Provider Mapping
  Chat/Responses: encode via system/developer instructions or tool description
  Legacy prompt-only: append to prompt prefix if supported
```
