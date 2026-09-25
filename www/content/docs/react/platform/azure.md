---
title: 'Microsoft Azure OpenAI: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s Microsoft Azure OpenAI adapter maps AG-UI runs to the Azure OpenAI SDK and streams canonical AG-UI events.'
---

# Microsoft Azure OpenAI

Install the Azure adapter, the Azure OpenAI SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/azure openai @ag-ui/core @ag-ui/encoder
```

## Client Configuration

Pass the official SDK's `AzureClientOptions` directly as `clientOptions`. This supports API keys, Microsoft Entra token providers, Azure endpoints, custom base URLs, deployment aliases, retries, and custom fetch implementations without Hashbrown wrapping those options. The model remains server configuration and is not read from the client run input.

**API key:**

```ts
HashbrownAzure.stream.text({
  clientOptions: {
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
    apiVersion: process.env.AZURE_API_VERSION!,
    deployment: process.env.AZURE_DEPLOYMENT,
  },
  model: process.env.AZURE_MODEL!,
  input,
});
```

**Microsoft Entra token provider:**

```ts
HashbrownAzure.stream.text({
  clientOptions: {
    azureADTokenProvider,
    endpoint: process.env.AZURE_ENDPOINT!,
    apiVersion: process.env.AZURE_API_VERSION!,
    deployment: process.env.AZURE_DEPLOYMENT,
  },
  model: process.env.AZURE_MODEL!,
  input,
});
```

## Streaming Text Responses

`HashbrownAzure.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. Encode those events as AG-UI SSE at your HTTP boundary.

### API Reference

| Name                      | Type                                    | Description                                                                          |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `clientOptions`           | `AzureClientOptions`                    | Official Azure OpenAI SDK configuration, passed through unchanged.                   |
| `model`                   | `string`                                | Server-selected Azure OpenAI model.                                                  |
| `input`                   | `AzureHashbrownRunAgentInput`           | AG-UI run input, including messages and tools.                                       |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the Azure OpenAI request when the HTTP client disconnects.      |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final OpenAI chat-completions streaming request options. |

The adapter maps system and developer instructions, message history, tool definitions, tool results, and native structured output. Provider and mapping failures are emitted as `RUN_ERROR` events.

Set `input.hashbrown.responseSchema` to use Azure OpenAI native JSON schema output:

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

### Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownAzure } from '@hashbrownai/azure';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownAzure.stream.text({
    clientOptions: {
      apiKey: process.env.AZURE_API_KEY!,
      endpoint: process.env.AZURE_ENDPOINT!,
      apiVersion: process.env.AZURE_API_VERSION!,
      deployment: process.env.AZURE_DEPLOYMENT,
    },
    model: process.env.AZURE_MODEL!,
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
import { HashbrownAzure } from '@hashbrownai/azure';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownAzure.stream.text({
    clientOptions: {
      apiKey: process.env.AZURE_API_KEY!,
      endpoint: process.env.AZURE_ENDPOINT!,
      apiVersion: process.env.AZURE_API_VERSION!,
      deployment: process.env.AZURE_DEPLOYMENT,
    },
    model: process.env.AZURE_MODEL!,
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
import { HashbrownAzure } from '@hashbrownai/azure';
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
    const stream = HashbrownAzure.stream.text({
      clientOptions: {
        apiKey: process.env.AZURE_API_KEY!,
        endpoint: process.env.AZURE_ENDPOINT!,
        apiVersion: process.env.AZURE_API_VERSION!,
        deployment: process.env.AZURE_DEPLOYMENT,
      },
      model: process.env.AZURE_MODEL!,
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
import { HashbrownAzure } from '@hashbrownai/azure';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownAzure.stream.text({
    clientOptions: {
      apiKey: process.env.AZURE_API_KEY!,
      endpoint: process.env.AZURE_ENDPOINT!,
      apiVersion: process.env.AZURE_API_VERSION!,
      deployment: process.env.AZURE_DEPLOYMENT,
    },
    model: process.env.AZURE_MODEL!,
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

### Transform Request Options

`transformRequestOptions` receives the final Azure OpenAI SDK request after AG-UI input has been mapped. Use it for server-owned provider settings.

```ts
const stream = HashbrownAzure.stream.text({
  clientOptions: {
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
    apiVersion: process.env.AZURE_API_VERSION!,
    deployment: process.env.AZURE_DEPLOYMENT,
  },
  model: process.env.AZURE_MODEL!,
  input,
  transformRequestOptions: (options) => ({
    ...options,
    temperature: 0.2,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      ...options.messages,
    ],
  }),
});
```

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)
