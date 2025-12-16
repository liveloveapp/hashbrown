---
title: 'Anthropic: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s Anthropic adapter streams Claude completions with tool use, thread persistence, and request transforms for React apps.'
---

# Anthropic

First, install the Anthropic adapter (and the required SDK peer dependency):

```sh
npm install @hashbrownai/anthropic @anthropic-ai/sdk
```

## Streaming Text Responses

Hashbrown’s Anthropic adapter lets you **stream Claude chat completions** with support for tool use, request transforms, and optional thread persistence.

### API Reference

#### `HashbrownAnthropic.stream.text(options)`

Streams a Claude completion as encoded frames. Handles content, tool calls, thread load/save signals, and errors; yields each frame as a `Uint8Array`.

**Options:**

| Name                      | Type                                        | Description                                                                                        |
| ------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apiKey`                  | `string`                                    | Your Anthropic API key.                                                                            |
| `baseURL`                 | `string`                                    | _(Optional)_ Custom Anthropic API origin (self-hosted gateway, proxy, etc.).                       |
| `request`                 | `Chat.Api.CompletionCreateParams`           | Chat request: model, messages, tools, toolChoice, system, threadId, operation, etc.                |
| `transformRequestOptions` | `(params) => params \| Promise<params>`     | _(Optional)_ Modify the final Anthropic request before sending (e.g., tune `max_tokens`).          |
| `loadThread`              | `(threadId) => Promise<Chat.Api.Message[]>` | _(Optional)_ Load a stored thread when `request.threadId` is present.                              |
| `saveThread`              | `(thread, threadId?) => Promise<string>`    | _(Optional)_ Persist the merged thread after a run; returns the thread id to send back downstream. |

**Supported Features:**

- **Roles:** `user`, `assistant`, `tool` (tool results are serialized as Claude `tool_result` blocks).
- **Tools:** Maps Hashbrown tool schemas to Claude tool definitions; streams `tool_use` blocks and arguments.
- **Tool Choice:** Supports `auto`, `required` (mapped to Claude `any`), and `none`.
- **Threading:** Optional `threadId` load/save flow with `thread-load-*` and `thread-save-*` frames for persistence.
- **Streaming:** Text deltas and tool call deltas are framed as `Uint8Array` chunks; default `max_tokens` is 4096, override in `transformRequestOptions`.

### How It Works

- **Messages:** Hashbrown messages are converted to Claude’s Messages API (assistant text plus `tool_use` blocks; tool results become `tool_result` blocks on the user side).
- **Tools:** Each tool’s JSON schema is sent as `input_schema`; tool outputs can be streamed via the special `output` tool when present.
- **Tool Choice:** `toolChoice: 'required'` translates to Claude’s `{ type: 'any' }`; `auto` uses Claude’s auto-selection.
- **Thread Persistence:** If `request.threadId` is set and `loadThread` is provided, the adapter loads, merges, and (optionally) hydrates the thread. When `saveThread` is provided, it emits save frames after generation to persist history.
- **Error Handling:** Exceptions are emitted as error frames before termination.

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
    },
  );
});

export default app;
```

</div>

</hb-backend-code-example>

---

### Transform Request Options

Use `transformRequestOptions` to adjust the Anthropic request before it is sent. Common tweaks include raising `max_tokens`, injecting a server-side system prompt, or logging.

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
        system: 'You are a helpful assistant.', // prepend server-side system prompt
        max_tokens: 6000, // override default 4096
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
    transformRequestOptions: (options) => ({
      ...options,
      system: 'You are a helpful assistant.',
      max_tokens: 6000,
    }),
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
      transformRequestOptions: (options) => ({
        ...options,
        system: 'You are a helpful assistant.',
        max_tokens: 6000,
      }),
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
    transformRequestOptions: (options) => ({
      ...options,
      system: 'You are a helpful assistant.',
      max_tokens: 6000,
    }),
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
    },
  );
});
```

</div>

</hb-backend-code-example>
