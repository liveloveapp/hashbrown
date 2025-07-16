# Google Gemini (React)

First, install the Google adapter package:

```sh
npm install @hashbrownai/google
```

## Streaming Text Responses

Hashbrown’s Google Gemini adapter lets you **stream chat completions** from Google Gemini models, handling function calls, response schemas, and request transforms.

### API Reference

#### `HashbrownGoogle.stream.text(options)`

Streams a Gemini chat completion as a series of encoded frames. Handles content, tool calls, and errors, and yields each frame as a `Uint8Array`.

**Options:**

| Name                      | Type                                    | Description                                                                    |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `apiKey`                  | `string`                                | Your Google Gemini API Key.                                                    |
| `request`                 | `Chat.Api.CompletionCreateParams`       | The chat request: model, messages, tools, system, responseFormat, etc.         |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transform or override the final Gemini request before it is sent. |

**Supported Features:**

- **Roles:** `user`, `assistant`, `tool`, `error`
- **Tools:** Supports function calling with OpenAPI schemas automatically converted to Gemini format.
- **Response Format:** Optionally specify a JSON schema for model output validation.
- **System Prompt:** Included as Gemini’s `systemInstruction`.
- **Function Calling:** Handles Gemini’s tool/function-calling modes and emits tool call frames.
- **Streaming:** Each chunk/frame is encoded using `@hashbrownai/core`’s `encodeFrame`.

### How It Works

- **Messages** are mapped to Gemini's `Content` objects, including tool calls and tool responses.
- **Tools/Functions:** Tools are converted to Gemini `FunctionDeclaration` format, including parameter schema conversion via OpenAPI.
- **Response Schema:** If you specify `responseFormat`, it's converted and set as `responseSchema` for Gemini.
- **Streaming:** All data is sent as a stream of encoded frames (`Uint8Array`). Chunks may contain text, tool calls, errors, or finish signals.
- **Error Handling:** Any thrown errors are sent as error frames before the stream ends.

### Example: Using with Express

```ts
import { HashbrownGoogle } from '@hashbrownai/google';
import { decodeFrame } from '@hashbrownai/core';

app.post('/chat', async (req, res) => {
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
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

- **Tools:** Add tools using OpenAI-style function specs. They will be auto-converted for Gemini.
- **Function Calling:** Supported via Gemini’s tool configuration, with control over `auto`, `required`, or `none` modes.
- **Response Format:** Pass a JSON schema in `responseFormat` for structured output.
