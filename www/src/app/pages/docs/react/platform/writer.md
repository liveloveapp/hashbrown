# Writer

First, install the Writer adapter package:

```sh
npm install @hashbrownai/writer
```

## Streaming Text Responses

Hashbrown’s Writer adapter lets you **stream chat completions** from Writer models, including support for function calling, response schemas, and request transforms.

### API Reference

#### `HashbrownWriter.stream.text(options)`

Streams a Writer chat completion as a series of encoded frames. Handles content, tool calls, and errors, and yields each frame as a `Uint8Array`.

**Options:**

| Name                      | Type                                    | Description                                                                    |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `apiKey`                  | `string`                                | Your Writer API key.                                                           |
| `request`                 | `Chat.Api.CompletionCreateParams`       | The chat request: model, messages, tools, system, responseFormat, etc.         |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transform or override the final Writer request before it is sent. |

**Supported Features:**

- **Roles:** `user`, `assistant`, `tool`
- **Tools:** Supports Writer function calling, including `toolCalls` and strict function schemas.
- **Response Format:** Optionally specify a JSON schema for structured output (Writer’s `response_format` parameter).
- **System Prompt:** Included as the first message if provided.
- **Function Calling:** Handles Writer function calling modes and emits tool call frames.
- **Streaming:** Each chunk/frame is encoded into a resilient streaming format.

### How It Works

- **Messages:** Translated to Writer’s message format, supporting all roles and tool calls.
- **Tools/Functions:** Tools are passed as function definitions, using your JSON schemas as `parameters`.
- **Response Format:** Pass a JSON schema in `responseFormat` for Writer to validate the model output.
- **Streaming:** All data is sent as a stream of encoded frames (`Uint8Array`). Chunks may contain text, tool calls, errors, or finish signals.
- **Error Handling:** Any thrown errors are sent as error frames before the stream ends.

### Example: Using with Express

```ts
import { HashbrownWriter } from '@hashbrownai/writer';
import { decodeFrame } from '@hashbrownai/core';

app.post('/chat', async (req, res) => {
  const stream = HashbrownWriter.stream.text({
    apiKey: process.env.WRITER_API_KEY!,
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

### Advanced: Tools, Function Calling, and Response Schema

- **Tools:** Add tools using function specs (name, description, parameters) compatible with Writer.
- **Function Calling:** Supported via `toolChoice` (`auto`, `required`, `none`, etc.).
- **Response Format:** Pass a JSON schema in `responseFormat` for Writer to return validated structured output.
