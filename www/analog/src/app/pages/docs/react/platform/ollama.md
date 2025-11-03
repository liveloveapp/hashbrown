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

| Name                       | Type                              | Description                                                                                        |
| -------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `turbo.apiKey`             | `string`                          | _(Optional)_ Use Ollama Turbo by providing an API key. Defaults to local Ollama via `OLLAMA_HOST`. |
| `request`                  | `Chat.Api.CompletionCreateParams` | The chat request: model, messages, tools, system, `responseFormat`, etc.                           |
| `transformRequestOptions`  | `function`                        | _(Optional)_ Async function to transform Ollama request options before sending (e.g., for `think` parameter). |

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

## Example: Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownOllama } from '@hashbrownai/ollama';
import express from 'express';

const app = express();
app.use(express.json());

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

app.listen(3000);
```

</div>

<div backend="fastify">

```ts
import { HashbrownOllama } from '@hashbrownai/ollama';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownOllama.stream.text({
    // Optional: use Ollama Turbo
    // turbo: { apiKey: process.env.OLLAMA_API_KEY! },
    request: request.body, // must be Chat.Api.CompletionCreateParams
  });

  reply.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    reply.raw.write(chunk); // Pipe each encoded frame as it arrives
  }

  reply.raw.end();
});

fastify.listen({ port: 3000 });
```

</div>

<div backend="nestjs">

```ts
import { Controller, Post, Body, Res } from '@nestjs/common';
import { HashbrownOllama } from '@hashbrownai/ollama';
import { Response } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Res() res: Response) {
    const stream = HashbrownOllama.stream.text({
      // Optional: use Ollama Turbo
      // turbo: { apiKey: process.env.OLLAMA_API_KEY! },
      request: body, // must be Chat.Api.CompletionCreateParams
    });

    res.header('Content-Type', 'application/octet-stream');

    for await (const chunk of stream) {
      res.write(chunk); // Pipe each encoded frame as it arrives
    }

    res.end();
  }
}
```

</div>

<div backend="hono">

```ts
import { HashbrownOllama } from '@hashbrownai/ollama';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();
  
  const stream = HashbrownOllama.stream.text({
    // Optional: use Ollama Turbo
    // turbo: { apiKey: process.env.OLLAMA_API_KEY! },
    request: body, // must be Chat.Api.CompletionCreateParams
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(chunk); // Pipe each encoded frame as it arrives
        }
        controller.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    }
  );
});

export default app;
```

</div>

</hb-backend-code-example>

---

---

### Transform Request Options

The `transformRequestOptions` parameter allows you to intercept and modify the request before it's sent to Ollama. This is useful for server-side prompts, message filtering, logging, and dynamic configuration.

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownOllama } from '@hashbrownai/ollama';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const stream = HashbrownOllama.stream.text({
    request: req.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add server-side system prompt
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          ...options.messages,
        ],
        // Adjust parameters based on user preferences
        temperature: getUserPreferences(req.user.id).creativity,
      };
    },
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
});
```

</div>

<div backend="fastify">

```ts
import { HashbrownOllama } from '@hashbrownai/ollama';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownOllama.stream.text({
    request: request.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add server-side system prompt
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          ...options.messages,
        ],
        // Adjust parameters based on user preferences
        temperature: getUserPreferences(request.user.id).creativity,
      };
    },
  });

  reply.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    reply.raw.write(chunk);
  }

  reply.raw.end();
});
```

</div>

<div backend="nestjs">

```ts
import { Controller, Post, Body, Res, Req } from '@nestjs/common';
import { HashbrownOllama } from '@hashbrownai/ollama';
import { Response, Request } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const stream = HashbrownOllama.stream.text({
      request: body,
      transformRequestOptions: (options) => {
        return {
          ...options,
          // Add server-side system prompt
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            ...options.messages,
          ],
          // Adjust parameters based on user preferences
          temperature: getUserPreferences(req.user.id).creativity,
        };
      },
    });

    res.header('Content-Type', 'application/octet-stream');

    for await (const chunk of stream) {
      res.write(chunk);
    }

    res.end();
  }
}
```

</div>

<div backend="hono">

```ts
import { HashbrownOllama } from '@hashbrownai/ollama';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();
  
  const stream = HashbrownOllama.stream.text({
    request: body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add server-side system prompt
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          ...options.messages,
        ],
        // Adjust parameters based on user preferences
        temperature: getUserPreferences(c.req.user.id).creativity,
      };
    },
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    }
  );
});
```

</div>

</hb-backend-code-example>

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)

---

## Advanced: Tools, Function Calling, and Response Schema

- **Tools:** Add tools using function specs (name, description, parameters as JSON Schema). The adapter forwards them to Ollama with `strict` mode enabled.
- **Function Calling:** Ollama can return `tool_calls` which are streamed as frames; execute your tool and continue the conversation by sending a `tool` message.
- **Response Format:** Pass a JSON schema in `responseFormat` to request validated structured output from models that support it.

---

## Using Extended Thinking with DeepSeek Models

DeepSeek R1 and similar models support an extended thinking mode via the `think` parameter. You can enable this using `transformRequestOptions`:

```ts
import { HashbrownOllama } from '@hashbrownai/ollama';

app.post('/chat', async (req, res) => {
  const stream = HashbrownOllama.stream.text({
    request: req.body,
    transformRequestOptions: async (options) => ({
      ...options,
      think: true, // Enable extended thinking for DeepSeek R1
    }),
  });

  res.header('Content-Type', 'application/octet-stream');
  for await (const chunk of stream) {
    res.write(chunk);
  }
  res.end();
});
```

The `think` parameter accepts:
- `true` - Enable thinking
- `false` - Disable thinking (default)
