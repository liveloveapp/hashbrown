---
title: 'Amazon Bedrock: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s Amazon Bedrock adapter maps AG-UI runs to the AWS Bedrock Converse API and streams canonical AG-UI events.'
---

# Amazon Bedrock

Install the Bedrock adapter, the AWS Bedrock Runtime SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/bedrock @aws-sdk/client-bedrock-runtime @ag-ui/core @ag-ui/encoder
```

## Streaming Text Responses

`HashbrownBedrock.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. The adapter uses the AWS SDK's `ConverseStream` API. Encode its events as AG-UI SSE at your HTTP boundary.

The model or inference profile is server configuration and is not read from the client run input.

### API Reference

| Name                      | Type                                    | Description                                                                    |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `model`                   | `string`                                | Server-selected Bedrock model or inference profile ID.                         |
| `input`                   | `BedrockHashbrownRunAgentInput`         | AG-UI run input, including messages and tools.                                 |
| `clientOptions`           | `BedrockRuntimeClientConfig`            | _(Optional)_ AWS SDK client configuration. Mutually exclusive with `client`.   |
| `client`                  | `BedrockRuntimeClient`                  | _(Optional)_ Reusable AWS SDK client. Mutually exclusive with `clientOptions`. |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the Bedrock request when the HTTP client disconnects.     |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final Bedrock `ConverseStreamCommandInput`.        |

The adapter maps system and developer instructions, message history, tools, tool results, and native structured output. Bedrock reasoning text, signatures, and redacted reasoning become AG-UI reasoning records that can be sent back on continuation. Citations, images, response metadata, and unsupported native blocks are preserved as AG-UI `RAW` events. Provider and mapping failures are emitted as `RUN_ERROR` events.

Set `input.hashbrown.responseSchema` to use Bedrock native structured output on a model that supports it:

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
import { HashbrownBedrock } from '@hashbrownai/bedrock';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownBedrock.stream.text({
    clientOptions: { region: process.env.AWS_REGION ?? 'us-east-1' },
    model: process.env.BEDROCK_MODEL_ID!,
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
import { HashbrownBedrock } from '@hashbrownai/bedrock';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownBedrock.stream.text({
    clientOptions: { region: process.env.AWS_REGION ?? 'us-east-1' },
    model: process.env.BEDROCK_MODEL_ID!,
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
import { HashbrownBedrock } from '@hashbrownai/bedrock';
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
    const stream = HashbrownBedrock.stream.text({
      clientOptions: { region: process.env.AWS_REGION ?? 'us-east-1' },
      model: process.env.BEDROCK_MODEL_ID!,
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
import { HashbrownBedrock } from '@hashbrownai/bedrock';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownBedrock.stream.text({
    clientOptions: { region: process.env.AWS_REGION ?? 'us-east-1' },
    model: process.env.BEDROCK_MODEL_ID!,
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

## AWS Credentials and Client Reuse

`clientOptions` uses the AWS SDK default credential provider chain, including environment variables, shared AWS config, ECS task roles, EC2 instance roles, and web identity credentials.

```ts
const stream = HashbrownBedrock.stream.text({
  clientOptions: {
    region: 'us-east-1',
  },
  model: process.env.BEDROCK_MODEL_ID!,
  input,
});
```

Pass a configured `BedrockRuntimeClient` through `client` when you need to reuse connections, retries, or middleware. Hashbrown destroys clients it creates from `clientOptions`; it never destroys a client supplied through `client`.

## Transform Request Options

Use `transformRequestOptions` for provider-owned inference settings, guardrails, request metadata, performance configuration, or a forced tool choice.

```ts
const stream = HashbrownBedrock.stream.text({
  clientOptions: { region: 'us-east-1' },
  model: process.env.BEDROCK_MODEL_ID!,
  input,
  transformRequestOptions: (options) => ({
    ...options,
    inferenceConfig: {
      maxTokens: 2048,
      temperature: 0.2,
    },
    requestMetadata: {
      application: 'my-app',
    },
  }),
});
```
