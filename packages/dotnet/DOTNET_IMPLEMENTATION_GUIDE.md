# Hashbrown .NET Implementation Guide with Microsoft Agents Framework

## Executive Summary

This document provides a comprehensive technical specification for implementing Hashbrown server endpoints as a **.NET NuGet package contribution** to the Hashbrown open-source project. Hashbrown is an open-source framework for building generative user interfaces with React and Angular, featuring a headless, platform-agnostic architecture built for streaming AI responses.

### Package Information

**Package Name**: `Hashbrown.DotNet`  
**Target Framework**: .NET 9.0+  
**Package Type**: Class library with ASP.NET Core integration extensions  
**Distribution**: NuGet package for community use  
**Repository**: Contribution to [hashbrownai/hashbrown](https://github.com/hashbrownai/hashbrown)  

### Implementation Approach

This implementation uses the **Microsoft Agents Framework** (successor to Semantic Kernel) with a **simplified endpoint mapping pattern**:

#### Core Design Principles

1. **User-Configured Agents**: Developers manually create and configure their agent (using Microsoft.SemanticKernel.Agents)
2. **Endpoint Mapping Extension**: Simple `app.MapHashbrownAgent()` extension method for registration
3. **Automatic Thread Persistence**: Framework uses ChatMessageStore for thread persistence (auto-handled by Agents Framework)
4. **Dual Operations**: Single endpoint handles both `load-thread` and `generate` operations

#### Architecture

```csharp
// User configures agent
var agent = new ChatClientAgent(
    chatClient,
    name: "my-agent",
    instructions: "You are helpful"
);

// User configures ChatMessageStore (optional for persistence)
var messageStore = new YourChatMessageStore(dbContext);

// Register endpoint - framework handles the rest
app.MapHashbrownAgent(
    path: "/chat",
    agent: agent,
    messageStore: messageStore  // Optional
);
```

#### Operation Flow

**Load Thread Operation (`operation: 'load-thread'`)**:
1. Request includes `threadId` and `operation: 'load-thread'`
2. Endpoint queries `ChatMessageStore.GetMessagesAsync(threadId)`
3. Returns thread messages as `thread-load-success` frame
4. Agent is NOT invoked

**Generate Operation (`operation: 'generate'`)**:
1. Request includes messages and optional `threadId`
2. If `threadId` exists, load thread context from ChatMessageStore
3. Invoke agent with merged messages
4. Agent auto-persists to ChatMessageStore (if provided)
5. Stream frames back to client

### Contribution Requirements

Following [Hashbrown contributing guidelines](https://github.com/liveloveapp/hashbrown/blob/main/CONTRIBUTING.md):

- ✅ **Commit Convention**: Uses conventional commits: `feat(dotnet): add azure openai adapter`
- ✅ **Testing**: Includes unit tests, integration tests, and E2E tests
- ✅ **Documentation**: Comprehensive README.md with usage examples (similar to TypeScript packages)
- ✅ **API Design**: Idiomatic .NET with extension methods for DI registration
- ✅ **Code Quality**: XML documentation, nullable reference types, async/await best practices

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Data Models](#core-data-models)
3. [Frame-Based Streaming Protocol](#frame-based-streaming-protocol)
4. [Agent Implementation Pattern](#agent-implementation-pattern)
5. [HTTP Transport Layer](#http-transport-layer)
6. [Thread Management & Persistence](#thread-management--persistence)
7. [Tool Calling & Structured Output](#tool-calling--structured-output)
8. [Error Handling](#error-handling)
9. [.NET Core Implementation Recommendations](#net-core-implementation-recommendations)

---

## 1. Architecture Overview

### 1.1 Package Structure

```
Hashbrown.DotNet/
├── Models/
│   ├── CompletionCreateParams.cs    # Request model with operation field
│   ├── Message.cs                    # Chat message model
│   └── Frame.cs                      # Streaming frame model
├── Frames/
│   └── FrameEncoder.cs              # Binary frame encoding
└── Extensions/
    └── HashbrownEndpointExtensions.cs # app.MapHashbrownAgent() extension

Hashbrown.DotNet.EntityFramework/    # Optional companion package
├── HashbrownDbContext.cs            # EF Core DbContext
├── Entities/
│   ├── ThreadEntity.cs
│   └── MessageEntity.cs
└── Extensions/
    └── EntityFrameworkExtensions.cs  # EF ChatMessageStore implementation
```

### 1.2 Simplified Architecture

**Key Concept**: The .NET package provides endpoint mapping, frame encoding, and operation routing. Users bring their own configured agent and optional ChatMessageStore.

```
┌───────────────────────────────────────────────────────────┐
│ User Application (ASP.NET Core)                           │
│                                                            │
│  • Creates & configures ChatClientAgent                   │
│  • Implements ChatMessageStore (optional)                 │
│  • Calls app.MapHashbrownAgent(agent, messageStore)       │
└───────────────────────────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────────────────┐
│ Hashbrown.DotNet Package                                  │
│                                                            │
│  [MapHashbrownAgent Extension]                            │
│     ├─ Parse CompletionCreateParams from body             │
│     ├─ Route operation (load-thread vs generate)          │
│     │                                                      │
│     ├─ load-thread:                                       │
│     │    └─ Query ChatMessageStore.GetMessagesAsync()     │
│     │    └─ Encode & return frames                        │
│     │                                                      │
│     └─ generate:                                          │
│          └─ Load thread context (if threadId exists)      │
│          └─ Invoke agent.InvokeStreamingAsync()           │
│          └─ Encode chunks as frames                       │
│          └─ Agent auto-persists via ChatMessageStore      │
└───────────────────────────────────────────────────────────┘
```

### 1.3 Separation of Concerns

**Server-Side (What we're implementing in .NET):**
- AI provider adapters (OpenAI, Anthropic, etc.)
- Streaming frame generation
- Thread persistence
- Tool execution
- Request/response transformation

**Client-Side (Stays in React/Angular):**
- UI rendering
- State management
- Frame consumption
- User interaction

### 1.3 Separation of Concerns

**Server-Side (What we're implementing in .NET):**
- Endpoint mapping extension (`MapHashbrownAgent`)
- Operation routing (load-thread vs generate)
- Frame encoding (length-prefixed binary format)
- Request/response models

**User's Responsibility:**
- Agent creation & configuration
- ChatMessageStore implementation (optional, for persistence)
- Azure OpenAI / AI provider setup

**Client-Side (Stays in React/Angular):**
- UI rendering
- State management
- Frame consumption
- User interaction

### 1.4 Usage Example

```csharp
using Azure.AI.OpenAI;
using Azure.Identity;
using Hashbrown.DotNet.Extensions;
using Hashbrown.DotNet.EntityFramework.Extensions;
using Microsoft.SemanticKernel.Agents;

var builder = WebApplication.CreateBuilder(args);

// 1. User configures Azure OpenAI client
var azureClient = new  AzureOpenAIClient(
    new Uri("https://your-resource.openai.azure.com"),
    new DefaultAzureCredential()
);
var chatClient = azureClient.GetChatClient("gpt-4");

// 2. User creates agent
var agent = new ChatClientAgent(
    chatClient,
    name: "assistant",
    instructions: "You are a helpful AI assistant."
);

// 3. User configures ChatMessageStore (optional)
builder.Services.AddHashbrownChatMessageStore(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

var app = builder.Build();

// 4. Map Hashbrown endpoint - framework does the rest!
app.MapHashbrownAgent(
    path: "/chat",
    agent: agent,
    messageStoreFactory: sp => sp.GetService<ChatMessageStore>()
);

app.Run();
```

That's it! The endpoint now:
- Accepts `CompletionCreateParams` with operation field
- Handles `load-thread`: queries ChatMessageStore and returns thread
- Handles `generate`: invokes agent and streams frames
- Auto-persists messages via agent's ChatMessageStore

### 1.5 Communication Flow

```
Client (React/Angular)
    ↓ HTTP POST (Chat.Api.CompletionCreateParams)
Server (.NET Core API)
    ↓ Transform to provider format
AI Provider (OpenAI, etc.)
    ↓ Streaming response chunks
Server (.NET Core API)
    ↓ Encode to Frame format (length-prefixed binary)
Client (React/Angular)
    ↓ Parse frames & update UI
```

---

## 2. Core Data Models

### 2.1 Chat.Api.CompletionCreateParams

This is the **standardized request format** sent from client to server:

```typescript
interface CompletionCreateParams {
  operation: 'load-thread' | 'generate';
  model: string;                    // Model identifier (e.g., 'gpt-4o-mini')
  system: string;                   // System prompt
  messages: Message[];              // Conversation history
  responseFormat?: object;          // JSON schema for structured output
  toolChoice?: 'auto' | 'none' | 'required';
  tools?: Tool[];                   // Available tools/functions
  threadId?: string;                // For thread persistence
}
```

**Key Properties:**

| Property | Type | Purpose |
|----------|------|---------|
| `operation` | `'load-thread' \| 'generate'` | Determines if loading a thread or generating new response |
| `model` | `string` | Model identifier (e.g., `'gpt-4o-mini'`, `'gemini-2.0-flash'`) |
| `system` | `string` | System prompt/instructions |
| `messages` | `Message[]` | Conversation history (user, assistant, tool messages) |
| `responseFormat` | `object?` | JSON schema for structured output |
| `toolChoice` | `string?` | Tool calling strategy |
| `tools` | `Tool[]?` | Available tools the model can call |
| `threadId` | `string?` | Thread identifier for persistence |

### 2.2 Message Types

```typescript
// User message
interface UserMessage {
  role: 'user';
  content: string;
}

// Assistant message
interface AssistantMessage {
  role: 'assistant';
  content?: string;
  toolCalls?: ToolCall[];
}

// Tool result message
interface ToolMessage {
  role: 'tool';
  content: PromiseSettledResult<any>;
  toolCallId: string;
  toolName: string;
}

// Error message
interface ErrorMessage {
  role: 'error';
  content: string;
}

type Message = UserMessage | AssistantMessage | ToolMessage | ErrorMessage;
```

### 2.3 Tool Definition

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: object;  // JSON Schema
}

interface ToolCall {
  index: number;
  id: string;
  type: string;        // 'function'
  function: {
    name: string;
    arguments: string; // JSON string
  };
  metadata?: Record<string, unknown>;
}
```

### 2.4 Completion Chunk (Streaming Delta)

```typescript
interface CompletionChunk {
  choices: CompletionChunkChoice[];
}

interface CompletionChunkChoice {
  index: number;
  delta: {
    content?: string | null;
    role?: string;
    toolCalls?: PartialToolCall[];
  };
  finishReason: string | null;
}
```

---

## 3. Frame-Based Streaming Protocol

### 3.1 Frame Format

Hashbrown uses a **length-prefixed binary protocol** for streaming:

```
[4 bytes: length (Big Endian)] [N bytes: UTF-8 JSON payload]
```

**Example:**
```
00 00 00 2A   {"type":"generation-start"}
```

### 3.2 Frame Types

```typescript
// Generation lifecycle
type Frame = 
  | { type: 'generation-start' }
  | { type: 'generation-chunk', chunk: CompletionChunk }
  | { type: 'generation-finish' }
  | { type: 'generation-error', error: string, stacktrace?: string }
  
  // Thread management
  | { type: 'thread-load-start' }
  | { type: 'thread-load-success', thread?: Message[] }
  | { type: 'thread-load-failure', error: string, stacktrace?: string }
  | { type: 'thread-save-start' }
  | { type: 'thread-save-success', threadId: string }
  | { type: 'thread-save-failure', error: string, stacktrace?: string }
```

### 3.3 Frame Encoding (TypeScript Implementation)

```typescript
function encodeFrame(frame: Frame): Uint8Array {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(frame));
  const len = jsonBytes.length;
  const out = new Uint8Array(4 + len);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  view.setUint32(0, len, /* Big Endian */ false);
  out.set(jsonBytes, 4);

  return out;
}
```

**For .NET Core:**
```csharp
byte[] EncodeFrame(object frame)
{
    var json = JsonSerializer.Serialize(frame);
    var jsonBytes = Encoding.UTF8.GetBytes(json);
    var length = jsonBytes.Length;
    
    var result = new byte[4 + length];
    
    // Big Endian length prefix
    result[0] = (byte)(length >> 24);
    result[1] = (byte)(length >> 16);
    result[2] = (byte)(length >> 8);
    result[3] = (byte)length;
    
    Buffer.BlockCopy(jsonBytes, 0, result, 4, length);
    
    return result;
}
```

---

## 4. Agent Implementation Pattern

### 4.1 OpenAI Adapter Structure

File: `packages/openai/src/stream/text.fn.ts`

```typescript
export async function* text(
  options: OpenAITextStreamOptions
): AsyncIterable<Uint8Array>
```

**Options Interface:**

```typescript
type OpenAITextStreamOptions = {
  apiKey: string;
  baseURL?: string;
  request: Chat.Api.CompletionCreateParams;
  transformRequestOptions?: (
    options: OpenAI.Chat.ChatCompletionCreateParamsStreaming
  ) => OpenAI.Chat.ChatCompletionCreateParamsStreaming | Promise<...>;
  
  // Thread persistence (optional)
  loadThread?: (threadId: string) => Promise<Chat.Api.Message[]>;
  saveThread?: (thread: Chat.Api.Message[], threadId?: string) => Promise<string>;
}
```

### 4.2 Processing Pipeline

```typescript
async function* text(options) {
  // 1. Extract parameters
  const { apiKey, request, loadThread, saveThread } = options;
  const { model, tools, responseFormat, system, threadId } = request;
  
  // 2. Create provider client
  const openai = new OpenAI({ apiKey });
  
  // 3. Handle thread loading
  if (threadId && loadThread) {
    yield encodeFrame({ type: 'thread-load-start' });
    try {
      const loadedThread = await loadThread(threadId);
      yield encodeFrame({ 
        type: 'thread-load-success', 
        thread: loadedThread 
      });
    } catch (error) {
      yield encodeFrame({ 
        type: 'thread-load-failure', 
        error: error.message 
      });
      return;
    }
  }
  
  // 4. Merge messages
  const mergedMessages = threadId 
    ? mergeMessagesForThread(loadedThread, request.messages)
    : request.messages;
  
  // 5. Transform to provider format
  const providerRequest = {
    stream: true,
    model: model,
    messages: [
      { role: 'system', content: system },
      ...transformMessages(mergedMessages)
    ],
    tools: transformTools(tools),
    response_format: transformResponseFormat(responseFormat),
  };
  
  // 6. Stream from provider
  yield encodeFrame({ type: 'generation-start' });
  
  const stream = openai.chat.completions.stream(providerRequest);
  let assistantMessage = null;
  
  try {
    for await (const chunk of stream) {
      const chunkMessage = transformProviderChunk(chunk);
      assistantMessage = updateAssistantMessage(assistantMessage, chunkMessage);
      
      yield encodeFrame({ 
        type: 'generation-chunk', 
        chunk: chunkMessage 
      });
    }
    
    yield encodeFrame({ type: 'generation-finish' });
  } catch (error) {
    yield encodeFrame({ 
      type: 'generation-error', 
      error: error.message,
      stacktrace: error.stack 
    });
    return;
  }
  
  // 7. Save thread
  if (saveThread && assistantMessage) {
    yield encodeFrame({ type: 'thread-save-start' });
    try {
      const savedThreadId = await saveThread(
        [...mergedMessages, assistantMessage],
        threadId
      );
      yield encodeFrame({ 
        type: 'thread-save-success', 
        threadId: savedThreadId 
      });
    } catch (error) {
      yield encodeFrame({ 
        type: 'thread-save-failure', 
        error: error.message 
      });
    }
  }
}
```

### 4.3 Message Transformation

**Hashbrown → OpenAI:**

```typescript
function transformMessages(messages: Chat.Api.Message[]) {
  return messages.map(message => {
    switch (message.role) {
      case 'user':
        return { role: 'user', content: message.content };
      
      case 'assistant':
        return {
          role: 'assistant',
          content: typeof message.content === 'string' 
            ? message.content 
            : JSON.stringify(message.content),
          tool_calls: message.toolCalls?.map(tc => ({
            ...tc,
            type: 'function',
            function: {
              ...tc.function,
              arguments: JSON.stringify(tc.function.arguments)
            }
          }))
        };
      
      case 'tool':
        return {
          role: 'tool',
          content: JSON.stringify(message.content),
          tool_call_id: message.toolCallId
        };
        
      default:
        throw new Error(`Invalid message role: ${message.role}`);
    }
  });
}
```

### 4.4 Tool Transformation

```typescript
function transformTools(tools?: Tool[]) {
  if (!tools?.length) return undefined;
  
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: true  // Enable strict schema validation
    }
  }));
}
```

### 4.5 Assistant Message Accumulation

```typescript
function updateAssistantMessage(
  message: AssistantMessage | null,
  delta: CompletionChunk
): AssistantMessage {
  if (message && delta.choices.length) {
    const choice = delta.choices[0];
    return {
      role: 'assistant',
      content: (message.content ?? '') + (choice.delta.content ?? ''),
      toolCalls: mergeToolCalls(message.toolCalls, choice.delta.toolCalls)
    };
  } else if (delta.choices[0]?.delta?.role === 'assistant') {
    return {
      role: 'assistant',
      content: delta.choices[0].delta.content ?? '',
      toolCalls: mergeToolCalls([], delta.choices[0].delta.toolCalls)
    };
  }
  return message;
}
```

---

## 5. HTTP Transport Layer

### 5.1 Server Endpoint Pattern

**Express.js Example (TypeScript):**

```typescript
app.post('/chat', async (req, res) => {
  const request = req.body as Chat.Api.CompletionCreateParams;
  
  const stream = HashbrownOpenAI.stream.text({
    apiKey: OPENAI_API_KEY,
    request,
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
});
```

### 5.2 Client-Side Transport

File: `packages/core/src/transport/http-transport.ts`

```typescript
class HttpTransport implements Transport {
  async send(request: TransportRequest): Promise<TransportResponse> {
    const requestInit: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.params),
      signal: request.signal,
    };

    const response = await fetch(this.baseUrl, requestInit);
    
    if (!response.ok) {
      throw new TransportError(
        `${response.statusText} (${response.status})`,
        { status: response.status, retryable: false }
      );
    }

    return { stream: response.body };
  }
}
```

**Key Points:**
- POST request with JSON body
- `Content-Type: application/json` request header
- `Content-Type: application/octet-stream` response header
- Streaming response body (binary frames)

---

## 6. Thread Management & Persistence

### 6.1 Thread Operations

**Operation: `load-thread`**
- Client requests thread reload
- Server yields `thread-load-start` frame
- Server calls `loadThread(threadId)`
- Server yields `thread-load-success` with messages array
- Server stops (no generation)

**Operation: `generate`**
- If `threadId` provided:
  - Load thread messages
  - Merge with incoming messages
  - Generate response
  - Save updated thread
- If no `threadId`:
  - Generate response from provided messages only

### 6.2 Message Merging Algorithm

File: `packages/core/src/utils/threading.ts`

```typescript
function mergeMessagesForThread(
  saved: Message[] = [],
  incoming: Message[] = []
): Message[] {
  if (saved.length === 0) return incoming;
  if (incoming.length === 0) return saved;

  // Find longest overlap between end of saved and start of incoming
  const maxOverlap = Math.min(saved.length, incoming.length);
  let overlap = 0;

  for (let k = maxOverlap; k > 0; k--) {
    const savedStart = saved.length - k;
    let matches = true;

    for (let i = 0; i < k; i++) {
      if (!deepEqual(saved[savedStart + i], incoming[i])) {
        matches = false;
        break;
      }
    }

    if (matches) {
      overlap = k;
      break;
    }
  }

  // Return saved + new tail from incoming
  return [
    ...saved,
    ...incoming.slice(overlap)
  ];
}
```

**Why This Matters:**
- Client sends only **delta** messages after first turn
- Server must reconstruct full conversation from saved thread
- Prevents sending entire conversation history on every request

### 6.3 Thread Persistence Interface

**TypeScript (Callback-based):**
```typescript
interface ThreadPersistence {
  loadThread: (threadId: string) => Promise<Message[]>;
  saveThread: (thread: Message[], threadId?: string) => Promise<string>;
}
```

**Implementation Notes:**
- `loadThread`: Fetch messages from database
- `saveThread`: Store messages, return threadId (create new if not provided)
- Thread messages must include full conversation history
- Messages should be serialized/deserialized as JSON

**.NET Core (ChatMessageStore-based):**

For .NET Core implementation, **replace callback-based persistence** with Microsoft Agents Framework's `ChatMessageStore`:

```csharp
public abstract class ChatMessageStore
{
    // Load all messages for a thread
    public abstract Task<IReadOnlyList<ChatMessage>> GetMessagesAsync(
        string threadId, 
        CancellationToken cancellationToken);
    
    // Add a single message to a thread
    public abstract Task AddMessageAsync(
        string threadId, 
        ChatMessage message, 
        CancellationToken cancellationToken);
    
    // Delete all messages for a thread
    public abstract Task DeleteMessagesAsync(
        string threadId, 
        CancellationToken cancellationToken);
}
```

**Key Benefits:**
- Integrated with `ChatClientAgent.GetNewThreadAsync(messageStore)`
- Automatic message persistence during streaming
- Standardized interface for multiple storage backends
- Built-in support for `AgentThread` conversation management

See **Section 9.6** for complete `HashbrownChatMessageStore` implementation with Entity Framework.

---

## 7. Tool Calling & Structured Output

### 7.1 Tool Definition Format

```typescript
const tools: Tool[] = [
  {
    name: 'get_weather',
    description: 'Get the current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
      },
      required: ['location']
    }
  }
];
```

### 7.2 Tool Call Merging (Streaming)

```typescript
function mergeToolCalls(
  existingCalls: ToolCall[] = [],
  newCalls: PartialToolCall[] = []
): ToolCall[] {
  const merged = [...existingCalls];
  
  newCalls.forEach(newCall => {
    const index = merged.findIndex(call => call.index === newCall.index);
    
    if (index !== -1) {
      // Update existing
      const existing = merged[index];
      merged[index] = {
        ...existing,
        function: {
          ...existing.function,
          arguments: existing.function.arguments + newCall.function.arguments
        }
      };
    } else {
      // Add new
      merged.push(newCall as ToolCall);
    }
  });
  
  return merged;
}
```

**Key Behavior:**
- Tool calls stream incrementally (by `index`)
- Arguments accumulate as strings
- Final arguments are JSON-serialized parameters

### 7.3 Structured Output (Response Format)

```typescript
const responseFormat = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] }
  },
  required: ['summary', 'sentiment']
};
```

**Transformation for OpenAI:**

```typescript
const openaiFormat = {
  type: 'json_schema',
  json_schema: {
    strict: true,
    name: 'schema',
    description: '',
    schema: responseFormat
  }
};
```

**.NET Core Tool Registration with Agent Framework:**

Instead of manually building JSON tool definitions, use `AIFunctionFactory`:

```csharp
using Microsoft.Extensions.AI;
using System.ComponentModel;

