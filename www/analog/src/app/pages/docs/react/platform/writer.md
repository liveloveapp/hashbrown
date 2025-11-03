---
title: 'Writer (React): Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s Writer adapter lets you stream chat completions from Writer models, including support for tool calling, response schemas, and request transforms.'
---
# Writer (React)

First, install the Writer adapter package:

```sh
npm install @hashbrownai/writer
```

## Streaming Text Responses

Hashbrown’s Writer adapter lets you **stream chat completions** from Writer models, including support for tool calling, response schemas, and request transforms.

### API Reference

#### `HashbrownWriter.stream.text(options)`

Streams a Writer chat completion as a series of encoded frames. Handles content, tool calls, and errors, and yields each frame as a `Uint8Array`.

**Options:**

| Name                      | Type                                    | Description                                                                    |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `apiKey`                  | `string`                                | Your Writer API Key.                                                           |
| `request`                 | `Chat.Api.CompletionCreateParams`       | The chat request: model, messages, tools, system, responseFormat, etc.         |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transform or override the final Writer request before it is sent. |

**Supported Features:**

- **Roles:** `user`, `assistant`, `tool`
- **Tools:** Supports Writer tool calling, including `toolCalls` and strict function schemas.
- **Response Format:** Optionally specify a JSON schema for structured output (Writer’s `response_format` parameter).
- **System Prompt:** Included as the first message if provided.
- **Tool Calling:** Handles Writer tool calling modes and emits tool call frames.
- **Streaming:** Each chunk/frame is encoded into a resilient streaming format.

### How It Works

- **Messages:** Translated to Writer’s message format, supporting all roles and tool calls.
- **Tools/Functions:** Tools are passed as function definitions, using your JSON schemas as `parameters`.
- **Response Format:** Pass a JSON schema in `responseFormat` for Writer to validate the model output.
- **Streaming:** All data is sent as a stream of encoded frames (`Uint8Array`). Chunks may contain text, tool calls, errors, or finish signals.
- **Error Handling:** Any thrown errors are sent as error frames before the stream ends.

### Example: Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownWriter } from '@hashbrownai/writer';
import express from 'express';

const app = express();
app.use(express.json());

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

app.listen(3000);
```

</div>

<div backend="fastify">

```ts
import { HashbrownWriter } from '@hashbrownai/writer';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownWriter.stream.text({
    apiKey: process.env.WRITER_API_KEY!,
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
import { HashbrownWriter } from '@hashbrownai/writer';
import { Response } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Res() res: Response) {
    const stream = HashbrownWriter.stream.text({
      apiKey: process.env.WRITER_API_KEY!,
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
import { HashbrownWriter } from '@hashbrownai/writer';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();
  
  const stream = HashbrownWriter.stream.text({
    apiKey: process.env.WRITER_API_KEY!,
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

The `transformRequestOptions` parameter allows you to intercept and modify the request before it's sent to Writer. This is useful for server-side prompts, message filtering, logging, and dynamic configuration.

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownWriter } from '@hashbrownai/writer';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const stream = HashbrownWriter.stream.text({
    apiKey: process.env.WRITER_API_KEY!,
    request: req.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add server-side system prompt
        messages: [
          { role: 'system', content: 'You are a helpful AI writing assistant.' },
          ...options.messages,
        ],
        // Adjust parameters based on writing task
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
import { HashbrownWriter } from '@hashbrownai/writer';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownWriter.stream.text({
    apiKey: process.env.WRITER_API_KEY!,
    request: request.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add server-side system prompt
        messages: [
          { role: 'system', content: 'You are a helpful AI writing assistant.' },
          ...options.messages,
        ],
        // Adjust parameters based on writing task
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
import { HashbrownWriter } from '@hashbrownai/writer';
import { Response, Request } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const stream = HashbrownWriter.stream.text({
      apiKey: process.env.WRITER_API_KEY!,
      request: body,
      transformRequestOptions: (options) => {
        return {
          ...options,
          // Add server-side system prompt
          messages: [
            { role: 'system', content: 'You are a helpful AI writing assistant.' },
            ...options.messages,
          ],
          // Adjust parameters based on writing task
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
import { HashbrownWriter } from '@hashbrownai/writer';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();
  
  const stream = HashbrownWriter.stream.text({
    apiKey: process.env.WRITER_API_KEY!,
    request: body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add server-side system prompt
        messages: [
          { role: 'system', content: 'You are a helpful AI writing assistant.' },
          ...options.messages,
        ],
        // Adjust parameters based on writing task
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

### Advanced: Tools and Response Schema

- **Tools:** Add tools using function specs (name, description, parameters) compatible with Writer.
- **Tool Calling:** Supported via `toolChoice` (`auto`, `required`, `none`, etc.).
- **Response Format:** Pass a JSON schema in `responseFormat` for Writer to return validated structured output.
