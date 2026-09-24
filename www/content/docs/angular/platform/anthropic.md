---
title: 'Anthropic: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Hashbrown’s Anthropic adapter maps AG-UI runs to the Claude Messages API and streams canonical AG-UI events.'
---

# Anthropic

Install the Anthropic adapter, the official Anthropic SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/anthropic @anthropic-ai/sdk @ag-ui/core @ag-ui/encoder
```

## Streaming Text Responses

`HashbrownAnthropic.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. The adapter uses Anthropic's streaming Messages API. Encode its events as AG-UI SSE at your HTTP boundary.

The model is server configuration and is not read from the client run input.

### API Reference

| Name                      | Type                                    | Description                                                                  |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `apiKey`                  | `string`                                | Anthropic API key.                                                           |
| `baseURL`                 | `string`                                | _(Optional)_ Anthropic-compatible API base URL.                              |
| `model`                   | `string`                                | Server-selected Anthropic model.                                             |
| `input`                   | `AnthropicHashbrownRunAgentInput`       | AG-UI run input, including messages and tools.                               |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the Anthropic request when the HTTP client disconnects. |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final streaming Messages API request.            |

The adapter maps system and developer instructions, message history, tool definitions, tool results, and native structured output. Claude thinking, signatures, and redacted thinking become AG-UI reasoning records that can be sent back on continuation. Provider metadata and unsupported native events are preserved as AG-UI `RAW` events. Provider and mapping failures are emitted as `RUN_ERROR` events.

Set `input.hashbrown.responseSchema` to use Anthropic native structured output on a model that supports it:

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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
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
    const stream = HashbrownAnthropic.stream.text({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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

## Extended Thinking

Enable provider-owned reasoning settings with `transformRequestOptions`. Hashbrown emits Claude thinking and redacted thinking as AG-UI reasoning events and preserves their signatures for subsequent requests.

```ts
const stream = HashbrownAnthropic.stream.text({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    max_tokens: 4096,
    thinking: { type: 'enabled', budget_tokens: 1024 },
  }),
});
```

## Transform Request Options

Use `transformRequestOptions` for server-owned provider settings such as token limits, service tiers, or a server-side system instruction.

```ts
const stream = HashbrownAnthropic.stream.text({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    max_tokens: 2048,
  }),
});
```

[Learn more about transformRequestOptions](/docs/angular/concept/transform-request-options)