public class WeatherTools
{
    [Description("Get current weather for a location")]
    public static async Task<string> GetWeather(
        [Description("City name or location")] string location,
        [Description("Temperature unit (celsius/fahrenheit)")] string unit = "celsius")
    {
        // Implementation
        var weather = await FetchWeatherAsync(location);
        
        return JsonSerializer.Serialize(new
        {
            location,
            temperature = weather.Temp,
            unit,
            conditions = weather.Conditions
        });
    }
}

// Register with ChatOptions
var chatOptions = new ChatOptions
{
    Tools = new[]
    {
        AIFunctionFactory.Create(WeatherTools.GetWeather),
        AIFunctionFactory.Create(SearchKnowledgeBase),
        AIFunctionFactory.Create(CreateCalendarEvent)
    }
};

// Use with agent
await _agent.InvokeStreamingAsync(thread, chatOptions, cancellationToken);
```

**Key Differences:**
- **TypeScript**: Manual JSON schemas with types and descriptions
- **.NET**: C# attributes automatically converted to tool schemas
- **Automatic invocation**: Agent Framework can auto-invoke tools during streaming

---

## 8. Error Handling

### 8.1 Error Frame Structure

```typescript
{
  type: 'generation-error',
  error: string,        // User-friendly message
  stacktrace?: string   // Developer debug info
}
```

### 8.2 Error Normalization

```typescript
function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}
```

### 8.3 Error Scenarios

| Scenario | Frame Type | Action |
|----------|------------|--------|
| Thread load fails | `thread-load-failure` | Stop execution, return early |
| Generation fails | `generation-error` | Send error frame, return early |
| Thread save fails | `thread-save-failure` | Send warning frame, continue |
| Network error | `generation-error` | Propagate to client |
| Invalid request | HTTP 400 | Return before streaming |

---

## 9. .NET NuGet Package Implementation with Microsoft Agents Framework

### 9.1 Package Project Structure

```
packages/dotnet/
├── src/
│   ├── Hashbrown.DotNet/
│   │   ├── Hashbrown.DotNet.csproj
│   │   ├── Models/
│   │   │   ├── CompletionCreateParams.cs
│   │   │   ├── Message.cs
│   │   │   ├── Tool.cs
│   │   │   └── Frame.cs
│   │   ├── Persistence/
│   │   │   ├── HashbrownChatMessageStore.cs
│   │   │   └── IThreadRepository.cs
│   │   ├── Streaming/
│   │   │   ├── IStreamingAdapter.cs
│   │   │   └── AgentFrameworkAdapter.cs
│   │   ├── Extensions/
│   │   │   └── HashbrownServiceCollectionExtensions.cs
│   │   └── HashbrownDotNet.cs
│   └── Hashbrown.DotNet.EntityFramework/
│       ├── Hashbrown.DotNet.EntityFramework.csproj
│       ├── Repositories/
│       │   └── ThreadRepository.cs
│       ├── Entities/
│       │   ├── ThreadEntity.cs
│       │   └── MessageEntity.cs
│       └── HashbrownDbContext.cs
├── tests/
│   ├── Hashbrown.DotNet.Tests/
│   │   └── Unit tests
│   └── Hashbrown.DotNet.IntegrationTests/
│       └── Integration tests
├── samples/
│   └── HashbrownServer/
│       └── Sample ASP.NET Core application
├── README.md
├── LICENSE
└── Hashbrown.DotNet.sln
│   │   ├── FrameEncoder.cs
│   │   └── IStreamingAdapter.cs
│   └── Threading/
│       └── MessageMerger.cs
├── Hashbrown.Adapters.OpenAI/
│   └── OpenAIAdapter.cs
├── Hashbrown.Adapters.Anthropic/
│   └── AnthropicAdapter.cs
└── Hashbrown.WebApi/
    ├── Controllers/
    │   └── ChatController.cs
    └── Program.cs
