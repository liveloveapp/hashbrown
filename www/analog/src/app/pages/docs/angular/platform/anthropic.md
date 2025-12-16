---
title: 'Anthropic: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Hashbrown’s Anthropic adapter streams Claude responses with tool calling, thread persistence, and request transforms.'
---
# Anthropic

Install the Anthropic adapter and peer SDK:

```sh
npm install @hashbrownai/anthropic @anthropic-ai/sdk
```

## Streaming Text Responses

Hashbrown’s Anthropic adapter lets you **stream Claude chat completions**, with support for tool calling, optional thread persistence, and custom endpoints.

### API Reference

#### `HashbrownAnthropic.stream.text(options)`

Streams an Anthropic chat completion as a series of encoded frames. Handles content, tool calls, and errors, and yields each frame as a `Uint8Array`.

**Options:**

| Name                      | Type                                                            | Description                                                                                                               |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`                  | `string`                                                        | Your Anthropic API Key.                                                                                                   |
| `baseURL`                 | `string`                                                        | _(Optional)_ Custom Anthropic base URL (useful for proxies or gateways).                                                  |
| `request`                 | `Chat.Api.CompletionCreateParams`                               | The chat request: model, messages, tools, system, toolChoice, threadId, etc.                                              |
| `loadThread`              | `(threadId: string) => Promise<Chat.Api.Message[]>`             | _(Optional)_ Load prior thread messages when `request.threadId` is provided.                                              |
| `saveThread`              | `(thread: Chat.Api.Message[], threadId?: string) => Promise<string>` | _(Optional)_ Persist the merged thread after a response. Returns the saved `threadId`.                                    |
| `transformRequestOptions` | `(params) => params \| Promise<params>`                         | _(Optional)_ Transform or override the final Anthropic request before it is sent.                                         |

**Supported Features:**

- **Roles:** `user`, `assistant`, `tool`
- **Tools:** Supports Anthropic tool calling with `input_schema`.
- **System Prompt:** Included as the first message if provided.
- **Thread Persistence:** Optional `loadThread`/`saveThread` hooks for thread-aware conversations.
- **Streaming:** Each chunk is encoded into a resilient streaming format.
- **Base URL Override:** Point to on-prem gateways or secure proxies.

### How It Works

- **Messages:** Translated to Anthropic’s Claude message format, including tool uses and tool results.
- **Tools/Functions:** Tools are passed as Anthropic tools using your JSON schemas as `input_schema`.
- **Threading:** If `threadId` is present, Hashbrown will load and merge history before sending the request, and can save the updated thread afterward.
- **Streaming:** All data is sent as encoded frames (`Uint8Array`). Chunks may contain text, tool calls, errors, or finish signals.
- **Error Handling:** Any thrown errors are sent as error frames before the stream ends.

### Example: Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseURL: process.env.ANTHROPIC_BASE_URL, // optional proxy/gateway
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseURL: process.env.ANTHROPIC_BASE_URL, // optional proxy/gateway
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import { Response } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Res() res: Response) {
    const stream = HashbrownAnthropic.stream.text({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      baseURL: process.env.ANTHROPIC_BASE_URL, // optional proxy/gateway
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();
  
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseURL: process.env.ANTHROPIC_BASE_URL, // optional proxy/gateway
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

Use `transformRequestOptions` to inject server-side system prompts, cap tokens, or audit requests before sending them to Anthropic.

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    request: req.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        system: 'You are a concise assistant.',
        max_tokens: 1024,
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    request: request.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        system: 'You are a concise assistant.',
        max_tokens: 1024,
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
import { Controller, Post, Body, Res } from '@nestjs/common';
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import { Response } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Res() res: Response) {
    const stream = HashbrownAnthropic.stream.text({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      request: body,
      transformRequestOptions: (options) => {
        return {
          ...options,
          system: 'You are a concise assistant.',
          max_tokens: 1024,
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();
  
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    request: body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        system: 'You are a concise assistant.',
        max_tokens: 1024,
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

[Learn more about transformRequestOptions](/docs/angular/concept/transform-request-options)

---

### Thread Persistence (Optional)

Provide `loadThread` and `saveThread` to keep conversations stateful across requests.

```ts
import { HashbrownAnthropic } from '@hashbrownai/anthropic';

const stream = HashbrownAnthropic.stream.text({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  request: {
    threadId,
    messages,
    model: 'claude-3-5-sonnet-20241022',
  },
  loadThread: async (threadId) => db.loadThread(threadId),
  saveThread: async (thread, existingId) => db.saveThread(thread, existingId),
});
```
