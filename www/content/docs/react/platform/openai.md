---
title: 'OpenAI: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s OpenAI adapter maps AG-UI runs to the OpenAI Chat Completions API and streams canonical AG-UI events.'
---

# OpenAI

Install the OpenAI adapter, the official OpenAI SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/openai openai @ag-ui/core @ag-ui/encoder
```

## Streaming Text Responses

`HashbrownOpenAI.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. The adapter uses OpenAI's streaming Chat Completions API. Encode its events as AG-UI SSE at your HTTP boundary.

The model is server configuration and is not read from the client run input.

### API Reference

| Name                      | Type                                    | Description                                                               |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `apiKey`                  | `string`                                | OpenAI API key.                                                           |
| `baseURL`                 | `string`                                | _(Optional)_ OpenAI-compatible API base URL.                              |
| `model`                   | `string`                                | Server-selected OpenAI model.                                             |
| `input`                   | `OpenAIHashbrownRunAgentInput`          | AG-UI run input, including messages and tools.                            |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the OpenAI request when the HTTP client disconnects. |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final streaming Chat Completions request.     |

The adapter maps system and developer instructions, message history, tool definitions, and tool results. Text and tool calls become canonical AG-UI events. Provider and mapping failures are emitted as `RUN_ERROR` events.

Set `input.hashbrown.responseSchema` to use OpenAI native JSON schema output:

```ts
const input = {
  ...runInput,
  hashbrown: {
    responseSchema: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
      },
      required: ['answer'],
      additionalProperties: false,
    },
  },
};
```

### Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
    input: req.body as RunAgentInput,
    signal: abortController.signal,
  });
  const encoder = new EventEncoder();

  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Content-Type', encoder.getContentType());
  res.header('Connection', 'keep-alive');
  res.flushHeaders();

  for await (const event of stream) {
    res.write(encoder.encodeSSE(event));
  }

  if (!res.writableEnded) {
    res.end();
  }
});

app.listen(3000);
```

</div>

<div backend="fastify">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
    input: request.body as RunAgentInput,
    signal: abortController.signal,
  });
  const encoder = new EventEncoder();

  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.header('Content-Type', encoder.getContentType());
  reply.header('Connection', 'keep-alive');

  for await (const event of stream) {
    reply.raw.write(encoder.encodeSSE(event));
  }

  if (!reply.raw.writableEnded) {
    reply.raw.end();
  }
});

fastify.listen({ port: 3000 });
```

</div>

<div backend="nestjs">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import type { Request, Response } from 'express';

@Controller()
export class RunController {
  @Post('run')
  async run(
    @Body() input: RunAgentInput,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const abortController = new AbortController();
    req.once('aborted', () => abortController.abort());
    res.once('close', () => abortController.abort());
    const stream = HashbrownOpenAI.stream.text({
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
      input,
      signal: abortController.signal,
    });
    const encoder = new EventEncoder();

    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Content-Type', encoder.getContentType());
    res.header('Connection', 'keep-alive');
    res.flushHeaders();

    for await (const event of stream) {
      res.write(encoder.encodeSSE(event));
    }

    if (!res.writableEnded) {
      res.end();
    }
  }
}
```

</div>

<div backend="hono">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
    input,
    signal: c.req.raw.signal,
  });
  const encoder = new EventEncoder();
  const textEncoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          controller.enqueue(textEncoder.encode(encoder.encodeSSE(event)));
        }
        controller.close();
      },
    }),
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': encoder.getContentType(),
      },
    },
  );
});

export default app;
```

</div>

</hb-backend-code-example>

## Transform Request Options

`transformRequestOptions` receives the final OpenAI SDK request after AG-UI input has been mapped. Use it for server-owned provider settings.

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    max_completion_tokens: 2048,
  }),
});
```

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)
