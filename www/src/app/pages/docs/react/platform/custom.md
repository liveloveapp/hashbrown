# Custom Adapter (React)

Hashbrown uses the adapter pattern to support multiple AI providers. While we provide official adapters for popular platforms, you can create custom adapters for any LLM provider that supports streaming chat completions.

## Overview

A Hashbrown adapter is a package that implements the streaming interface for a specific AI provider. The adapter:

1. Accepts a standardized request format (`Chat.Api.CompletionCreateParams`)
2. Streams responses as encoded frames (`Uint8Array`)
3. Handles tool calling, structured outputs, and error conditions
4. Uses the provider's native SDK or API

## Core Interfaces

### Request Format

```ts
interface CompletionCreateParams {
  model: KnownModelIds;
  system: string;
  messages: Message[];
  responseFormat?: object;
  toolChoice?: 'auto' | 'none' | 'required';
  tools?: Tool[];
}
```

### Response Format

Adapters return an async generator that yields encoded frames:

```ts
export async function* text(options: CustomAdapterOptions): AsyncIterable<Uint8Array>
```

## Implementation Guide

### 1. Create Package Structure

```sh
mkdir packages/custom-adapter
cd packages/custom-adapter
npm init -y
```

### 2. Define Package Dependencies

```json
{
  "name": "@your-org/custom-adapter",
  "version": "1.0.0",
  "dependencies": {
    "@hashbrownai/core": "^0.3.0",
    "your-provider-sdk": "^1.0.0"
  }
}
```

### 3. Implement the Adapter

```ts
// src/stream/text.fn.ts
import { Chat, encodeFrame, Frame } from '@hashbrownai/core';
import { YourProviderSDK } from 'your-provider-sdk';

export interface CustomAdapterOptions {
  apiKey: string;
  baseURL?: string;
  request: Chat.Api.CompletionCreateParams;
  transformRequestOptions?: (options: any) => any | Promise<any>;
}

export async function* text(options: CustomAdapterOptions): AsyncIterable<Uint8Array> {
  const { apiKey, baseURL, request, transformRequestOptions } = options;
  const { messages, model, tools, responseFormat, toolChoice, system } = request;

  const client = new YourProviderSDK({ apiKey, baseURL });

  try {
    // Transform messages to provider format
    const providerMessages = transformMessages(messages, system);

    // Transform tools to provider format
    const providerTools = tools ? transformTools(tools) : undefined;

    // Prepare request options
    const baseOptions = {
      model: model as string,
      messages: providerMessages,
      tools: providerTools,
      toolChoice,
      responseFormat,
      stream: true,
    };

    // Apply transformations if provided
    const resolvedOptions = transformRequestOptions
      ? await transformRequestOptions(baseOptions)
      : baseOptions;

    // Create streaming request
    const stream = client.chat.completions.create(resolvedOptions);

    // Process streaming response
    for await (const chunk of stream) {
      const chunkMessage: Chat.Api.CompletionChunk = {
        choices: chunk.choices.map(choice => ({
          index: choice.index,
          delta: {
            content: choice.delta.content,
            role: choice.delta.role,
            toolCalls: choice.delta.tool_calls,
          },
          finishReason: choice.finish_reason,
        })),
      };

      const frame: Frame = {
        type: 'chunk',
        chunk: chunkMessage,
      };

      yield encodeFrame(frame);
    }
  } catch (error: unknown) {
    const frame: Frame = {
      type: 'error',
      error: error instanceof Error ? error.toString() : String(error),
      stacktrace: error instanceof Error ? error.stack : undefined,
    };

    yield encodeFrame(frame);
  } finally {
    const frame: Frame = {
      type: 'finish',
    };

    yield encodeFrame(frame);
  }
}

// Helper functions
function transformMessages(messages: Chat.Api.Message[], system: string): any[] {
  const systemMessage = system ? [{ role: 'system', content: system }] : [];

  return [
    ...systemMessage,
    ...messages.map(message => {
      switch (message.role) {
        case 'user':
          return { role: message.role, content: message.content };
        case 'assistant':
          return {
            role: message.role,
            content: message.content,
            tool_calls: message.toolCalls,
          };
        case 'tool':
          return {
            role: message.role,
            content: JSON.stringify(message.content),
            tool_call_id: message.toolCallId,
          };
        default:
          throw new Error(`Unsupported message role: ${message.role}`);
      }
    }),
  ];
}

function transformTools(tools: Chat.Api.Tool[]): any[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
```

### 4. Export the Adapter

```ts
// src/index.ts
import { text } from './stream/text.fn';

export const CustomAdapter = {
  stream: {
    text,
  },
};
```

### 5. Add TypeScript Configuration

```json
// tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Usage Example

```ts
import { CustomAdapter } from '@your-org/custom-adapter';

app.post('/chat', async (req, res) => {
  const stream = CustomAdapter.stream.text({
    apiKey: process.env.CUSTOM_API_KEY!,
    request: req.body, // Chat.Api.CompletionCreateParams
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
});
```

## Key Considerations

### Message Transformation

- Convert Hashbrown's message format to your provider's format
- Handle all message roles: `user`, `assistant`, `tool`
- Include system messages appropriately
- Serialize tool call arguments as JSON strings

### Tool Calling

- Transform Hashbrown tool definitions to provider format
- Handle tool choice options (`auto`, `none`, `required`)
- Process tool call deltas in streaming responses
- Maintain tool call IDs for proper correlation

### Error Handling

- Catch and wrap provider errors
- Yield error frames with descriptive messages
- Include stack traces when available
- Always yield a finish frame

### Streaming

- Process chunks as they arrive
- Encode each chunk as a frame using `encodeFrame()`
- Handle partial responses and deltas
- Maintain proper finish reason handling

## Advanced Features

### Transform Request Options

Allow users to modify requests before sending:

```ts
export interface CustomAdapterOptions {
  transformRequestOptions?: (options: ProviderRequest) => ProviderRequest | Promise<ProviderRequest>;
}
```

### Custom Configuration

Add provider-specific options:

```ts
export interface CustomAdapterOptions {
  apiKey: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  // ... other provider-specific options
}
```

## Testing Your Adapter

Create comprehensive tests for your adapter:

```ts
// Test basic streaming
// Test tool calling
// Test error handling
// Test message transformation
// Test request transformation
```

## Publishing

1. Build your package: `npm run build`
2. Publish to npm: `npm publish`
3. Users can install: `npm install @your-org/custom-adapter`

## Need Help?

If you encounter issues implementing a custom adapter:

- Check the [OpenAI adapter](https://github.com/liveloveapp/hashbrown/tree/main/packages/openai) as a reference
- Review the [core types](https://github.com/liveloveapp/hashbrown/tree/main/packages/core/src/models)
- Open an issue on [GitHub](https://github.com/liveloveapp/hashbrown/issues) for guidance

Custom adapters enable Hashbrown to work with any AI provider, making it a truly extensible framework for AI-powered applications.