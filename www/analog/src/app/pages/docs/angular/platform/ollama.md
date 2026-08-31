---
title: 'Ollama: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Hashbrown maps AG-UI runs to the official Ollama SDK and streams canonical AG-UI events.'
---

# Ollama

Install the Ollama adapter, official Ollama SDK, and AG-UI SSE packages:

```sh
npm install @hashbrownai/ollama ollama @ag-ui/core @ag-ui/encoder
```

## Streaming Text Responses

`HashbrownOllama.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. The adapter uses the official Ollama SDK streaming chat API. Encode its events as AG-UI SSE at your HTTP boundary.

The model is server configuration and is not read from the client run input. By default the official SDK connects to the local Ollama server. Pass `host` for a remote or containerized server, or pass a preconfigured `client` for custom headers and transport settings. An explicit `client` takes precedence over `host`.

### API Reference

| Name                      | Type                                    | Description                                                            |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `client`                  | `Ollama`                                | _(Optional)_ Preconfigured official Ollama SDK client.                 |
| `host`                    | `string`                                | _(Optional)_ Ollama host URL used when creating a client for this run. |
| `model`                   | `string`                                | Server-selected Ollama model.                                          |
| `input`                   | `OllamaHashbrownRunAgentInput`          | AG-UI run input, including messages and tools.                         |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the Ollama request when the client disconnects.   |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final streaming Ollama `ChatRequest`.      |

The adapter maps system and developer instructions, text message history, tool definitions, tool calls, and tool results. Text and tool calls become canonical AG-UI events. Ollama thinking becomes AG-UI reasoning records and is restored as `thinking` when that assistant message is sent back for continuation. Terminal response details, including metrics and log probabilities, are preserved as Ollama `RAW` events. Provider and mapping failures are emitted as `RUN_ERROR` events.

### Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOllama } from '@hashbrownai/ollama';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownOllama.stream.text({
    host: process.env.OLLAMA_HOST,
    model: process.env.OLLAMA_MODEL ?? 'gemma3',
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
import { HashbrownOllama } from '@hashbrownai/ollama';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownOllama.stream.text({
    host: process.env.OLLAMA_HOST,
    model: process.env.OLLAMA_MODEL ?? 'gemma3',
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
import { HashbrownOllama } from '@hashbrownai/ollama';
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
    const stream = HashbrownOllama.stream.text({
      host: process.env.OLLAMA_HOST,
      model: process.env.OLLAMA_MODEL ?? 'gemma3',
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
import { HashbrownOllama } from '@hashbrownai/ollama';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownOllama.stream.text({
    host: process.env.OLLAMA_HOST,
    model: process.env.OLLAMA_MODEL ?? 'gemma3',
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

## Structured Output

Set `input.hashbrown.responseSchema` to use Ollama native structured output. Hashbrown forwards a cloned JSON Schema as the Ollama `format` request field; it does not emulate or prevalidate provider support.

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
    },
  },
};
```

Ollama Cloud does not currently support structured outputs. Use a local or self-hosted model that supports `format` when setting `responseSchema`.

## Ollama Cloud

Configure the official SDK client with the Ollama Cloud host and authorization header, then pass it to Hashbrown:

```ts
import { HashbrownOllama } from '@hashbrownai/ollama';
import { Ollama } from 'ollama';

const client = new Ollama({
  host: 'https://ollama.com',
  headers: {
    Authorization: `Bearer ${process.env.OLLAMA_API_KEY!}`,
  },
});

const stream = HashbrownOllama.stream.text({
  client,
  model: process.env.OLLAMA_MODEL ?? 'gpt-oss:120b',
  input,
});
```

## Thinking

Use `transformRequestOptions` to enable thinking on a compatible model. Thinking chunks are emitted as AG-UI reasoning records and are included in provider continuation messages.

```ts
const stream = HashbrownOllama.stream.text({
  model: process.env.OLLAMA_MODEL ?? 'deepseek-r1',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    think: true,
  }),
});
```

## Transform Request Options

`transformRequestOptions` receives the final Ollama SDK request after AG-UI input has been mapped. Use it for server-owned model settings.

```ts
const stream = HashbrownOllama.stream.text({
  model: process.env.OLLAMA_MODEL ?? 'gemma3',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    options: {
      ...options.options,
      temperature: 0.2,
      num_predict: 2048,
    },
  }),
});
```

[Learn more about transformRequestOptions](/docs/angular/concept/transform-request-options)
