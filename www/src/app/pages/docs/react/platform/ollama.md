---
title: 'Ollama: Hashbrown React Docs'
meta:
  - name: description
    content: 'First, install the Ollama adapter package:'
---
# Ollama

First, install the Ollama adapter package:

<hb-code-example header="terminal">

```sh
npm install @hashbrownai/ollama
```

</hb-code-example>

---

## `HashbrownOllama.stream.text(options)`

Streams an Ollama chat completion as a series of encoded frames. Handles content, tool calls, and errors, and yields each frame as a `Uint8Array`.

**Options:**

| Name           | Type                              | Description                                                                                        |
| -------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `turbo.apiKey` | `string`                          | _(Optional)_ Use Ollama Turbo by providing an API key. Defaults to local Ollama via `OLLAMA_HOST`. |
| `request`      | `Chat.Api.CompletionCreateParams` | The chat request: model, messages, tools, system, `responseFormat`, etc.                           |

**Supported Features:**

- **Roles:** `user`, `assistant`, `tool`
- **Tools:** Function calling with strict function schemas
- **Response Format:** Optionally specify a JSON schema in `responseFormat` (forwarded to Ollama `format`)
- **System Prompt:** Included as the first message if provided
- **Streaming:** Each chunk is encoded into a resilient streaming format
- **Local or Turbo:** Connects to local Ollama by default; set `turbo.apiKey` to use Ollama Turbo

---

## How It Works

- **Messages:** Translated to Ollama’s message format, supporting `user`, `assistant`, and `tool` roles. Tool results are stringified as tool messages.
- **Tools/Functions:** Tools are passed as function definitions with `name`, `description`, and JSON Schema `parameters` (`strict: true`).
- **Response Format:** Pass a JSON schema in `responseFormat`; forwarded to Ollama as `format` for structured output.
- **Streaming:** All data is sent as a stream of encoded frames (`Uint8Array`). Chunks may contain text, tool calls, errors, or finish signals.
- **Client Selection:**
  - Default: local Ollama via the `ollama` Node client (honors `OLLAMA_HOST`)
  - Turbo: set `turbo.apiKey` to route via Turbo
- **Error Handling:** Any thrown errors are sent as error frames before the stream ends.

---

## Example Using with Express

```ts
import { HashbrownOllama } from '@hashbrownai/ollama';

app.post('/chat', async (req, res) => {
  const stream = HashbrownOllama.stream.text({
    // Optional: use Ollama Turbo
    // turbo: { apiKey: process.env.OLLAMA_API_KEY! },
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

## Advanced: Tools, Function Calling, and Response Schema

- **Tools:** Add tools using function specs (name, description, parameters as JSON Schema). The adapter forwards them to Ollama with `strict` mode enabled.
- **Function Calling:** Ollama can return `tool_calls` which are streamed as frames; execute your tool and continue the conversation by sending a `tool` message.
- **Response Format:** Pass a JSON schema in `responseFormat` to request validated structured output from models that support it.
