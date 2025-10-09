<h1 align="center">Hashbrown - Build Generative User Interfaces</h1>

<p align="center">
  <img src="https://hashbrown.dev/image/logo/brand-mark.svg" alt="Hashbrown Logo" width="144px" height="136px"/>
  <br>
  <em>Hashbrown is an open-source framework for building user interfaces
    <br />that converse with users, dynamically reorganize, and even code themselves.</em>
  <br>
</p>

<p align="center">
  <a href="https://hashbrown.dev/"><strong>hashbrown.dev</strong></a>
  <br>
</p>

## Getting Started

### Installation

```sh
npm install @hashbrownai/anthropic --save
```

You'll also need to install the Anthropic SDK as a peer dependency:

```sh
npm install @anthropic-ai/sdk --save
```

### Basic Usage

Deploy an express server with a single `/chat` endpoint to use Hashbrown with Anthropic.

```ts
import { HashbrownAnthropic } from '@hashbrownai/anthropic';

app.post('/chat', async (req, res) => {
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    request: req.body, // must be Chat.Api.CompletionCreateParams
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk); // Pipe each encoded frame as it arrives
  }

  res.end();
});
```

### Advanced Usage with Custom Base URL

```ts
import { HashbrownAnthropic } from '@hashbrownai/anthropic';

const stream = HashbrownAnthropic.stream.text({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  baseURL: 'https://api.anthropic.com', // Optional custom base URL
  request: {
    model: 'claude-3-5-sonnet-20241022',
    system: 'You are a helpful assistant.',
    messages: [
      {
        role: 'user',
        content: 'Hello, how are you?',
      },
    ],
    // Optional: Add tools for function calling
    tools: [
      {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
          },
          required: ['location'],
        },
      },
    ],
    toolChoice: 'auto',
    // Optional: Add structured output schema
    responseFormat: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['answer'],
    },
  },
  // Optional: Transform request options before sending to Anthropic
  transformRequestOptions: (options) => {
    // Modify options as needed
    return {
      ...options,
      max_tokens: 1000, // Override max tokens
    };
  },
});
```

## API Reference

### `HashbrownAnthropic.stream.text(options)`

Creates a streaming text completion using Anthropic's Claude models.

#### Parameters

- `options.apiKey` (string, required): Your Anthropic API key
- `options.baseURL` (string, optional): Custom base URL for Anthropic API
- `options.request` (Chat.Api.CompletionCreateParams, required): The completion request parameters
- `options.transformRequestOptions` (function, optional): Function to modify request options before sending

#### Returns

An async iterable that yields `Uint8Array` chunks encoded with Hashbrown's frame protocol.

## Supported Features

- ✅ **Text Streaming**: Real-time streaming of text completions
- ✅ **Tool Calling**: Function calling with automatic tool execution
- ✅ **Structured Output**: JSON schema validation for responses
- ✅ **System Messages**: Custom system prompts and instructions
- ✅ **Message History**: Full conversation context support
- ✅ **Error Handling**: Proper error propagation through the stream

## Models

The adapter supports all Anthropic Claude models:

- `claude-3-5-sonnet-20241022` (recommended)
- `claude-3-5-haiku-20241022`
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

## Docs

[Read the docs for the Hashbrown Anthropic adapter](https://hashbrown.dev/docs/react/platform/anthropic).

## Contributing

hashbrown is a community-driven project. Read our [contributing guidelines](https://github.com/liveloveapp/hashbrown?tab=contributing-ov-file) on how to get involved.

## Workshops and Consulting

Want to learn how to build web apps with AI? [Learn more about our workshops](https://hashbrown.dev/workshops).

LiveLoveApp provides hands-on engagement with our AI engineers for architecture reviews, custom integrations, proof-of-concept builds, performance tuning, and expert guidance on best practices. [Learn more about LiveLoveApp](https://liveloveapp.com).

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