```

### 9.2 Core Interfaces

```csharp
// IStreamingAdapter.cs
public interface IStreamingAdapter
{
    IAsyncEnumerable<byte[]> StreamTextAsync(
        StreamingOptions options,
        CancellationToken cancellationToken = default
    );
}

// StreamingOptions.cs
public class StreamingOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public CompletionCreateParams Request { get; set; } = null!;
    public Func<string, Task<List<Message>>>? LoadThread { get; set; }
    public Func<List<Message>, string?, Task<string>>? SaveThread { get; set; }
}
```

### 9.3 ASP.NET Core Controller

```csharp
[ApiController]
[Route("api/[controller]")]
public class ChatController : ControllerBase
{
    private readonly IStreamingAdapter _openAIAdapter;
    
    public ChatController(IStreamingAdapter openAIAdapter)
    {
        _openAIAdapter = openAIAdapter;
    }
    
    [HttpPost]
    public async Task Post(
        [FromBody] CompletionCreateParams request,
        CancellationToken cancellationToken)
    {
        Response.ContentType = "application/octet-stream";
        Response.Headers.Add("Cache-Control", "no-cache");
        
        var options = new StreamingOptions
        {
            ApiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY")!,
            Request = request,
            LoadThread = LoadThreadFromDb,
            SaveThread = SaveThreadToDb
        };
        
        await foreach (var frame in _openAIAdapter.StreamTextAsync(options, cancellationToken))
        {
            await Response.Body.WriteAsync(frame, cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }
    }
    
    private async Task<List<Message>> LoadThreadFromDb(string threadId)
    {
        // Implementation: Query database
        throw new NotImplementedException();
    }
    
    private async Task<string> SaveThreadToDb(List<Message> messages, string? threadId)
    {
        // Implementation: Save to database, return threadId
        throw new NotImplementedException();
    }
}
```

### 9.4 Frame Encoder Implementation

```csharp
public static class FrameEncoder
{
    public static byte[] Encode(object frame)
    {
        var json = JsonSerializer.Serialize(frame, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
        
        var jsonBytes = Encoding.UTF8.GetBytes(json);
        var length = jsonBytes.Length;
        
        var result = new byte[4 + length];
        
        // Big-endian length prefix
        result[0] = (byte)(length >> 24);
        result[1] = (byte)(length >> 16);
        result[2] = (byte)(length >> 8);
        result[3] = (byte)length;
        
        Buffer.BlockCopy(jsonBytes, 0, result, 4, length);
        
        return result;
    }
}
```

### 9.5 Agent Framework Adapter with Azure OpenAI

```csharp
using Azure.AI.OpenAI;
using Azure.Identity;
using Microsoft.Extensions.AI;
using Microsoft.SemanticKernel.Agents;
using OpenAI.Chat;

public class AgentFrameworkAdapter : IStreamingAdapter
{
    private readonly IChatClient _chatClient;
    private readonly ChatClientAgent _agent;
    private readonly HashbrownChatMessageStore _messageStore;
    
