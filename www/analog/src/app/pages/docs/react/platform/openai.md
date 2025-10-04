---
title: 'OpenAI (React): Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s OpenAI adapter lets you stream chat completions from OpenAI’s GPT models, including support for tool calling, response schemas, and request transforms.'
---
# OpenAI (React)

First, install the OpenAI adapter package:

```sh
npm install @hashbrownai/openai
```

## Streaming Text Responses

Hashbrown’s OpenAI adapter lets you **stream chat completions** from OpenAI’s GPT models, including support for tool calling, response schemas, and request transforms.

### API Reference

#### `HashbrownOpenAI.stream.text(options)`

Streams an OpenAI chat completion as a series of encoded frames. Handles content, tool calls, and errors, and yields each frame as a `Uint8Array`.

**Options:**

| Name                      | Type                                    | Description                                                                    |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `apiKey`                  | `string`                                | Your OpenAI API Key.                                                           |
| `request`                 | `Chat.Api.CompletionCreateParams`       | The chat request: model, messages, tools, system, responseFormat, etc.         |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transform or override the final OpenAI request before it is sent. |

**Supported Features:**

- **Roles:** `user`, `assistant`, `tool`
- **Tools:** Supports OpenAI tool calling, including `toolCalls` and strict function schemas.
- **Response Format:** Optionally specify a JSON schema for structured output (uses OpenAI’s `response_format` parameter).
- **System Prompt:** Included as the first message if provided.
- **Tool Calling:** Handles OpenAI tool calling modes and emits tool call frames.
- **Streaming:** Each chunk is encoded into a resilient streaming format

### How It Works

- **Messages:** Translated to OpenAI’s message format, supporting all roles and tool calls.
- **Tools/Functions:** Tools are passed as OpenAI function definitions, using your JSON schemas as `parameters`.
- **Response Format:** Pass a JSON schema in `responseFormat` for OpenAI to validate the model output.
- **Streaming:** All data is sent as a stream of encoded frames (`Uint8Array`). Chunks may contain text, tool calls, errors, or finish signals.
- **Error Handling:** Any thrown errors are sent as error frames before the stream ends.

### Example: Using with Express

```ts
import { HashbrownOpenAI } from '@hashbrownai/openai';

app.post('/chat', async (req, res) => {
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    request: req.body, // must be Chat.Api.CompletionCreateParams
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk); // Pipe each encoded frame as it arrives
  }

  res.end();
});
```

---

### Transform Request Options

The `transformRequestOptions` parameter allows you to intercept and modify the request before it's sent to OpenAI. This is useful for server-side prompts, message filtering, logging, and dynamic configuration.

```ts
app.post('/chat', async (req, res) => {
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    request: req.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add server-side system prompt
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          ...options.messages,
        ],
        // Adjust temperature based on user preferences
        temperature: getUserPreferences(req.user.id).creativity,
      };
    },
  });

  // ... rest of the code
});
```

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)

---

### Advanced: Tools and Response Schema

- **Tools:** Add tools using OpenAI-style function specs (name, description, parameters).
- **Tool Calling:** Supported via `toolChoice` (`auto`, `required`, `none`, etc.).
- **Response Format:** Pass a JSON schema in `responseFormat` for OpenAI to return validated structured output.
