---
title: 'OpenAI: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s OpenAI adapter maps AG-UI runs to the OpenAI Responses API, with reasoning, and streams canonical AG-UI events.'
---

# OpenAI

Install the OpenAI adapter, the official OpenAI SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/openai openai @ag-ui/core @ag-ui/encoder
```

## Streaming Text Responses

`HashbrownOpenAI.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. The adapter uses OpenAI's streaming Responses API. Encode its events as AG-UI SSE at your HTTP boundary.

The model is server configuration and is not read from the client run input.

### API Reference

| Name                      | Type                                    | Description                                                                                                |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apiKey`                  | `string`                                | OpenAI API key.                                                                                            |
| `baseURL`                 | `string`                                | _(Optional)_ Base URL of a server that implements the Responses API.                                       |
| `model`                   | `string`                                | Server-selected OpenAI model.                                                                              |
| `input`                   | `OpenAIHashbrownRunAgentInput`          | AG-UI run input, including messages and tools.                                                             |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the OpenAI request when the HTTP client disconnects.                                  |
| `activities`              | `ActivityCallback`                      | _(Optional)_ Sends activities alongside the model's output. See [Sending Activities](#sending-activities). |
| `reasoning`               | `false \| { effort?, summary? }`        | _(Optional)_ Controls the `reasoning` request parameter. See [Reasoning](#reasoning).                      |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final streaming Responses request (`ResponseCreateParamsStreaming`).           |

The adapter maps system and developer instructions, message history, tool definitions, and tool results. Text and tool calls become canonical AG-UI events. Provider and mapping failures are emitted as `RUN_ERROR` events.

### Responses API

The adapter streams from OpenAI's Responses API. Every request sends `store: false`, so OpenAI does not keep conversation state for you. Hashbrown replays the earlier turns, including earlier reasoning, from the history your client sends, which also works with zero-data-retention organizations.

`baseURL` must point at a server that implements the Responses API. Servers that only implement Chat Completions (for example vLLM, OpenRouter, or LM Studio, depending on the server and mode) are no longer supported by `@hashbrownai/openai`.

### Reasoning

Reasoning models, which are models whose names start with `o` and a digit (`o3`), `gpt-5`, or `gpt-` followed by a major version of 5 or later, stream reasoning summaries by default. `-chat` variants such as `gpt-5-chat-latest` are not reasoning models. Hashbrown sends `reasoning: { summary: 'auto' }` and `include: ['reasoning.encrypted_content']` for them, and leaves `effort` to the model. Other models get no `reasoning` field.

Use the `reasoning` option to change this:

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-5',
  input,
  reasoning: { effort: 'low', summary: 'detailed' },
});
```

- `reasoning: { effort, summary }` is sent as given. A missing `summary` defaults to `'auto'`. `effort` is sent only when you set it.
- `reasoning: false` stops Hashbrown from requesting reasoning summaries. It does not turn reasoning off: a reasoning model may still return encrypted reasoning, which Hashbrown still replays on the next turn.

The client receives reasoning as AG-UI `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT`, and `REASONING_MESSAGE_END` events for the summary text, and `REASONING_ENCRYPTED_VALUE` events for the encrypted content. On the Hashbrown side, assistant messages expose them as `reasoning` and `reasoningDetails`.

### Structured Output

Set `input.forwardedProps.hashbrown.responseSchema` to use OpenAI native JSON schema output:

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
        additionalProperties: false,
      },
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

## Sending Activities

Pass `activities` to send AG-UI activities alongside the model's output. Activities are display-only progress, such as a plan or a progress report, and the model never sees them. See [Activities](/docs/react/concept/activities) for how the client renders them.

```ts
import { HashbrownOpenAI } from '@hashbrownai/openai';

const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-5-nano',
  input,
  signal,
  activities: async ({ activity, model }) => {
    const plan = activity.snapshot('plan-1', 'plan', {
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
- `model` resolves when the model stream ends, before the run finishes, and rejects if the model call fails.
- Activity events and model events are sent in the order they happen. The callback starts after `RUN_STARTED`, and the terminal event waits until the callback settles. Model text streams as it arrives and is never held back.
- If the callback throws while the model is streaming, Hashbrown aborts the model and ends the run with one `RUN_ERROR`. If it throws after the model has finished, `RUN_ERROR` replaces `RUN_FINISHED`. If the model fails too, the model's error wins.
- When the client disconnects, `signal` aborts. No terminal event is sent, and writes become no-ops.
- A write after the run has closed throws, as does a second snapshot that reuses an id with a different `activityType`.

## Transform Request Options

`transformRequestOptions` receives the final Responses API request (`ResponseCreateParamsStreaming`) after AG-UI input has been mapped. Use it for server-owned provider settings.

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    max_output_tokens: 2048,
  }),
});
```

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)