    public AgentFrameworkAdapter(
        IConfiguration config,
        HashbrownChatMessageStore messageStore)
    {
        _messageStore = messageStore;
        
        // Create Azure OpenAI Chat Client
        var endpoint = new Uri(config["AzureOpenAI:Endpoint"]);
        var credential = new DefaultAzureCredential();
        var azureClient = new AzureOpenAIClient(endpoint, credential);
        var deploymentName = config["AzureOpenAI:DeploymentName"];
        
        // Get ChatClient and convert to IChatClient
        _chatClient = azureClient
            .GetChatClient(deploymentName)
            .AsIChatClient();
        
        // Create ChatClientAgent
        _agent = new ChatClientAgent(
            _chatClient,
            name: "hashbrown-agent",
            instructions: "You are a helpful AI assistant for generative UI."
        );
    }
    
    public async IAsyncEnumerable<byte[]> StreamTextAsync(
        StreamingOptions options,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var request = options.Request;
        AgentThread? thread = null;
        
        // 1. Load or create thread with ChatMessageStore
        yield return FrameEncoder.Encode(new { type = "thread-load-start" });
        
        try
        {
            if (!string.IsNullOrEmpty(request.ThreadId))
            {
                // Load existing thread from ChatMessageStore
                var existingMessages = await _messageStore.GetMessagesAsync(
                    request.ThreadId, 
                    cancellationToken);
                    
                thread = await _agent.GetNewThreadAsync(_messageStore, cancellationToken);
                
                yield return FrameEncoder.Encode(new
                {
                    type = "thread-load-success",
                    thread = existingMessages.Select(ConvertToHashbrownMessage).ToList()
                });
                
                if (request.Operation == "load-thread")
                {
                    yield break;
                }
            }
            else
            {
                // Create new thread
                thread = await _agent.GetNewThreadAsync(_messageStore, cancellationToken);
                yield return FrameEncoder.Encode(new { type = "thread-load-success", thread = Array.Empty<Message>() });
            }
        }
        catch (Exception ex)
        {
            yield return FrameEncoder.Encode(new
            {
                type = "thread-load-failure",
                error = ex.Message,
                stacktrace = ex.StackTrace
            });
            yield break;
        }
        
        // 2. Prepare chat options with tools and response format
        var chatOptions = new ChatOptions();
        
        if (request.Tools?.Any() == true)
        {
            foreach (var tool in request.Tools)
            {
                chatOptions.Tools.Add(ConvertToAITool(tool));
            }
        }
        
        if (request.ResponseFormat != null)
        {
            chatOptions.ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                "hashbrown_schema",
                BinaryData.FromString(JsonSerializer.Serialize(request.ResponseFormat)),
                jsonSchemaIsStrict: true
            );
        }
        
        // 3. Add system message and user messages to thread
        if (!string.IsNullOrEmpty(request.System))
        {
            await thread.AddMessageAsync(
                new ChatMessage(ChatRole.System, request.System),
                cancellationToken);
        }
        
        foreach (var msg in request.Messages)
        {
            await thread.AddMessageAsync(
                ConvertToAgentChatMessage(msg),
                cancellationToken);
        }
        
        // 4. Stream AI responses
        yield return FrameEncoder.Encode(new { type = "generation-start" });
        
        try
        {
            await foreach (var update in _agent.InvokeStreamingAsync(
                thread, 
                chatOptions, 
                cancellationToken))
            {
                var chunk = ConvertToHashbrownChunk(update);
                
                yield return FrameEncoder.Encode(new
                {
                    type = "generation-chunk",
                    chunk
                });
            }
            
            yield return FrameEncoder.Encode(new { type = "generation-finish" });
        }
        catch (Exception ex)
        {
            yield return FrameEncoder.Encode(new
            {
                type = "generation-error",
                error = ex.Message,
                stacktrace = ex.StackTrace
            });
            yield break;
        }
        
        // 5. Thread saving (messages already persisted by ChatMessageStore)
        yield return FrameEncoder.Encode(new { type = "thread-save-start" });
        
        try
        {
            var threadId = thread.Id ?? Guid.NewGuid().ToString();
            
            yield return FrameEncoder.Encode(new
            {
                type = "thread-save-success",
                threadId
            });
        }
        catch (Exception ex)
        {
            yield return FrameEncoder.Encode(new
            {
                type = "thread-save-failure",
                error = ex.Message
            });
        }
    }
    
    private static ChatMessage ConvertToAgentChatMessage(Message msg)
    {
        return msg.Role switch
        {
            "user" => new ChatMessage(ChatRole.User, msg.Content),
            "assistant" => new ChatMessage(ChatRole.Assistant, msg.Content),
            "tool" => new ChatMessage(ChatRole.Tool, msg.Content),
            _ => throw new ArgumentException($"Unsupported role: {msg.Role}")
        };
    }
    
    private static Message ConvertToHashbrownMessage(ChatMessage msg)
    {
        return new Message
        {
            Role = msg.Role.ToString().ToLowerInvariant(),
            Content = msg.Text
        };
    }
    
    private static AITool ConvertToAITool(Tool tool)
    {
        var parametersJson = JsonSerializer.Serialize(tool.Parameters);
        var parametersElement = JsonSerializer.Deserialize<JsonElement>(parametersJson);
        
        return AIFunctionFactory.Create(
            tool.Name,
            tool.Description,
            parametersElement
        );
    }
    
