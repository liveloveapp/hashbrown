# Hashbrown .NET

> [!IMPORTANT]
> This is **BETA SOFTWARE**. The APIs may change.

Hashbrown .NET is a server-side adapter for the [Hashbrown](https://hashbrown.dev) generative UI framework. It exposes a streaming ASP.NET Core endpoint that Hashbrown React/Angular clients connect to out of the box, powered by the [Microsoft Agents Framework](https://github.com/microsoft/agents) and Azure OpenAI.

## Features

- 🚀 **Frame-based streaming protocol** — Low-latency streaming with length-prefixed binary frames, compatible with Hashbrown's TypeScript clients
- 🤖 **Microsoft Agents Framework** — Built on `Microsoft.Agents.AI` (`AIAgent`, `ChatClientAgent`)
- 🔧 **Minimal API integration** — Single `MapHashbrownAgent()` call wires up a fully functional endpoint
- 💾 **Optional thread persistence** — Pass a `ChatHistoryProvider` for conversation continuity
- 🔧 **Tool calling & structured output** — Full support for function calling and JSON schema response formats
- 🔐 **Flexible authentication** — API key or `DefaultAzureCredential` (Managed Identity, Azure CLI)
- ⚡ **Async streaming** — First-class `IAsyncEnumerable` and cancellation token support

## Installation

```bash
dotnet add package Hashbrown.DotNet
```

## Quick Start

### 1. Register Hashbrown in `Program.cs`

```csharp
builder.Services.AddHashbrown();
```

### 2. Configure the agent and map the endpoint

```csharp
using Azure.AI.OpenAI;
using Hashbrown.DotNet.Extensions;
using Microsoft.Extensions.AI;

var azureClient = new AzureOpenAIClient(
    new Uri(builder.Configuration["AzureOpenAI:Endpoint"]!),
    new System.ClientModel.ApiKeyCredential(builder.Configuration["AzureOpenAI:APIKey"]!)
);

var agent = azureClient
    .GetChatClient(builder.Configuration["AzureOpenAI:DeploymentName"]!)
    .AsIChatClient()
    .AsAIAgent(new ChatClientAgentOptions
    {
        Name = "My Agent",
        ChatOptions = new ChatOptions
        {
            Instructions = "You are a helpful assistant."
        }
    });

var app = builder.Build();

app.MapHashbrownAgent(
    pattern: "/chat",
    agent: agent
);

app.Run();
```

That's it — the `/chat` endpoint handles both `generate` and `load-thread` operations, streams frames back, and integrates directly with Hashbrown React/Angular client hooks.

---

## Integration Guide

### Connecting from a Hashbrown Angular or React Client

Point your Hashbrown client hook at the endpoint exposed above.

**Angular**

```typescript
// app.component.ts
import { useChat } from '@hashbrownai/angular';

chat = useChat({
  url: '/chat',
  model: 'gpt-4o',
});
```

**React**

```tsx
import { useChat } from '@hashbrownai/react';

const chat = useChat({
  url: '/chat',
  model: 'gpt-4o',
});
```

The client automatically handles frame parsing, thread management, and streaming state.

---

### Thread Persistence

By default each request is stateless. Pass a `ChatHistoryProvider` to enable conversation continuity across requests.

`ChatHistoryProvider` is an abstract type from the Microsoft Agents Framework — implement it against your storage of choice (in-memory, SQL, etc.).

```csharp
var messageProvider = new MyChatHistoryProvider();

app.MapHashbrownAgent(
    pattern: "/chat",
    agent: agent,
    messageProvider: messageProvider  // optional
);
```

When a `ChatHistoryProvider` is supplied:

1. **`load-thread` operation** — history is loaded and a `thread-load-success` frame is returned.
2. **`generate` operation** — after streaming completes, a `thread-save-success` frame is returned containing the `threadId`.

---

### Tool Calling

Pass an array of `Tool` objects in the request body. The framework wraps them as `AIFunction` declarations and forwards them to the agent.

**Request payload** (sent by the Hashbrown client automatically when tools are configured):

```json
{
  "operation": "generate",
  "model": "gpt-4o",
  "messages": [{ "role": "user", "content": "What's the weather in Seattle?" }],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a city",
      "parameters": {
        "type": "object",
        "properties": {
          "city": { "type": "string", "description": "City name" }
        },
        "required": ["city"],
        "additionalProperties": false
      }
    }
  ]
}
```

Tool call results are sent back as `tool` role messages in subsequent requests. The framework routes `FunctionCallContent` and `FunctionResultContent` through the Microsoft Agents runtime automatically.

---

### Structured Output

Pass a JSON Schema in `responseFormat` to constrain the model's response shape:

```json
{
  "operation": "generate",
  "model": "gpt-4o",
  "messages": [{ "role": "user", "content": "List three items" }],
  "responseFormat": {
    "type": "object",
    "properties": {
      "items": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "required": ["items"],
    "additionalProperties": false
  }
}
```

The framework converts this to `ChatResponseFormat.ForJsonSchema(...)` and sets it on `ChatOptions` before invoking the agent.

---

### Custom Endpoint (Advanced)

If you need full control (auth middleware, custom routing, multi-agent routing, etc.) inject `IHashbrownAgentService` directly instead of using `MapHashbrownAgent`:

```csharp
app.MapPost("/my-chat", async (HttpContext ctx, IHashbrownAgentService svc) =>
    await svc.HandleRequestAsync(ctx, agent, messageProvider));
```

`HandleRequestAsync` handles request parsing, response headers, and dispatches to `HandleLoadThreadAsync` or `HandleGenerateAsync` based on the `operation` field.

---

## Frame Protocol

Hashbrown uses a length-prefixed binary streaming protocol compatible with the TypeScript clients:

```
[4 bytes: big-endian length] [UTF-8 JSON payload]
```

### Frame Types

| Frame type | Description |
|---|---|
| `generation-start` | Agent invocation started |
| `generation-chunk` | Streaming text or tool-call delta |
| `generation-finish` | Agent invocation complete |
| `generation-error` | Error during generation |
| `thread-load-start` | Thread load started |
| `thread-load-success` | Thread history returned |
| `thread-load-failure` | Thread load failed |
| `thread-save-start` | Thread save started |
| `thread-save-success` | Thread saved; includes `threadId` |
| `thread-save-failure` | Thread save failed |
| `error` | General error |

### `generation-chunk` payload

```json
{
  "type": "generation-chunk",
  "chunk": {
    "choices": [{
      "index": 0,
      "delta": {
        "role": "assistant",
        "content": "Hello",
        "toolCalls": null
      },
      "finishReason": null
    }]
  }
}
```

---

## Request Model Reference

```csharp
public class CompletionCreateParams
{
    public string Operation { get; set; }       // "generate" | "load-thread"
    public required string Model { get; set; }
    public string? System { get; set; }         // System prompt override
    public List<Message> Messages { get; set; }
    public List<Tool>? Tools { get; set; }
    public object? ToolChoice { get; set; }     // "auto" | "required" | "none"
    public object? ResponseFormat { get; set; } // JSON Schema
    public string? ThreadId { get; set; }
}
```

---

## Authentication

### API Key (development)

```csharp
var azureClient = new AzureOpenAIClient(
    new Uri(endpoint),
    new System.ClientModel.ApiKeyCredential(apiKey)
);
```

### Managed Identity (production)

```csharp
var azureClient = new AzureOpenAIClient(
    new Uri(endpoint),
    new DefaultAzureCredential()
);
```

`DefaultAzureCredential` resolves credentials in this order: Azure CLI → environment variables → Managed Identity. No code changes required between local development and production.

---

## Sample Application

See [samples/HashbrownSample](./samples/HashbrownSample) for a complete working example with:

- ASP.NET Core minimal API
- Azure OpenAI configuration
- Built-in test chat UI served from the same process

---

## Contributing

Contributions are welcome! Please follow the [Hashbrown contributing guidelines](../../CONTRIBUTING.md) and use conventional commits with the `dotnet` scope:

```
feat(dotnet): add entity framework persistence adapter
fix(dotnet): resolve frame encoding for large payloads
docs(dotnet): update integration guide
```

---

## License

MIT — see [LICENSE](./LICENSE)

## Related Packages

| Package | Description |
|---|---|
| [`@hashbrownai/core`](../../packages/core) | TypeScript core library |
| [`@hashbrownai/react`](../../packages/react) | React hooks |
| [`@hashbrownai/angular`](../../packages/angular) | Angular signals & directives |
| [Microsoft Agents Framework](https://github.com/microsoft/agents) | Underlying agent runtime |
