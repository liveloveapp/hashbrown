---
title: 'Google Gemini: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Hashbrown’s Google Gemini adapter maps AG-UI runs to the Google Gen AI SDK and streams canonical AG-UI events.'
---

# Google Gemini

Install the Google adapter, the Google Gen AI SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/google @google/genai @ag-ui/encoder
```

## Authentication

The adapter supports two mutually exclusive authentication modes. The model is server configuration and is not read from the client run input.

**Gemini Developer API:**

```ts
HashbrownGoogle.stream.text({
  apiKey: process.env.GOOGLE_API_KEY!,
  model: 'gemini-2.5-flash',
  input,
});
```

**Vertex AI with Application Default Credentials:**

```ts
HashbrownGoogle.stream.text({
  vertexai: true,
  project: 'your-gcp-project',
  location: 'us-central1',
  model: 'gemini-2.5-flash',
  input,
});
```

## Streaming Text Responses

`HashbrownGoogle.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. Encode those events as AG-UI SSE at your HTTP boundary.

### API Reference

| Name                      | Type                                    | Description                                                                                                |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apiKey`                  | `string`                                | Gemini Developer API key. Mutually exclusive with `vertexai`.                                              |
| `vertexai`                | `true`                                  | Enables Vertex AI. Mutually exclusive with `apiKey`.                                                       |
| `project`                 | `string`                                | GCP project ID. Required with `vertexai: true`.                                                            |
| `location`                | `string`                                | GCP region. Required with `vertexai: true`.                                                                |
| `model`                   | `string`                                | Server-selected Google model.                                                                              |
| `input`                   | `GoogleHashbrownRunAgentInput`          | AG-UI run input, including messages and tools.                                                             |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the Google request when the HTTP client disconnects.                                  |
| `activities`              | `ActivityCallback`                      | _(Optional)_ Sends activities alongside the model's output. See [Sending Activities](#sending-activities). |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final Google `GenerateContentParameters`.                                      |

The adapter maps system instructions, message history, tool definitions, tool results, and native structured output. Gemini thought parts become AG-UI reasoning records, and Gemini thought signatures are preserved for continuation. Provider and mapping failures are emitted as `RUN_ERROR` events.

Set `input.forwardedProps.hashbrown.responseSchema` to use Gemini's native JSON schema output:

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

### Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownGoogle } from '@hashbrownai/google';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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
import { HashbrownGoogle } from '@hashbrownai/google';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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
import { HashbrownGoogle } from '@hashbrownai/google';
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
    const stream = HashbrownGoogle.stream.text({
      apiKey: process.env.GOOGLE_API_KEY!,
      model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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
import { HashbrownGoogle } from '@hashbrownai/google';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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

### Sending Activities

Pass `activities` to send AG-UI activities alongside the model's output. Activities are display-only progress, such as a plan or a progress report, and the model never sees them. See [Activities](/docs/angular/concept/activities) for how the client renders them.

```ts
import { HashbrownGoogle } from '@hashbrownai/google';

const stream = HashbrownGoogle.stream.text({
  apiKey: process.env.GOOGLE_API_KEY!,
  model: 'gemini-2.5-flash',
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

`transformRequestOptions` receives the final Google SDK request after AG-UI input has been mapped. Use it for server-owned provider settings.

```ts
const stream = HashbrownGoogle.stream.text({
  apiKey: process.env.GOOGLE_API_KEY!,
  model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    config: {
      ...options.config,
      temperature: 0.2,
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }],
      },
    },
  }),
});
```

[Learn more about transformRequestOptions](/docs/angular/concept/transform-request-options)

};

````

### Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownGoogle } from '@hashbrownai/google';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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
````

</div>

<div backend="fastify">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownGoogle } from '@hashbrownai/google';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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
import { HashbrownGoogle } from '@hashbrownai/google';
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
    const stream = HashbrownGoogle.stream.text({
      apiKey: process.env.GOOGLE_API_KEY!,
      model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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
import { HashbrownGoogle } from '@hashbrownai/google';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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

`transformRequestOptions` receives the final Google SDK request after AG-UI input has been mapped. Use it for server-owned provider settings.

```ts
const stream = HashbrownGoogle.stream.text({
  apiKey: process.env.GOOGLE_API_KEY!,
  model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    config: {
      ...options.config,
      temperature: 0.2,
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }],
      },
    },
  }),
});
```

[Learn more about transformRequestOptions](/docs/angular/concept/transform-request-options)