    private static CompletionChunk ConvertToHashbrownChunk(StreamingChatCompletionUpdate update)
    {
        return new CompletionChunk
        {
            Choices = new[]
            {
                new Choice
                {
                    Index = 0,
                    Delta = new Delta
                    {
                        Role = update.Role?.ToString().ToLowerInvariant(),
                        Content = update.ContentUpdate
                            .Where(c => c is TextContent)
                            .Cast<TextContent>()
                            .FirstOrDefault()?.Text,
                        ToolCalls = update.ToolCallUpdates?.Select((tc, index) => new ToolCall
                        {
                            Index = index,
                            Id = tc.ToolCallId,
                            Function = new FunctionCall
                            {
                                Name = tc.FunctionName,
                                Arguments = tc.FunctionArgumentsUpdate
                            }
                        }).ToList()
                    },
                    FinishReason = update.FinishReason?.ToString().ToLowerInvariant()
                }
            }
        };
    }
}
```

### 9.6 ChatMessageStore Implementation for Thread Persistence

```csharp
using Microsoft.Extensions.AI;
using Microsoft.SemanticKernel.Agents;

public class HashbrownChatMessageStore : ChatMessageStore
{
    private readonly IThreadRepository _threadRepository;
    
    public HashbrownChatMessageStore(IThreadRepository threadRepository)
    {
        _threadRepository = threadRepository;
    }
    
    public override async Task<IReadOnlyList<ChatMessage>> GetMessagesAsync(
        string threadId,
        CancellationToken cancellationToken = default)
    {
        var messages = await _threadRepository.LoadThreadAsync(threadId, cancellationToken);
        
        return messages.Select(m => new ChatMessage
        {
            Role = m.Role switch
            {
                "user" => ChatRole.User,
                "assistant" => ChatRole.Assistant,
                "system" => ChatRole.System,
                "tool" => ChatRole.Tool,
                _ => throw new ArgumentException($"Unknown role: {m.Role}")
            },
            Text = m.Content,
            AdditionalProperties = m.ToolCalls != null
                ? new AdditionalPropertiesDictionary { ["tool_calls"] = m.ToolCalls }
                : null
        }).ToList();
    }
    
    public override async Task AddMessageAsync(
        string threadId,
        ChatMessage message,
        CancellationToken cancellationToken = default)
    {
        var hashbrownMessage = new Message
        {
            Role = message.Role.ToString().ToLowerInvariant(),
            Content = message.Text,
            ToolCalls = message.AdditionalProperties?.ContainsKey("tool_calls") == true
                ? message.AdditionalProperties["tool_calls"] as List<ToolCall>
                : null
        };
        
        await _threadRepository.AddMessageAsync(threadId, hashbrownMessage, cancellationToken);
    }
    
    public override async Task DeleteMessagesAsync(
        string threadId,
        CancellationToken cancellationToken = default)
    {
        await _threadRepository.DeleteThreadAsync(threadId, cancellationToken);
    }
}

// Repository interface for database persistence
public interface IThreadRepository
{
    Task<List<Message>> LoadThreadAsync(string threadId, CancellationToken ct);
    Task AddMessageAsync(string threadId, Message message, CancellationToken ct);
    Task<string> SaveThreadAsync(string threadId, List<Message> messages, CancellationToken ct);
    Task DeleteThreadAsync(string threadId, CancellationToken ct);
}

// Example Entity Framework implementation
public class ThreadRepository : IThreadRepository
{
    private readonly HashbrownDbContext _context;
    
    public ThreadRepository(HashbrownDbContext context)
    {
        _context = context;
    }
    
    public async Task<List<Message>> LoadThreadAsync(
        string threadId, 
        CancellationToken ct)
    {
        var thread = await _context.Threads
            .Include(t => t.Messages)
            .FirstOrDefaultAsync(t => t.Id == threadId, ct);
        
        return thread?.Messages
            .OrderBy(m => m.CreatedAt)
            .Select(m => new Message
            {
                Role = m.Role,
                Content = m.Content,
                ToolCalls = m.ToolCallsJson != null
                    ? JsonSerializer.Deserialize<List<ToolCall>>(m.ToolCallsJson)
                    : null
            })
            .ToList() ?? new List<Message>();
    }
    
    public async Task AddMessageAsync(
        string threadId, 
        Message message, 
        CancellationToken ct)
    {
        var thread = await _context.Threads
            .FirstOrDefaultAsync(t => t.Id == threadId, ct);
        
        if (thread == null)
        {
            thread = new ThreadEntity
            {
                Id = threadId,
                CreatedAt = DateTime.UtcNow
            };
            _context.Threads.Add(thread);
        }
        
        thread.Messages.Add(new MessageEntity
        {
            Role = message.Role,
            Content = message.Content,
            ToolCallsJson = message.ToolCalls != null
                ? JsonSerializer.Serialize(message.ToolCalls)
                : null,
            CreatedAt = DateTime.UtcNow
        });
        
        await _context.SaveChangesAsync(ct);
    }
    
    public async Task<string> SaveThreadAsync(
        string threadId, 
        List<Message> messages, 
        CancellationToken ct)
    {
        threadId ??= Guid.NewGuid().ToString();
        
        var thread = await _context.Threads
            .Include(t => t.Messages)
            .FirstOrDefaultAsync(t => t.Id == threadId, ct);
        
        if (thread == null)
        {
            thread = new ThreadEntity
            {
                Id = threadId,
                CreatedAt = DateTime.UtcNow
            };
            _context.Threads.Add(thread);
        }
        
        thread.Messages.Clear();
        thread.Messages = messages.Select(m => new MessageEntity
        {
            Role = m.Role,
            Content = m.Content,
            ToolCallsJson = m.ToolCalls != null
                ? JsonSerializer.Serialize(m.ToolCalls)
                : null,
            CreatedAt = DateTime.UtcNow
        }).ToList();
        
        await _context.SaveChangesAsync(ct);
        return threadId;
    }
    
    public async Task DeleteThreadAsync(string threadId, CancellationToken ct)
    {
        var thread = await _context.Threads
            .FirstOrDefaultAsync(t => t.Id == threadId, ct);
        
        if (thread != null)
        {
            _context.Threads.Remove(thread);
            await _context.SaveChangesAsync(ct);
        }
    }
}
```

### 9.7 Service Registration Extension Methods (for Program.cs)

**Hashbrown.DotNet/Extensions/HashbrownServiceCollectionExtensions.cs**

```csharp
using Azure.AI.OpenAI;
using Azure.Identity;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.SemanticKernel.Agents;

namespace Hashbrown.DotNet.Extensions;

/// <summary>
/// Extension methods for registering Hashbrown services in the dependency injection container.
/// </summary>
public static class HashbrownServiceCollectionExtensions
{
    /// <summary>
    /// Adds Hashbrown .NET services with Azure OpenAI to the service collection.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configure">Configuration action for Hashbrown options.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddHashbrown(
        this IServiceCollection services,
        Action<HashbrownOptions> configure)
    {
        var options = new HashbrownOptions();
        configure(options);
        
        services.AddSingleton(options);
        
        // Register IChatClient for Azure OpenAI
        services.AddSingleton<IChatClient>(sp =>
        {
            var azureClient = new AzureOpenAIClient(
                new Uri(options.AzureOpenAI.Endpoint),
                new DefaultAzureCredential());
            
            var chatClient = azureClient.GetChatClient(options.AzureOpenAI.DeploymentName);
            return chatClient.AsIChatClient();
        });
        
        // Register ChatClientAgent
        services.AddScoped<ChatClientAgent>(sp =>
        {
            var chatClient = sp.GetRequiredService<IChatClient>();
            return new ChatClientAgent(
                chatClient,
                name: "hashbrown-agent",
                instructions: options.Instructions ?? "You are a helpful AI assistant."
            );
        });
        
        // Register streaming adapter
        services.AddScoped<IStreamingAdapter, AgentFrameworkAdapter>();
        
        return services;
    }
    
    /// <summary>
    /// Adds Hashbrown .NET services with Entity Framework-based thread persistence.
    /// </summary>
    public static IServiceCollection AddHashbrownWithEntityFramework(
        this IServiceCollection services,
        Action<HashbrownOptions> configure,
        Action<DbContextOptionsBuilder> configureDbContext)
    {
        services.AddHashbrown(configure);
        
        // Register DbContext (requires Hashbrown.DotNet.EntityFramework package)
        services.AddDbContext<HashbrownDbContext>(configureDbContext);
        
        // Register repository and message store
        services.AddScoped<IThreadRepository, ThreadRepository>();
        services.AddSingleton<HashbrownChatMessageStore>();
        
        return services;
    }
}

/// <summary>
/// Configuration options for Hashbrown .NET.
/// </summary>
public class HashbrownOptions
{
    /// <summary>
    /// Azure OpenAI configuration.
    /// </summary>
    public AzureOpenAIOptions AzureOpenAI { get; set; } = new();
    
    /// <summary>
    /// Default instructions for the AI agent.
    /// </summary>
    public string? Instructions { get; set; }
}

public class AzureOpenAIOptions
{
    public string Endpoint { get; set; } = string.Empty;
    public string DeploymentName { get; set; } = string.Empty;
}
```

**Usage in Program.cs (Consumer Application)**

```csharp
using Hashbrown.DotNet.Extensions;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

