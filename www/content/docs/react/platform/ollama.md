---
title: 'Ollama: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown maps AG-UI runs to the official Ollama SDK and streams canonical AG-UI events.'
---

# Ollama

<hb-docs-demo demo="canonical-workbench-first-plan-react">
</hb-docs-demo>

Run model inference through Ollama while keeping Hashbrown's normal client APIs. Your server receives AG-UI input, selects an installed model, and translates the Ollama chat stream into AG-UI events. Choose a model with the capabilities your application needs: streaming text alone does not establish support for tools or structured output.

The teaser demonstrates the OpenAI-backed client flow. It does not demonstrate the server-side Ollama adapter. The separate Local models lesson uses a browser-native transport and is a different integration.

<hb-concept-diagram concept="client-server">
</hb-concept-diagram>

## Install the server adapter

Install the Ollama adapter, official Ollama SDK, and AG-UI SSE packages:

```sh
npm install @hashbrownai/ollama ollama @ag-ui/core @ag-ui/encoder
```

## Streaming Text Responses

`HashbrownOllama.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. The adapter uses the official Ollama SDK streaming chat API. Encode its events as AG-UI SSE at your HTTP boundary.

The model is server configuration and is not read from the client run input. By default the official SDK connects to the local Ollama server. Pass `host` for a remote or containerized server, or pass a preconfigured `client` for custom headers and transport settings. An explicit `client` takes precedence over `host`.

### API Reference

| Name                      | Type                                    | Description                                                                                                |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `client`                  | `Ollama`                                | _(Optional)_ Preconfigured official Ollama SDK client.                                                     |
| `host`                    | `string`                                | _(Optional)_ Ollama host URL used when creating a client for this run.                                     |
| `model`                   | `string`                                | Server-selected Ollama model.                                                                              |
| `input`                   | `OllamaHashbrownRunAgentInput`          | AG-UI run input, including messages and tools.                                                             |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the Ollama request when the client disconnects.                                       |
| `activities`              | `ActivityCallback`                      | _(Optional)_ Sends activities alongside the model's output. See [Sending Activities](#sending-activities). |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final streaming Ollama `ChatRequest`.                                          |

The adapter maps system and developer instructions, text message history, tool definitions, tool calls, and tool results. Text and tool calls become canonical AG-UI events. Ollama thinking becomes AG-UI reasoning records and is restored as `thinking` when that assistant message is sent back for continuation. Terminal response details, including metrics and log probabilities, are preserved as Ollama `RAW` events. Provider and mapping failures are emitted as `RUN_ERROR` events.

### Node.js Server Integration

The examples below host `/run` in an ordinary application. Configure your React client to call that route, using the [Quickstart](/docs/react/start/quick) for the framework setup. They show provider mapping, SSE encoding, and disconnect cancellation. Add your application's validation, identity, authorization, and request limits before exposing the route; see [Securing a public endpoint](/docs/react/recipes/public-endpoint). A TypeScript assertion on the request body does not validate it.

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

Set `input.forwardedProps.hashbrown.responseSchema` to use Ollama native structured output. Hashbrown forwards a cloned JSON Schema as the Ollama `format` request field; it does not emulate or prevalidate provider support.

```ts
const input = {
  ...runInput,
  forwardedProps: {
    hashbrown: {
      responseSchema: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
        },
        required: ['answer'],
      },
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

## Sending Activities

Pass `activities` to send AG-UI activities alongside the model's output. Activities are display-only progress, such as a plan or a progress report, and the model never sees them. See [Activities](/docs/react/concept/activities) for how the client renders them.

```ts
import { HashbrownOllama } from '@hashbrownai/ollama';

const stream = HashbrownOllama.stream.text({
  host: process.env.OLLAMA_HOST,
  model: 'gemma3',
  input,
  signal,
  activities: async ({ activity, model }) => {
    const plan = activity.snapshot(`plan-${input.runId}`, 'plan', {
      steps: ['Read the question', 'Answer'],
      done: 0,
    });

    await model;

    plan.patch([{ op: 'replace', path: '/done', value: 2 }]);
  },
});
```

The callback receives an `activity` writer, a `model` promise, and the run's `signal`:

- `activity.snapshot(id, activityType, content)` sends an `ACTIVITY_SNAPSHOT` and returns a handle. The handle's `patch(operations)` sends an `ACTIVITY_DELTA` with RFC 6902 JSON Patch operations, and `replace(content)` sends a new snapshot.
- Activity ids must be unique within the thread. Reusing an id from an earlier turn updates that turn's activity in place, so the example builds the id from `input.runId` to give each run its own plan.
- `model` resolves when the model stream ends, before the run finishes, and rejects if the model call fails.
- Activity events and model events are sent in the order they happen. The callback starts after `RUN_STARTED`, and the terminal event waits until the callback settles. Model text streams as it arrives and is never held back.
- If the callback throws while the model is streaming, Hashbrown aborts the model and ends the run with one `RUN_ERROR`. If it throws after the model has finished, `RUN_ERROR` replaces `RUN_FINISHED`. If the model fails too, the model's error wins.
- When the client disconnects, `signal` aborts. No terminal event is sent, and writes become no-ops.
- A write after the run has closed throws, as does a second snapshot that reuses an id with a different `activityType`.

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

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)

## Explore it in the workbench

Start the [conversation workbench](/docs/react/start/workbench) and open `/react.html?lesson=first-plan`. Ask for a two-step plan. In **Requests**, compare the AG-UI input with the streamed response; in **UI**, follow the resolved props into the trusted card. **State** stays unchanged because this lesson previews a plan without accepting it.

The workbench's [server route](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-app.ts) adds bounded lesson policy around an OpenAI adapter. Compare that route with the `Ollama` route above: the client contract stays AG-UI, while authentication, native request options, and capability support belong to the selected provider. This exercise does not call Ollama or verify its provider-specific behavior.

For a local deployment, verify the same request against your running Ollama server and installed model. The [Local models recipe](/docs/react/recipes/local-models) explores browser-native inference separately; it does not test this server adapter.