// Register Hashbrown with Azure OpenAI and Entity Framework persistence
builder.Services.AddHashbrownWithEntityFramework(
    options =>
    {
        options.AzureOpenAI.Endpoint = builder.Configuration["AzureOpenAI:Endpoint"]!;
        options.AzureOpenAI.DeploymentName = builder.Configuration["AzureOpenAI:DeploymentName"]!;
        options.Instructions = "You are a helpful AI assistant for generative UI applications.";
    },
    dbOptions => dbOptions.UseSqlServer(
        builder.Configuration.GetConnectionString("Hashbrown")));

var app = builder.Build();

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<HashbrownDbContext>();
    await context.Database.EnsureCreatedAsync();
}

app.MapControllers();
app.Run();
```

### 9.8 Controller Implementation

```csharp
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class ChatController : ControllerBase
{
    private readonly IStreamingAdapter _adapter;
    private readonly ILogger<ChatController> _logger;
    
    public ChatController(
        IStreamingAdapter adapter,
        ILogger<ChatController> logger)
    {
        _adapter = adapter;
        _logger = logger;
    }
    
    [HttpPost]
    public async Task Post(
        [FromBody] CompletionCreateParams request,
        CancellationToken cancellationToken)
    {
        // Set response headers for binary streaming
        Response.ContentType = "application/octet-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Add("X-Content-Type-Options", "nosniff");
        
        try
        {
            var options = new StreamingOptions
            {
                Request = request
            };
            
            await foreach (var frame in _adapter.StreamTextAsync(options, cancellationToken))
            {
                await Response.Body.WriteAsync(frame, cancellationToken);
                await Response.Body.FlushAsync(cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error streaming chat response");
            
            // Send error frame
            var errorFrame = FrameEncoder.Encode(new
            {
                type = "generation-error",
                error = ex.Message,
                stacktrace = ex.StackTrace
            });
            
            await Response.Body.WriteAsync(errorFrame, cancellationToken);
        }
    }
    
    [HttpGet("threads/{threadId}")]
    public async Task<ActionResult<List<Message>>> GetThread(
        string threadId,
        [FromServices] IThreadRepository repository,
        CancellationToken cancellationToken)
    {
        try
        {
            var messages = await repository.LoadThreadAsync(threadId, cancellationToken);
            return Ok(messages);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading thread {ThreadId}", threadId);
            return NotFound(new { error = "Thread not found" });
        }
    }
    
    [HttpDelete("threads/{threadId}")]
    public async Task<IActionResult> DeleteThread(
        string threadId,
        [FromServices] IThreadRepository repository,
        CancellationToken cancellationToken)
    {
        await repository.DeleteThreadAsync(threadId, cancellationToken);
        return NoContent();
    }
}
```

### 9.9 NuGet Package Configuration

**Hashbrown.DotNet.csproj**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <LangVersion>latest</LangVersion>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    
    <!-- NuGet Package Metadata -->
    <PackageId>Hashbrown.DotNet</PackageId>
    <Version>0.5.0-beta.1</Version>
    <Authors>Hashbrown Contributors</Authors>
    <Company>LiveLoveApp, LLC</Company>
    <Description>Microsoft Agents Framework adapter for Hashbrown - Build generative user interfaces with .NET and Azure OpenAI</Description>
    <PackageLicenseExpression>MIT</PackageLicenseExpression>
    <PackageProjectUrl>https://hashbrown.dev</PackageProjectUrl>
    <RepositoryUrl>https://github.com/hashbrownai/hashbrown</RepositoryUrl>
    <RepositoryType>git</RepositoryType>
    <PackageTags>hashbrown;dotnet;csharp;ai;generative-ui;azure-openai;agents;microsoft-agents-framework</PackageTags>
    <PackageReadmeFile>README.md</PackageReadmeFile>
    <PackageIcon>icon.png</PackageIcon>
  </PropertyGroup>

  <ItemGroup>
    <!-- Agent Framework -->
    <PackageReference Include="Microsoft.SemanticKernel.Agents" Version="1.0.0-preview" />
    <PackageReference Include="Microsoft.Extensions.AI" Version="9.0.0" />
    
    <!-- Azure OpenAI -->
    <PackageReference Include="Azure.AI.OpenAI" Version="2.0.0" />
    <PackageReference Include="Azure.Identity" Version="1.13.0" />
    
    <!-- ASP.NET Core Abstractions -->
    <PackageReference Include="Microsoft.AspNetCore.Http.Abstractions" Version="2.2.0" />
    <PackageReference Include="Microsoft.Extensions.DependencyInjection.Abstractions" Version="9.0.0" />
    <PackageReference Include="Microsoft.Extensions.Configuration.Abstractions" Version="9.0.0" />
  </ItemGroup>

  <ItemGroup>
    <None Include="README.md" Pack="true" PackagePath="/" />
    <None Include="icon.png" Pack="true" PackagePath="/" />
  </ItemGroup>
</Project>
```

**Hashbrown.DotNet.EntityFramework.csproj (Optional Companion Package)**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <PackageId>Hashbrown.DotNet.EntityFramework</PackageId>
    <Version>0.5.0-beta.1</Version>
    <Description>Entity Framework Core persistence provider for Hashbrown .NET</Description>
    <PackageLicenseExpression>MIT</PackageLicenseExpression>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\Hashbrown.DotNet\Hashbrown.DotNet.csproj" />
    
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="9.0.0" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Relational" Version="9.0.0" />
  </ItemGroup>
</Project>
```

### 9.10 Package README.md Example

Following the pattern of existing Hashbrown packages (see `packages/azure/README.md`):

````markdown
<h1 align="center">Hashbrown - Build Generative User Interfaces with .NET</h1>

<p align="center">
  <img src="https://hashbrown.dev/image/logo/brand-mark.svg" alt="Hashbrown Logo" width="144px" height="136px"/>
  <br>
  <em>Hashbrown for .NET - Microsoft Agents Framework integration</em>
</p>

## Getting Started

```bash
dotnet add package Hashbrown.DotNet
dotnet add package Hashbrown.DotNet.EntityFramework
```

Deploy an ASP.NET Core API with a /chat endpoint to use Hashbrown with Azure OpenAI.

```csharp
using Hashbrown.DotNet.Extensions;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

// Register Hashbrown services
builder.Services.AddHashbrownWithEntityFramework(
    options =>
    {
        options.AzureOpenAI.Endpoint = builder.Configuration["AzureOpenAI:Endpoint"]!;
        options.AzureOpenAI.DeploymentName = "gpt-4o";
    },
    dbOptions => dbOptions.UseSqlServer(
        builder.Configuration.GetConnectionString("Hashbrown")));

var app = builder.Build();

// Create chat endpoint
app.MapPost("/chat", async (
    [FromBody] CompletionCreateParams request,
    [FromServices] IStreamingAdapter adapter,
    HttpContext context) =>
{
    context.Response.ContentType = "application/octet-stream";
    
    var options = new StreamingOptions { Request = request };
    
    await foreach (var frame in adapter.StreamTextAsync(options, context.RequestAborted))
    {
        await context.Response.Body.WriteAsync(frame, context.RequestAborted);
        await context.Response.Body.FlushAsync(context.RequestAborted);
    }
});

app.Run();
```

## Docs

[Read the docs for Hashbrown .NET](https://hashbrown.dev/docs/dotnet/platform/azure)

## Contributing

Hashbrown is a community-driven project. Read our [contributing guidelines](https://github.com/liveloveapp/hashbrown?tab=contributing-ov-file) on how to get involved.

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
````

---

## 10. Agent Framework Best Practices

### 10.1 ChatMessageStore Implementation

**Key Principles:**
1. **Persistence**: Implement persistent storage (SQL, CosmosDB, etc.) for production
2. **Thread Isolation**: Ensure users can only access their own threads (implement authorization checks)
3. **Serialization**: Store tool calls and metadata as JSON for flexibility
4. **Performance**: Index threadId for fast retrieval

**Alternative Implementations:**
- **InMemoryChatMessageStore**: For development/testing
- **CosmosDB**: For globally distributed applications
- **Redis**: For session-based caching with TTL
- **SQL Server/PostgreSQL**: For enterprise applications

### 10.2 Agent Configuration

**ChatClientAgent Options:**
```csharp
var agent = new ChatClientAgent(
    chatClient,
    name: "hashbrown-agent",
    instructions: "You are a helpful AI assistant.",
    options: new ChatClientAgentOptions
    {
        // Register tools for function calling
        Tools = new[]
        {
            AIFunctionFactory.Create(GetWeather),
            AIFunctionFactory.Create(SearchKnowledgeBase)
        },
        // Configure temperature, top_p, etc.
        ChatOptions = new ChatOptions
        {
            Temperature = 0.7f,
            MaxTokens = 2000
        }
    }
);
```

**Tool Registration:**
```csharp
[Description("Get current weather for a location")]
public static async Task<string> GetWeather(
    [Description("City name")] string location,
    [Description("Temperature unit")] string unit = "celsius")
{
    // Implementation
    return JsonSerializer.Serialize(new { temp = 72, unit });
}
```

### 10.3 Streaming Best Practices

1. **Flush frequently**: Call `Response.Body.FlushAsync()` after each frame
2. **Set headers early**: `Content-Type`, `Cache-Control` before streaming
3. **Handle cancellation**: Pass `CancellationToken` through all async operations
4. **Buffer size**: Keep frames small (< 64KB recommended)
5. **Error frames**: Always send error frames instead of throwing exceptions mid-stream

### 10.4 Performance Considerations

1. **IChatClient Singleton**: Register as singleton for connection pooling
2. **ChatClientAgent Scoped**: Register as scoped for request-level context
3. **Memory management**: Stream directly, avoid buffering entire response
4. **Concurrency**: Use `IAsyncEnumerable` for natural backpressure
5. **Database pooling**: Configure EF Core connection pooling

### 10.5 Security Recommendations

1. **Managed Identity**: Use `DefaultAzureCredential()` for Azure OpenAI authentication
2. **Key Vault**: Store sensitive configuration in Azure Key Vault
3. **Rate Limiting**: Implement per-user/per-IP limits with ASP.NET Core middleware
4. **Input Validation**: Validate `CompletionCreateParams` with FluentValidation
5. **Thread Authorization**: Check user ownership before loading/saving threads
6. **Content Filtering**: Use Azure OpenAI Content Safety API

### 10.6 Testing Strategy

**Unit Tests:**
```csharp
[Fact]
public async Task AgentFrameworkAdapter_StreamsChunks()
{
    // Arrange
    var mockChatClient = new MockChatClient();
    var mockStore = new InMemoryChatMessageStore();
    var adapter = new AgentFrameworkAdapter(config, mockStore);
    
    // Act
    var frames = await adapter.StreamTextAsync(options).ToListAsync();
    
    // Assert
    frames.Should().Contain(f => f.Type == "generation-chunk");
}
```

**Integration Tests:**
```csharp
[Fact]
public async Task ChatController_ReturnsFrames()
{
    // Arrange
    var factory = new WebApplicationFactory<Program>();
    var client = factory.CreateClient();
    
    // Act
    var response = await client.PostAsJsonAsync("/api/chat", request);
    
    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.OK);
    response.Content.Headers.ContentType.MediaType
        .Should().Be("application/octet-stream");
}
```

### 10.7 Monitoring and Observability

**Logging with Agent Framework:**
```csharp
builder.Services.AddSingleton<IChatClient>(sp =>
{
    var chatClient = /* ... configure Azure OpenAI ... */;
    
    return chatClient
        .AsBuilder()
        .UseLogging() // Add telemetry logging
        .UseFunctionInvocation() // Enable automatic tool calling
        .Build();
});
```

**Application Insights:**
```csharp
builder.Services.AddApplicationInsightsTelemetry();

// Log custom events
_telemetryClient.TrackEvent("ChatGeneration", new Dictionary<string, string>
{
    { "Model", request.Model },
    { "ThreadId", request.ThreadId },
    { "TokensUsed", tokenCount.ToString() }
});
```

---

## 11. Key Differences: TypeScript vs .NET Core with Agent Framework

| Aspect | TypeScript (Hashbrown) | .NET Core (Agent Framework) |
|--------|------------------------|----------------------------|
| **Async Iteration** | `async function*` generators | `IAsyncEnumerable<T>` |
| **AI Provider Integration** | Direct HTTP client to OpenAI/Anthropic | `IChatClient` abstraction (Agent Framework) |
| **Thread Persistence** | Callback functions (`loadThread`/`saveThread`) | `ChatMessageStore` abstract base class |
| **Agent Pattern** | Functional composition | `ChatClientAgent` with dependency injection |
| **Tool Calling** | Manual JSON tool definitions | C# attributes via `AIFunctionFactory` |
| **Streaming** | Manual SSE parsing | Built-in streaming via `InvokeStreamingAsync` |
| **Authentication** | API Key strings | Managed Identity (`DefaultAzureCredential`) |
| **JSON Naming** | camelCase (default) | PascalCase → configure serializer |
| **Error Handling** | Try/catch + yield error frames | Same pattern with error frames |
| **Module System** | ES modules, npm packages | NuGet packages, project references |

**Key Architectural Difference:**
- **TypeScript**: Direct adapter pattern with manual HTTP streaming
- **.NET Core**: Agent Framework abstraction with built-in Azure OpenAI integration

---

## 12. Sample Request/Response

### Request (Client → Server)

```json
POST /api/chat
Content-Type: application/json

{
  "operation": "generate",
  "model": "gpt-4o-mini",
  "system": "You are a helpful assistant.",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "tools": [],
  "threadId": "thread-123"
}
```

### Response (Server → Client)

```
Binary Stream (application/octet-stream)

Frame 1: {"type":"thread-load-start"}
Frame 2: {"type":"thread-load-success","thread":[...]}
Frame 3: {"type":"generation-start"}
Frame 4: {"type":"generation-chunk","chunk":{"choices":[{"index":0,"delta":{"content":"Hello","role":"assistant"},"finishReason":null}]}}
Frame 5: {"type":"generation-chunk","chunk":{"choices":[{"index":0,"delta":{"content":"!"},"finishReason":null}]}}
Frame 6: {"type":"generation-chunk","chunk":{"choices":[{"index":0,"delta":{},"finishReason":"stop"}]}}
Frame 7: {"type":"generation-finish"}
Frame 8: {"type":"thread-save-start"}
Frame 9: {"type":"thread-save-success","threadId":"thread-123"}
```

---

## 13. Next Steps for .NET Implementation with Agent Framework

### Phase 1: Core Infrastructure
1. ✅ Define core models (`CompletionCreateParams`, `Message`, `Frame`)
2. ✅ Implement `FrameEncoder`
3. ✅ Create `IStreamingAdapter` interface
4. ✅ Design `HashbrownChatMessageStore` and `IThreadRepository`

### Phase 2: Agent Framework Integration
1. ⬜ Configure Azure OpenAI with Managed Identity
2. ⬜ Implement `AgentFrameworkAdapter` with `ChatClientAgent`
3. ⬜ Create `HashbrownChatMessageStore` with database persistence
4. ⬜ Test streaming with Azure OpenAI GPT-4o
5. ⬜ Implement tool calling via `AIFunctionFactory`

### Phase 3: ASP.NET Core API
1. ⬜ Create `ChatController` with frame streaming
2. ⬜ Configure DI container with Agent Framework services
3. ⬜ Implement Entity Framework DbContext for threads
4. ⬜ Add thread management endpoints (GET/DELETE)
5. ⬜ Implement error handling middleware

### Phase 4: Production Readiness
1. ⬜ Add authentication/authorization (Azure AD B2C)
2. ⬜ Implement rate limiting per user
3. ⬜ Configure Application Insights telemetry
4. ⬜ Add content filtering (Azure Content Safety)
5. ⬜ Set up health checks and monitoring

### Phase 5: Testing & Deployment
1. ⬜ Unit tests for adapters and frame encoding
2. ⬜ Integration tests with ChatClientAgent
3. ⬜ E2E tests with React/Angular client
4. ⬜ Load testing for concurrent streams
5. ⬜ Deploy to Azure App Service or Container Apps

---

## 14. Contribution Workflow

### 14.1 Commit Message Convention

Following [Hashbrown commit guidelines](https://github.com/liveloveapp/hashbrown/blob/main/CONTRIBUTING.md#commit):

```bash
# Feature commits
git commit -m "feat(dotnet): add azure openai streaming adapter"
git commit -m "feat(dotnet): implement ChatMessageStore persistence"

# Bug fixes
git commit -m "fix(dotnet): resolve frame encoding for special characters"

# Documentation
git commit -m "docs(dotnet): add usage examples to README"

# Tests
git commit -m "test(dotnet): add integration tests for agent streaming"

# Refactoring
git commit -m "refactor(dotnet): simplify dependency injection setup"
```

**Rules:**
- Use scope `(dotnet)` for all .NET-related commits
- Use imperative, present tense: "add" not "added" nor "adds"
- Don't capitalize first letter
- No period at the end
- Keep header under 100 characters

### 14.2 Testing Requirements

**Before submitting PR:**

```bash
# Run all tests
dotnet test

# Run specific test project
dotnet test tests/Hashbrown.DotNet.Tests/

# Run with coverage
dotnet test /p:CollectCoverage=true /p:CoverageReportsDirectory=./coverage
```

**Test Coverage Requirements:**
- ✅ Unit tests for all public APIs
- ✅ Integration tests with mocked `IChatClient`
- ✅ E2E tests with Azure OpenAI Test resource
- ✅ At least 80% code coverage for core logic

**Example Unit Test:**

```csharp
using Xunit;
using FluentAssertions;

public class FrameEncoderTests
{
    [Fact]
    public void Encode_WithValidFrame_ReturnsLengthPrefixedBytes()
    {
        // Arrange
        var frame = new { type = "test", data = "value" };
        
        // Act
        var encoded = FrameEncoder.Encode(frame);
        
        // Assert
        encoded.Should().NotBeEmpty();
        
        // First 4 bytes are big-endian length
        var length = (encoded[0] << 24) | (encoded[1] << 16) | 
                     (encoded[2] << 8) | encoded[3];
        encoded.Length.Should().Be(4 + length);
    }
}
```

### 14.3 Pull Request Checklist

Before submitting a PR:

- [ ] Code follows .NET coding conventions (see [.editorconfig](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/code-style-rule-options))
- [ ] All tests pass locally: `dotnet test`
- [ ] XML documentation added for all public APIs
- [ ] README.md updated with new features/changes
- [ ] CHANGELOG.md entry added (if applicable)
- [ ] Rebased against latest `main` branch
- [ ] No merge conflicts
- [ ] Commit messages follow convention
- [ ] PR description references issue number (if applicable)

**PR Template:**

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] feat: New feature
- [ ] fix: Bug fix
- [ ] docs: Documentation only
- [ ] test: Adding tests
- [ ] refactor: Code refactoring

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] My code follows the project's code style
- [ ] I have performed a self-review of my code
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] New and existing tests pass locally

Closes #[issue-number]
```

### 14.4 Code Review Process

1. **Automated Checks**: GitHub Actions will run:
   - Build verification on Windows/Linux/macOS
   - Unit test execution
   - Code coverage analysis
   - XML documentation validation

2. **Maintainer Review**: Core maintainers will review:
   - API design consistency with TypeScript packages
   - .NET best practices and idioms
   - Performance implications
   - Security considerations

3. **Required Approvals**: Minimum 1 approval from core maintainers

4. **Merge**: Squash and merge with descriptive commit message

### 14.5 Development Setup

```bash
# Clone repository
git clone https://github.com/hashbrownai/hashbrown.git
cd hashbrown

# Create .NET package directory
mkdir -p packages/dotnet
cd packages/dotnet

# Create solution and projects
dotnet new sln -n Hashbrown.DotNet
dotnet new classlib -n Hashbrown.DotNet -o src/Hashbrown.DotNet
dotnet new classlib -n Hashbrown.DotNet.EntityFramework -o src/Hashbrown.DotNet.EntityFramework
dotnet new xunit -n Hashbrown.DotNet.Tests -o tests/Hashbrown.DotNet.Tests

# Add projects to solution
dotnet sln add src/Hashbrown.DotNet/Hashbrown.DotNet.csproj
dotnet sln add src/Hashbrown.DotNet.EntityFramework/Hashbrown.DotNet.EntityFramework.csproj
dotnet sln add tests/Hashbrown.DotNet.Tests/Hashbrown.DotNet.Tests.csproj

# Build
dotnet build

# Run tests
dotnet test
```

### 14.6 Local Testing with Sample App

```bash
# Create sample application
cd samples
dotnet new web -n HashbrownSample
cd HashbrownSample

# Reference local package
dotnet add reference ../../src/Hashbrown.DotNet/Hashbrown.DotNet.csproj

# Run sample
dotnet run
```

Test with existing React/Angular clients by pointing them to `http://localhost:5000/api/chat`.

### Package Dependencies

**Hashbrown.DotNet.csproj (Main Package)**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    
    <!-- NuGet Package Metadata -->
    <PackageId>Hashbrown.DotNet</PackageId>
    <Version>0.5.0-beta.1</Version>
    <Authors>Hashbrown Contributors</Authors>
    <Description>Microsoft Agents Framework adapter for Hashbrown - Build generative user interfaces with .NET</Description>
    <PackageLicenseExpression>MIT</PackageLicenseExpression>
    <PackageProjectUrl>https://hashbrown.dev</PackageProjectUrl>
    <RepositoryUrl>https://github.com/hashbrownai/hashbrown</RepositoryUrl>
    <RepositoryType>git</RepositoryType>
    <PackageTags>hashbrown;dotnet;csharp;ai;generative-ui;azure-openai;agents</PackageTags>
    <PackageReadmeFile>README.md</PackageReadmeFile>
  </PropertyGroup>

  <ItemGroup>
    <!-- Agent Framework -->
    <PackageReference Include="Microsoft.SemanticKernel.Agents" Version="1.0.0-preview" />
    <PackageReference Include="Microsoft.Extensions.AI" Version="9.0.0" />
    
    <!-- Azure OpenAI -->
    <PackageReference Include="Azure.AI.OpenAI" Version="2.0.0" />
    <PackageReference Include="Azure.Identity" Version="1.13.0" />
    
    <!-- ASP.NET Core -->
    <PackageReference Include="Microsoft.AspNetCore.Http.Abstractions" Version="2.2.0" />
    <PackageReference Include="Microsoft.Extensions.DependencyInjection.Abstractions" Version="9.0.0" />
  </ItemGroup>

  <ItemGroup>
    <None Include="README.md" Pack="true" PackagePath="/" />
  </ItemGroup>
</Project>
```

**Hashbrown.DotNet.EntityFramework.csproj (Optional EF Package)**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <PackageId>Hashbrown.DotNet.EntityFramework</PackageId>
    <Version>0.5.0-beta.1</Version>
    <Description>Entity Framework Core persistence for Hashbrown .NET</Description>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\Hashbrown.DotNet\Hashbrown.DotNet.csproj" />
    
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="9.0.0" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Relational" Version="9.0.0" />
  </ItemGroup>
</Project>
```

---

## 14. References

### TypeScript Source Files

- **OpenAI Adapter**: `packages/openai/src/stream/text.fn.ts`
- **Core Models**: `packages/core/src/models/api.models.ts`
- **Frame Types**: `packages/core/src/frames/frame-types.ts`
- **Frame Encoder**: `packages/core/src/frames/encode-frame.ts`
- **HTTP Transport**: `packages/core/src/transport/http-transport.ts`
- **Message Threading**: `packages/core/src/utils/threading.ts`
- **Assistant Message**: `packages/core/src/utils/assistant-message.ts`

### External Documentation

- OpenAI API: https://platform.openai.com/docs/api-reference/chat
- Anthropic API: https://docs.anthropic.com/claude/reference
- Azure OpenAI: https://learn.microsoft.com/azure/ai-services/openai/
- Google Gemini: https://ai.google.dev/docs

---

## 15. Conclusion

The Hashbrown architecture is designed for **streaming-first generative UI** with a vendor-agnostic protocol. The .NET Core implementation with **Microsoft Agents Framework** provides a modern, enterprise-ready approach:

### Key Implementation Principles

1. **Preserve the frame protocol**: Clients expect length-prefixed binary frames—this remains unchanged
2. **Support all frame types**: Generation, thread, error frames must be wire-compatible with TypeScript
3. **Use ChatMessageStore**: Replace callback-based thread persistence with Agent Framework's `ChatMessageStore`
4. **Leverage ChatClientAgent**: Use built-in Azure OpenAI integration instead of manual HTTP streaming
5. **Stream efficiently**: Use `IAsyncEnumerable<byte[]>` with proper backpressure and error handling

### Architecture Benefits

**Microsoft Agents Framework provides:**
- ✅ **Built-in Azure OpenAI integration** with Managed Identity support
- ✅ **Structured conversation management** via `AgentThread` and `ChatMessageStore`
- ✅ **Automatic tool calling** with C# attributes and reflection
- ✅ **Middleware support** for logging, telemetry, and custom processing
- ✅ **Production-ready abstractions** from Microsoft AI ecosystem

**Compared to direct HTTP integration:**
- No manual SSE parsing required
- No API key management in code
- Built-in retry logic and error handling
- Standardized `IChatClient` interface for testability
- Future-proof as Microsoft evolves AI SDKs

### Integration Strategy

The key insight is that Hashbrown's server agents are **transformation and streaming layers** between:
- **Client**: Standardized Hashbrown frame protocol (binary length-prefixed JSON)
- **AI Provider**: Azure OpenAI via Agent Framework's `IChatClient` abstraction

By implementing the patterns documented here, a .NET Core server can:
1. Seamlessly integrate with existing React/Angular Hashbrown clients
2. Persist conversations to any database via `ChatMessageStore`
3. Leverage enterprise auth with Azure Managed Identity
4. Scale with Azure App Service, Container Apps, or Kubernetes
5. Monitor with Application Insights and Azure Monitor

### Future Enhancements

- **Multi-agent orchestration**: Use Agent Framework's group chat patterns
- **Retrieval-augmented generation**: Integrate Azure AI Search
- **Custom middleware**: Add caching, content filtering, PII redaction
- **Hybrid cloud**: Support both Azure OpenAI and OpenAI.com
- **Streaming function calls**: Real-time tool execution with progress updates

---

**Document Version**: 2.0 (Microsoft Agents Framework)  
**Last Updated**: 2026-02-11  
**Author**: Technical Analysis of Hashbrown TypeScript→.NET Core Migration
